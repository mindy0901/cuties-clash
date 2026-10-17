import { describe, expect, it } from 'vitest'
import { migrateV1ToV2 } from '../migrate'
import { createItemInstance } from '../bag'
import { getPet, petLevelStats } from '../pets'
import type { RunState } from '../types'

/** Minimal v1 save with enough fields for the migration to run. */
function v1Run(items: ReturnType<typeof createItemInstance>[]): Parameters<typeof migrateV1ToV2>[0] {
	return {
		run: {
			petId: getPet('fire-pup').id,
			pets: { 'fire-pup': 1 },
			unlockedPets: ['fire-pup'],
			currency: 20,
			stage: 5,
			clearedStage: 4,
			seed: 123,
			shop: [],
			rerolls: 1,
			wins: 2,
			losses: 1,
			items,
		},
	}
}

describe('migrating a v1 save → v2', () => {
	it('level 1 has a 4×3 = 12 cell grid', () => {
		const { bagSize } = petLevelStats(getPet('fire-pup'), 1)
		expect(bagSize).toBe(12)
	})

	it('keeps items that still fit as worn and moves the surplus into the storage', () => {
		// Level 1 only has 12 cells; with 13 single-cell items the last one has to reach the storage.
		const items = Array.from({ length: 13 }, (_, slot) => createItemInstance('jade-fury', 1, `i${slot}`, slot))
		const migrated = migrateV1ToV2(v1Run(items)) as { run: RunState }

		expect(migrated.run.equipped).toHaveLength(12)
		expect(migrated.run.inventory).toHaveLength(1)
		expect(migrated.run.inventory[0].uid).toBe('i12')
		expect(migrated.run.inventory[0].slot).toBe(0)
	})

	it('moves items in the waiting tray (slot -1) into the storage', () => {
		const items = [
			createItemInstance('jade-fury', 1, 'worn', 0),
			createItemInstance('great-axe', 1, 'tray'),
		]
		const migrated = migrateV1ToV2(v1Run(items)) as { run: RunState }

		expect(migrated.run.equipped.map((item) => item.uid)).toEqual(['worn'])
		expect(migrated.run.inventory.map((item) => item.uid)).toEqual(['tray'])
	})

	it('keeps the currency, stage, pet and battle record intact', () => {
		const migrated = migrateV1ToV2(v1Run([createItemInstance('jade-fury', 1, 'a', 0)])) as { run: RunState }
		expect(migrated.run.currency).toBe(20)
		expect(migrated.run.stage).toBe(5)
		expect(migrated.run.clearedStage).toBe(4)
		expect(migrated.run.petId).toBe('fire-pup')
		expect(migrated.run.wins).toBe(2)
		expect(migrated.run.losses).toBe(1)
		// The old `items` field is gone.
		expect('items' in migrated.run).toBe(false)
	})

	it('loses no item when the grid is smaller than the item count', () => {
		const items = Array.from({ length: 20 }, (_, slot) => createItemInstance('jade-fury', 1, `i${slot}`, slot))
		const migrated = migrateV1ToV2(v1Run(items)) as { run: RunState }
		expect(migrated.run.equipped.length + migrated.run.inventory.length).toBe(20)
	})

	it('returns an empty or run-less save untouched and never throws', () => {
		expect(() => migrateV1ToV2({})).not.toThrow()
		expect(migrateV1ToV2({})).toEqual({})
		const noItems = v1Run([])
		const migrated = migrateV1ToV2(noItems) as { run: RunState }
		expect(migrated.run.equipped).toEqual([])
		expect(migrated.run.inventory).toEqual([])
	})
})
