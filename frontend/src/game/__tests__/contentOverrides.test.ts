/**
 * Content overlay from the admin page: merged over the templates in code.
 *
 * What must hold:
 *   * per-star JSON data has to be rebuilt into the exact functions `ItemTemplate` expects;
 *   * a **broken** row is skipped, it must never crash the game (throwing here is a blank page);
 *   * the overlay has to reach **gameplay** (roll pools, weapon stats), not just labels.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createItemInstance } from '../bag'
import { buildPlayerCombatant } from '../build'
import { applyContentOverrides, mergeItem, mergePet } from '../content'
import { getTemplate, itemTemplatesUpToTier } from '../items'
import { getPet, petList } from '../pets'
import type { Star } from '../types'

/** Every test must clear the overlay, otherwise it leaks into the next one (module variable). */
afterEach(() => applyContentOverrides(null))

const ATK_OVERRIDE = { atk: 7 }

/** Per-star lookup helper: `Star` values in order, so tests need no literal casts. */
const STARS: Star[] = [1, 2, 3, 4, 5]

describe('merging an overlay into a template', () => {
	it('changes plain data fields', () => {
		const merged = mergeItem(getTemplate('wooden-blade'), { name: 'New Blade', cost: 9, tier: 2 })
		expect(merged.name).toBe('New Blade')
		expect(merged.cost).toBe(9)
		expect(merged.tier).toBe(2)
		// Untouched fields keep the value from code.
		expect(merged.icon).toBe(getTemplate('wooden-blade').icon)
	})

	it('rebuilds per-star functions from a 5-entry array', () => {
		const merged = mergeItem(getTemplate('wooden-blade'), {
			damage: [11, 22, 33, 44, 55],
			speed: [1, 1.25, 1.5, 1.75, 2],
		})
		expect(STARS.map((star) => merged.damage!(star))).toEqual([11, 22, 33, 44, 55])
		expect(STARS.map((star) => merged.speed!(star))).toEqual([1, 1.25, 1.5, 1.75, 2])
	})

	it('rebuilds passive and aura per star', () => {
		const merged = mergeItem(getTemplate('wooden-blade'), {
			passive: [ATK_OVERRIDE, {}, {}, {}, {}],
			aura: [{ target: 'adjacent', mods: { atk: 3 } }, {}, {}, {}, {}],
		})
		expect(merged.passive!(1)).toEqual(ATK_OVERRIDE)
		expect(merged.aura!(1)).toEqual({ target: 'adjacent', mods: { atk: 3 } })
	})

	it('rejects a per-star array that is not exactly 5 entries long', () => {
		const base = getTemplate('wooden-blade')
		const merged = mergeItem(base, { damage: [11, 22, 33, 44] })
		expect(merged.damage).toBe(base.damage)
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
			damage: 'not an array',
			cost: -5,
			space: { w: 0, h: 3 },
			name: 'Still Applied',
		})
		expect(merged.name).toBe('Still Applied')
		expect(merged.damage).toBe(base.damage)
		expect(merged.cost).toBe(base.cost)
		expect(merged.space).toEqual(base.space)
	})

	it('returns the very same object when there is no overlay', () => {
		const base = getTemplate('fire-spear')
		expect(mergeItem(base, undefined)).toBe(base)
	})

	it('merges nested pet skills key by key', () => {
		const base = getPet('fire-pup')
		const merged = mergePet(base, { name: 'New Pup', skill: { damage: 99 } })
		expect(merged.name).toBe('New Pup')
		expect(merged.skill.damage).toBe(99)
		// The rest of the skill survives, it is not wiped by a shallow merge.
		expect(merged.skill.name).toBe(base.skill.name)
		expect(merged.maxHp).toBe(base.maxHp)
	})

	it('only accepts valid bag rows for pets', () => {
		const base = getPet('fire-pup')
		const merged = mergePet(base, { bags: base.bags.map(() => ({ width: 4, rows: 5 })) })
		expect(merged.bags.every((bag) => bag.rows === 5)).toBe(true)
	})
})

describe('the overlay reaches gameplay', () => {
	it('weapon stats follow the overlay', () => {
		const before = buildPlayerCombatant('fire-pup', 1, [createItemInstance('wooden-blade', 1, 'a', 0)])
		applyContentOverrides({ items: { 'wooden-blade': { damage: [99, 99, 99, 99, 99] } } })
		const after = buildPlayerCombatant('fire-pup', 1, [createItemInstance('wooden-blade', 1, 'a', 0)])

		// Base damage comes from the template in code; after the overlay the blade must use the
		// overridden number. Weapons[0] is the pet's innate skill, so find the blade by name.
		const blade = (weapons: { name: string; damage: number }[]) =>
			weapons.find((weapon) => weapon.name === getTemplate('wooden-blade').name)!
		expect(blade(after.weapons).damage).toBe(99)
		expect(blade(before.weapons).damage).not.toBe(99)
	})

	it('the shop roll pool reads the overlay, not the raw array', () => {
		expect(itemTemplatesUpToTier(1).map((template) => template.id)).not.toContain('warden-plate')

		applyContentOverrides({ items: { 'warden-plate': { tier: 1 } } })
		expect(itemTemplatesUpToTier(1).map((template) => template.id)).toContain('warden-plate')
	})

	it('pet unlocks read the overlay', () => {
		applyContentOverrides({ pets: { 'white-rabbit': { unlockStage: 1, name: 'Early Rabbit' } } })
		expect(petList().find((pet) => pet.id === 'white-rabbit')?.unlockStage).toBe(1)
		expect(getPet('white-rabbit').name).toBe('Early Rabbit')
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
