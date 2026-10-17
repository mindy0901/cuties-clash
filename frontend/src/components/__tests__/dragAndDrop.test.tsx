// @vitest-environment jsdom
/**
 * **Drag and drop is the only way** to move or swap items; **clicking** an item opens the detail
 * dialog (see `itemDetailDialog.test.tsx`).
 *
 * ⚠️ WHY "CLICK–CLICK" WAS REMOVED: clicking an item used to pick it up and clicking a cell used to
 * place it. Both gestures shared one "held" state, which easily left things dangling (the item ghost
 * following the cursor after the player let go), and the `click` after `pointerup` both picked up
 * and dropped. Now every click has exactly one meaning: picking up requires **holding the mouse and
 * moving**.
 */
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrepScreen } from '../PrepScreen'
import { itemCells, templateFootprint } from '../../game/bag'
import { useGameStore } from '../../store/gameStore'
import { useUiStore } from '../../store/uiStore'
import { renderInRouter } from '../../test/router'
import type { ItemInstance } from '../../game/types'

/** Đao Gỗ 1×3 — rotates to 3×1 inside a 4-column grid. */
function blade(uid: string, slot: number, rotated = false): ItemInstance {
	return { uid, templateId: 'wooden-blade', star: 1, slot, rotated, paid: 3 }
}

/** Ngọc 1×1 — its shape does not change on rotation, handy for testing raw positions. */
function jade(uid: string, slot: number): ItemInstance {
	return { uid, templateId: 'jade-fury', star: 1, slot, rotated: false, paid: 3 }
}

/** An item in the **inventory** (it already has a real cell — the inventory is a free grid). */
function stored(uid: string, templateId = 'jade-fury', slot = 0): ItemInstance {
	return { uid, templateId, star: 1, slot, rotated: false, paid: 3 }
}

function reset(items: ItemInstance[], inventory: ItemInstance[] = []) {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: { ...state.run, equipped: items, inventory },
	}))
	useUiStore.setState({ itemUid: null })
	window.history.replaceState({}, '', '/')
}

function renderPrep() {
	return renderInRouter(<PrepScreen />)
}

function panel(title: string): HTMLElement {
	const found = [...document.querySelectorAll('section')].find(
		(s) => s.querySelector('h2')?.textContent === title,
	)
	if (!found) throw new Error(`board ${title} not found`)
	return found
}

/** The box of one item on the loadout board. */
function boxOf(uid: string): HTMLElement {
	const box = document.querySelector<HTMLElement>(`[data-item-box="${uid}"]`)
	if (!box) throw new Error(`item ${uid} not found`)
	return box
}

/** The button inside the item box (the element that receives clicks/mouse presses). */
function buttonOf(uid: string): HTMLElement {
	const button = boxOf(uid).querySelector('button')
	if (!button) throw new Error(`item ${uid} has no button`)
	return button
}

/**
 * A cell of the **loadout board** by index.
 *
 * ⚠️ Must be scoped to the board: the inventory shares `[data-cell]`, so a page-wide query would
 * pick up inventory cells by mistake.
 */
function cellOf(slot: number): HTMLElement {
	const cell = panel('Trang bị').querySelector<HTMLElement>(`[data-cell="${slot}"]`)
	if (!cell) throw new Error(`cell ${slot} not found`)
	return cell
}

/** The button of an item in the **inventory**. */
function invTileOf(uid: string): HTMLElement {
	const tile = document.querySelector<HTMLElement>(`button[data-inv-tile="${uid}"]`)
	if (!tile) throw new Error(`item ${uid} not found in the inventory`)
	return tile
}

function boardOf(title: string): HTMLElement {
	const board = panel(title).querySelector<HTMLElement>('[data-grid-board]')
	if (!board) throw new Error(`board ${title} has no grid`)
	return board
}

/** Hint cells currently filled (both boards). */
function previewSlots(): number[] {
	return Array.from(document.querySelectorAll<HTMLElement>('[data-preview]')).map((node) =>
		Number(node.dataset.preview),
	)
}

/** Hint cells filled **inside one board**. */
function previewSlotsIn(title: string): number[] {
	return Array.from(panel(title).querySelectorAll<HTMLElement>('[data-preview]')).map((node) =>
		Number(node.dataset.preview),
	)
}

/** The item image following the cursor. */
function ghost(): HTMLElement | null {
	return document.querySelector<HTMLElement>('[data-held-ghost]')
}

/** Class of the hint outline — `border-danger` means that spot **cannot take the item**. */
function outlineClass(): string {
	const outline = document.querySelector<HTMLElement>('[data-preview-outline]')
	if (!outline) throw new Error('no hint outline')
	return outline.className
}

/**
 * The text of the toasts currently shown.
 *
 * ⚠️ Read from the store: `Toasts` sits in the root layout, while these tests only render
 * `PrepScreen`.
 */
function toastText(): string {
	return useGameStore
		.getState()
		.toasts.map((toast) => toast.text)
		.join(' | ')
}

function pressKey(key: string) {
	fireEvent.keyDown(document, { key })
}

/**
 * Stubs the **Inventory** area (px) — standing in for the real layout jsdom does not have.
 *
 * ⚠️ Required to tell "dropped inside the inventory" apart from "dropped on the board": jsdom
 * returns `getBoundingClientRect()` with all zeros, so the inventory area is 0×0 and **every**
 * point counts as outside it; the default cursor is (0,0), which then sometimes counts as inside.
 */
function stubInventoryRect(left: number, top: number, width: number, height: number) {
	const section = panel('Kho đồ')
	section.getBoundingClientRect = () =>
		({
			x: left,
			y: top,
			left,
			top,
			right: left + width,
			bottom: top + height,
			width,
			height,
			toJSON: () => ({}),
		}) as DOMRect
}

/** Moves the cursor to a coordinate (px) — only the parent listens for it, no board does. */
function movePointerTo(x: number, y: number) {
	fireEvent.pointerMove(document, { clientX: x, clientY: y })
}

/** An inventory area not containing (0,0) → a drop is understood as "on the loadout board". */
function inventoryFarAway() {
	stubInventoryRect(200, 200, 100, 100)
}

/**
 * Moves the cursor over a cell.
 *
 * The real handler derives the cell from **coordinates** (`mousemove` + `elementFromPoint`) because
 * a long item covers cells, so `mouseenter` would fire on the item. jsdom has no layout, so this
 * dispatches `mousemove` straight onto the cell — the component reads `data-cell` from the event
 * target.
 */
function hoverCell(slot: number) {
	fireEvent.mouseMove(cellOf(slot), { clientX: 0, clientY: 0 })
}

/** Moves the cursor over an **inventory** cell. */
function hoverInvCell(slot: number) {
	const cell = panel('Kho đồ').querySelector<HTMLElement>(`[data-cell="${slot}"]`)
	if (!cell) throw new Error(`the inventory has no cell ${slot}`)
	fireEvent.mouseMove(cell, { clientX: 0, clientY: 0 })
}

/** Starts a drag: hold the mouse, then move past the 4px threshold (like a real browser). */
function startDrag(target: HTMLElement) {
	fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
	fireEvent.pointerMove(target, { clientX: 300, clientY: 300 })
}

/**
 * Releases the mouse.
 *
 * ⚠️ Must be wrapped in `act`: `pointerup` is listened for on `document` (the cursor may be over
 * another panel), so it does not go through `fireEvent` — without `act` the state has changed but
 * the DOM has not re-rendered.
 */
function releaseMouse() {
	act(() => {
		document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }))
	})
}

beforeEach(() => reset([blade('sword', 0)]))
afterEach(cleanup)

describe('dragging an item to pick it up', () => {
	it('dragging an item on the board dims it and shows a cursor ghost', () => {
		renderPrep()

		startDrag(buttonOf('sword'))

		expect(boxOf('sword').style.opacity).toBe('0.45')
		expect(ghost()).not.toBeNull()
	})

	it('CLICKING an item (without dragging) does NOT pick it up — it only opens the detail dialog', () => {
		renderPrep()

		fireEvent.click(buttonOf('sword'))

		expect(ghost(), 'a click must not pick the item up').toBeNull()
		expect(boxOf('sword').style.opacity, 'the item is not dimmed').toBe('1')
		expect(useUiStore.getState().itemUid, 'the detail dialog opens').toBe('sword')
	})

	it('dragging an item does NOT open the detail dialog', () => {
		renderPrep()
		inventoryFarAway()

		startDrag(buttonOf('sword'))
		hoverCell(4)
		releaseMouse()
		// The browser still fires `click` after `pointerup` — it must be ignored.
		fireEvent.click(buttonOf('sword'))

		expect(useUiStore.getState().itemUid, 'a click accompanying a drag is ignored').toBeNull()
	})

	it('the item image follows the cursor', () => {
		renderPrep()
		startDrag(buttonOf('sword'))

		fireEvent.pointerMove(document, { clientX: 120, clientY: 240 })
		expect(ghost()!.style.left).toBe('120px')
		expect(ghost()!.style.top).toBe('240px')

		fireEvent.pointerMove(document, { clientX: 400, clientY: 80 })
		expect(ghost()!.style.left).toBe('400px')
		expect(ghost()!.style.top).toBe('80px')
	})

	it('Esc cancels the drag', () => {
		renderPrep()
		startDrag(buttonOf('sword'))

		pressKey('Escape')

		expect(ghost()).toBeNull()
		expect(boxOf('sword').style.opacity).toBe('1')
	})
})

describe('the placement hint', () => {
	it('moving the mouse over a cell fills exactly the number of cells the item needs', () => {
		renderPrep()
		startDrag(buttonOf('sword'))
		hoverCell(0)

		// Đao Gỗ upright 1×3 → 3 cells.
		expect(previewSlots()).toHaveLength(3)
	})

	it('the hint stays inside ONE column for a 1×3 item', () => {
		renderPrep()
		startDrag(buttonOf('sword'))
		hoverCell(2)

		const columns = new Set(
			previewSlots().map(
				(slot) =>
					panel('Trang bị').querySelector<HTMLElement>(`[data-cell="${slot}"]`)!.style.gridColumn,
			),
		)
		expect([...columns]).toHaveLength(1)
	})

	it('there is no hint while nothing is being dragged', () => {
		renderPrep()
		hoverCell(5)
		expect(previewSlots()).toHaveLength(0)
	})

	/**
	 * BUG THAT HAPPENED: the **shading** (filled cells) and the **dashed outline** were computed from
	 * two different positions, so the outline drifted away from the shaded area. This test pins both
	 * to the **same block of cells**.
	 */
	it('the dashed outline wraps exactly the shaded cells (no drift)', () => {
		renderPrep()
		startDrag(buttonOf('sword'))
		hoverCell(5)

		const filled = previewSlots()
		expect(filled.length).toBeGreaterThan(0)

		const outline = document.querySelector<HTMLElement>('[data-preview-outline]')!
		const cols = filled.map((slot) => slot % 4)
		const rowIdx = filled.map((slot) => Math.floor(slot / 4))
		const minCol = Math.min(...cols)
		const minRow = Math.min(...rowIdx)

		expect(outline.style.gridColumn).toBe(`${minCol + 1} / span ${Math.max(...cols) - minCol + 1}`)
		expect(outline.style.gridRow).toBe(`${minRow + 1} / span ${Math.max(...rowIdx) - minRow + 1}`)
	})
})

/**
 * BUG THAT HAPPENED: the hovered cell was only **written** while the cursor crossed a board and was
 * **never cleared** when the cursor left — the other board kept showing the hint on the old cell, and
 * releasing the mouse elsewhere placed the item on that remembered cell.
 */
describe('the hint only shows while the cursor is INSIDE a board', () => {
	it('leaving the loadout board while dragging an inventory item → the board shows no hint', () => {
		reset([], [stored('stored')])
		renderPrep()

		startDrag(invTileOf('stored'))
		hoverCell(9)
		expect(previewSlotsIn('Trang bị'), 'the cursor is on the board so a hint must show').toEqual([9])

		fireEvent.pointerLeave(boardOf('Trang bị'))

		expect(previewSlotsIn('Trang bị'), 'the cursor left the board so no hint may remain').toEqual([])
	})

	it('leaving the inventory while dragging a loadout item → the inventory shows no hint', () => {
		reset([jade('gem', 0)], [])
		renderPrep()

		startDrag(buttonOf('gem'))
		hoverInvCell(0)
		expect(previewSlotsIn('Kho đồ')).toEqual([0])

		fireEvent.pointerLeave(boardOf('Kho đồ'))

		expect(previewSlotsIn('Kho đồ')).toEqual([])
	})

	it('coming back to the board shows the hint again — and drops on the new spot', () => {
		reset([], [stored('stored')])
		renderPrep()
		inventoryFarAway()

		startDrag(invTileOf('stored'))
		hoverCell(9)
		fireEvent.pointerLeave(boardOf('Trang bị'))
		expect(previewSlotsIn('Trang bị')).toEqual([])

		hoverCell(6)
		expect(previewSlotsIn('Trang bị'), 'back on the board the hint must show again').toEqual([6])

		releaseMouse()
		expect(useGameStore.getState().run.equipped[0].slot, 'placed on the hovered cell, not the old one').toBe(6)
	})

	it('leaving the board and releasing cancels, without placing on the old cell', () => {
		reset([], [stored('stored')])
		renderPrep()
		// The inventory area contains (0,0) → dropping here is **not** "store into the inventory".
		stubInventoryRect(0, 0, 1000, 1000)

		startDrag(invTileOf('stored'))
		movePointerTo(500, 500)
		hoverCell(9)
		fireEvent.pointerLeave(boardOf('Trang bị'))
		releaseMouse()

		const run = useGameStore.getState().run
		expect(run.equipped, 'released outside the board so nothing may be placed').toHaveLength(0)
		expect(run.inventory.map((item) => item.uid), 'the item is still in the inventory').toEqual(['stored'])
		expect(ghost(), 'after the mouse was released no cursor ghost may remain').toBeNull()
	})
})

describe('rotating while dragging', () => {
	it('the R key flips the orientation of the dragged item', () => {
		renderPrep()
		startDrag(buttonOf('sword'))
		hoverCell(5)

		// Upright 1×3 in column 1 → cells 1, 5, 9
		expect(previewSlots()).toEqual([1, 5, 9])

		pressKey('r')

		// Sideways 3×1 on the cursor's row (row 1) → cells 4, 5, 6
		expect(previewSlots()).toEqual([4, 5, 6])
	})

	it('the right mouse button also flips the orientation', () => {
		renderPrep()
		startDrag(buttonOf('sword'))

		fireEvent.contextMenu(document)

		expect(templateFootprint('wooden-blade', true)).toEqual({ w: 3, h: 1 })
		expect(ghost()).not.toBeNull()
	})

	it('pressing R twice returns to the original orientation', () => {
		renderPrep()
		startDrag(buttonOf('sword'))
		hoverCell(5)

		pressKey('r')
		pressKey('R')

		expect(previewSlots(), 'upright 1×3 in column 1 → cells 1, 5, 9').toEqual([1, 5, 9])
	})
})

describe('dropping an item', () => {
	it('dropping inside the board → the item lands on exactly the hint block', () => {
		renderPrep()
		inventoryFarAway()

		startDrag(buttonOf('sword'))
		hoverCell(6)
		const preview = previewSlots()
		releaseMouse()

		const item = useGameStore.getState().run.equipped[0]
		expect(itemCells(item, 4), 'the placed block must match the hinted block').toEqual(preview)
	})

	it('the rotated orientation is applied on drop', () => {
		renderPrep()
		inventoryFarAway()

		startDrag(buttonOf('sword'))
		hoverCell(4)
		pressKey('r')
		const preview = previewSlots()
		releaseMouse()

		const item = useGameStore.getState().run.equipped[0]
		expect(item.rotated).toBe(true)
		expect(itemCells(item, 4), 'the item lies sideways exactly where the hint was').toEqual(preview)
		expect(preview, 'sideways 3×1 → one row of three cells').toEqual([4, 5, 6])
	})

	it('dropping onto an item of a different kind swaps positions, with no overlap', () => {
		reset([blade('a', 0), jade('b', 2)], [])
		renderPrep()
		inventoryFarAway()

		startDrag(buttonOf('b'))
		hoverCell(0)
		releaseMouse()

		const run = useGameStore.getState().run
		const a = run.equipped.find((item) => item.uid === 'a')!
		const b = run.equipped.find((item) => item.uid === 'b')!
		expect(b.slot).toBe(0)
		expect(a.slot).toBe(2)
		expect(new Set([...itemCells(a, 4), ...itemCells(b, 4)]).size).toBe(itemCells(a, 4).length + itemCells(b, 4).length)
	})

	it('a hint overlapping another item → red outline and dropping places NOTHING, even with room below', () => {
		// BUG THAT HAPPENED: the hint block overlapped another item yet still drew a golden outline,
		// and the drop then "took" it — the item slid down onto an empty cell below, far away from the
		// outline the player was looking at.
		reset([blade('sword', 0), jade('gem', 5)], [])
		renderPrep()
		inventoryFarAway()

		startDrag(buttonOf('sword'))
		hoverCell(1)

		expect(previewSlots(), 'the hint block overlaps Ngọc on cell 5').toContain(5)
		expect(outlineClass(), 'must report red because an item is in the way').toContain('border-danger')

		releaseMouse()

		expect(
			useGameStore.getState().run.equipped.find((item) => item.uid === 'sword')?.slot,
			'the item must stay where it was',
		).toBe(0)
		expect(toastText(), 'the player must be told').toMatch(/không vừa món/)
	})

	it('a hint block spilling into LOCKED cells is red, even with the cursor on an item', () => {
		// BUG THAT HAPPENED (screenshot sent by a player): a 1×4 spear dragged up from the inventory had
		// its hint block both covering Ngọc and spilling two locked rows down. The cursor stood on Ngọc,
		// so the "pointing at an item" exception (meant for star merges/swaps) **hid** the overflow
		// error → the outline stayed golden even though the drop would fail.
		reset([jade('gem', 5)], [stored('spear', 'fire-spear')])
		renderPrep()
		inventoryFarAway()

		startDrag(invTileOf('spear'))
		hoverCell(5)

		expect(previewSlotsIn('Trang bị'), 'the block spills into the locked rows').toContain(13)
		expect(outlineClass(), 'overflowing the drop area must report red').toContain('border-danger')

		releaseMouse()

		const run = useGameStore.getState().run
		expect(run.equipped.map((item) => item.uid), 'the existing item stays put').toEqual(['gem'])
		expect(run.inventory.map((item) => item.uid), 'when it cannot be placed it stays in the inventory').toEqual([
			'spear',
		])
		expect(toastText(), 'the player must be shown how to rotate').toMatch(/bấm R để xoay/)
	})

	it('hint cells sit ABOVE the item layer — items must not cover the hint', () => {
		// An item is a grid cell with `relative`, so it is painted **after** the hint cells in the DOM:
		// without `z-10` the hint block is covered by items and the player cannot see where the item is
		// about to land.
		//
		// ⚠️ jsdom does not paint, so only the **layer** can be checked via the class here; verify the
		// real thing visually in a browser (screenshot) when changing the hint UI.
		reset([blade('sword', 0), jade('gem', 5)], [])
		renderPrep()
		inventoryFarAway()

		startDrag(buttonOf('sword'))
		hoverCell(1)

		const cells = [...document.querySelectorAll<HTMLElement>('[data-preview]')]
		expect(cells.length, 'a hint block is present').toBeGreaterThan(0)
		for (const cell of cells) expect(cell.className, 'hint cells must float above').toContain('z-10')
		expect(outlineClass(), 'the dashed outline must float above too').toContain('z-10')
		expect(boxOf('gem').className, 'an item ❌ must not be lifted above the hint').not.toMatch(
			/(^|\s)z-/,
		)
	})

	it('a hint block clashing with a THIRD item (besides the one under the cursor) is red', () => {
		// The "pointing at an item" exception applies only to **that item**: `resolveDrop` handles just
		// the item under the cursor, so a third item caught in the block makes the drop impossible →
		// the hint must be red.
		reset([jade('gem-a', 1), blade('sword', 3), jade('gem-b', 5)], [])
		renderPrep()
		inventoryFarAway()

		startDrag(buttonOf('sword'))
		hoverCell(5)

		expect(previewSlots(), 'the block covers Ngọc on cell 5 (under the cursor) and Ngọc on cell 1').toEqual(
			expect.arrayContaining([1, 5]),
		)
		expect(outlineClass(), 'clashing with a third item must report red').toContain('border-danger')

		releaseMouse()

		expect(
			useGameStore.getState().run.equipped.map((item) => item.uid),
			'when it cannot be placed every item stays put',
		).toEqual(['gem-a', 'sword', 'gem-b'])
	})

	it('Esc mid-drag followed by a mouse release places NOTHING', () => {
		// BUG THAT HAPPENED: `Esc` only cleared `held`, while the parent still remembered the dragged
		// item, so the **mouse release** after that still dropped the item on the last cell the cursor
		// passed over — the player cancelled yet the item moved.
		reset([blade('sword', 0), jade('gem', 5)], [])
		renderPrep()
		inventoryFarAway()

		startDrag(buttonOf('sword'))
		hoverCell(2)
		expect(outlineClass(), 'this cell can take the item (otherwise the test proves nothing)').toContain(
			'border-gold',
		)
		pressKey('Escape')
		releaseMouse()

		expect(ghost(), 'after cancelling no item follows the cursor').toBeNull()
		expect(
			useGameStore.getState().run.equipped.map((item) => [item.uid, item.slot]),
			'after cancelling nothing is placed',
		).toEqual([
			['sword', 0],
			['gem', 5],
		])
	})

	it('the board blocks text selection (holding the mouse on an empty cell must not turn the cursor 🚫)', () => {
		// Adjacent empty cells still form a **selection area**, at which point the browser switches to
		// "drag-select" → the cursor becomes 🚫 (a board is not a drop target) and it looks like that
		// cell cannot hold an item. `select-none` stops it at the source; jsdom has no selection, so
		// the class is pinned here.
		reset([blade('sword', 0)], [])
		renderPrep()

		const boards = [...document.querySelectorAll<HTMLElement>('[data-grid-board]')]
		expect(boards.length, 'both boards are present').toBe(2)
		for (const board of boards) expect(board.className, 'the board must have select-none').toContain('select-none')
	})

	it('dropping on a LOCKED cell places nothing and says so clearly', () => {
		reset([], [stored('stored')])
		renderPrep()
		inventoryFarAway()

		startDrag(invTileOf('stored'))
		hoverCell(14) // a locked cell (a level 1 pet only uses the first 12 cells)
		releaseMouse()

		expect(useGameStore.getState().run.equipped, 'must not be placed on a locked cell').toHaveLength(0)
		expect(screen.getByText(/khoá/)).toBeTruthy()
	})

	it('clicking a cell without dragging anything changes nothing', () => {
		renderPrep()
		hoverCell(9)
		fireEvent.click(cellOf(9))

		expect(useGameStore.getState().run.equipped[0].slot).toBe(0)
		expect(useUiStore.getState().itemUid).toBeNull()
	})
})

describe('inventory ↔ loadout', () => {
	it('dragging an inventory item onto the board makes it carried', () => {
		reset([], [stored('stored')])
		renderPrep()
		inventoryFarAway()

		startDrag(invTileOf('stored'))
		hoverCell(0)
		releaseMouse()

		const run = useGameStore.getState().run
		expect(run.inventory).toHaveLength(0)
		expect(run.equipped).toHaveLength(1)
		expect(run.equipped[0].uid).toBe('stored')
	})

	it('a 1×4 inventory item that does not fit the 3-row board is REJECTED (must be rotated with R)', () => {
		reset([], [stored('spear', 'fire-spear')])
		renderPrep()
		inventoryFarAway()

		startDrag(invTileOf('spear'))
		hoverCell(0)
		expect(outlineClass(), 'the hint must report red: this orientation does not fit').toContain('border-danger')
		releaseMouse()

		const run = useGameStore.getState().run
		expect(run.inventory, 'when it cannot be placed the item stays in the inventory').toHaveLength(1)
		expect(toastText(), 'the player must be shown how to rotate').toMatch(/bấm R để xoay/)
	})

	it('rotating with R mid-drag lets a 1×4 inventory item fit the 3-row board', () => {
		reset([], [stored('spear', 'fire-spear')])
		renderPrep()
		inventoryFarAway()

		startDrag(invTileOf('spear'))
		hoverCell(0)
		pressKey('r')
		expect(outlineClass(), 'after rotating the hint is no longer red').not.toContain('border-danger')
		const preview = previewSlots()
		releaseMouse()

		const run = useGameStore.getState().run
		expect(run.inventory, 'it has been moved up').toHaveLength(0)
		expect(run.equipped[0].rotated, 'matching the orientation on screen').toBe(true)
		expect(itemCells(run.equipped[0], 4)).toEqual(preview)
	})

	it('dragging a loadout item down into the inventory area stores it', () => {
		reset([jade('gem', 0)], [])
		renderPrep()
		// The inventory area contains (0,0) → a drop here counts as "inside the inventory".
		stubInventoryRect(0, 0, 1000, 1000)
		movePointerTo(400, 400)

		startDrag(buttonOf('gem'))
		releaseMouse()

		const run = useGameStore.getState().run
		expect(run.equipped, 'it left the loadout').toHaveLength(0)
		expect(run.inventory, 'it went into the inventory').toHaveLength(1)
	})
})

describe('the ⟳ button still works', () => {
	it('clicking the rotate button flips the item orientation', () => {
		renderPrep()
		fireEvent.click(screen.getByTitle('Xoay 90°'))

		expect(useGameStore.getState().run.equipped[0].rotated).toBe(true)
		expect(templateFootprint('wooden-blade', true)).toEqual({ w: 3, h: 1 })
	})
})
