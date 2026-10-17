// @vitest-environment jsdom
/**
 * Loadout and Inventory are **two different places**:
 * - Loadout: a 4-column grid that **always shows the full 4×5**; cells past the pet's level are
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
import { GRID_MAX_CELLS } from '../../game/pets'
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
	it('always shows all 20 cells even for a level 1 pet', () => {
		renderPrep()
		expect(loadoutCells()).toHaveLength(GRID_MAX_CELLS)
		expect(GRID_MAX_CELLS).toBe(20)
	})

	it('cells past the pet level are locked (dimmed), cells inside the level are not', () => {
		renderPrep()
		const cells = loadoutCells()
		// Cẩu Hỏa Sài level 1 → 3 rows = 12 usable cells.
		const locked = cells.filter((cell) => cell.className.includes('opacity-25'))
		expect(locked).toHaveLength(GRID_MAX_CELLS - 12)
		// Locked cells sit at the end of the board.
		expect(Number(locked[0].dataset.cell)).toBe(12)
	})

	it('the label states how many cells are locked', () => {
		renderPrep()
		expect(screen.getByText(/8 ô khoá/)).toBeTruthy()
	})
})

describe('Inventory — reserves', () => {
	it('an empty inventory still shows grid cells, with no hint text', () => {
		renderPrep()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(screen.getByText('0 món · không giới hạn')).toBeTruthy()
		// An empty inventory still shows the full **8×8 cells**.
		expect(inventoryCells().length).toBe(64)
		// ❌ No hint line is left inside the inventory.
		expect(screen.queryByText(/Kho trống/)).toBeNull()
		expect(screen.queryByText(/Giữ chuột kéo món/)).toBeNull()
		expect(inventoryCells().length).toBeGreaterThan(0)
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
		expect(screen.getByText('2 món · không giới hạn')).toBeTruthy()
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

	it('an inventory item can be sold', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, inventory: [createItemInstance('great-axe', 2, 'axe', 0)] },
		}))
		const before = useGameStore.getState().run.currency
		renderPrep()
		fireEvent.click(screen.getByTitle('Bán món này (hoàn 50%)'))

		expect(useGameStore.getState().run.inventory).toHaveLength(0)
		expect(useGameStore.getState().run.currency).toBeGreaterThan(before)
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
		// "1 món · x/y ô · Sức mạnh …" — a contextual regex so it does not match "1 món dự trữ".
		expect(screen.getByText(/1 món · \d+\/\d+ ô/)).toBeTruthy()
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
})
