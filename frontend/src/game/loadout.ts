import { canPlace, createItemInstance, findFreePlacement, resolveDrop, rotateItem, templateFootprint } from './bag'
import { addToStorage, unequipIntoStorage } from './storage'
import { GRID_MAX_ROWS, getPet, petLevelStats } from './pets'
import { makeUid } from './rng'
import type { ItemInstance, RunState, Star } from './types'

/**
 * Equip grid shape: **always `GRID_MAX_ROWS` rows** (4×5 = 20 cells), while `usable` is the number
 * of cells **usable** at the pet level — anything past `usable` is a **locked cell**.
 *
 * ⚠️ These two numbers have to stay separate: using `usable` as the grid size would correctly keep
 * items out of locked rows, but the grid would only be 3 rows tall and the UI would be missing cells.
 */
export function loadoutShape(run: RunState) {
	const { bag, bagSize } = petLevelStats(getPet(run.petId), run.pets[run.petId] ?? 1)
	return { width: bag.width, rows: GRID_MAX_ROWS, size: bag.width * GRID_MAX_ROWS, usable: bagSize }
}

/** Items currently worn (having a cell inside the **usable** area of the equip grid). */
export function equippedItems(run: RunState): ItemInstance[] {
	const { usable } = loadoutShape(run)
	return run.equipped.filter((item) => item.slot >= 0 && item.slot < usable)
}

/** Whether this cell is **locked** (past the number of usable cells for the pet level). */
export function loadoutCellLocked(run: RunState, slot: number): boolean {
	const { size, usable } = loadoutShape(run)
	return slot >= usable && slot < size
}

/** Create a new item in the storage (not worn yet) — no cell yet, `acquireItem` will place it. */
export function inventoryItem(run: RunState, templateId: string, star: Star, seed: number): ItemInstance {
	return createItemInstance(templateId, star, makeUid(seed, `${templateId}-${run.inventory.length}`))
}

/**
 * Buy an item: try to wear it first, and stash it in the storage when there is no room left.
 *
 * Same as the original behaviour — buying while the equip grid still has a slot makes the item
 * usable right away, otherwise it goes to the storage for later.
 */
export function acquireItem(
	run: RunState,
	templateId: string,
	star: Star,
	seed: number,
): { run: RunState; wentToInventory: boolean } {
	const add = inventoryItem(run, templateId, star, seed)
	const { width, size, usable } = loadoutShape(run)
	const placement = findFreePlacement(run.equipped, templateId, width, size, usable)
	if (!placement) {
		return { run: addToStorage(run, add), wentToInventory: true }
	}
	const item: ItemInstance = { ...add, slot: placement.slot, rotated: placement.rotated }
	return { run: { ...run, equipped: [...run.equipped, item] }, wentToInventory: false }
}

export type TransferResult =
	| { ok: true; run: RunState }
	| { ok: false; reason: 'not-found' | 'no-space' }

/**
 * Storage → equip, **into the exact chosen cell** (the cursor cell), with the chosen orientation.
 *
 * Returns `{ ok: false, reason: 'no-space' }` when that orientation does not fit the cell — callers
 * should fall back to `equipFromInventory` so the store finds a spot itself (that function tries both
 * orientations).
 */
export function equipFromInventoryAt(
	run: RunState,
	uid: string,
	slot: number,
	rotated: boolean,
): TransferResult {
	const item = run.inventory.find((entry) => entry.uid === uid)
	if (!item) return { ok: false, reason: 'not-found' }
	const { width, size, usable } = loadoutShape(run)
	const footprint = templateFootprint(item.templateId, rotated)
	if (!canPlace(run.equipped, [], slot, footprint, width, size, usable)) return { ok: false, reason: 'no-space' }
	return {
		ok: true,
		run: {
			...run,
			inventory: run.inventory.filter((entry) => entry.uid !== uid),
			equipped: [...run.equipped, { ...item, slot, rotated }],
		},
	}
}

/** Storage → equip: find a free spot itself, **trying both orientations** (rotating when the original does not fit). */
export function equipFromInventory(run: RunState, uid: string): TransferResult {
	const item = run.inventory.find((entry) => entry.uid === uid)
	if (!item) return { ok: false, reason: 'not-found' }
	const { width, size, usable } = loadoutShape(run)
	const placement = findFreePlacement(run.equipped, item.templateId, width, size, usable)
	if (!placement) return { ok: false, reason: 'no-space' }
	return {
		ok: true,
		run: {
			...run,
			inventory: run.inventory.filter((entry) => entry.uid !== uid),
			equipped: [...run.equipped, { ...item, slot: placement.slot, rotated: placement.rotated }],
		},
	}
}

/**
 * Equip → storage, at the first free spot. Storage cells are **real data**, so an item entering the
 * storage always has a position (❌ no more `slot: -1`).
 */
export function unequipToInventory(run: RunState, uid: string): TransferResult {
	const item = run.equipped.find((entry) => entry.uid === uid)
	if (!item) return { ok: false, reason: 'not-found' }
	return { ok: true, run: unequipIntoStorage(run, uid, null) }
}

/** Sell an item from the storage or the equip grid; refunds 50% of the paid price. */
export function sellItem(run: RunState, uid: string, refund: number): RunState {
	return {
		...run,
		currency: run.currency + refund,
		equipped: run.equipped.filter((item) => item.uid !== uid),
		inventory: run.inventory.filter((item) => item.uid !== uid),
	}
}

/** Rotate a worn item. Returns the state untouched when the new orientation does not fit. */
export function rotateEquipped(run: RunState, uid: string): RunState {
	const { width, size, usable } = loadoutShape(run)
	const next = rotateItem(run.equipped, uid, width, size, usable)
	return next ? { ...run, equipped: next } : run
}

/** Drag and drop inside the equip grid. */
export function dropEquipped(run: RunState, uid: string, slot: number, rotated?: boolean) {
	const { width, size, usable } = loadoutShape(run)
	const result = resolveDrop(run.equipped, uid, slot, width, size, rotated, usable)
	return {
		run: { ...run, equipped: result.items },
		merged: result.merged,
		reason: result.reason,
	}
}

/** Compute an item's sell price (50% of what was paid). */
export function refundOf(item: ItemInstance): number {
	return Math.max(1, Math.floor(item.paid / 2))
}
