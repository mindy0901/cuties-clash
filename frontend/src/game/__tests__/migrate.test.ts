import { describe, expect, it } from 'vitest'
import { migrateV1ToV2, migrateV2ToV3 } from '../migrate'
import { createItemInstance } from '../bag'
import { getCutie, cutieLevelStats } from '../cuties'
import type { RunState } from '../types'

/** Minimal v1 save with enough fields for the migration to run. */
function v1Run(items: ReturnType<typeof createItemInstance>[]): Parameters<typeof migrateV1ToV2>[0] {
	return {
		run: {
			cutieId: getCutie('fire-pup').id,
			cuties: { 'fire-pup': 1 },
			unlockedCuties: ['fire-pup'],
			gold: 20,
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
		const { bagSize } = cutieLevelStats(getCutie('fire-pup'), 1)
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

	it('keeps the gold, stage, cutie and battle record intact', () => {
		const migrated = migrateV1ToV2(v1Run([createItemInstance('jade-fury', 1, 'a', 0)])) as { run: RunState }
		expect(migrated.run.gold).toBe(20)
		expect(migrated.run.stage).toBe(5)
		expect(migrated.run.clearedStage).toBe(4)
		expect(migrated.run.cutieId).toBe('fire-pup')
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

describe('migrating a v2 save → v3', () => {
	it('renames the three Cutie fields and keeps everything else', () => {
		// 🔴 The domain word `pet` became **cutie**. A v2 save still says `petId` / `pets` /
		// `unlockedPets`; leaving them would reset the player's Cutie, its level and the unlock list.
		const legacyRun: Record<string, unknown> = {
			...(v1Run([]).run as Record<string, unknown>),
			petId: 'white-rabbit',
			pets: { 'fire-pup': 7, 'white-rabbit': 10 },
			unlockedPets: ['fire-pup', 'white-rabbit'],
		}
		// A real v2 save has **no** `cutie*` keys yet, so drop the ones the fixture above carries.
		delete legacyRun.cutieId
		delete legacyRun.cuties
		delete legacyRun.unlockedCuties
		const next = migrateV2ToV3({ run: legacyRun } as never)
		const run = next.run as unknown as Record<string, unknown>
		expect(run.cutieId).toBe('white-rabbit')
		expect(run.cuties).toEqual({ 'fire-pup': 7, 'white-rabbit': 10 })
		expect(run.unlockedCuties).toEqual(['fire-pup', 'white-rabbit'])
		// The old keys are gone, so the save is written back in the new shape only.
		expect(run.petId).toBeUndefined()
		expect(run.pets).toBeUndefined()
		expect(run.unlockedPets).toBeUndefined()
		// Everything else survives untouched.
		expect(run.gold).toBe(legacyRun.gold)
	})

	it('leaves an already-migrated save alone and never throws', () => {
		const run = { ...(v1Run([]).run as Record<string, unknown>), cutieId: 'fire-pup', cuties: { 'fire-pup': 4 }, unlockedCuties: ['fire-pup'] }
		const next = migrateV2ToV3({ run } as never)
		expect((next.run as unknown as RunState).cuties).toEqual({ 'fire-pup': 4 })
		expect(migrateV2ToV3({} as never)).toEqual({})
	})
})