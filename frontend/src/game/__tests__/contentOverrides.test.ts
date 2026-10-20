/**
 * Content overlay from the admin page: merged over the templates in code.
 *
 * What must hold:
 *   * per-star JSON data has to be rebuilt into the exact functions `ItemTemplate` expects;
 *   * a **broken** row is skipped, it must never crash the game (throwing here is a blank page);
 *   * the overlay has to reach **gameplay** (roll pools, weapon stats), not just labels.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { installRetiredItems } from '../../test/retiredItems'

installRetiredItems()
import { createItemInstance } from '../bag'
import { buildPlayerCombatant } from '../build'
import { applyContentOverrides, kitCatalogue, mergeItem, mergeCutie } from '../content'
import { getTemplate, itemTemplatesUpToTier } from '../items'
import { kitValue } from '../kits'
import { getCutie, cutieList } from '../cuties'

/** Every test must clear the overlay, otherwise it leaks into the next one (module variable). */
afterEach(() => applyContentOverrides(null))

const ATK_OVERRIDE = { atk: 7 }

describe('merging an overlay into a template', () => {
	it('changes plain data fields', () => {
		const merged = mergeItem(getTemplate('wooden-blade'), { name: 'New Blade', cost: 9, tier: 2 })
		expect(merged.name).toBe('New Blade')
		expect(merged.cost).toBe(9)
		expect(merged.tier).toBe(2)
		// Untouched fields keep the value from code.
		expect(merged.icon).toBe(getTemplate('wooden-blade').icon)
	})

	it('rebuilds kits from the stored payload', () => {
		const kits = [
			{
				id: 'basic-attack' as const,
				params: { multiplier: [1, 1.2, 1.4, 1.6, 2], cooldown: [1.6, 1.45, 1.3, 1.15, 1] },
				onHit: [
					{
						id: 'burn-on-hit' as const,
						params: {
							chance: [20, 20, 20, 20, 20],
							duration: [3000, 3000, 3000, 3000, 3000],
							// A share of the owner's attack per second — no `scaling` any more.
							value: [1, 2, 3, 4, 5],
						},
					},
				],
			},
		]
		const merged = mergeItem(getTemplate('wooden-blade'), { kits })
		expect(merged.kits).toEqual(kits)
	})

	it('rebuilds stats and aura option kits from the stored payload', () => {
		const stats = [ATK_OVERRIDE, {}, {}, {}, {}]
		const aura = Array.from({ length: 5 }, () => ({ target: 'adjacent' as const, mods: { atk: 3 } }))
		const merged = mergeItem(getTemplate('hide-vest'), {
			kits: [
				{ id: 'stats', params: {}, stats },
				{ id: 'aura', params: {}, aura },
			],
		})
		expect(merged.kits?.find((kit) => kit.id === 'stats')?.stats?.[0]).toEqual(ATK_OVERRIDE)
		expect(merged.kits?.find((kit) => kit.id === 'aura')?.aura?.[0]).toEqual({
			target: 'adjacent',
			mods: { atk: 3 },
		})
	})

	it('keeps two stat kits apart — one stat each, never merged into one table', () => {
		const atk = Array.from({ length: 5 }, () => ({ atk: 30 }))
		const maxHp = Array.from({ length: 5 }, () => ({ maxHp: 120 }))
		const merged = mergeItem(getTemplate('hide-vest'), {
			kits: [
				{ id: 'stats' as const, params: {}, stats: atk },
				{ id: 'stats' as const, params: {}, stats: maxHp },
			],
		})
		expect(merged.kits?.map((kit) => kit.stats?.[0])).toEqual([{ atk: 30 }, { maxHp: 120 }])
	})

	it('fills missing kit ranks and drops unknown kits', () => {
		const base = getTemplate('wooden-blade')
		const merged = mergeItem(base, {
			kits: [
				{ id: 'basic-attack', params: { multiplier: [1, 2, 3] } },
				{ id: 'not-a-kit', params: {} },
			],
		})
		// Unknown ids are dropped; ranks the row does not carry fall back to the kit default.
		expect(merged.kits).toHaveLength(1)
		expect(merged.kits?.[0].params.multiplier).toEqual([1, 2, 3, 1, 1])
	})

	it('ignores a damage number stored inside an old attack kit', () => {
		const merged = mergeItem(getTemplate('wooden-blade'), {
			kits: [{ id: 'basic-attack', params: { damage: [11, 22, 33, 44, 55], cooldown: [1, 1, 1, 1, 1] } }],
		})
		// Damage only exists on the cutie now, so an old per-kit number is dropped, not lifted.
		expect(merged.kits?.[0].params.damage).toBeUndefined()
		expect(merged.kits?.[0].params.cooldown).toEqual([1, 1, 1, 1, 1])
	})

	it('accepts a quality override and ignores an out-of-range one', () => {
		expect(mergeItem(getTemplate('wooden-blade'), { quality: 5 }).quality).toBe(5)
		// A broken value keeps the quality from code instead of breaking the tile.
		expect(mergeItem(getTemplate('wooden-blade'), { quality: 9 }).quality).toBe(
			getTemplate('wooden-blade').quality,
		)
	})

	it('skips only the broken field and still applies the rest', () => {
		const base = getTemplate('wooden-blade')
		const merged = mergeItem(base, {
			kits: 'not an array',
			cost: -5,
			space: { w: 0, h: 3 },
			name: 'Still Applied',
		})
		expect(merged.name).toBe('Still Applied')
		expect(merged.kits).toEqual(base.kits)
		expect(merged.cost).toBe(base.cost)
		expect(merged.space).toEqual(base.space)
	})

	it('returns the very same object when there is no overlay', () => {
		const base = getTemplate('fire-spear')
		expect(mergeItem(base, undefined)).toBe(base)
	})

	it('keeps whatever footprint the row declares, whatever its class', () => {
		const base = getTemplate('wooden-blade')
		// No class owns a footprint: the size is data, so a jade can be 3×3 if the row says so.
		expect(mergeItem(base, { cls: 'jade', space: { w: 3, h: 3 } }).space).toEqual({ w: 3, h: 3 })
		expect(mergeItem(base, { cls: 'accessory', space: { w: 1, h: 2 } }).space).toEqual({ w: 1, h: 2 })
		// A row that never mentions `space` keeps the code value.
		expect(mergeItem(base, { cls: 'accessory' }).space).toEqual(base.space)
	})

	it('merges cutie numbers field by field', () => {
		const base = getCutie('fire-pup')
		const merged = mergeCutie(base, { name: 'New Pup', attack: 99, maxHp: 1234 })
		expect(merged.name).toBe('New Pup')
		expect(merged.attack).toBe(99)
		expect(merged.maxHp).toBe(1234)
		// The rest of the definition survives, it is not wiped by a shallow merge.
		expect(merged.blurb).toBe(base.blurb)
		expect(merged.kits).toEqual(base.kits)
	})

	it('replaces the cutie kit list and keeps the base one when the payload is broken', () => {
		const base = getCutie('fire-pup')
		const merged = mergeCutie(base, {
			kits: [{ id: 'basic-attack', params: { cooldown: [1.5], multiplier: [2] } }],
		})
		expect(merged.kits).toHaveLength(1)
		expect(kitValue(merged.kits![0]!, 'cooldown', 1)).toBe(1.5)
		expect(mergeCutie(base, { kits: 'not an array' }).kits).toEqual(base.kits)
		expect(mergeCutie(base, { kits: [] }).kits).toEqual([])
	})
})

describe('the overlay reaches gameplay', () => {
	it('weapon stats follow the overlay', () => {
		installRetiredItems()
		const before = buildPlayerCombatant('fire-pup', 1, [createItemInstance('wooden-blade', 1, 'a', 0)])
		applyContentOverrides({
			items: {
				'wooden-blade': {
					name: 'Đao Gỗ',
					cls: 'melee',
					space: { w: 1, h: 3 },
					kits: [
						{
							id: 'basic-attack',
							params: {
								multiplier: [3, 3, 3, 3, 3],
								speed: [1, 1, 1, 1, 1],
							},
						},
					],
				},
			},
		})
		const after = buildPlayerCombatant('fire-pup', 1, [createItemInstance('wooden-blade', 1, 'a', 0)])

		// The kit's multiplier is what an item owns; the damage itself is the cutie's attack (14).
		const blade = (weapons: { name: string; damage: number }[]) =>
			weapons.find((weapon) => weapon.name === getTemplate('wooden-blade').name)!
		expect(blade(after.weapons).damage).toBe(42)
		expect(blade(before.weapons).damage).toBe(14)
	})

	it('a legacy top-level charge kit becomes the charged sub-kit of the basic attack', () => {
		applyContentOverrides({
			items: {
				'wooden-blade': {
					kits: [
						{
							id: 'basic-attack',
							params: { multiplier: [1, 1, 1, 1, 1], speed: [0, 0, 0, 0, 0] },
						},
						{
							id: 'charge-attack',
							params: {
								// `cooldown` belonged to the old shape and is dropped: the charged hit rides
								// on the basic attack's own cadence.
								cooldown: [2, 2, 2, 2, 2],
								seNeed: [50, 50, 50, 50, 50],
								multiplier: [2, 2, 2, 2, 2],
							},
						},
					],
				},
			},
		})
		const kits = getTemplate('wooden-blade').kits ?? []
		// One swing only: the charged attack is a property of it, ❌ not a second timer.
		expect(kits.map((kit) => kit.id)).toEqual(['basic-attack'])
		expect(kits[0]!.charge?.id).toBe('charge-attack')

		const combatant = buildPlayerCombatant('fire-pup', 1, [createItemInstance('wooden-blade', 1, 'a', 0)])
		const blades = combatant.weapons.filter((weapon) => weapon.templateId === 'wooden-blade')
		expect(blades).toHaveLength(1)
		// A `speed` delta of 0 keeps the cutie's own 0.625/s (1600 ms); seNeed 50 % of its 100 bar.
		expect([blades[0]!.damage, blades[0]!.interval]).toEqual([14, 1600])
		// The charged hit is its own number (14 × 2), not the basic damage plus a bonus.
		expect(blades[0]!.charge).toEqual({ multiplier: 2, seNeed: 50, damage: 28 })
		expect(combatant.weapons.length).toBe(2)
	})

	it('a charge sub-kit inside the basic attack is read as-is', () => {
		applyContentOverrides({
			items: {
				'wooden-blade': {
					kits: [
						{
							id: 'basic-attack',
							params: { multiplier: [1.5, 1.5, 1.5, 1.5, 1.5], speed: [1, 1, 1, 1, 1] },
							charge: { params: { seNeed: [100, 100, 100, 100, 100], multiplier: [3, 3, 3, 3, 3] } },
						},
					],
				},
			},
		})
		const combatant = buildPlayerCombatant('fire-pup', 1, [createItemInstance('wooden-blade', 1, 'a', 0)])
		const blade = combatant.weapons.find((weapon) => weapon.templateId === 'wooden-blade')!
		expect(blade.damage).toBe(21)
		// 14 × 3 — the basic attack's ×1.5 is **not** stacked on top of the charged multiplier.
		expect(blade.charge).toEqual({ multiplier: 3, seNeed: 100, damage: 42 })
	})

	it('the shop roll pool reads the overlay, not the raw array', () => {
		expect(itemTemplatesUpToTier(1).map((template) => template.id)).not.toContain('warden-plate')

		applyContentOverrides({ items: { 'warden-plate': { tier: 1 } } })
		expect(itemTemplatesUpToTier(1).map((template) => template.id)).toContain('warden-plate')
	})

	it('cutie unlocks read the overlay', () => {
		applyContentOverrides({ cuties: { 'white-rabbit': { unlockStage: 1, name: 'Early Rabbit' } } })
		expect(cutieList().find((cutie) => cutie.id === 'white-rabbit')?.unlockStage).toBe(1)
		expect(getCutie('white-rabbit').name).toBe('Early Rabbit')
	})

	it("a cutie's own attack Cooldown Time is editable from the admin page", () => {
		const base = getCutie('fire-pup')
		const swingInterval = () =>
			buildPlayerCombatant('fire-pup', 1, []).weapons.find((weapon) => weapon.uid === 'skill')?.interval
		const before = swingInterval()
		expect(before).toBe(1600)

		// The cutie's kit is the one place its rhythm lives now — a shorter Cooldown Time is faster.
		applyContentOverrides({
			cuties: { 'fire-pup': { kits: [{ id: 'basic-attack', params: { cooldown: [0.8, 0.8, 0.8, 0.8, 0.8] } }] } },
		})
		expect(swingInterval()).toBe(800)

		// A row written before the change still carries `attackSpeed`: it is ignored, never resurrected.
		applyContentOverrides({ cuties: { 'fire-pup': { attackSpeed: 9 } } })
		expect('attackSpeed' in getCutie('fire-pup')).toBe(false)
		expect(swingInterval()).toBe(before)

		applyContentOverrides(null)
		expect(swingInterval()).toBe(1600)
		expect(getCutie('fire-pup').kits).toEqual(base.kits)
	})

	it('clearing the overlay returns to the defaults', () => {
		const base = getTemplate('wooden-blade')
		applyContentOverrides({ items: { 'wooden-blade': { name: 'Temp' } } })
		expect(getTemplate('wooden-blade').name).toBe('Temp')
		applyContentOverrides(null)
		expect(getTemplate('wooden-blade').name).toBe(base.name)
	})

	it('never copies an unknown key onto the template', () => {
		applyContentOverrides({ items: { 'wooden-blade': { notARealField: 1 } } })
		expect(Object.keys(getTemplate('wooden-blade'))).not.toContain('notARealField')
	})
})

/**
 * A kit deleted from the whole game (`/admin` → Kits).
 *
 * 🔴 The removal has to survive **the code copy**: items and Cuties are defined in `game/kits.ts`
 * / `game/cuties.ts`, so a deleted kit is only really gone if every read path drops it — top level,
 * inside an attack kit's `onHit`, and the `charge` variant.
 */
describe('kits deleted from the game', () => {
	it('drops a removed kit out of any kit list, including the code one', () => {
		// `fire-pup` carries its basic attack straight from code (no stored row).
		const before = getCutie('fire-pup').kits ?? []
		expect(before.map((kit) => kit.id)).toEqual(['basic-attack'])

		applyContentOverrides({ kits: { categories: [], entries: { 'basic-attack': { removed: true } } } })
		expect(getCutie('fire-pup').kits).toEqual([])
		// And it is not offered any more: the catalogue is the source of the admin's add list.
		expect(kitCatalogue().some((def) => def.id === 'basic-attack')).toBe(false)

		applyContentOverrides(null)
		expect(getCutie('fire-pup').kits).toEqual(before)
		expect(kitCatalogue().some((def) => def.id === 'basic-attack')).toBe(true)
	})

	it('strips a nested on-hit effect and the charged variant out of a stored kit list', () => {
		const kits = [
			{
				id: 'basic-attack' as const,
				params: { multiplier: [1, 1, 1, 1, 1], cooldown: [1.6, 1.6, 1.6, 1.6, 1.6] },
				onHit: [{ id: 'burn-on-hit' as const, params: { chance: [30, 30, 30, 30, 30] } }],
				charge: { id: 'charge-attack' as const, params: { multiplier: [2, 2, 2, 2, 2] } },
			},
		]
		applyContentOverrides({ kits: { categories: [], entries: { 'burn-on-hit': { removed: true } } } })
		const withoutBurn = mergeItem(getTemplate('wooden-blade'), { kits })
		expect(withoutBurn.kits?.[0]?.onHit).toBeUndefined()
		// The charged variant is a different kit, so it stayed.
		expect(withoutBurn.kits?.[0]?.charge?.id).toBe('charge-attack')

		applyContentOverrides({ kits: { categories: [], entries: { 'charge-attack': { removed: true } } } })
		const withoutCharge = mergeItem(getTemplate('wooden-blade'), { kits })
		expect(withoutCharge.kits?.[0]?.charge).toBeUndefined()
		expect(withoutCharge.kits?.[0]?.onHit).toHaveLength(1)
	})
})
