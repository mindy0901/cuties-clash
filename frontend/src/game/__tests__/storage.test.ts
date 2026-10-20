import { describe, expect, it } from 'vitest'
import { installRetiredItems } from '../../test/retiredItems'

installRetiredItems()
import { createItemInstance, itemCells, templateFootprint, toCell } from '../bag'
import { dropInStorage, storageRows, storageShape, STORAGE_WIDTH, repairStorageSlots, rotateInStorage, sortStorage, unequipIntoStorage } from '../storage'
import type { ItemInstance, RunState } from '../types'

/**
 * The storage is a **free grid**: an item sits in the exact cell the player dropped it in, in any
 * orientation, and the storage ❌ **never** packs it. This suite locks that behaviour down — the
 * previous version packed items one after another and overwrote the cell just dropped into, so
 * dragging inside the storage looked like it did nothing.
 */

/** Minimal run: the pure functions only need `equipped` + `inventory`. */
function runWith(inventory: ItemInstance[], equipped: ItemInstance[] = []): RunState {
	return { inventory, equipped } as RunState
}

describe('the storage is a free grid', () => {
	it('an item dropped on a cell stays in that exact cell (no packing towards the start)', () => {
		const gem = createItemInstance('jade-fury', 1, 'gem', 0)
		const { run } = dropInStorage(runWith([gem]), 'gem', 20)

		expect(run.inventory[0].slot).toBe(20)
	})

	it('other storage items are NOT re-laid when another item is dropped', () => {
		const a = createItemInstance('jade-fury', 1, 'a', 3)
		const b = createItemInstance('jade-fury', 1, 'b', 11)
		const c = createItemInstance('jade-fury', 1, 'c', 40)

		const { run } = dropInStorage(runWith([a, b, c]), 'c', 45)

		expect(run.inventory.map((item) => [item.uid, item.slot])).toEqual([
			['a', 3],
			['b', 11],
			['c', 45],
		])
	})

	it('dropping onto a DIFFERENT item is REJECTED — no swap, no displacement', () => {
		// BUG THAT HAPPENED: dropping onto another storage item **swapped** the two, i.e. the
		// stationary one was pushed elsewhere. The storage is a free grid, so that action is rejected.
		const blade = createItemInstance('wooden-blade', 1, 'blade', 0)
		const gem = createItemInstance('jade-fury', 1, 'gem', 2)

		const { run, result } = dropInStorage(runWith([blade, gem]), 'gem', 0)

		expect(result.reason, 'must be rejected').toBe('no-space')
		expect(run.inventory.map((item) => [item.uid, item.slot])).toEqual([
			['blade', 0],
			['gem', 2],
		])
	})

	it('dropping onto an identical item merges the star ranks', () => {
		const a = createItemInstance('jade-fury', 1, 'a', 0)
		const b = createItemInstance('jade-fury', 1, 'b', 9)

		const { run, result } = dropInStorage(runWith([a, b]), 'b', 0)

		expect(result.merged).toBe(true)
		expect(run.inventory).toHaveLength(1)
		expect(run.inventory[0].star).toBe(2)
	})

	it('dropping on a cell too small for a long item still places it (nearby anchor cell)', () => {
		// Cell 5 sits in the middle of the 8-column grid and a 1×4 item can be anchored right there.
		const spear = createItemInstance('fire-spear', 1, 'spear', 0)
		const { run } = dropInStorage(runWith([spear]), 'spear', 5)
		expect(run.inventory[0].slot).toBe(5)
	})

	it('rotates a storage item when the new orientation fits', () => {
		const axe = createItemInstance('great-axe', 1, 'axe', 0)
		const { run } = dropInStorage(runWith([axe]), 'axe', 2)

		const rotated = rotateInStorage(run, 'axe')
		expect(rotated?.inventory[0].rotated).toBe(true)
		// 2×3 becomes 3×2 — still snug inside the 8 columns.
		expect(rotated?.inventory[0].slot).toBe(2)
	})

	it('returns null when it cannot rotate (the new orientation spills outside the grid)', () => {
		// A 1×4 in **column 5**: rotating into 4×1 would spill past column 8 → rejected.
		const spear = createItemInstance('fire-spear', 1, 'spear', 5)
		const run = runWith([spear])
		expect(rotateInStorage(run, 'spear')).toBeNull()
	})
})

describe('the storage has unlimited capacity', () => {
	it('the grid grows taller when an item sits lower down', () => {
		expect(storageRows([])).toBe(8)

		const deep = createItemInstance('jade-fury', 1, 'deep', 20 * STORAGE_WIDTH)
		expect(storageRows([deep])).toBeGreaterThan(20)
	})

	it('buying while the rendered grid is full still finds room (the grid grows taller)', () => {
		// Fill the first 8×8 with single-cell items, then drop one more below them.
		const full = Array.from({ length: 64 }, (_, index) => createItemInstance('jade-fury', 1, `f${index}`, index))
		const extra = createItemInstance('jade-fury', 1, 'extra', 0)

		const { run } = dropInStorage(runWith([...full, extra]), 'extra', 64)

		const placed = run.inventory.find((item) => item.uid === 'extra')!
		expect(placed.slot).toBeGreaterThanOrEqual(64)
		expect(storageShape(run.inventory).usable).toBeGreaterThan(placed.slot)
	})
})

describe('equip → storage', () => {
	it('an unequipped item lands in the hovered cell', () => {
		const worn = createItemInstance('jade-fury', 1, 'worn', 0)
		const run = unequipIntoStorage(runWith([], [worn]), 'worn', 17)

		expect(run.equipped).toHaveLength(0)
		expect(run.inventory[0].slot).toBe(17)
	})

	it('with no hovered cell the storage finds a free spot itself', () => {
		const worn = createItemInstance('jade-fury', 1, 'worn', 0)
		const run = unequipIntoStorage(runWith([], [worn]), 'worn', null)
		expect(run.inventory[0].slot).toBe(0)
	})

	it('lays the item into free space instead of onto the item already there', () => {
		const existing = createItemInstance('jade-fury', 1, 'existing', 0)
		const worn = createItemInstance('jade-fury', 1, 'worn', 0)
		const run = unequipIntoStorage(runWith([existing], [worn]), 'worn', null)
		expect(run.inventory.find((item) => item.uid === 'existing')?.slot).toBe(0)
		expect(run.inventory.find((item) => item.uid === 'worn')?.slot).toBe(1)
	})
})

describe('the sort button', () => {
	it('packs the storage from the top-left with no gaps, strongest items first', () => {
		const scattered = [
			createItemInstance('jade-fury', 1, 'weak-gem', 60),
			createItemInstance('fire-spear', 3, 'strong-spear', 20),
			createItemInstance('wooden-blade', 5, 'best-blade', 45),
		]

		const sorted = sortStorage(scattered)

		expect(sorted.map((item) => item.uid)).toEqual(['best-blade', 'strong-spear', 'weak-gem'])
		expect(sorted[0].slot, 'the strongest item takes the first cell').toBe(0)
		// Every item sits somewhere valid and nothing overlaps.
		const used = new Set<number>()
		for (const item of sorted) {
			expect(item.slot).toBeGreaterThanOrEqual(0)
			const cells = itemCells(item, STORAGE_WIDTH)
			expect(cells.length).toBeGreaterThan(0)
			for (const cell of cells) {
				expect(used.has(cell), `${item.uid} overlaps at ${cell}`).toBe(false)
				used.add(cell)
			}
		}
		// A tidy pack never leaves a hole row above the last item.
		const bottom = Math.max(
			...sorted.map((item) => toCell(item.slot, STORAGE_WIDTH).row + templateFootprint(item.templateId, item.rotated).h),
		)
		expect(bottom).toBeLessThanOrEqual(4)
	})

	it('puts a lone item in the first cell as well', () => {
		const only = createItemInstance('jade-fury', 2, 'only', 33)
		const [sorted] = sortStorage([only])
		expect(sorted.slot).toBe(0)
		expect(sorted.star, 'sorting never changes what an item is').toBe(2)
	})
})

describe('repairing an old save', () => {
	it('an item missing a cell (slot -1) is laid into free space while placed items stay put', () => {
		const placed = createItemInstance('jade-fury', 1, 'placed', 12)
		const tray = { ...createItemInstance('jade-fury', 1, 'tray'), slot: -1 }

		const repaired = repairStorageSlots([placed, tray])

		expect(repaired.find((item) => item.uid === 'placed')?.slot, 'a position the player chose must stay').toBe(12)
		expect(repaired.find((item) => item.uid === 'tray')?.slot).toBe(0)
	})

	it('when two items share a cell the later one is moved elsewhere', () => {
		const a = createItemInstance('jade-fury', 1, 'a', 4)
		const b = createItemInstance('jade-fury', 1, 'b', 4)

		const repaired = repairStorageSlots([a, b])

		expect(repaired[0].slot).toBe(4)
		expect(repaired[1].slot).not.toBe(4)
	})
})
