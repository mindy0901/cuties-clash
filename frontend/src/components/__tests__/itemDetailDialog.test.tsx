// @vitest-environment jsdom
/**
 * Clicking an item (in the inventory or the loadout) opens the **detail dialog** — that is the only
 * thing a click does, now that picking up/placing belongs to drag and drop.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemDetailDialog } from '../ItemDetailDialog'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'
import { installRetiredItems } from '../../test/retiredItems'
import type { ItemInstance } from '../../game/types'
import { useLanguageStore } from '../../i18n'
import { applyContentOverrides } from '../../game/content'

function item(uid: string, templateId: string, star: ItemInstance['star'] = 1, paid = 3, slot = 0): ItemInstance {
	return { uid, templateId, star, slot, rotated: false, paid }
}

function reset(equipped: ItemInstance[], inventory: ItemInstance[]) {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({ run: { ...state.run, equipped, inventory } }))
}

beforeEach(() => {
	installRetiredItems()
	useLanguageStore.setState({ language: 'vi' })
	reset([], [])
})
afterEach(() => {
	cleanup()
	applyContentOverrides(null)
})

describe('ItemDetailDialog', () => {
	it('shows the name, class and size', () => {
		reset([], [item('spear', 'fire-spear')])
		render(<ItemDetailDialog uid="spear" onClose={() => {}} />)

		expect(screen.getByText('Thương Lửa')).toBeTruthy()
		expect(screen.getByText('Vũ khí cận chiến')).toBeTruthy()
		expect(screen.getByText('1×4 ô')).toBeTruthy()
		// Where the item sits is not restated here — the bag already shows it worn or stored.
		expect(screen.queryByText('Trong kho')).toBeNull()
		expect(screen.queryByText('Đang mang')).toBeNull()
	})

	it('looks the item up whether it is worn or stored', () => {
		reset([item('worn', 'jade-fury')], [])
		render(<ItemDetailDialog uid="worn" onClose={() => {}} />)

		expect(screen.getByText('Hồn Ngọc Phẫn Nộ')).toBeTruthy()
	})

	it('shows the damage multiplier, Cooldown Time and resale value per star, and no description line', () => {
		reset([], [item('spear', 'fire-spear', 2, 8)])
		render(<ItemDetailDialog uid="spear" onClose={() => {}} />)

		// The multiplier, not the resulting damage: the hit depends on the Cutie.
		expect(screen.getByText('Hệ số sát thương')).toBeTruthy()
		expect(screen.queryByText('Sát thương mỗi đòn')).toBeNull()
		// The rank is drawn on the tile, the same way the bag draws it — no separate "2★" label.
		expect(document.querySelector('[data-item-quality] [data-item-stars="2"]')).toBeTruthy()
		// One rhythm row, in the unit the admin page edits: seconds between two swings. The 2★ rank
		// carries a 1.5 s Cooldown Time — the player reads exactly the stored number.
		expect(screen.getByText('Hồi chiêu')).toBeTruthy()
		expect(screen.getByText('1.5s')).toBeTruthy()
		// Paid 8 → resells for 4. The paw glyph is an icon now, so the number and the note are separate.
		const resale = screen.getByText('Bán được (hoàn 50%)').closest('div')
		expect(resale?.textContent).toContain('4')
		// An item has no description field any more — the numbers say everything.
		expect(screen.queryByText(/Đâm 17 sát thương/)).toBeNull()
	})

	it('draws the item in its default shape even when it lies sideways in the bag', () => {
		// A turned sword is 3×1 in the bag; the dialog has to show the item as it is defined (1×3),
		// because the picture is cropped to that shape.
		reset([], [{ ...item('turned', 'wooden-blade'), rotated: true }])
		render(<ItemDetailDialog uid="turned" onClose={() => {}} />)

		const preview = document.querySelector('[data-item-quality]')!.parentElement as HTMLElement
		expect(preview.style.width, 'one cell wide').toBe('44px')
		expect(preview.style.height, 'three cells tall').toBe('132px')
		expect(screen.getByText('1×3 ô')).toBeTruthy()
	})

	it('lists the bonus stats of an item with a passive', () => {
		reset([], [item('jade', 'jade-sword')])
		render(<ItemDetailDialog uid="jade" onClose={() => {}} />)

		expect(screen.getByText('Hồi Kiếm Thế')).toBeTruthy()
	})

	it('shows the parry kit of an item — Chấn Đao lives only in the kit', () => {
		reset([], [item('sword', 'jade-sword', 4)])
		render(<ItemDetailDialog uid="sword" onClose={() => {}} />)

		expect(screen.getByText('Chấn Đao')).toBeTruthy()
		// 4★: 18% chance, 65 Sword Energy, 135% of the owner's basic attack.
		expect(screen.getByText('18%')).toBeTruthy()
		expect(screen.getByText('Kiếm Thế tiêu hao')).toBeTruthy()
		expect(screen.getByText('65')).toBeTruthy()
		expect(screen.getByText('135%')).toBeTruthy()
	})

	it('draws the reaction kits from their own parameter tables', () => {
		applyContentOverrides({
			items: {
				'jade-fury': {
					kits: [
						{
							id: 'freeze-haste',
							params: {
								boost: [50, 60, 70, 80, 100],
								duration: [4000, 4000, 4000, 4000, 4000],
							},
						},
						{ id: 'regen', params: { value: [0.6, 0.9, 1.3, 1.8, 2.4] } },
					],
				},
			},
		})
		reset([], [item('gem', 'jade-fury')])
		render(<ItemDetailDialog uid="gem" onClose={() => {}} />)

		expect(screen.getByText('Hỗ trợ Băng · Giảm hồi chiêu')).toBeTruthy()
		// The gem's reduction is temporary — the label says so (the admin's "(% )" suffix is dropped:
		// the value already carries the sign).
		expect(screen.getByText('Giảm hồi chiêu tạm thời')).toBeTruthy()
		expect(screen.getByText('50%')).toBeTruthy()
		expect(screen.getByText('Thời gian buff')).toBeTruthy()
		expect(screen.getByText('4s')).toBeTruthy()
		expect(screen.getByText('Hồi máu theo giây')).toBeTruthy()
		expect(screen.getByText('0.6%')).toBeTruthy()
	})

	it('lists the on-hit effects and the adjacency aura the admin attached', () => {
		// Thương Lửa carries a burn; the war drum buffs a neighbouring weapon.
		reset([], [item('spear', 'fire-spear'), item('drum', 'war-drum')])
		const { unmount } = render(<ItemDetailDialog uid="spear" onClose={() => {}} />)
		// 🔴 Every kit is its own block, and every parameter of it is a row of its own.
		expect(screen.getByText('Đòn đánh cơ bản')).toBeTruthy()
		expect(screen.getByText('Cháy khi trúng đòn')).toBeTruthy()
		expect(screen.getByText('Tỉ lệ kích hoạt')).toBeTruthy()
		expect(screen.getByText('25%')).toBeTruthy()
		expect(screen.getByText('Thời gian')).toBeTruthy()
		expect(screen.getByText('3s')).toBeTruthy()
		// A burn drains 14 % of the owner's attack per second at 1★.
		expect(screen.getByText('14%')).toBeTruthy()
		unmount()

		render(<ItemDetailDialog uid="drum" onClose={() => {}} />)
		expect(screen.getByText('Hào khí liền kề')).toBeTruthy()
		// The aura's own parameters: what it applies to, and each stat it moves.
		expect(screen.getByText('Áp dụng cho')).toBeTruthy()
		expect(screen.getByText('Cần một vũ khí liền kề')).toBeTruthy()
		expect(screen.getByText('Sát thương')).toBeTruthy()
		expect(screen.getByText('+10%')).toBeTruthy()
	})

	it('writes a shield and a scaled effect out with their real numbers', () => {
		reset([], [item('blade', 'wooden-blade', 3)])
		applyContentOverrides({
			items: {
				'wooden-blade': {
					kits: [
						{
							id: 'basic-attack',
							params: { multiplier: [1, 1, 1, 1, 1], cooldown: [1, 1, 1, 1, 1] },
							onHit: [
								{
									id: 'shield-on-hit',
									params: {
										chance: [30, 30, 30, 30, 30],
										amount: [10, 20, 30, 40, 50],
									},
								},
								{
									id: 'burn-on-hit',
									params: {
										chance: [25, 25, 25, 25, 25],
										duration: [3000, 3000, 3000, 3000, 3000],
										value: [10, 10, 10, 10, 10],
									},
								},
							],
						},
					],
				},
			},
		})
		render(<ItemDetailDialog uid="blade" onClose={() => {}} />)

		// Each on-hit kit is a block with its own parameters: 3★ shield = 30 % of max HP.
		expect(screen.getByText('Tạo khiên khi trúng đòn')).toBeTruthy()
		expect(screen.getAllByText('30%').length, 'the chance and the amount are two rows').toBeGreaterThan(1)
		expect(screen.getByText('Cháy khi trúng đòn')).toBeTruthy()
		expect(screen.getAllByText('10%').length).toBeGreaterThan(0)
	})

	it('lists the charged attack as a kit of its own, with its own parameters', () => {
		reset([], [item('charger', 'wooden-blade')])
		// No code weapon carries a charged variant yet, so the numbers come from a stored override.
		applyContentOverrides({
			items: {
				'wooden-blade': {
					kits: [
						{
							id: 'basic-attack',
							params: { multiplier: [1, 1, 1, 1, 1], cooldown: [1.6, 1.6, 1.6, 1.6, 1.6] },
							charge: { id: 'charge-attack', params: { seNeed: [100, 100, 100, 100, 100], multiplier: [2.2, 2.2, 2.2, 2.2, 2.2] } },
						},
					],
				},
			},
		})
		render(<ItemDetailDialog uid="charger" onClose={() => {}} />)

		// Two blocks: the swing and the charged hit, each with its own parameter rows.
		expect(screen.getByText('Đòn đánh cơ bản')).toBeTruthy()
		expect(screen.getByText('Trọng kích nạp')).toBeTruthy()
		// The plain swing keeps its own numbers…
		expect(screen.getByText('Hồi chiêu')).toBeTruthy()
		// The basic attack's own 1.6 s Cooldown Time.
		expect(screen.getByText('1.6s')).toBeTruthy()
		// …and the charged kit shows its threshold and its multiplier — its damage is not printed: it
		// depends on the Cutie, and the multiplier already says everything.
		expect(screen.getByText('Kiếm Thế cần')).toBeTruthy()
		// Energy is **absolute points**, so the row is a plain number (100 Energy), never `100%`.
		expect(screen.getByText('100')).toBeTruthy()
		expect(screen.queryByText('100%')).toBeNull()
		// One term for one number: the charged hit's multiplier is a plain `Hệ số sát thương` too.
		expect(screen.getAllByText('Hệ số sát thương')).toHaveLength(2)
		expect(screen.getByText('×2.2')).toBeTruthy()
		expect(screen.queryByText('Sát thương đòn nạp')).toBeNull()
		expect(screen.queryByText('Hồi đòn')).toBeNull()
	})

	it('renders nothing when the item is gone (already sold)', () => {
		reset([], [])
		const { container } = render(<ItemDetailDialog uid="ghost" onClose={() => {}} />)
		expect(container.firstChild).toBeNull()
	})

	it('calls onClose when "Đóng" is clicked', () => {
		reset([], [item('gem', 'jade-fury')])
		const onClose = vi.fn()
		render(<ItemDetailDialog uid="gem" onClose={onClose} />)

		fireEvent.click(screen.getByText('Đóng'))

		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it('closes when clicking outside the dialog', () => {
		reset([], [item('gem', 'jade-fury')])
		const onClose = vi.fn()
		const { container } = render(<ItemDetailDialog uid="gem" onClose={onClose} />)

		fireEvent.click(container.firstElementChild!)

		expect(onClose).toHaveBeenCalledTimes(1)
	})
})

/**
 * The dialog is rendered by the root layout (`routes/__root.tsx`), not inside `PrepScreen`, so the
 * whole **app** has to be built to verify the real flow: click an item → the dialog appears.
 */
describe('the real flow inside the app', () => {
	it('clicking an inventory item opens the detail dialog', async () => {
		reset([], [item('gem', 'jade-fury')])
		await renderApp('/')

		fireEvent.click(document.querySelector<HTMLElement>('button[data-inv-tile="gem"]')!)

		expect(await screen.findByText('Chi tiết món')).toBeTruthy()
		// This row only exists in the dialog (an inventory cell does not have it).
		expect(screen.getByText('Bán được (hoàn 50%)')).toBeTruthy()
	})
})
