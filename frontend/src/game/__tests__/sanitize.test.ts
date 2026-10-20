import { describe, expect, it } from 'vitest'
import { installRetiredItems } from '../../test/retiredItems'

installRetiredItems()
import { sanitizeRun } from '../sanitize'
import { createItemInstance } from '../bag'
import { SHOP_SIZE } from '../economy'
import { MAX_STAR, getTemplate } from '../items'
import { FINAL_STAGE } from '../stages'
import { MAX_CUTIE_LEVEL, CUTIES, getCutie, cutieLevelStats } from '../cuties'
import type { RunState } from '../types'

/** Minimal valid v2 save. */
function validRun(overrides: Partial<RunState> = {}): RunState {
	return {
		cutieId: 'fire-pup',
		cuties: { 'fire-pup': 2 },
		unlockedCuties: ['fire-pup'],
		gold: 40,
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
		expect(run.cutieId).toBe(CUTIES[0].id)
		expect(run.equipped).toEqual([])
		expect(run.inventory).toEqual([])
		expect(run.stage).toBe(1)
		expect(run.gold).toBe(0)
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

	it('a non-existent cutieId → falls back to the default cutie', () => {
		const run = sanitizeRun({ ...validRun(), cutieId: 'khong-co-that' })
		expect(run.cutieId).toBe(CUTIES[0].id)
		expect(getCutie(run.cutieId)).toBeTruthy()
	})

	it('when cuties has no level for the selected cutieId → level 1 is added', () => {
		const run = sanitizeRun({ ...validRun(), cuties: {} })
		expect(run.cuties[run.cutieId]).toBe(1)
	})

	it('cutie levels outside 1..MAX_CUTIE_LEVEL are clamped', () => {
		expect(sanitizeRun({ ...validRun(), cuties: { 'fire-pup': 99 } }).cuties['fire-pup']).toBe(MAX_CUTIE_LEVEL)
		expect(sanitizeRun({ ...validRun(), cuties: { 'fire-pup': 7 } }).cuties['fire-pup']).toBe(7)
		expect(sanitizeRun({ ...validRun(), cuties: { 'fire-pup': -3 } }).cuties['fire-pup']).toBe(1)
		expect(sanitizeRun({ ...validRun(), cuties: { 'fire-pup': Number.NaN } }).cuties['fire-pup']).toBe(1)
	})

	it('unknown ids inside cuties are dropped', () => {
		const run = sanitizeRun({ ...validRun(), cuties: { 'fire-pup': 2, 'cutie-la': 4 } })
		expect('cutie-la' in run.cuties).toBe(false)
	})

	it('the stage and progress are clamped to 1..FINAL_STAGE', () => {
		expect(sanitizeRun({ ...validRun(), stage: 999 }).stage).toBe(FINAL_STAGE)
		expect(sanitizeRun({ ...validRun(), stage: -5 }).stage).toBe(1)
		expect(sanitizeRun({ ...validRun(), clearedStage: 999 }).clearedStage).toBe(FINAL_STAGE)
		expect(sanitizeRun({ ...validRun(), clearedStage: -1 }).clearedStage).toBe(0)
	})

	it('gold, reroll count and win/loss record reject negative numbers and NaN', () => {
		const run = sanitizeRun({ ...validRun(), gold: Number.NaN, rerolls: -2, wins: -1, losses: Number.POSITIVE_INFINITY })
		expect(run.gold).toBe(0)
		expect(run.rerolls).toBe(0)
		expect(run.wins).toBe(0)
		expect(run.losses).toBe(0)
	})

	it('reads the pre-rename `currency` field, so an old save keeps its money', () => {
		// The unit was called `currency` before it became gold. A save written then must not reset to 0.
		const legacy = { ...validRun(), currency: 137 } as Record<string, unknown>
		delete legacy.gold
		expect(sanitizeRun(legacy).gold).toBe(137)
		// The new name wins when both are present.
		expect(sanitizeRun({ ...legacy, gold: 5 }).gold).toBe(5)
	})

	it('reads the pre-rename `pet` fields, so an old save keeps its Cutie, its level and its unlocks', () => {
		// 🔴 Regression: the domain word `pet` became **cutie** and three save fields were renamed. A save
		// that still spells them the old way was read as "level 1, first Cutie only" and the reset was then
		// pushed to the server — the player really lost a level-10 Cutie that way.
		const legacy = {
			...validRun(),
			petId: 'white-rabbit',
			pets: { 'fire-pup': 7, 'white-rabbit': 10, 'spirit-cat': 3 },
			unlockedPets: ['fire-pup', 'white-rabbit', 'spirit-cat'],
		} as Record<string, unknown>
		delete legacy.cutieId
		delete legacy.cuties
		delete legacy.unlockedCuties

		const run = sanitizeRun(legacy)
		expect(run.cutieId).toBe('white-rabbit')
		expect(run.cuties).toEqual({ 'fire-pup': 7, 'white-rabbit': 10, 'spirit-cat': 3 })
		expect(run.unlockedCuties).toEqual(['fire-pup', 'white-rabbit', 'spirit-cat'])

		// The new names win when both spellings are present.
		const both = { ...legacy, cuties: { 'fire-pup': 2 }, cutieId: 'fire-pup' }
		expect(sanitizeRun(both).cuties['fire-pup']).toBe(2)
		expect(sanitizeRun(both).cutieId).toBe('fire-pup')
	})

	it('drops items pointing at a template that no longer exists', () => {
		const run = sanitizeRun(
			{
				...validRun(),
				equipped: [createItemInstance('wooden-blade', 1, 'ok', 0)],
				inventory: [{ ...createItemInstance('wooden-blade', 1, 'bad'), templateId: 'da-bi-xoa' }],
			},
			{ keepUnknownTemplates: false },
		)
		expect(run.equipped.map((item) => item.uid)).toEqual(['ok'])
		expect(run.inventory).toEqual([])
	})

	it('keeps an unknown template while the overlay has not arrived yet', () => {
		// This is the rehydrate case: the store loads during module import, before `/api/content`
		// answers, so a created item (`melting-ice`) is not a deleted item yet.
		const run = sanitizeRun(
			{
				...validRun(),
				inventory: [{ ...createItemInstance('wooden-blade', 1, 'created'), templateId: 'melting-ice' }],
			},
			{ keepUnknownTemplates: true },
		)
		expect(run.inventory.map((item) => item.templateId)).toEqual(['melting-ice'])
		// It still renders: `getTemplate` hands back a neutral placeholder instead of throwing.
		expect(getTemplate('melting-ice').icon).toBe('❔')
		expect(getTemplate('melting-ice').name).toBe('melting-ice')
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
		const run = sanitizeRun({ ...validRun(), cuties: { 'fire-pup': 1 }, equipped: [createItemInstance('jade-fury', 1, 'x', 50)] })
		expect(run.equipped).toEqual([])
		expect(run.inventory.map((item) => item.uid)).toEqual(['x'])
		expect(run.inventory[0].slot).toBe(0)
	})

	it('the star rank and paid price are clamped to their valid ranges', () => {
		const run = sanitizeRun({
			...validRun(),
			inventory: [{ ...createItemInstance('jade-fury', 1, 'x'), star: 99 as never, paid: -5 }],
		})
		expect(run.inventory[0].star).toBe(MAX_STAR)
		expect(run.inventory[0].paid).toBe(0)
	})

	it('keeps a save that holds a 5★ item instead of rejecting or downgrading it', () => {
		const maxed = { ...createItemInstance('great-axe', 5, 'maxed', 0), paid: 40 }
		const run = sanitizeRun({
			...validRun(),
			equipped: [maxed],
			inventory: [createItemInstance('jade-fury', 5, 'stored')],
		})
		expect(run.equipped.map((item) => ({ star: item.star, paid: item.paid }))).toEqual([{ star: 5, paid: 40 }])
		expect(run.inventory[0].star).toBe(5)
	})

	it('an empty or broken shop is rolled again with a full offer list', () => {
		expect(sanitizeRun({ ...validRun(), shop: [] }).shop).toHaveLength(SHOP_SIZE)
		expect(sanitizeRun({ ...validRun(), shop: 'hong' as never }).shop).toHaveLength(SHOP_SIZE)
		expect(
			sanitizeRun({ ...validRun(), shop: [{ templateId: 'khong-co' }] as never }, { keepUnknownTemplates: false })
				.shop,
		).toHaveLength(SHOP_SIZE)
		// Before the overlay resolves the id is not "unknown", it is "not here yet".
		expect(
			sanitizeRun({ ...validRun(), shop: [{ templateId: 'melting-ice' }] as never }, { keepUnknownTemplates: true })
				.shop.map((offer) => offer.templateId),
		).toEqual(['melting-ice'])
	})

	it('a cutie that is not unlocked stays out of unlockedCuties', () => {
		const run = sanitizeRun({ ...validRun(), unlockedCuties: ['linh-tinh'] })
		expect(run.unlockedCuties).toContain('fire-pup')
		expect(run.unlockedCuties).not.toContain('linh-tinh')
	})

	it('the equip grid size is always derivable (even from a broken save)', () => {
		const run = sanitizeRun({ cutieId: 'la', cuties: { la: 3 } })
		expect(cutieLevelStats(getCutie(run.cutieId), run.cuties[run.cutieId]).bagSize).toBeGreaterThan(0)
	})
})
