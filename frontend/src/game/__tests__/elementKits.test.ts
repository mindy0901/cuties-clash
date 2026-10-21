/**
 * The **element kits** — fire (damage / burn / anti-heal), water (weaken / phantom armour), ice
 * (control / brittle), thunder (speed / crit / shock) and wood (cleanse / heal / mitigation).
 *
 * What this file pins is the **wiring**, not the balance: a kit that is declared but never reaches the
 * engine is worse than a missing kit, because the card shows numbers that do nothing. Each case reads the
 * assembled combatant (or the swing's on-hit list) and asserts the mechanic actually arrived.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCombatant } from '../build'
import { createItemInstance } from '../bag'
import { applyContentOverrides } from '../content'
import { installRetiredItems } from '../../test/retiredItems'
import { defaultKit } from '../kits'
import type { ItemInstance, ItemKit, ItemKitId, OnHitKitId } from '../types'

beforeEach(() => installRetiredItems())
afterEach(() => applyContentOverrides(null))

/** A kit with its per-star table filled from the definition (`defaultKit`) plus overrides. */
function kit(id: ItemKitId, params: Record<string, number> = {}): ItemKit {
	const base = defaultKit(id)
	const merged = { ...base.params }
	for (const [key, value] of Object.entries(params)) merged[key] = [value, value, value, value, value]
	return { ...base, params: merged }
}

/** One weapon carrying `onHit` effects, laid out at slot 0. */
function weaponWithOnHit(...effects: ItemKit[]): ItemInstance[] {
	applyContentOverrides({
		items: {
			'wooden-blade': {
				kits: [{ ...kit('basic-attack'), onHit: effects as ItemKit<OnHitKitId>[] }],
			},
		},
	})
	return [createItemInstance('wooden-blade', 1, 'blade', 0)]
}

/** One gem in the bag (an `option` kit only shapes the owner). */
function gemWith(optionKit: ItemKit | null, weapon = 'wooden-blade'): ItemInstance[] {
	applyContentOverrides({
		items: {
			'jade-guard': { kits: optionKit ? [optionKit] : [] },
		},
	})
	return [createItemInstance('jade-guard', 1, 'gem', 0), createItemInstance(weapon, 1, 'blade', 2)]
}

function combatant(items: ItemInstance[]) {
	return buildCombatant({
		side: 'player',
		name: 'Test',
		icon: '🐶',
		baseMaxHp: 600,
		baseMaxSe: 100,
		baseSeRegen: 8,
		baseWeaponName: 'Đòn cơ bản',
		baseWeaponIcon: '✨',
		baseWeaponInterval: 1500,
		baseWeaponDamage: 14,
		items,
		gridWidth: 6,
		gridSize: 12,
	})
}

/** Every on-hit effect the assembled weapon rolls after a hit. */
function onHitStatuses(items: ItemInstance[]) {
	const built = combatant(items)
	return built.weapons.flatMap((weapon) =>
		(weapon.onHit ?? []).flatMap((trigger) =>
			trigger.effects.map((effect) => (effect.kind === 'status' ? effect.status : effect.kind)),
		),
	)
}

describe('element kits reach the engine', () => {
	it('hands out the ice / fire / water debuffs as statuses', () => {
		const statuses = onHitStatuses(
			weaponWithOnHit(
				kit('brittle-on-hit', { chance: 100, duration: 3000, value: 15 }),
				kit('wound-on-hit', { chance: 100, duration: 3000, value: 35 }),
				kit('weaken-on-hit', { chance: 100, duration: 3000, value: 20 }),
			),
		)
		expect(statuses).toEqual(expect.arrayContaining(['brittle', 'wound', 'weaken']))
	})

	it('turns the thunder shock into a stun effect', () => {
		const built = combatant(weaponWithOnHit(kit('shock-on-hit', { chance: 100, duration: 800 })))
		const effects = built.weapons.flatMap((weapon) =>
			(weapon.onHit ?? []).flatMap((trigger) => trigger.effects),
		)
		expect(effects.some((effect) => effect.kind === 'stun' && effect.duration === 800)).toBe(true)
	})

	it('gives the water gem a phantom armour reaction and the wood gem a cleanse', () => {
		const water = combatant(
			gemWith(kit('shield-when-hit', { chance: 100, amount: 6 })),
		)
		expect(water.reactions.attacked.some((reaction) => (reaction.shield ?? 0) > 0)).toBe(true)

		applyContentOverrides(null)
		installRetiredItems()
		const wood = combatant(gemWith(kit('cleanse', { chance: 100 })))
		expect(wood.reactions.attacked.some((reaction) => reaction.cleanse === true)).toBe(true)
	})

	it('lets the thunder gem refund Sword Energy on a critical hit', () => {
		const charged = combatant(gemWith(kit('overcharge', { amount: 25 })))
		expect(charged.critEnergy).toBe(25)
	})

	it('keeps every new kit out of the way when it is not carried', () => {
		const bare = combatant(gemWith(null))
		expect(bare.critEnergy).toBeUndefined()
		expect(bare.reactions.attacked).toHaveLength(0)
	})
})
