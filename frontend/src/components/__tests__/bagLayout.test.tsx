// @vitest-environment jsdom
/**
 * Loadout and Inventory are **two different places**:
 * - Loadout: a 4-column grid that **always shows the full 4×5**; cells past the cutie's level are
 *   **locked** (dimmed). Only items inside the usable area take part in the fight.
 * - Inventory: **the same formulas and UI** but **no cell limit**; it is a **free grid** — an item
 *   sits exactly where the player put it, the inventory never packs them. With many items it
 *   scrolls vertically.
 *
 * Renders the whole `PrepScreen` (not the panels individually) because the pick-up/place state
 * lives in the shared parent — the inventory and the loadout are sibling panels.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrepScreen } from '../PrepScreen'
import { createItemInstance } from '../../game/bag'
import { GRID_MAX_CELLS } from '../../game/cuties'
import { STORAGE_MIN_ROWS } from '../../game/storage'
import { boardHeight } from '../GridBoard'
import { useGameStore } from '../../store/gameStore'
import { useUiStore } from '../../store/uiStore'
import { renderInRouter } from '../../test/router'

function reset() {
	useGameStore.getState().newRun()
	window.history.replaceState({}, '', '/')
}

function renderPrep() {
	return renderInRouter(<PrepScreen />)
}

/** Cells of the loadout board (the inventory uses `data-inv-cell`). */
function loadoutCells(): HTMLElement[] {
	const panel = [...document.querySelectorAll('section')].find(
		(s) => s.querySelector('h2')?.textContent === 'Trang bị',
	)
	return Array.from(panel?.querySelectorAll<HTMLElement>('[data-cell]') ?? [])
}

/** Cells of the **inventory grid** — must be scoped to the board, because both share `[data-cell]`. */
function inventoryCells(): HTMLElement[] {
	const panel = [...document.querySelectorAll('section')].find(
		(s) => s.querySelector('h2')?.textContent === 'Kho đồ',
	)
	return Array.from(panel?.querySelectorAll<HTMLElement>('[data-cell]') ?? [])
}

beforeEach(reset)
afterEach(cleanup)

describe('Loadout — the board always has the full 4×5', () => {
	it('always shows all 20 cells even for a level 1 cutie', () => {
		renderPrep()
		expect(loadoutCells()).toHaveLength(GRID_MAX_CELLS)
		expect(GRID_MAX_CELLS).toBe(20)
	})

	it('cells past the cutie level are locked (dimmed), cells inside the level are not', () => {
		renderPrep()
		const cells = loadoutCells()
		// Cẩu Hỏa Sài level 1 → 3 rows = 12 usable cells.
		const locked = cells.filter((cell) => cell.className.includes('opacity-25'))
		expect(locked).toHaveLength(GRID_MAX_CELLS - 12)
		// Locked cells sit at the end of the board.
		expect(Number(locked[0].dataset.cell)).toBe(12)
	})

	it('the header carries no counter — the board itself shows which cells are locked', () => {
		renderPrep()
		expect(screen.queryByText(/ô khoá/)).toBeNull()
		expect(screen.queryByText(/Sức mạnh /)).toBeNull()
	})
})

describe('Inventory — reserves', () => {
	it('an empty inventory still shows grid cells, with no hint text', () => {
		renderPrep()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		// ❌ No "0 món · không giới hạn" counter any more: the board already fills the panel and the
		// count told the player nothing they could act on.
		expect(screen.queryByText(/không giới hạn/)).toBeNull()
		expect(document.querySelector('[data-storage-sort]')).toBeTruthy()
		// An empty inventory still shows the full **8×8 cells**.
		expect(inventoryCells().length).toBe(64)
		// ❌ No hint line is left inside the inventory.
		expect(screen.queryByText(/Kho trống/)).toBeNull()
		expect(screen.queryByText(/Giữ chuột kéo món/)).toBeNull()
		expect(inventoryCells().length).toBeGreaterThan(0)
	})

	it('the storage viewport is exactly as tall as the default 8 rows, so none of them is cut off', () => {
		renderPrep()
		const panel = [...document.querySelectorAll('section')].find(
			(s) => s.querySelector('h2')?.textContent === 'Kho đồ',
		)!
		// The scroll container around the board. jsdom does not lay out, so the rule is checked on the
		// **measurement** that drives it: 8 rows of 90 px + gaps + padding + the 1 px border.
		const viewport = panel.querySelector<HTMLElement>('div.overflow-auto')!
		expect(viewport.style.maxHeight).toBe(`${boardHeight(STORAGE_MIN_ROWS)}px`)
		expect(boardHeight(8)).toBe(762)
		expect(inventoryCells()).toHaveLength(STORAGE_MIN_ROWS * 8)
	})

	it('shows reserved items as cells on the grid', () => {
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				inventory: [
					createItemInstance('great-axe', 2, 'axe', 0),
					createItemInstance('wooden-blade', 1, 'sword', 8),
				],
			},
		}))
		renderPrep()
		expect(screen.queryByText(/không giới hạn/), 'the header carries no counter').toBeNull()
		expect(document.querySelector('[data-inv-tile="axe"]')).toBeTruthy()
		expect(document.querySelector('[data-inv-tile="sword"]')).toBeTruthy()
	})

	it('clicking an inventory item opens the detail dialog and does NOT pick the item up', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, inventory: [createItemInstance('jade-fury', 1, 'jade', 0)] },
		}))
		renderPrep()

		fireEvent.click(document.querySelector<HTMLElement>('button[data-inv-tile="jade"]')!)

		expect(useUiStore.getState().itemUid, 'opens the details of that very item').toBe('jade')
		expect(document.querySelector('[data-held-ghost]'), 'a click must not pick the item up').toBeNull()
		expect(useGameStore.getState().run.inventory[0].slot, 'the position does not change').toBe(0)
	})

	it('shows no rotate or sell action icons on item hover', () => {
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [createItemInstance('jade-fury', 1, 'worn', 0)],
				inventory: [createItemInstance('great-axe', 2, 'axe', 0)],
			},
		}))
		renderPrep()

		for (const uid of ['axe', 'worn']) {
			const box = document.querySelector<HTMLElement>(`[data-item-box="${uid}"]`)!
			expect(box.querySelector('[title="Xoay 90°"]')).toBeNull()
			expect(box.querySelector('[title="Bán món này (hoàn 50%)"]')).toBeNull()
			expect(box.querySelector('[data-item-stars]'), 'star rank remains visible').toBeTruthy()
		}
	})
})

describe('Loadout — carried items', () => {
	it('shows only carried items, never the ones in the inventory', () => {
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [createItemInstance('jade-fury', 1, 'worn', 0)],
				inventory: [createItemInstance('great-axe', 1, 'stored', 0)],
			},
		}))
		renderPrep()

		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		// Inventory items do not appear on the loadout board (Đại Đao exists only in the inventory).
		expect(screen.queryByTitle(/^Đại Đao/)).toBeNull()
	})

	it('clicking "Tháo hết" moves every item back into the inventory', () => {
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [
					createItemInstance('jade-fury', 1, 'a', 0),
					createItemInstance('heal-dew', 1, 'b', 1),
				],
			},
		}))
		renderPrep()
		fireEvent.click(screen.getByText(/Tháo hết/))

		const run = useGameStore.getState().run
		expect(run.equipped).toHaveLength(0)
		expect(run.inventory).toHaveLength(2)
		expect(run.inventory.every((item) => item.slot >= 0), 'items moved to the inventory must have a real cell').toBe(true)
	})

	it('Shop and Tháo hết sit on the equipment panel floor, Shop first and both full width', () => {
		renderPrep()
		const panel = [...document.querySelectorAll('section')].find(
			(s) => s.querySelector('h2')?.textContent === 'Trang bị',
		)!
		const buttons = [...panel.querySelectorAll('button')]
		const shopIndex = buttons.findIndex((button) => button.hasAttribute('data-shop-drop-target'))
		const unequipIndex = buttons.findIndex((button) => /Tháo hết/.test(button.textContent ?? ''))
		expect(shopIndex, 'the Shop button lives in this panel').toBeGreaterThan(-1)
		expect(unequipIndex, 'Tháo hết sits right under it').toBeGreaterThan(shopIndex)
		// ❌ The bottom bar no longer carries a shop drop zone.
		expect(document.querySelector('[data-shop-drop-target="action-bar"]')).toBeNull()
		expect(document.querySelectorAll('[data-shop-drop-target]')).toHaveLength(1)
	})

	it('the four modes sit in the shared footer under the panels, splitting its width evenly', () => {
		renderPrep()
		const footer = document.querySelector<HTMLElement>('[data-action-bar]')!
		const modesRow = footer.querySelector<HTMLElement>('[data-action-bar-panel="modes"]')!
		const journeyRow = footer.querySelector<HTMLElement>('[data-action-bar-panel="journey"]')!
		// One footer landmark holding both panels …
		expect(footer.tagName).toBe('FOOTER')
		expect([...footer.children]).toEqual([modesRow, journeyRow])
		// … and the footer is a **sibling of the main content**, not nested inside it.
		const mainContent = footer.previousElementSibling!
		expect(mainContent.querySelector('section'), 'main content holds the three panels').toBeTruthy()
		expect(mainContent.contains(footer), 'the footer does not hide inside main content').toBe(false)
		const cells = [...modesRow.children].map((cell) => (cell.textContent ?? '').trim())
		expect(cells).toEqual(['Đấu Trường', 'Phiêu Lưu', 'Phòng tập', 'Bảng Xếp Hạng'])
		// Leader Board has no feature behind it yet, so it is **disabled** (never a dead click).
		const leaderBoard = [...modesRow.querySelectorAll('button')].find((button) =>
			/Bảng Xếp Hạng/.test(button.textContent ?? ''),
		)!
		expect(leaderBoard.disabled).toBe(true)
		expect(leaderBoard.title).toContain('sẽ có ở bản sau')
	})

	it('Arena starts a duel and Adventure opens the map', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, equipped: [createItemInstance('jade-fury', 1, 'a', 0)] },
		}))
		renderPrep()

		// ❌ No second "Maps" button anywhere: Adventure is the only entry point.
		expect(screen.queryByRole('button', { name: /^Bản đồ$/ })).toBeNull()

		fireEvent.click(screen.getByText('Phiêu Lưu'))
		expect(useUiStore.getState().mapOpen, 'Adventure opens the journey map').toBe(true)
		useUiStore.getState().closeMap()

		fireEvent.click(screen.getByText('Đấu Trường'))
		const battle = useGameStore.getState().battle
		expect(battle?.mode, 'Arena is the rival duel, not another stage run').toBe('pvp')
		expect(battle?.reward).toBeGreaterThan(0)
	})
})
