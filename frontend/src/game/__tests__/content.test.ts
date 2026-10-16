import { describe, expect, it } from 'vitest'
import { ITEM_TEMPLATES, getTemplate, starPrice } from '../items'
import { rollShop, SHOP_SIZE } from '../economy'
import { FINAL_STAGE, MAPS, STAGES, getStage, stageTier } from '../stages'
import { PETS, petLevelStats, petUpgradeCost } from '../pets'

describe('item catalogue', () => {
	it('has unique ids and complete per-star data', () => {
		const ids = ITEM_TEMPLATES.map((template) => template.id)
		expect(new Set(ids).size).toBe(ids.length)
		for (const template of ITEM_TEMPLATES) {
			for (const star of [1, 2, 3, 4] as const) {
				expect(template.desc(star).length).toBeGreaterThan(0)
			}
			if (template.attackInterval) expect(template.damage, template.id).toBeDefined()
			if (template.active) expect(template.interval, template.id).toBeDefined()
		}
	})

	it('scales prices with the star rank and armour tiers with the event numbers', () => {
		expect(starPrice(3, 1)).toBe(3)
		expect(starPrice(3, 4)).toBe(12)
		expect(getTemplate('hide-vest').passive?.(1).shield).toBe(180)
		expect(getTemplate('hide-vest').passive?.(4).shield).toBe(450)
	})
})

describe('shop rolls', () => {
	it('produces a full offer list whose cost matches the star price', () => {
		const shop = rollShop(1, 4242)
		expect(shop).toHaveLength(SHOP_SIZE)
		for (const offer of shop) {
			expect(offer.cost).toBe(starPrice(getTemplate(offer.templateId).cost, offer.star))
			expect(offer.sold).toBe(false)
		}
	})

	it('is deterministic for the same seed', () => {
		expect(rollShop(25, 777)).toEqual(rollShop(25, 777))
	})

	it('only offers tier 1 items in the first map', () => {
		for (const offer of rollShop(5, 99)) {
			expect(getTemplate(offer.templateId).tier).toBe(1)
		}
	})
})

describe('stage ladder', () => {
	it('spans 60 stages across 3 maps', () => {
		expect(STAGES).toHaveLength(FINAL_STAGE)
		expect(MAPS).toHaveLength(3)
		expect(STAGES[59].index).toBe(60)
		expect(STAGES[19].mapIndex).toBe(0)
		expect(STAGES[20].mapIndex).toBe(1)
		expect(STAGES[59].mapIndex).toBe(2)
	})

	it('hardens every stage and doubles up on bosses', () => {
		expect(STAGES[0].enemy.maxHp).toBeLessThan(STAGES[30].enemy.maxHp)
		expect(STAGES[30].enemy.maxHp).toBeLessThan(STAGES[59].enemy.maxHp)
		expect(STAGES[9].name.startsWith('Thủ Lĩnh')).toBe(true)
		expect(STAGES[8].name.startsWith('Thủ Lĩnh')).toBe(false)
		expect(STAGES[9].enemy.maxHp).toBeGreaterThan(STAGES[8].enemy.maxHp)
	})

	it('clamps stage lookups and maps stages to shop tiers', () => {
		expect(getStage(0).index).toBe(1)
		expect(getStage(999).index).toBe(60)
		expect([stageTier(1), stageTier(21), stageTier(60)]).toEqual([1, 2, 3])
	})
})

describe('pets', () => {
	it('unlocks along the map clears and grows the bag with the level', () => {
		expect(PETS.map((pet) => pet.unlockStage)).toEqual([0, 20, 40])
		const rabbit = PETS[1]
		expect(petLevelStats(rabbit, 1).maxHp).toBeLessThan(petLevelStats(rabbit, 5).maxHp)
		expect(petLevelStats(rabbit, 5).bagSize).toBeGreaterThanOrEqual(petLevelStats(rabbit, 1).bagSize)
	})

	it('charges a growing fee for pet upgrades', () => {
		expect(petUpgradeCost(1)).toBeLessThan(petUpgradeCost(4))
	})
})
