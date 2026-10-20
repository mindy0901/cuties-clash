import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLASS_LABELS, DEFAULT_COOLDOWN, ITEM_TEMPLATES, STARS, cooldownMs, getTemplate, isWeaponClass, starPrice } from '../items'
import { kitDef, kitValue } from '../kits'
import type { ItemKitId } from '../types'
import {
	rollShop,
	SHOP_SIZE,
	STAR_THREE_CHANCE,
	STAR_TWO_CHANCE,
	STAR_TWO_FROM_CLEARED,
	shopQualityOdds,
	shopStarOdds,
} from '../economy'
import { FINAL_STAGE, MAPS, STAGES, getStage, highestAccessibleStage, stageTier } from '../stages'
import { applyContentOverrides, normalizeItemClass } from '../content'
import { itemArtSrc, cutieArtSrc } from '../art'
import { GRID_WIDTH, MAX_CUTIE_LEVEL, CUTIES, cutieBag, cutieLevelStats, cutieUpgradeCost } from '../cuties'
import { RETIRED_ITEM_TEMPLATES } from '../../test/retiredCatalogue'
import { installRetiredItems } from '../../test/retiredItems'

describe('item catalogue', () => {
	it('has unique ids and complete per-star data', () => {
		const ids = ITEM_TEMPLATES.map((template) => template.id)
		expect(new Set(ids).size).toBe(ids.length)
		for (const template of ITEM_TEMPLATES) {
			for (const star of STARS) {
				// Every price is a real number at every rank: a NaN would break the shop.
				expect(Number.isFinite(starPrice(template.cost, star)), template.id).toBe(true)
			}
			if (template.kits?.some((kit) => kit.id === 'basic-attack')) {
				expect(template.kits.find((kit) => kit.id === 'basic-attack')?.params.cooldown, template.id).toBeDefined()
			}
		}
	})

	it('gives every kit one value per parameter for all five star ranks', () => {
		for (const template of ITEM_TEMPLATES) {
			for (const kit of template.kits ?? []) {
				const check = (id: ItemKitId, params: Record<string, number[]>) => {
					for (const param of kitDef(id).params) {
						const values = params[param.key]
						expect(values, `${template.id} · ${id} · ${param.key}`).toHaveLength(STARS.length)
						for (const value of values) {
							expect(Number.isFinite(value), `${template.id} · ${param.key}`).toBe(true)
						}
					}
				}
				check(kit.id, kit.params)
				for (const effect of kit.onHit ?? []) check(effect.id, effect.params)
			}
		}
	})

	it('reads Cooldown Time as seconds, with 1.6 s as the standard', () => {
		// The number on the admin page is seconds between two swings — no rate, no star math.
		expect(cooldownMs(DEFAULT_COOLDOWN)).toBe(1600)
		expect(cooldownMs(0.85)).toBe(850)
		// A higher star rank hits faster, so its Cooldown Time is shorter.
		for (const template of ITEM_TEMPLATES) {
			const attack = template.kits?.find((kit) => kit.id === 'basic-attack')
			if (!attack) continue
			const interval = STARS.map((star) => cooldownMs(kitValue(attack, 'cooldown', star)))
			for (let index = 1; index < interval.length; index += 1) {
				expect(interval[index], `${template.id} at ${index + 1}★`).toBeLessThan(interval[index - 1]!)
			}
		}
		// 🔴 A cooldown of 0 ms would swing forever inside a single tick, so the shipped rows must be
		// strictly positive — `DEFAULT_COOLDOWN` is what an old row with no `cooldown` falls back to.
		expect(DEFAULT_COOLDOWN).toBeGreaterThan(0)
		for (const template of RETIRED_ITEM_TEMPLATES) {
			const attack = template.kits?.find((kit) => kit.id === 'basic-attack')
			if (!attack) continue
			for (const star of STARS) {
				expect(cooldownMs(kitValue(attack, 'cooldown', star)), template.id).toBeGreaterThan(0)
			}
		}
	})

	it('gives every shipped item a class label, and the three weapon types count as a weapon', () => {
		// The shipped catalogue is what ships to a player who has never touched the admin page; the rest
		// of the content is owned by the database now, so this only checks the templates in code.
		for (const template of ITEM_TEMPLATES) {
			// A missing label would print `undefined` on the tile tag.
			expect(CLASS_LABELS[template.cls], template.id).toBeTruthy()
		}
		// Every class still needs a label, even one no shipped template uses today.
		for (const cls of ['melee', 'ranged', 'artifact', 'jade', 'accessory', 'armor', 'potion'] as const) {
			expect(CLASS_LABELS[cls]).toBeTruthy()
		}
		// Auras ask `isWeaponClass`, so a ranged weapon must buff "weapon LIỀN KỀ" like a melee one —
		// and an artifact is a weapon too (it swings, it just leans on debuffs).
		expect(isWeaponClass('melee')).toBe(true)
		expect(isWeaponClass('ranged')).toBe(true)
		expect(isWeaponClass('artifact')).toBe(true)
		expect(isWeaponClass('armor')).toBe(false)
		expect(isWeaponClass('jade')).toBe(false)
		expect(isWeaponClass('accessory')).toBe(false)
	})

	it('reads a pre-artifact `focus` row as an artifact and old `jewelry` as a jade', () => {
		expect(normalizeItemClass('focus')).toBe('artifact')
		expect(normalizeItemClass('artifact')).toBe('artifact')
		expect(normalizeItemClass('armor')).toBe('armor')
		// `jewelry` was renamed to `jade` when `accessory` joined the list.
		expect(normalizeItemClass('jewelry')).toBe('jade')
		expect(normalizeItemClass('accessory')).toBe('accessory')
		expect(normalizeItemClass('steel')).toBeUndefined()
		expect(normalizeItemClass(3)).toBeUndefined()
	})

	it('gives every template a quality band from 1 to 5', () => {
		for (const template of ITEM_TEMPLATES) {
			expect(template.quality, template.id).toBeGreaterThanOrEqual(1)
			expect(template.quality, template.id).toBeLessThanOrEqual(5)
		}
	})

	it('reads a per-star parameter that is stored as a percentage', () => {
		// Every kit stores `chance` as a 0-100 number, and `kitValue()` turns it into a 0-1 roll at
		// build time; the retired catalogue is where those templates live now.
		const spear = RETIRED_ITEM_TEMPLATES.find((template) => template.id === 'fire-spear')
		const burn = spear?.kits
			?.find((kit) => kit.id === 'basic-attack')
			?.onHit?.find((effect) => effect.id === 'burn-on-hit')
		expect(burn?.params.chance).toEqual([25, 25, 25, 25, 25])
	})

	it('keeps the per-star multipliers growing with the star rank', () => {
		// An item has no attack of its own: the number that grows is its kit's multiplier.
		for (const template of ITEM_TEMPLATES) {
			const attack = template.kits?.find((kit) => kitDef(kit.id).kind === 'attack')
			if (!attack) continue
			const multiplier = attack.params.multiplier ?? []
			expect(multiplier, template.id).toHaveLength(STARS.length)
			for (let index = 1; index < multiplier.length; index += 1) {
				expect(multiplier[index], `${template.id} 5★ multiplier`).toBeGreaterThan(multiplier[index - 1]!)
			}
		}
	})

	it('prices a star rank by the copies it is built from', () => {
		// 2^(star-1): 1★ = one copy, 3★ = four, 5★ = sixteen — exactly what merging costs.
		expect(starPrice(3, 1)).toBe(3)
		expect(starPrice(3, 2)).toBe(6)
		expect(starPrice(3, 3)).toBe(12)
		expect(starPrice(3, 4)).toBe(24)
		expect(starPrice(3, 5)).toBe(48)
	})
})

describe('shop rolls', () => {
	// The catalogue is database-only now; the fixtures stand in for the stored rows.
	beforeEach(() => installRetiredItems())

	it('produces a full offer list whose cost matches the star price', () => {
		const shop = rollShop(1, 0, 4242)
		expect(shop).toHaveLength(SHOP_SIZE)
		for (const offer of shop) {
			expect(offer.cost).toBe(starPrice(getTemplate(offer.templateId).cost, offer.star))
			expect(offer.sold).toBe(false)
		}
	})

	it('is deterministic for the same seed', () => {
		expect(rollShop(25, 0, 777)).toEqual(rollShop(25, 0, 777))
	})

	it('only offers tier 1 items in the first map', () => {
		for (const offer of rollShop(5, 0, 99)) {
			expect(getTemplate(offer.templateId).tier).toBe(1)
		}
	})

	it('never sells above 3★, and gates the upgrades on the cleared stage', () => {
		const starsOf = (stageIndex: number, clearedStage: number, seeds: number) => {
			const found: number[] = []
			for (let seed = 0; seed < seeds; seed += 1) {
				for (const offer of rollShop(stageIndex, clearedStage, seed * 7919)) found.push(offer.star)
			}
			return found
		}

		// Not cleared 40 yet: every offer is plain, however deep the map is.
		expect(starsOf(35, 39, 400).every((star) => star === 1)).toBe(true)

		// Cleared 40 → 2★ shows up, 3★ still does not.
		const afterForty = starsOf(60, 40, 3000)
		expect(afterForty.some((star) => star === 2)).toBe(true)
		expect(afterForty.some((star) => star === 3)).toBe(false)

		// The whole ladder cleared → the 3★ roll exists at last, and nothing above it.
		const afterSixty = starsOf(60, 60, 3000)
		expect(afterSixty.some((star) => star === 3)).toBe(true)
		expect(Math.max(...afterSixty)).toBe(3)
	})

	it('reports the same star odds it rolls, and they always add up to 100%', () => {
		// Nothing cleared: every offer is plain.
		expect(shopStarOdds(0)).toEqual({ one: 1, two: 0, three: 0 })

		// Cleared 40: only the 2★ upgrade is live.
		const afterForty = shopStarOdds(STAR_TWO_FROM_CLEARED)
		expect(afterForty.one).toBeCloseTo(1 - STAR_TWO_CHANCE, 10)
		expect(afterForty.two).toBe(STAR_TWO_CHANCE)
		expect(afterForty.three).toBe(0)

		// Whole ladder cleared: the 3★ roll joins in.
		const afterSixty = shopStarOdds(FINAL_STAGE)
		expect(afterSixty.two).toBe(STAR_TWO_CHANCE)
		expect(afterSixty.three).toBe(STAR_THREE_CHANCE)

		for (const cleared of [0, 39, 40, 59, 60]) {
			const odds = shopStarOdds(cleared)
			expect(odds.one + odds.two + odds.three).toBeCloseTo(1, 10)
		}
	})

	it('weights the roll by quality band, and reports the same odds it rolls', () => {
		// The odds are derived from the live pool: every band present is listed, none exceeds 100 %.
		const odds = shopQualityOdds(1)
		expect(odds).toHaveLength(5)
		expect(odds.reduce((sum, band) => sum + band.chance, 0)).toBeCloseTo(1, 10)
		for (const band of odds) {
			expect(band.chance).toBeGreaterThanOrEqual(0)
			expect(band.chance).toBeLessThanOrEqual(1)
			// A rarer band can never be more likely than a more common one.
			if (band.quality > 1) {
				const previous = odds[band.quality - 2]
				expect(band.chance).toBeLessThanOrEqual(previous.chance + 1e-12)
			}
		}

		// The real distribution: over many rolls, a common band shows up more often than a rare one.
		const drawn: Record<number, number> = {}
		for (let seed = 0; seed < 400; seed += 1) {
			for (const offer of rollShop(60, 0, seed * 7919 + 1)) {
				const quality = getTemplate(offer.templateId).quality
				drawn[quality] = (drawn[quality] ?? 0) + 1
			}
		}
		const present = Object.keys(drawn)
			.map(Number)
			.sort((a, b) => a - b)
		if (present.length > 1) {
			expect(drawn[present[0]]).toBeGreaterThan(drawn[present[present.length - 1]])
		}
		// Whatever came out must be one of the weighted bands the panel advertises (same stage → same pool).
		const deepOdds = shopQualityOdds(60)
		expect(present.every((quality) => deepOdds.some((band) => band.quality === quality && band.count > 0))).toBe(true)
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

	it('allows only cleared stages and the next stage to be entered', () => {
		expect([highestAccessibleStage(0), highestAccessibleStage(20), highestAccessibleStage(60)]).toEqual([1, 21, 60])
	})

	it('uses monster, evil, and zombie enemy factions across the three regions', () => {
		expect([STAGES[0].enemy.name, STAGES[20].enemy.name, STAGES[40].enemy.name]).toEqual([
			'Quái vật · Chuột Đồng Cỏ',
			'Ác linh · Tiểu Yêu Tro',
			'Zombie · Gấu Ngưng Băng',
		])
	})
})

describe('cuties', () => {
	it('unlocks along the map clears and grows the bag with the level', () => {
		expect(CUTIES.map((cutie) => cutie.unlockStage)).toEqual([0, 20, 40])
		const rabbit = CUTIES[1]
		expect(cutieLevelStats(rabbit, 1).maxHp).toBeLessThan(cutieLevelStats(rabbit, 10).maxHp)
	})

	it('reaches level 10 and stops there', () => {
		expect(MAX_CUTIE_LEVEL).toBe(10)
		const cutie = CUTIES[0]
		// Beyond the cap the numbers stop growing; level 1 and level 0 read the same.
		expect(cutieLevelStats(cutie, 10)).toEqual(cutieLevelStats(cutie, 99))
		expect(cutieLevelStats(cutie, 1)).toEqual(cutieLevelStats(cutie, 0))
	})

	it('adds one bag row at level 3 and one at level 5, with no per-cutie table', () => {
		// Every cutie shares the same growth: 3 rows, then 4, then the 5-row maximum.
		const rows = [1, 2, 3, 4, 5, 10].map((level) => cutieBag(level).rows)
		expect(rows).toEqual([3, 3, 4, 4, 5, 5])
		expect(cutieBag(1).width).toBe(GRID_WIDTH)
	})

	it('scales its base attack with the level — the number its kits multiply', () => {
		const cutie = CUTIES[0]
		expect(cutieLevelStats(cutie, 1).attack).toBe(cutie.attack)
		expect(cutieLevelStats(cutie, 10).attack).toBeGreaterThan(cutie.attack)
	})

	it('doubles its level-1 max HP, attack and Sword Energy regen by the max level', () => {
		for (const cutie of CUTIES) {
			const level1 = cutieLevelStats(cutie, 1)
			const level10 = cutieLevelStats(cutie, MAX_CUTIE_LEVEL)
			expect(level1.seRegen).toBe(5)
			expect(level10.seRegen).toBe(10)
			expect(level10.maxHp).toBe(level1.maxHp * 2)
			expect(level10.attack).toBe(level1.attack * 2)
			// Growth is monotonic: no level is worth nothing.
			for (let level = 2; level <= MAX_CUTIE_LEVEL; level += 1) {
				const previous = cutieLevelStats(cutie, level - 1)
				const current = cutieLevelStats(cutie, level)
				expect(current.maxHp).toBeGreaterThanOrEqual(previous.maxHp)
				expect(current.attack).toBeGreaterThanOrEqual(previous.attack)
				expect(current.seRegen).toBeGreaterThanOrEqual(previous.seRegen)
			}
		}
	})

	it('ships with the basic-attack kit and nothing else', () => {
		for (const cutie of CUTIES) {
			expect(cutie.kits?.map((kit) => kit.id)).toEqual(['basic-attack'])
			// One value per parameter: a cutie levels up, it has no star ranks.
			for (const values of Object.values(cutie.kits![0]!.params)) expect(values).toHaveLength(5)
			expect(new Set(Object.values(cutie.kits![0]!.params).flat()).size).toBeGreaterThan(0)
		}
	})

	it('charges a growing fee for cutie upgrades', () => {
		expect(cutieUpgradeCost(1)).toBeLessThan(cutieUpgradeCost(4))
	})
})

describe('art uploaded from the admin page', () => {
	beforeEach(() => installRetiredItems())

	const ITEM = RETIRED_ITEM_TEMPLATES[0]!.id
	const CUTIE = CUTIES[0]!.id

	afterEach(() => {
		applyContentOverrides(null)
	})

	it('prefers the uploaded picture over the bundled one', () => {
		const bundled = itemArtSrc(ITEM)
		expect(bundled).toBe(`/icons/items/${ITEM}.png`)
		expect(cutieArtSrc(CUTIE)).toBe(`/icons/cuties/${CUTIE}.png`)

		applyContentOverrides({
			art: { [`item:${ITEM}`]: '/api/content/art/item/x?v=2', [`cutie:${CUTIE}`]: '/api/content/art/cutie/y?v=1' },
		})
		expect(itemArtSrc(ITEM)).toContain('/api/content/art/item/x?v=2')
		expect(cutieArtSrc(CUTIE)).toContain('/api/content/art/cutie/y?v=1')

		// Removing the picture puts the entity back on the bundled art (or the emoji).
		installRetiredItems()
		expect(itemArtSrc(ITEM)).toBe(bundled)
	})

	it('ignores a broken art URL instead of rendering a broken icon', () => {
		installRetiredItems({ art: { [`item:${ITEM}`]: 'javascript:alert(1)' } as never })
		expect(itemArtSrc(ITEM)).toBe(`/icons/items/${ITEM}.png`)
	})
})
