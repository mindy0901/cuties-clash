import { describe, expect, it } from 'vitest'
import { sanitizeRun } from '../sanitize'
import { createItemInstance } from '../bag'
import { SHOP_SIZE } from '../economy'
import { FINAL_STAGE } from '../stages'
import { PETS, getPet, petLevelStats } from '../pets'
import type { RunState } from '../types'

/** Minimal valid v2 save. */
function validRun(overrides: Partial<RunState> = {}): RunState {
	return {
		petId: 'fire-pup',
		pets: { 'fire-pup': 2 },
		unlockedPets: ['fire-pup'],
		currency: 40,
		stage: 3,
		clearedStage: 2,
		equipped: [],
		inventory: [],
		seed: 999,
		shop: [],
		rerolls: 0,
		wins: 1,
		losses: 0,
		...overrides,
	}
}

describe('sanitizeRun — preventing a blank page', () => {
	it('a completely empty save still yields a usable RunState', () => {
		const run = sanitizeRun(undefined)
		expect(run.petId).toBe(PETS[0].id)
		expect(run.equipped).toEqual([])
		expect(run.inventory).toEqual([])
		expect(run.stage).toBe(1)
		expect(run.currency).toBe(0)
		expect(run.shop).toHaveLength(SHOP_SIZE)
	})

	it('missing equipped/inventory → empty arrays, not undefined', () => {
		// This is exactly the save that made the whole page blank before.
		const run = sanitizeRun({ ...validRun(), equipped: undefined, inventory: undefined })
		expect(Array.isArray(run.equipped)).toBe(true)
		expect(Array.isArray(run.inventory)).toBe(true)
	})

	it('equipped/inventory of the wrong type (string, number) → empty arrays', () => {
		expect(sanitizeRun({ ...validRun(), equipped: 'hong' as never }).equipped).toEqual([])
		expect(sanitizeRun({ ...validRun(), inventory: 42 as never }).inventory).toEqual([])
	})

	it('a non-existent petId → falls back to the default pet', () => {
		const run = sanitizeRun({ ...validRun(), petId: 'khong-co-that' })
		expect(run.petId).toBe(PETS[0].id)
		expect(getPet(run.petId)).toBeTruthy()
	})

	it('when pets has no level for the selected petId → level 1 is added', () => {
		const run = sanitizeRun({ ...validRun(), pets: {} })
		expect(run.pets[run.petId]).toBe(1)
	})

	it('pet levels outside 1..5 are clamped', () => {
		expect(sanitizeRun({ ...validRun(), pets: { 'fire-pup': 99 } }).pets['fire-pup']).toBe(5)
		expect(sanitizeRun({ ...validRun(), pets: { 'fire-pup': -3 } }).pets['fire-pup']).toBe(1)
		expect(sanitizeRun({ ...validRun(), pets: { 'fire-pup': Number.NaN } }).pets['fire-pup']).toBe(1)
	})

	it('unknown ids inside pets are dropped', () => {
		const run = sanitizeRun({ ...validRun(), pets: { 'fire-pup': 2, 'pet-la': 4 } })
		expect('pet-la' in run.pets).toBe(false)
	})

	it('the stage and progress are clamped to 1..FINAL_STAGE', () => {
		expect(sanitizeRun({ ...validRun(), stage: 999 }).stage).toBe(FINAL_STAGE)
		expect(sanitizeRun({ ...validRun(), stage: -5 }).stage).toBe(1)
		expect(sanitizeRun({ ...validRun(), clearedStage: 999 }).clearedStage).toBe(FINAL_STAGE)
		expect(sanitizeRun({ ...validRun(), clearedStage: -1 }).clearedStage).toBe(0)
	})

	it('currency, reroll count and win/loss record reject negative numbers and NaN', () => {
		const run = sanitizeRun({ ...validRun(), currency: Number.NaN, rerolls: -2, wins: -1, losses: Number.POSITIVE_INFINITY })
		expect(run.currency).toBe(0)
		expect(run.rerolls).toBe(0)
		expect(run.wins).toBe(0)
		expect(run.losses).toBe(0)
	})

	it('drops items pointing at a template that no longer exists', () => {
		const run = sanitizeRun({
			...validRun(),
			equipped: [createItemInstance('wooden-blade', 1, 'ok', 0)],
			inventory: [{ ...createItemInstance('wooden-blade', 1, 'bad'), templateId: 'da-bi-xoa' }],
		})
		expect(run.equipped.map((item) => item.uid)).toEqual(['ok'])
		expect(run.inventory).toEqual([])
	})

	it('drops items missing a uid and de-duplicates repeated uids', () => {
		const base = createItemInstance('jade-fury', 1, 'a', 0)
		const run = sanitizeRun({
			...validRun(),
			equipped: [base, { ...base }, { ...base, uid: '' }, { ...base, uid: 'b', slot: 1 }],
		})
		expect(run.equipped.map((item) => item.uid)).toEqual(['a', 'b'])
	})

	it('a worn item whose cell is outside the current grid moves to the storage', () => {
		// Level 1 has 12 cells; cell 50 is outside the grid.
		const run = sanitizeRun({ ...validRun(), pets: { 'fire-pup': 1 }, equipped: [createItemInstance('jade-fury', 1, 'x', 50)] })
		expect(run.equipped).toEqual([])
		expect(run.inventory.map((item) => item.uid)).toEqual(['x'])
		expect(run.inventory[0].slot).toBe(0)
	})

	it('the star rank and paid price are clamped to their valid ranges', () => {
		const run = sanitizeRun({
			...validRun(),
			inventory: [{ ...createItemInstance('jade-fury', 1, 'x'), star: 99 as never, paid: -5 }],
		})
		expect(run.inventory[0].star).toBe(4)
		expect(run.inventory[0].paid).toBe(0)
	})

	it('an empty or broken shop is rolled again with a full offer list', () => {
		expect(sanitizeRun({ ...validRun(), shop: [] }).shop).toHaveLength(SHOP_SIZE)
		expect(sanitizeRun({ ...validRun(), shop: 'hong' as never }).shop).toHaveLength(SHOP_SIZE)
		expect(sanitizeRun({ ...validRun(), shop: [{ templateId: 'khong-co' }] as never }).shop).toHaveLength(SHOP_SIZE)
	})

	it('a pet that is not unlocked stays out of unlockedPets', () => {
		const run = sanitizeRun({ ...validRun(), unlockedPets: ['linh-tinh'] })
		expect(run.unlockedPets).toContain('fire-pup')
		expect(run.unlockedPets).not.toContain('linh-tinh')
	})

	it('the equip grid size is always derivable (even from a broken save)', () => {
		const run = sanitizeRun({ petId: 'la', pets: { la: 3 } })
		expect(petLevelStats(getPet(run.petId), run.pets[run.petId]).bagSize).toBeGreaterThan(0)
	})
})
