import {
	canPlace,
	findFreePlacement,
	footprintOf,
	resolveDrop,
	rotateItem,
	templateFootprint,
	toCell,
	type MoveResult,
	type Placement,
} from './bag'
import { getTemplate } from './items'
import type { ItemInstance, RunState } from './types'

/**
 * **The storage is a free grid**, exactly like the equip grid: each item sits in **the very cell the
 * player dropped it in** and keeps **the orientation the player chose**. The storage ❌ **never**
 * packs items into a single column.
 *
 * ⚠️ WHY: the previous version laid items out sequentially (each item after the previous one) and
 * **overwrote** the cell the player had just dropped into, so dragging inside the storage looked
 * like it "did nothing" — the action took effect but the position was recomputed immediately.
 * Storage positions are now real data (`slot`/`rotated`) and only change when the player acts.
 */

/** Number of storage columns. */
export const STORAGE_WIDTH = 8

/** Minimum number of rows — an empty storage still renders a full grid. */
export const STORAGE_MIN_ROWS = 8

/** Spare empty rows kept at the bottom so there is always room to drop a new item. */
const STORAGE_SPARE_ROWS = 1

/**
 * Rows needed to hold every item in `items`: the lowest item bottom, plus the spare rows.
 *
 * Because this is derived from the data, the storage stays **unbounded**: dropping an item on the
 * spare row simply makes the grid taller, with no separate "capacity" to maintain.
 */
export function storageRows(items: ItemInstance[]): number {
	let bottom = 0
	for (const item of items) {
		if (item.slot < 0) continue
		const size = footprintOf(getTemplate(item.templateId).space, item.rotated)
		bottom = Math.max(bottom, toCell(item.slot, STORAGE_WIDTH).row + size.h)
	}
	return Math.max(STORAGE_MIN_ROWS, bottom + STORAGE_SPARE_ROWS)
}

/** Storage grid shape. Every cell is usable — the storage has no locked cells. */
export function storageShape(items: ItemInstance[]) {
	const rows = storageRows(items)
	const size = rows * STORAGE_WIDTH
	return { width: STORAGE_WIDTH, rows, size, usable: size }
}

/**
 * **Roomy** grid used while *searching* for a spot: the tallest item is 4 rows (a 4×1 item is only
 * 1 row tall), so `count × 4` rows are always enough for `count` items.
 *
 * ❌ Do not search using the rendered grid: once it is full down to the spare row a drop would fail
 * for no good reason, while the storage is supposed to be unbounded.
 */
function searchGridSize(count: number): number {
	return Math.max(STORAGE_MIN_ROWS, count * 4) * STORAGE_WIDTH
}

/** Closest free spot from the top of the storage (prefers the original orientation, rotates only when needed). */
export function findStoragePlacement(items: ItemInstance[], templateId: string): Placement | null {
	return findFreePlacement(items, templateId, STORAGE_WIDTH, searchGridSize(items.length + 1))
}

/**
 * **Repairs where storage items sit** while loading a save: an item missing a cell (`slot < 0`, the
 * old save format), a cell outside the grid, or a cell that **collides** with another item is laid
 * out again in the first free spot.
 *
 * Items that already have a valid position are **left alone** — once the player placed one, it is
 * not repacked.
 */
export function repairStorageSlots(items: ItemInstance[]): ItemInstance[] {
	const gridSize = searchGridSize(items.length + 1)
	const placed: ItemInstance[] = []
	for (const item of items) {
		const size = templateFootprint(item.templateId, item.rotated)
		if (item.slot >= 0 && canPlace(placed, [], item.slot, size, STORAGE_WIDTH, gridSize)) {
			placed.push(item)
			continue
		}
		const placement = findFreePlacement(placed, item.templateId, STORAGE_WIDTH, gridSize)
		placed.push(
			placement ? { ...item, slot: placement.slot, rotated: placement.rotated } : { ...item, slot: 0, rotated: false },
		)
	}
	return placed
}

/**
 * Rearrange the whole storage into a tidy, gap-free grid: the strongest items first (star rank, then
 * footprint, then name), each laid out at the first free spot.
 *
 * This is the **only** place that repacks the storage — ❌ the grid never arranges items by itself
 * (see `docs/GAME-RULES.md`: Kho đồ is a free grid, a drop is rejected rather than slid). The player
 * asks for it explicitly with the **Sắp xếp** button.
 */
export function sortStorage(items: ItemInstance[]): ItemInstance[] {
	const order = [...items].sort((a, b) => {
		if (a.star !== b.star) return b.star - a.star
		const sizeA = footprintOf(getTemplate(a.templateId).space, a.rotated)
		const sizeB = footprintOf(getTemplate(b.templateId).space, b.rotated)
		const areaA = sizeA.w * sizeA.h
		const areaB = sizeB.w * sizeB.h
		if (areaA !== areaB) return areaB - areaA
		if (a.templateId !== b.templateId) return a.templateId < b.templateId ? -1 : 1
		return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0
	})

	const gridSize = searchGridSize(items.length + 1)
	const placed: ItemInstance[] = []
	for (const item of order) {
		// `findFreePlacement` walks the grid row by row, so items fill it from the top-left corner.
		const placement = findFreePlacement(placed, item.templateId, STORAGE_WIDTH, gridSize)
		placed.push(placement ? { ...item, slot: placement.slot, rotated: placement.rotated } : { ...item })
	}
	return placed
}

/**
 * Put an item that is **not in the storage yet** into it: prefer the hovered cell (`slot`), and when
 * that does not fit, search for a free spot (the storage is unbounded, so a spot always exists).
 */
function placeNew(items: ItemInstance[], item: ItemInstance, slot: number | null, rotated: boolean) {
	const gridSize = searchGridSize(items.length + 1)
	if (slot !== null) {
		const incoming = [...items, { ...item, slot: -1, rotated }]
		const result = resolveDrop(incoming, item.uid, slot, STORAGE_WIDTH, gridSize, rotated)
		if (!result.reason) return { items: result.items, merged: result.merged }
	}
	const placement = findFreePlacement(items, item.templateId, STORAGE_WIDTH, gridSize)
	return {
		items: placement
			? [...items, { ...item, slot: placement.slot, rotated: placement.rotated }]
			: [...items, { ...item, slot: 0, rotated: false }],
		merged: false,
	}
}

/** Equip → storage, **into the hovered cell** when it fits; otherwise search for a spot. */
export function unequipIntoStorage(run: RunState, uid: string, slot: number | null, rotated = false): RunState {
	const item = run.equipped.find((entry) => entry.uid === uid)
	if (!item) return run
	const { items } = placeNew(run.inventory, item, slot, rotated)
	return { ...run, equipped: run.equipped.filter((entry) => entry.uid !== uid), inventory: items }
}

/** Buying while the equip grid is full: stash the new item in the first free storage spot. */
export function addToStorage(run: RunState, item: ItemInstance): RunState {
	return { ...run, inventory: placeNew(run.inventory, item, null, false).items }
}

/**
 * Move an item **inside the storage**: drop it on an empty cell, or **merge stars** when dropped on
 * an identical item.
 *
 * ❌ **No swapping**: dropping onto a different item is **rejected** (`reason: 'no-space'`), it does
 * ❌ not push the item already sitting there somewhere else. The storage is a free grid, so empty
 * cells are always available, and "drop in one place and displace another item" is behaviour nobody
 * asked for.
 */
export function dropInStorage(
	run: RunState,
	uid: string,
	slot: number | null,
	rotated?: boolean,
): { run: RunState; result: MoveResult } {
	const empty: MoveResult = {
		items: run.inventory,
		merged: false,
		swapped: false,
		rotated: false,
		reason: 'blocked',
	}
	const moving = run.inventory.find((entry) => entry.uid === uid)
	if (!moving) return { run, result: empty }

	const result =
		slot === null
			? empty
			: resolveDrop(run.inventory, uid, slot, STORAGE_WIDTH, storageShape(run.inventory).size, rotated)
	if (result.swapped) {
		return { run, result: { ...empty, reason: 'no-space' } }
	}
	if (!result.reason) return { run: { ...run, inventory: result.items }, result }

	// Dropped into the empty area of the storage, or the rendered grid is already full → lay the item
	// out in the **roomier grid**: the storage is unbounded, so the grid grows instead of the action
	// being dropped.
	const rest = run.inventory.filter((entry) => entry.uid !== uid)
	const { items } = placeNew(rest, moving, null, rotated ?? moving.rotated ?? false)
	return {
		run: { ...run, inventory: items },
		result: { items, merged: false, swapped: false, rotated: false },
	}
}

/** Rotate an item **inside the storage** in place. Returns `null` when the new orientation does not fit. */
export function rotateInStorage(run: RunState, uid: string): RunState | null {
	const { size } = storageShape(run.inventory)
	const next = rotateItem(run.inventory, uid, STORAGE_WIDTH, size)
	return next ? { ...run, inventory: next } : null
}
