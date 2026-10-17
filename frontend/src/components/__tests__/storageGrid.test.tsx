// @vitest-environment jsdom
/**
 * **The inventory is a free grid** — this locks down the three bugs that happened:
 *
 * 1. The inventory **re-packed items**: whatever cell you dropped on, they were squeezed back to
 *    the top row, so the position the player chose was not kept.
 * 2. As a result **dragging inside the inventory looked like it did nothing** — the move did
 *    happen but the position was recomputed instantly, and dragging an item inside the inventory
 *    used to be ignored entirely.
 * 3. Dropping onto an item of a different kind **swapped** them, i.e. the item sitting still got
 *    pushed elsewhere — the inventory does **not** swap, it only **merges stars**.
 */
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrepScreen } from '../PrepScreen'
import { useGameStore } from '../../store/gameStore'
import { renderInRouter } from '../../test/router'
import type { ItemInstance } from '../../game/types'

function item(uid: string, templateId: string, slot: number, rotated = false): ItemInstance {
	return { uid, templateId, star: 1, slot, rotated, paid: 3 }
}

function reset(equipped: ItemInstance[], inventory: ItemInstance[]) {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({ run: { ...state.run, equipped, inventory } }))
	window.history.replaceState({}, '', '/')
}

function renderPrep() {
	return renderInRouter(<PrepScreen />)
}

/** Board looked up by its heading. */
function panel(title: string): HTMLElement {
	const found = [...document.querySelectorAll('section')].find(
		(s) => s.querySelector('h2')?.textContent === title,
	)
	if (!found) throw new Error(`board ${title} not found`)
	return found
}

/** A cell of one board by index (both boards share `[data-cell]`). */
function cellIn(title: string, slot: number): HTMLElement {
	const cell = panel(title).querySelector<HTMLElement>(`[data-cell="${slot}"]`)
	if (!cell) throw new Error(`${title} has no cell ${slot}`)
	return cell
}

/** The button of an item in the **inventory**. */
function tile(uid: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(`button[data-inv-tile="${uid}"]`)
	if (!found) throw new Error(`item ${uid} not found in the inventory`)
	return found
}

/** The item box (the element carrying `gridColumn`/`gridRow`). */
function boxOf(uid: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(`[data-item-box="${uid}"]`)
	if (!found) throw new Error(`item box ${uid} not found`)
	return found
}

function toastText(): string { return useGameStore.getState().toasts.map((toast) => toast.text).join(' | ') }

function slotOf(uid: string): number | undefined {
	return useGameStore.getState().run.inventory.find((entry) => entry.uid === uid)?.slot
}

/** Moves the cursor over an **inventory** cell. */
function hoverInventoryCell(slot: number) {
	fireEvent.mouseMove(cellIn('Kho đồ', slot), { clientX: 0, clientY: 0 })
}

/**
 * Releases the mouse after a drag. Must be wrapped in `act` because `pointerup` is listened for on
 * `document` (the cursor may be over another panel), so it does not go through `fireEvent`.
 */
function releaseMouse() {
	act(() => {
		document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }))
	})
}

/** Starts a drag with a real mouse (pointerdown + pointermove past the 4px threshold). */
function startDrag(uid: string) {
	const button = tile(uid)
	fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 })
	fireEvent.pointerMove(button, { clientX: 300, clientY: 300 })
}

beforeEach(() => reset([], []))
afterEach(cleanup)

describe('the inventory keeps the position the player chose', () => {
	it('an item sits on the exact saved cell, never packed to the front of the grid', () => {
		reset([], [item('near', 'jade-fury', 5), item('far', 'jade-fury', 40)])
		renderPrep()

		// Cell 5 = row 0 column 5; cell 40 = row 5 column 0 (8 columns).
		expect(boxOf('near').style.gridColumn).toBe('6 / span 1')
		expect(boxOf('near').style.gridRow).toBe('1 / span 1')
		expect(boxOf('far').style.gridColumn).toBe('1 / span 1')
		expect(boxOf('far').style.gridRow).toBe('6 / span 1')
	})

	it('dragging an inventory item to another cell puts it on that cell', () => {
		reset([], [item('gem', 'jade-fury', 0)])
		renderPrep()

		startDrag('gem')
		hoverInventoryCell(20)
		releaseMouse()

		expect(slotOf('gem'), 'released on cell 20, so the item must sit on cell 20').toBe(20)
	})

	/**
	 * BUG THAT HAPPENED: the two boards shared **one "hint is blocked" flag**, so whichever board
	 * reported last overwrote the other — a drop inside the inventory left the flag `false`, so the
	 * item was still placed on top of another item.
	 */
	it('a hint block overlapping another inventory item → places nothing, and tells the player', () => {
		reset([], [item('block', 'jade-fury', 2), item('wide', 'hide-vest', 8)])
		renderPrep()

		// Giáp Da 2×2 on cell 8 (column 0, row 1). Dragged to cell 1: the 2×2 block would cover Ngọc on cell 2.
		startDrag('wide')
		hoverInventoryCell(1)

		const outline = document.querySelector<HTMLElement>('[data-preview-outline]')!
		expect(outline.className, 'the hint must report red').toContain('border-danger')

		releaseMouse()

		expect(slotOf('wide'), 'must not be dropped on top — the item stays where it was').toBe(8)
		expect(slotOf('block')).toBe(2)
		expect(toastText()).toMatch(/đã có món/)
	})

	/**
	 * BUG THAT HAPPENED (screenshot sent by a player): the cursor stood **right on** an item of a
	 * different kind, so the "pointing at an item = intent to swap" exception (correct for the
	 * loadout) made the inventory show a **golden** outline, and dropping then made `resolveDrop`
	 * **swap**: the item sitting still was pushed to the dragged item's old cell.
	 */
	it('dropping onto an item of a different kind → RED and REJECTED, no swap, nothing pushed away', () => {
		reset([], [item('vest', 'hide-vest', 0), item('spear', 'fire-spear', 24)])
		renderPrep()

		// Thương 1×4 on cell 24 (column 0, row 3). Dragged up to cell 8 (column 0, row 1) — Giáp Da 2×2's own cell.
		startDrag('spear')
		hoverInventoryCell(8)

		const outline = document.querySelector<HTMLElement>('[data-preview-outline]')!
		expect(outline.className, 'the cursor on an item of a different kind must report red').toContain(
			'border-danger',
		)

		releaseMouse()

		expect(slotOf('spear'), 'the dragged item must stay where it was').toBe(24)
		expect(slotOf('vest'), 'the covered item must NOT be pushed away').toBe(0)
		expect(toastText()).toMatch(/đã có món/)
	})

	it('dropping onto an IDENTICAL item still merges stars (golden outline)', () => {
		reset([], [item('a', 'jade-fury', 0), item('b', 'jade-fury', 9)])
		renderPrep()

		startDrag('b')
		hoverInventoryCell(0)

		const outline = document.querySelector<HTMLElement>('[data-preview-outline]')!
		expect(outline.className, 'a star merge is allowed, so it must be gold').toContain('border-gold')

		releaseMouse()

		const inventory = useGameStore.getState().run.inventory
		expect(inventory, 'the two items merge into one').toHaveLength(1)
		expect(inventory[0].star).toBe(2)
		expect(inventory[0].slot).toBe(0)
	})

	it('clicking an inventory item opens the details instead of moving it', () => {
		reset([], [item('gem', 'jade-fury', 0)])
		renderPrep()

		hoverInventoryCell(30)
		fireEvent.click(tile('gem'))

		expect(slotOf('gem'), 'a click must not move the item').toBe(0)
		expect(document.querySelector('[data-held-ghost]'), 'a click must not pick the item up').toBeNull()
	})

	it('selling one item does NOT make the other items jump around', () => {
		reset([], [item('sold', 'jade-fury', 3), item('kept', 'great-axe', 20)])
		renderPrep()

		const sellButton = boxOf('sold').querySelector<HTMLElement>('[title="Bán món này (hoàn 50%)"]')!
		fireEvent.click(sellButton)

		expect(slotOf('sold')).toBeUndefined()
		expect(slotOf('kept'), 'the remaining item must keep its cell').toBe(20)
	})

	it('rotating an inventory item with the ⟳ button', () => {
		reset([], [item('blade', 'wooden-blade', 0)])
		renderPrep()

		const rotateButton = panel('Kho đồ').querySelector<HTMLElement>('[title="Xoay 90°"]')!
		fireEvent.click(rotateButton)

		expect(useGameStore.getState().run.inventory[0].rotated).toBe(true)
		// Đao Gỗ 1×3 rotated to 3×1 — still anchored on cell 0.
		expect(boxOf('blade').style.gridColumn).toBe('1 / span 3')
	})
})

describe('moving items between the inventory and the loadout cell by cell', () => {
	it('dragging a loadout item onto an inventory cell leaves it on that cell', () => {
		reset([item('worn', 'jade-fury', 0)], [])
		renderPrep()

		const button = boxOf('worn').querySelector('button')!
		fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 })
		fireEvent.pointerMove(button, { clientX: 300, clientY: 300 })
		hoverInventoryCell(17)
		releaseMouse()

		expect(useGameStore.getState().run.equipped).toHaveLength(0)
		expect(slotOf('worn')).toBe(17)
	})

	it('removing every item gives each of them a real cell in the inventory', () => {
		reset([item('a', 'jade-fury', 0), item('b', 'jade-fury', 1)], [])
		renderPrep()

		fireEvent.click(screen.getByText(/Tháo hết/))

		const inventory = useGameStore.getState().run.inventory
		expect(inventory).toHaveLength(2)
		expect(inventory.every((entry) => entry.slot >= 0), 'no item is left with slot -1').toBe(true)
		expect(new Set(inventory.map((entry) => entry.slot)).size, 'no overlapping cells').toBe(2)
	})
})

describe('the tile background follows the item quality', () => {
	/** Tile button of an item (both boards draw the same component). */
	function anyTile(uid: string): HTMLElement {
		const found = document.querySelector<HTMLElement>(
			`button[data-inv-tile="${uid}"], [data-item-box="${uid}"] button`,
		)
		if (!found) throw new Error(`tile ${uid} not found`)
		return found
	}

	it('paints silver for quality 1 and gold-orange for quality 5', () => {
		// `jade-haste` is quality 1, `great-axe` quality 5 (see `game/items.ts`).
		reset([item('starter', 'jade-haste', 0)], [item('late', 'great-axe', 20)])
		renderPrep()

		expect(anyTile('starter').dataset.itemQuality).toBe('1')
		expect(anyTile('starter').className, 'quality 1 = silver').toContain('bg-quality-1')
		expect(anyTile('starter').className).not.toContain('bg-quality-5')

		expect(anyTile('late').dataset.itemQuality).toBe('5')
		expect(anyTile('late').className, 'quality 5 = gold-orange').toContain('bg-quality-5')
	})

	it('still borders the tile by item class, and glows only at 4★ and 5★', () => {
		reset([], [item('jade', 'jade-haste', 0), { ...item('maxed', 'jade-haste', 1), star: 5 }])
		renderPrep()

		// Border = item class, background = quality: the two never replace each other.
		expect(anyTile('maxed').className).toContain('border-[#6b4a8c]')
		expect(anyTile('jade').className).toContain('border-[#6b4a8c]')
		expect(anyTile('jade').className).not.toContain('shadow-[0_0_12px')
		expect(anyTile('maxed').className, '5★ keeps the glow').toContain('shadow-[0_0_12px')
	})
})
