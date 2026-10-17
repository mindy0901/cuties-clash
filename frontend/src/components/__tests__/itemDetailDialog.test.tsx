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
import type { ItemInstance } from '../../game/types'

function item(uid: string, templateId: string, star: ItemInstance['star'] = 1, paid = 3, slot = 0): ItemInstance {
	return { uid, templateId, star, slot, rotated: false, paid }
}

function reset(equipped: ItemInstance[], inventory: ItemInstance[]) {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({ run: { ...state.run, equipped, inventory } }))
}

beforeEach(() => reset([], []))
afterEach(cleanup)

describe('ItemDetailDialog', () => {
	it('shows the name, class, size and where the item currently sits', () => {
		reset([], [item('spear', 'fire-spear')])
		render(<ItemDetailDialog uid="spear" onClose={() => {}} />)

		expect(screen.getByText('Thương Lửa')).toBeTruthy()
		expect(screen.getByText('Vũ khí cận chiến')).toBeTruthy()
		expect(screen.getByText('1×4 ô')).toBeTruthy()
		expect(screen.getByText('Trong kho')).toBeTruthy()
	})

	it('says so clearly when the item is being carried', () => {
		reset([item('worn', 'jade-fury')], [])
		render(<ItemDetailDialog uid="worn" onClose={() => {}} />)

		expect(screen.getByText('Đang mang')).toBeTruthy()
	})

	it('shows the damage, attack speed and resale value per star, and no description line', () => {
		reset([], [item('spear', 'fire-spear', 2, 8)])
		render(<ItemDetailDialog uid="spear" onClose={() => {}} />)

		expect(screen.getByText('Sát thương mỗi đòn')).toBeTruthy()
		expect(screen.getByText('2★')).toBeTruthy()
		// Speed is the design value (attacks per second), so the player also gets the swing time.
		expect(screen.getByText('Tốc độ đánh')).toBeTruthy()
		expect(screen.getByText('0.76 đòn/giây')).toBeTruthy()
		expect(screen.getByText('1.3s')).toBeTruthy()
		// Paid 8 → resells for 4.
		expect(screen.getByText(/4 🐾 \(hoàn 50%\)/)).toBeTruthy()
		// An item has no description field any more — the numbers say everything.
		expect(screen.queryByText(/Đâm 17 sát thương/)).toBeNull()
	})

	it('lists the bonus stats of an item with a passive', () => {
		reset([], [item('jade', 'jade-sword')])
		render(<ItemDetailDialog uid="jade" onClose={() => {}} />)

		expect(screen.getByText('Hồi Kiếm Thế')).toBeTruthy()
		expect(screen.getByText('Tỉ lệ Chấn Đao')).toBeTruthy()
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
		// These two rows only exist in the dialog (an inventory cell has neither).
		expect(screen.getByText('Trong kho')).toBeTruthy()
		expect(screen.getByText('Bán được')).toBeTruthy()
	})
})
