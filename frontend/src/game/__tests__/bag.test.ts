import { describe, expect, it } from 'vitest'
import {
	adjacentUids,
	anchorFor,
	canPlace,
	cellsOf,
	createItemInstance,
	findFreePlacement,
	isMergeable,
	itemCells,
	mergeUpStar,
	occupancyOf,
	planAutoArrange,
	resolveDrop,
	rotateItem,
	sellValue,
	templateFootprint,
	toCell,
	toSlot,
} from '../bag'
import { getTemplate } from '../items'
import { installRetiredItems } from '../../test/retiredItems'
import type { ItemInstance } from '../types'

// The grid tests use the retired catalogue as fixtures (a 2×3 axe, 1×1 gems); they are registered as
// a content overlay, so nothing here ships with the game.
installRetiredItems()

/** 4 columns × 3 rows = 12 cells, used by most tests. */
const WIDTH = 4
const SIZE = 12

describe('item footprints', () => {
	it('gives the sword 1×3 and the great axe 2×3', () => {
		expect(getTemplate('wooden-blade').space).toEqual({ w: 1, h: 3 })
		expect(getTemplate('great-axe').space).toEqual({ w: 2, h: 3 })
		expect(getTemplate('fire-spear').space).toEqual({ w: 1, h: 4 })
	})

	it('a 90° rotation swaps w and h', () => {
		expect(templateFootprint('wooden-blade')).toEqual({ w: 1, h: 3 })
		expect(templateFootprint('wooden-blade', true)).toEqual({ w: 3, h: 1 })
		expect(templateFootprint('great-axe', true)).toEqual({ w: 3, h: 2 })
	})

	it('converts a cell index to row/column and back', () => {
		expect(toCell(0, WIDTH)).toEqual({ row: 0, col: 0 })
		expect(toCell(7, WIDTH)).toEqual({ row: 1, col: 3 })
		expect(toSlot({ row: 2, col: 1 }, WIDTH)).toBe(9)
	})
})

describe('cells an item covers', () => {
	it('a vertical 1×3 sword covers three cells in one column', () => {
		expect(cellsOf(1, { w: 1, h: 3 }, WIDTH)).toEqual([1, 5, 9])
	})

	it('a rotated 3×1 sword covers three cells in one row', () => {
		expect(cellsOf(0, { w: 3, h: 1 }, WIDTH)).toEqual([0, 1, 2])
	})

	it('the 2×3 great axe covers a rectangular block', () => {
		expect(cellsOf(4, { w: 2, h: 3 }, WIDTH)).toEqual([4, 5, 8, 9, 12, 13])
	})

	it('an item in the waiting tray covers no cell', () => {
		expect(itemCells(createItemInstance('wooden-blade', 1, 'a'), WIDTH)).toEqual([])
	})
})

describe('whether a placement is allowed', () => {
	it('rejects a block that spills outside the grid', () => {
		// 4 columns × 3 rows. A vertical 1×3 sword only stands in row 0 (cells 0..3).
		expect(canPlace([], [], 4, { w: 1, h: 3 }, WIDTH, SIZE)).toBe(false)
		expect(canPlace([], [], 0, { w: 1, h: 3 }, WIDTH, SIZE)).toBe(true)
		expect(canPlace([], [], 8, { w: 1, h: 3 }, WIDTH, SIZE)).toBe(false)
	})

	it('rejects a block that spills into another column', () => {
		// A 3-cell wide block only fits when anchored in column 0 or 1.
		console.log('DBG cells', JSON.stringify(cellsOf(3, { w: 3, h: 1 }, WIDTH)), 'WIDTH', WIDTH, 'SIZE', SIZE)
		console.log('DBG @3', canPlace([], [], 3, { w: 3, h: 1 }, WIDTH, SIZE))
		expect(canPlace([], [], 3, { w: 3, h: 1 }, WIDTH, SIZE)).toBe(false)
		expect(canPlace([], [], 1, { w: 3, h: 1 }, WIDTH, SIZE)).toBe(true)
	})

	it('rejects a block that overlaps another item', () => {
		const items = [createItemInstance('great-axe', 1, 'axe', 0)]
		// The great axe covers 0,1,4,5,8,9. Cell 5 is already taken.
		expect(occupancyOf(items, WIDTH).get(5)?.uid).toBe('axe')
		expect(canPlace(items, [], 5, { w: 1, h: 1 }, WIDTH, SIZE)).toBe(false)
		expect(canPlace(items, [], 2, { w: 1, h: 1 }, WIDTH, SIZE)).toBe(true)
	})

	it('ignores the item being moved itself', () => {
		const items = [createItemInstance('great-axe', 1, 'axe', 0)]
		expect(canPlace(items, ['axe'], 0, { w: 2, h: 3 }, WIDTH, SIZE)).toBe(true)
	})
})

describe('finding free space', () => {
	it('places a single-cell item in the first free cell', () => {
		const items = [createItemInstance('jade-fury', 1, 'a', 0)]
		expect(findFreePlacement(items, 'jade-fury', WIDTH, SIZE)).toEqual({ slot: 1, rotated: false })
	})

	it('keeps the original orientation while it still fits', () => {
		const items = [createItemInstance('jade-fury', 1, 'a', 0)]
		expect(findFreePlacement(items, 'wooden-blade', WIDTH, SIZE)).toEqual({ slot: 1, rotated: false })
	})

	it('rotates itself when the original orientation does not fit but the rotation does', () => {
		// 4 columns × 3 rows. Blocked: both column 1 and column 2, the two lower cells of column 0,
		// and all of column 3 except the top cell. Result: only row 0 stays contiguous and free.
		//   free:    0 1 2 3
		//   blocked: 4 5 6 7
		//   blocked: 8 9 10 11
		const blockedSlots = [4, 5, 6, 7, 8, 9, 10, 11]
		const items = blockedSlots.map((slot, index) =>
			createItemInstance('jade-fury', 1, `b${index}`, slot),
		)
		// A vertical 1×3 sword needs 3 cells in one column — no column has enough left.
		expect(canPlace(items, [], 0, { w: 1, h: 3 }, WIDTH, SIZE)).toBe(false)
		// The rotated 3×1 sword fits in row 0.
		expect(canPlace(items, [], 0, { w: 3, h: 1 }, WIDTH, SIZE)).toBe(true)
		expect(findFreePlacement(items, 'wooden-blade', WIDTH, SIZE)).toEqual({ slot: 0, rotated: true })
	})

	it('returns null when nothing is left', () => {
		const items = Array.from({ length: SIZE }, (_, slot) => createItemInstance('jade-fury', 1, `f${slot}`, slot))
		expect(findFreePlacement(items, 'jade-fury', WIDTH, SIZE)).toBeNull()
	})
})

describe('drag and drop', () => {
	it('moves an item into an empty area', () => {
		const items = [createItemInstance('jade-fury', 1, 'a', 0)]
		const result = resolveDrop(items, 'a', 7, WIDTH, SIZE)
		expect(result.items.find((item) => item.uid === 'a')?.slot).toBe(7)
		expect(result.reason).toBeUndefined()
	})

	it('places a vertical sword in the exact anchor cell and keeps the orientation', () => {
		const items = [createItemInstance('wooden-blade', 1, 'a')]
		const result = resolveDrop(items, 'a', 1, WIDTH, SIZE)
		expect(result.items[0]).toMatchObject({ slot: 1, rotated: false })
		expect(itemCells(result.items[0], WIDTH)).toEqual([1, 5, 9])
	})

	it('anchors to the closest valid cell when the target area spills outside the grid', () => {
		const items = [createItemInstance('wooden-blade', 1, 'a')]
		// Cell 8 (last row) cannot hold 3 rows of a vertical sword → clamped up to the row above,
		// keeping the column.
		const result = resolveDrop(items, 'a', 8, WIDTH, SIZE)
		expect(result.reason).toBeUndefined()
		const cells = itemCells(result.items.find((item) => item.uid === 'a')!, WIDTH)
		expect(cells, 'must still be a 1×3 block').toHaveLength(3)
		// Same column 0 — it must not jump to another column.
		expect(cells).toEqual([0, 4, 8])
	})

	it('REJECTS when another item is in the way instead of sliding to the next free cell', () => {
		const items = [
			createItemInstance('jade-fury', 1, 'block', 5),
			createItemInstance('wooden-blade', 1, 'a', 9),
		]
		// Dropped on cell 1 — that cell is free, but the vertical sword would overlap 'block' at cell 5
		// and there is free space below it.
		// ⚠️ ❌ It must not slide down into that free space: the preview draws cell 2 (over 'block'), so
		// dropping there is **not a placement** — the drop has to match the outline the player sees.
		const result = resolveDrop(items, 'a', 1, WIDTH, SIZE)
		expect(result.reason).toBe('no-space')
		expect(result.items.find((item) => item.uid === 'a')?.slot, 'the item stays where it was').toBe(9)
	})

	it('merges two identical copies into +1★ and adds up the paid price', () => {
		const items = [
			createItemInstance('wooden-blade', 1, 'a', 0),
			createItemInstance('wooden-blade', 1, 'b', 3),
		]
		const result = resolveDrop(items, 'b', 0, WIDTH, SIZE)
		expect(result.merged).toBe(true)
		expect(result.items).toHaveLength(1)
		expect(result.items[0]).toMatchObject({ templateId: 'wooden-blade', star: 2, slot: 0, paid: 6 })
	})

	it('swaps two items of different kinds when both fit', () => {
		const items = [
			createItemInstance('jade-fury', 1, 'one', 0),
			createItemInstance('heal-dew', 1, 'two', 5),
		]
		const result = resolveDrop(items, 'one', 5, WIDTH, SIZE)
		expect(result.swapped).toBe(true)
		expect(result.items.find((item) => item.uid === 'one')?.slot).toBe(5)
		expect(result.items.find((item) => item.uid === 'two')?.slot).toBe(0)
	})

	it('cannot merge once the item is 5★', () => {
		const a = createItemInstance('wooden-blade', 5, 'a')
		const b = createItemInstance('wooden-blade', 5, 'b', 3)
		expect(isMergeable(a, b)).toBe(false)
	})

	it('two 4★ items still merge into a 5★ one', () => {
		const a = createItemInstance('wooden-blade', 4, 'a')
		const b = createItemInstance('wooden-blade', 4, 'b', 3)
		expect(isMergeable(a, b)).toBe(true)
	})

	it('only merges when the star ranks match', () => {
		expect(isMergeable(createItemInstance('wooden-blade', 2, 'a'), createItemInstance('wooden-blade', 1, 'b'))).toBe(false)
	})

	it('suggests the star a shop purchase would merge up to', () => {
		const bag = [
			createItemInstance('wooden-blade', 1, 'a'),
			createItemInstance('jade-fury', 2, 'b'),
		]
		// Same template + same star → the purchase lands a 2★.
		expect(mergeUpStar(bag, { templateId: 'wooden-blade', star: 1 })).toBe(2)
		expect(mergeUpStar(bag, { templateId: 'jade-fury', star: 2 })).toBe(3)
		// A different star rank, a different item, or an empty bag → nothing to merge with.
		expect(mergeUpStar(bag, { templateId: 'wooden-blade', star: 2 })).toBeNull()
		expect(mergeUpStar(bag, { templateId: 'heal-dew', star: 1 })).toBeNull()
		expect(mergeUpStar([], { templateId: 'wooden-blade', star: 1 })).toBeNull()
		// A 5★ copy can never merge again, even with a twin.
		expect(mergeUpStar([createItemInstance('wooden-blade', 5, 'a')], { templateId: 'wooden-blade', star: 5 })).toBeNull()
	})

	it('rejects a cell outside the grid', () => {
		const items = [createItemInstance('jade-fury', 1, 'a')]
		expect(resolveDrop(items, 'a', 99, WIDTH, SIZE).reason).toBe('out-of-bounds')
	})
})

describe('rotating in place', () => {
	it('rotates when the new orientation still fits', () => {
		const items = [createItemInstance('wooden-blade', 1, 'a', 0)]
		const rotated = rotateItem(items, 'a', WIDTH, SIZE)
		expect(rotated?.[0].rotated).toBe(true)
		expect(itemCells(rotated![0], WIDTH)).toEqual([0, 1, 2])
	})

	it('rejects a rotation whose new orientation overlaps another item', () => {
		const items = [
			createItemInstance('wooden-blade', 1, 'a', 0),
			createItemInstance('jade-fury', 1, 'block', 2),
		]
		expect(rotateItem(items, 'a', WIDTH, SIZE)).toBeNull()
	})

	it('does not rotate an item sitting in the waiting tray', () => {
		const items = [createItemInstance('wooden-blade', 1, 'a')]
		expect(rotateItem(items, 'a', WIDTH, SIZE)).toBeNull()
	})
})

describe('automatic arranging', () => {
	it('lays a tray item into the first free spot', () => {
		const items = [createItemInstance('jade-fury', 1, 'tray')]
		expect(planAutoArrange(items, WIDTH, SIZE)).toEqual([{ uid: 'tray', slot: 0, rotated: false }])
	})

	it('leaves items already placed in the storage alone', () => {
		const items = [createItemInstance('jade-fury', 1, 'placed', 0)]
		expect(planAutoArrange(items, WIDTH, SIZE)).toEqual([])
	})

	it('avoids overlapping an item already in the storage', () => {
		const items = [
			createItemInstance('great-axe', 1, 'axe', 0),
			createItemInstance('jade-fury', 1, 'tray'),
		]
		// The great axe covers 0,1,4,5,8,9 → the first free cell is 2.
		expect(planAutoArrange(items, WIDTH, SIZE)).toEqual([{ uid: 'tray', slot: 2, rotated: false }])
	})

	it('never lays two tray items into the same cell', () => {
		const items = [
			createItemInstance('jade-fury', 1, 't1'),
			createItemInstance('jade-fury', 1, 't2'),
		]
		const moves = planAutoArrange(items, WIDTH, SIZE)
		expect(moves).toHaveLength(2)
		expect(moves[0].slot).not.toBe(moves[1].slot)
	})

	it('skips an item that has no room left', () => {
		const full = Array.from({ length: SIZE }, (_, slot) => createItemInstance('jade-fury', 1, `f${slot}`, slot))
		const items = [...full, createItemInstance('jade-fury', 1, 'tray')]
		expect(planAutoArrange(items, WIDTH, SIZE)).toEqual([])
	})
})

describe('adjacency per cell', () => {
	it('computes adjacency from every cell of an item, not just the anchor cell', () => {
		// The vertical sword in column 0 covers 0,4,8; the jade in cell 1 sits next to cell 0.
		const items: ItemInstance[] = [
			createItemInstance('wooden-blade', 1, 'sword', 0),
			createItemInstance('jade-fury', 1, 'jade', 1),
		]
		const map = occupancyOf(items, WIDTH)
		const swordCells = cellsOf(0, { w: 1, h: 3 }, WIDTH)
		expect(adjacentUids(map, swordCells, WIDTH, SIZE, 'sword')).toEqual(new Set(['jade']))
	})

	it('does not count adjacency when the cells only touch diagonally', () => {
		// The vertical sword in column 0 covers 0,4,8. The jade in cell 5 is diagonal to cells 0 and 4.
		const items: ItemInstance[] = [
			createItemInstance('wooden-blade', 1, 'sword', 0),
			createItemInstance('jade-fury', 1, 'jade', 5),
		]
		const map = occupancyOf(items, WIDTH)
		// Cell 5 touches cell 4 (above) → there IS adjacency after all. Cell 6 is the true diagonal:
		// 6 sits in row 1 column 2 while the sword covers column 0 → far apart, not adjacent.
		expect(adjacentUids(map, cellsOf(0, { w: 1, h: 3 }, WIDTH), WIDTH, SIZE, 'sword').has('jade')).toBe(true)

		const diagonal: ItemInstance[] = [
			createItemInstance('wooden-blade', 1, 'sword', 0),
			createItemInstance('jade-fury', 1, 'jade', 6),
		]
		const diagonalMap = occupancyOf(diagonal, WIDTH)
		expect(adjacentUids(diagonalMap, cellsOf(0, { w: 1, h: 3 }, WIDTH), WIDTH, SIZE, 'sword').has('jade')).toBe(false)
	})
})

describe('selling', () => {
	it('refunds 50% of the paid price', () => {
		// A 3★ Phủ Nặng (cost 8) is worth four copies = 32 🐾, so it sells for 16.
		expect(sellValue(createItemInstance('great-axe', 3, 'a'))).toBe(16)
		expect(sellValue(createItemInstance('hide-vest', 1, 'b'))).toBe(1)
	})
})

/**
 * `anchorFor` is what keeps the **drag preview cells** and the **real drop target** in sync.
 *
 * The bug that happened: dragging a 4×1 spear and hovering cell 5 of a 4-column grid → the preview
 * produced `[5,6,7,8]`, spilling onto the row below (looking like 2 rows), while `resolveDrop`
 * rejected cell 5 → the drop only worked when pointing exactly at cell 4.
 */
describe('anchor cell clamping (anchorFor)', () => {
	const W = 4
	const SIZE_12 = 12 // 4×3 grid

	it('keeps the cell when the block already fits inside the grid', () => {
		expect(anchorFor(4, { w: 4, h: 1 }, W, SIZE_12)).toBe(4)
		expect(anchorFor(0, { w: 1, h: 3 }, W, SIZE_12)).toBe(0)
		expect(anchorFor(5, { w: 1, h: 1 }, W, SIZE_12)).toBe(5)
	})

	it('a 4×1 item always lands in column 0 and never spills onto another row', () => {
		for (const slot of [4, 5, 6, 7]) {
			expect(anchorFor(slot, { w: 4, h: 1 }, W, SIZE_12)).toBe(4)
		}
		for (const slot of [0, 1, 2, 3]) {
			expect(anchorFor(slot, { w: 4, h: 1 }, W, SIZE_12)).toBe(0)
		}
	})

	it('a 3×1 item is clamped to the closest column with enough room', () => {
		// Columns 0 and 1 both fit a 3-wide block (column 1 + 3 = 4).
		expect(anchorFor(0, { w: 3, h: 1 }, W, SIZE_12)).toBe(0)
		expect(anchorFor(1, { w: 3, h: 1 }, W, SIZE_12)).toBe(1)
		expect(anchorFor(2, { w: 3, h: 1 }, W, SIZE_12)).toBe(1)
		expect(anchorFor(3, { w: 3, h: 1 }, W, SIZE_12)).toBe(1)
	})

	it('an item that can never fit (1×4 in a 3-row grid) is clamped to cell 0 of the row', () => {
		// The grid is only 3 rows tall, so a 4-high block NEVER fits. Clamping still returns a valid
		// cell so the preview can be drawn; rejecting the drop is `canPlace`'s job.
		// The row clamps to row 0 while the column is kept (cell 11 = row 2, column 3) → cell 3.
		expect(anchorFor(11, { w: 1, h: 4 }, W, SIZE_12)).toBe(3)
		expect(canPlace([], [], 3, { w: 1, h: 4 }, W, SIZE_12)).toBe(false)
	})

	it('a 1×3 item is clamped up to the closest row with enough room', () => {
		expect(anchorFor(8, { w: 1, h: 3 }, W, SIZE_12)).toBe(0)
		expect(anchorFor(9, { w: 1, h: 3 }, W, SIZE_12)).toBe(1)
		expect(anchorFor(10, { w: 1, h: 3 }, W, SIZE_12)).toBe(2)
	})

	it('a negative or out-of-grid cell still yields a valid anchor cell', () => {
		// Negative cell → top-left corner; a cell past the grid → clamped to the bottom-right corner.
		expect(anchorFor(-1, { w: 2, h: 2 }, W, SIZE_12)).toBe(0)
		expect(anchorFor(999, { w: 2, h: 2 }, W, SIZE_12)).toBe(6)
	})

	it('after clamping the preview always stays inside a SINGLE row for a 4×1 item', () => {
		for (const slot of [4, 5, 6, 7]) {
			const anchor = anchorFor(slot, { w: 4, h: 1 }, W, SIZE_12)
			const cells = cellsOf(anchor, { w: 4, h: 1 }, W)
			const rows = new Set(cells.map((cell) => toCell(cell, W).row))
			expect([...rows], `cell ${slot}`).toEqual([1])
			expect(cells).toEqual([4, 5, 6, 7])
		}
	})

	it('accepts the cursor cell directly without clamping it first', () => {
		// The 4×1 blade: cell 5 (column 1) is not a valid anchor cell, but the function tries a nearby
		// cell by itself.
		const blade = createItemInstance('fire-spear', 1, 'spear', 0, true)
		const items = [blade]

		for (const slot of [5, 6, 7]) {
			const result = resolveDrop(items, 'spear', slot, W, SIZE_12, true)
			expect(result.reason, `cell ${slot}`).toBeUndefined()
			expect(itemCells(result.items[0], W)).toHaveLength(4)
		}
	})
})
