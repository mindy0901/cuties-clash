import { repairStorageSlots } from './storage'
import { petLevelStats } from './pets'
import { getPet } from './pets'
import type { ItemInstance, RunState } from './types'

/** v1 save: only `items` existed, and every item counted as worn. */
export interface PersistedV1 {
	run?: Omit<RunState, 'equipped' | 'inventory'> & { items?: ItemInstance[] }
}

export interface PersistedV2 {
	run: RunState
}

/**
 * Convert a v1 save (a flat `run.items` list) into v2 (`equipped` + `inventory`).
 *
 * Items still inside the equip grid of the current pet level stay worn; anything past the capacity
 * (or sitting in the waiting tray with `slot < 0`) moves into the storage.
 *
 * ⚠️ Pure function, must **never** throw: older players would lose progress if the migration broke.
 */
export function migrateV1ToV2(persisted: PersistedV1): PersistedV2 | PersistedV1 {
	const saved = persisted?.run
	if (!saved) return persisted
	const { items, ...rest } = saved
	const level = rest.pets?.[rest.petId] ?? 1
	const size = petLevelStats(getPet(rest.petId), level).bagSize
	const all = items ?? []

	const equipped: ItemInstance[] = []
	const inventory: ItemInstance[] = []
	const occupied = new Set<number>()

	// Keep items in their original order and accept only those that still fit the grid.
	for (const item of all) {
		if (item.slot < 0 || item.slot >= size) {
			inventory.push({ ...item, slot: -1, rotated: false })
			continue
		}
		equipped.push(item)
		occupied.add(item.slot)
	}

	// `size` is only a cell count, not a collision check: the old save was already valid.
	void occupied
	// The storage is a free grid, so items entering it must have a **real cell** (❌ no `slot: -1`).
	return { run: { ...rest, equipped, inventory: repairStorageSlots(inventory) } as RunState }
}
