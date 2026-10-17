import { describe, expect, it, afterEach } from 'vitest'
import { DEFAULT_SPEED, ITEM_TEMPLATES, STARS, getTemplate, starPrice, swingMs } from '../items'
import { rollShop, SHOP_SIZE } from '../economy'
import { FINAL_STAGE, MAPS, STAGES, getStage, stageTier } from '../stages'
import { applyContentOverrides } from '../content'
import { itemArtSrc, petArtSrc } from '../art'
import { PETS, petLevelStats, petUpgradeCost } from '../pets'

describe('item catalogue', () => {
	it('has unique ids and complete per-star data', () => {
		const ids = ITEM_TEMPLATES.map((template) => template.id)
		expect(new Set(ids).size).toBe(ids.length)
		for (const template of ITEM_TEMPLATES) {
			for (const star of STARS) {
				// Every price is a real number at every rank: a NaN would break the shop.
				expect(Number.isFinite(starPrice(template.cost, star)), template.id).toBe(true)
			}
			if (template.speed) expect(template.damage, template.id).toBeDefined()
			if (template.active) expect(template.interval, template.id).toBeDefined()
		}
	})

	it('reads speed as attacks per second, with 0.625 as the standard rate', () => {
		// 0.625 attacks per second = one swing every 1.6 s; 1/s = every second.
		expect(swingMs(DEFAULT_SPEED)).toBe(1600)
		expect(swingMs(1)).toBe(1000)
		expect(swingMs(2)).toBe(500)
		// A higher star rank attacks faster, so its interval is shorter.
		for (const template of ITEM_TEMPLATES.filter((entry) => entry.speed)) {
			const interval = STARS.map((star) => swingMs(template.speed!(star)))
			for (let index = 1; index < interval.length; index += 1) {
				expect(interval[index], `${template.id} at ${index + 1}★`).toBeLessThan(interval[index - 1]!)
			}
		}
	})

	it('gives every template a quality band from 1 to 5', () => {
		for (const template of ITEM_TEMPLATES) {
			expect(template.quality, template.id).toBeGreaterThanOrEqual(1)
			expect(template.quality, template.id).toBeLessThanOrEqual(5)
		}
		// The catalogue has to show a real spread, not one single band.
		expect(new Set(ITEM_TEMPLATES.map((template) => template.quality)).size).toBeGreaterThanOrEqual(4)
	})

	it('keeps the per-star numbers growing with the star rank', () => {
		for (const template of ITEM_TEMPLATES) {
			const damage = STARS.map((star) => template.damage?.(star)).filter((value) => value !== undefined)
			for (let index = 1; index < damage.length; index += 1) {
				expect(damage[index], `${template.id} 5★ damage`).toBeGreaterThan(damage[index - 1]!)
			}
		}
	})

	it('scales prices with the star rank and armour tiers with the event numbers', () => {
		expect(starPrice(3, 1)).toBe(3)
		expect(starPrice(3, 4)).toBe(12)
		expect(starPrice(3, 5)).toBe(15)
		expect(getTemplate('hide-vest').passive?.(1).shield).toBe(180)
		expect(getTemplate('hide-vest').passive?.(4).shield).toBe(450)
		expect(getTemplate('hide-vest').passive?.(5).shield).toBe(675)
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

describe('art uploaded from the admin page', () => {
	const ITEM = ITEM_TEMPLATES[0]!.id
	const PET = PETS[0]!.id

	afterEach(() => {
		applyContentOverrides(null)
	})

	it('prefers the uploaded picture over the bundled one', () => {
		const bundled = itemArtSrc(ITEM)
		expect(bundled).toBe(`/icons/items/${ITEM}.png`)
		expect(petArtSrc(PET)).toBe(`/icons/pets/${PET}.png`)

		applyContentOverrides({
			art: { [`item:${ITEM}`]: '/api/content/art/item/x?v=2', [`pet:${PET}`]: '/api/content/art/pet/y?v=1' },
		})
		expect(itemArtSrc(ITEM)).toContain('/api/content/art/item/x?v=2')
		expect(petArtSrc(PET)).toContain('/api/content/art/pet/y?v=1')

		// Removing the picture puts the entity back on the bundled art (or the emoji).
		applyContentOverrides({ art: {} })
		expect(itemArtSrc(ITEM)).toBe(bundled)
	})

	it('ignores a broken art URL instead of rendering a broken icon', () => {
		applyContentOverrides({ art: { [`item:${ITEM}`]: 'javascript:alert(1)' } as never })
		expect(itemArtSrc(ITEM)).toBe(`/icons/items/${ITEM}.png`)
	})
})
