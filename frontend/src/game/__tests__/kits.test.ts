import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCombatant, buildPlayerCombatant } from '../build'
import type { Combatant, CombatItem } from '../build'
import { createItemInstance } from '../bag'
import { simulateBattle } from '../battle'
import { applyContentOverrides } from '../content'
import { installRetiredItems } from '../../test/retiredItems'
import { getTemplate } from '../items'
import { buffDirectionMask } from '../kits'
import type { ItemInstance } from '../types'

beforeEach(() => installRetiredItems())
afterEach(() => applyContentOverrides(null))

function bag(...entries: [string, 1 | 2 | 3 | 4, number][]): ItemInstance[] {
	return entries.map(([templateId, star, slot]) => createItemInstance(templateId, star, `${templateId}-${slot}`, slot))
}

function dummy(overrides: Partial<Parameters<typeof buildCombatant>[0]> = {}): Combatant {
	return buildCombatant({
		side: 'player',
		name: 'Test',
		icon: '🐶',
		baseMaxHp: 6000,
		baseMaxSe: 100,
		baseSeRegen: 0,
		baseWeaponName: 'Đòn cơ bản',
		baseWeaponIcon: '✨',
		// The base attack is parked far in the future so only the weapons added below swing.
		baseWeaponInterval: 1_000_000,
		baseWeaponDamage: 0,
		items: [],
		gridWidth: 6,
		gridSize: 12,
		...overrides,
	})
}

function weapon(overrides: Partial<CombatItem>): CombatItem {
	return {
		uid: 'w1',
		templateId: 'w1',
		name: 'Test weapon',
		icon: '🗡️',
		star: 1,
		slot: 0,
		cls: 'melee',
		damage: 10,
		interval: 500,
		linked: false,
		...overrides,
	}
}

/** Attack / charged events coming from one weapon. */
function hits(result: ReturnType<typeof simulateBattle>, uid: string) {
	return result.events.filter(
		(event) => (event.kind === 'attack' || event.kind === 'charged') && event.sourceUid === uid,
	)
}

describe('kit catalogue → combatant', () => {
	it('reads the defensive option kits once per item', () => {
		installRetiredItems({
			items: {
				'hide-vest': {
					kits: [
						{ id: 'damage-reduction', params: { value: [10, 10, 10, 10, 10] } },
						{ id: 'starting-shield', params: { amount: [200, 200, 200, 200, 200] } },
						{ id: 'healing-boost', params: { value: [50, 50, 50, 50, 50] } },
						{ id: 'regen', params: { value: [1, 1, 1, 1, 1] } },
						{ id: 'block-chance', params: { chance: [100, 100, 100, 100, 100] } },
						{ id: 'block-charged', params: { seCost: [30, 30, 30, 30, 30] } },
					],
				},
			},
		})
		const combatant = buildPlayerCombatant('fire-pup', 1, bag(['hide-vest', 1, 0]))
		expect(combatant.damageReduction).toBeCloseTo(0.1)
		expect(combatant.shield).toBe(200)
		expect(combatant.healingBoost).toBeCloseTo(0.5)
		expect(combatant.regenPct).toBe(1)
		// The chance is capped so a full board cannot become invulnerable.
		expect(combatant.blockChance).toBeCloseTo(0.9)
		expect(combatant.blockCharged).toEqual({ seCost: 30 })
	})

	it('reports the sides a support gem covers as one mask', () => {
		const gem = (target: number, directions: number) => ({
			id: 'freeze-haste' as const,
			params: {
				target: [target, target, target, target, target],
				directions: [directions, directions, directions, directions, directions],
				boost: [50, 50, 50, 50, 50],
				duration: [4000, 4000, 4000, 4000, 4000],
			},
		})
		expect(buffDirectionMask([gem(0, 9)], 1)).toBe(9)
		// Two gems on one item: every side a buff can reach.
		expect(buffDirectionMask([gem(0, 1), gem(0, 8)], 1)).toBe(9)
		// A gem that buffs a random weapon has no sides to draw.
		expect(buffDirectionMask([gem(1, 15)], 1)).toBe(0)
		expect(buffDirectionMask(undefined, 1)).toBe(0)
	})

	it('buffa only the sides the kit ticks', () => {
		installRetiredItems({
			items: {
				// A 1×1 gem between two 1×1 weapons: only the right-hand one is selected.
				'jade-fury': {
					kits: [
						{
							id: 'freeze-haste',
							params: {
								target: [0, 0, 0, 0, 0],
								directions: [8, 8, 8, 8, 8],
								boost: [100, 100, 100, 100, 100],
								duration: [4000, 4000, 4000, 4000, 4000],
							},
						},
					],
				},
			},
		})
		const combatant = dummy({
			items: [
				{ templateId: 'poison-dagger', star: 1, slot: 0 },
				{ templateId: 'jade-fury', star: 1, slot: 1 },
				{ templateId: 'poison-dagger', star: 1, slot: 2 },
			],
		})
		expect(combatant.reactions.freeze[0]?.mode).toBe('directions')
		expect(combatant.reactions.freeze[0]?.weaponUids).toEqual(['poison-dagger-2'])
	})

	it('resolves a random target at runtime, not at build time', () => {
		installRetiredItems({
			items: {
				'jade-fury': {
					kits: [
						{
							id: 'freeze-haste',
							params: {
								target: [1, 1, 1, 1, 1],
								directions: [15, 15, 15, 15, 15],
								boost: [50, 50, 50, 50, 50],
								duration: [4000, 4000, 4000, 4000, 4000],
							},
						},
					],
				},
			},
		})
		const random = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 0], ['jade-fury', 1, 1]))
		expect(random.reactions.freeze[0]?.mode).toBe('random')
		expect(random.reactions.freeze[0]?.weaponUids).toEqual([])
	})

	it('only speeds up weapons edge-adjacent to a support gem', () => {
		installRetiredItems({
			items: {
				'jade-fury': {
					kits: [{ id: 'freeze-haste', params: { boost: [50, 50, 50, 50, 50], duration: [4000, 4000, 4000, 4000, 4000] } }],
				},
			},
		})
		// 1×1 gem at slot 1, a 1×3 blade down column 0 next to it.
		const combatant = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 0], ['jade-fury', 1, 1]))
		expect(combatant.reactions.freeze).toHaveLength(1)
		expect(combatant.reactions.freeze[0]?.value).toBe(50)
		expect(combatant.reactions.freeze[0]?.weaponUids).toEqual(['wooden-blade-0'])
	})
})

describe('freeze / slow / block', () => {
	it('freezes one weapon at random, pauses its charge and resumes afterwards', () => {
		const player = dummy({ name: 'Player' })
		player.weapons.push(
			weapon({
				uid: 'freezer',
				damage: 1,
				interval: 400,
				onHit: [{ chance: 1, effects: [{ kind: 'freezeWeapon', duration: 1500 }] }],
			}),
		)
		const enemy = dummy({ side: 'enemy', name: 'Enemy', baseMaxHp: 50_000 })
		enemy.weapons.push(
			weapon({ uid: 'e1', slot: 0, interval: 1000 }),
			weapon({ uid: 'e2', slot: 1, interval: 1000 }),
		)

		const result = simulateBattle(player, enemy, 11)
		const freezes = result.events.filter(
			(event) => event.kind === 'status' && event.amount === 1500 && Boolean(event.sourceUid),
		)
		expect(freezes.length).toBeGreaterThan(1)
		// The second freeze never refreshes the weapon already frozen: it picks the other one.
		expect(freezes[0]?.sourceUid).not.toBe(freezes[1]?.sourceUid)

		const first = freezes[0]!
		const frozenUid = first.sourceUid!
		expect(first.enemy.cooldowns.find((entry) => entry.uid === frozenUid)?.frozen).toBeGreaterThan(0)
		// Nothing swings from that weapon while it is frozen…
		const during = hits(result, frozenUid).filter(
			(event) => event.t > first.t && event.t < first.t + 1500,
		)
		expect(during).toHaveLength(0)
		// …and it resumes when the freeze runs out.
		expect(hits(result, frozenUid).some((event) => event.t >= first.t + 1500)).toBe(true)
	})

	it('a weapon fed by two cooldown gems takes only the higher reduction', () => {
		/**
		 * Two gems, the same 1×3 blade edge-adjacent to **both** of them, a `freeze-haste` kit on each and
		 * a guaranteed freeze on the blade — so both gems fire on the same trigger. `low`/`high` are
		 * swapped between the two runs so both application orders are covered.
		 */
		const run = (low: string, high: string) => {
			const haste = (boost: number) => ({
				id: 'freeze-haste' as const,
				params: {
					target: [0, 0, 0, 0, 0],
					directions: [15, 15, 15, 15, 15],
					boost: [boost, boost, boost, boost, boost],
					duration: [4000, 4000, 4000, 4000, 4000],
				},
			})
			installRetiredItems({
				items: {
					[low]: { kits: [haste(40)] },
					[high]: { kits: [haste(100)] },
					// The blade lands the freeze both gems react to. `on-hit` kits live **inside** the
					// attack kit (swings come from attack kits, not from the template's class).
					'wooden-blade': {
						// The footprint and the base attack have to be restated: a DB-only item merges onto
						// a blank template, so nothing comes from code any more.
						space: { w: 1, h: 3 },
						attack: [12, 20, 32, 50, 78],
						kits: [
							{
								...getTemplate('wooden-blade').kits![0]!,
								onHit: [
									{
										id: 'freeze-on-hit',
										params: {
											chance: [100, 100, 100, 100, 100],
											duration: [1500, 1500, 1500, 1500, 1500],
										},
									},
								],
							},
						],
					},
				},
			})
			// Row 1: gem | blade | gem — each gem's left/right neighbour is that same blade.
			const player = buildPlayerCombatant('fire-pup', 5, bag(['jade-fury', 1, 4], ['wooden-blade', 1, 5], ['jade-haste', 1, 6]))
			const enemy = dummy({ side: 'enemy', baseMaxHp: 50_000, baseMaxSe: 0, baseSeRegen: 0 })
			enemy.weapons.push(weapon({ uid: 'e1', slot: 0, interval: 1000 }))

			const result = simulateBattle(player, enemy, 8)
			const boosts = result.events.filter((event) => event.kind === 'status' && event.text.includes('giảm hồi chiêu'))
			const values = boosts.map(
				(event) => event.player.cooldowns.find((entry) => entry.uid === 'wooden-blade-5')?.cdr ?? 0,
			)
			return { boosts, values }
		}

		for (const [low, high] of [
			['jade-fury', 'jade-haste'],
			['jade-haste', 'jade-fury'],
		]) {
			const { boosts, values } = run(low, high)
			// Both gems fired on the same freeze…
			expect(boosts.length).toBeGreaterThan(1)
			// …and the blade never went above the strongest one: 140 would be a stack, 40 a downgrade.
			expect(Math.max(...values)).toBe(100)
			expect(values.every((value) => value <= 100)).toBe(true)
			// The last snapshot is what the weapon holds once both gems are done with it.
			expect(values.at(-1)).toBe(100)
		}
	})

	it('slows one enemy weapon when a weapon lands a hit', () => {
		installRetiredItems({
			items: {
				'jade-fury': {
					kits: [
						{
							id: 'slow-strike',
							params: {
								chance: [100, 100, 100, 100, 100],
								value: [50, 50, 50, 50, 50],
								duration: [3000, 3000, 3000, 3000, 3000],
							},
						},
					],
				},
			},
		})
		const player = dummy({ items: [{ templateId: 'jade-fury', star: 1, slot: 0 }] })
		player.weapons.push(weapon({ uid: 'hitter', interval: 400, damage: 1 }))
		const enemy = dummy({ side: 'enemy', name: 'Enemy', baseMaxHp: 50_000 })
		enemy.weapons.push(weapon({ uid: 'e1', slot: 0, interval: 1000 }))

		const result = simulateBattle(player, enemy, 5)
		const slow = result.events.find(
			(event) => event.kind === 'status' && event.text.includes('bị làm chậm'),
		)
		expect(slow).toBeTruthy()
		expect(slow?.sourceUid).toBe('e1')
		expect(slow?.enemy.cooldowns.find((entry) => entry.uid === 'e1')?.slow).toBe(50)
	})

	it('blocks a charged attack outright when the defender holds enough Sword Energy', () => {
		const attacker = dummy({ side: 'enemy', name: 'Attacker', baseMaxSe: 100, baseSeRegen: 80 })
		attacker.weapons.push(
			weapon({
				uid: 'heavy',
				interval: 700,
				damage: 5,
				charge: { multiplier: 2, seNeed: 10, damage: 100 },
			}),
		)
		const defender = dummy({ name: 'Defender', baseMaxHp: 50_000, baseSeRegen: 200 })
		defender.blockCharged = { seCost: 20 }

		const result = simulateBattle(defender, attacker, 9)
		const blocks = result.events.filter((event) => event.kind === 'block')
		expect(blocks.length).toBeGreaterThan(0)
		expect(blocks[0]?.side).toBe('player')
		expect(result.events.some((event) => event.kind === 'charged')).toBe(false)
	})
})

describe('healing and damage over time', () => {
	it('a burning target only heals at half rate', () => {
		const clean = dummy({ baseMaxHp: 6000 })
		clean.regenPct = 10
		// The bar has to be below max, or the passive ticks are all capped at 0.
		clean.hp = 3000
		const burned = dummy({ baseMaxHp: 6000 })
		burned.regenPct = 10
		burned.hp = 3000
		burned.statuses = [{ key: 'burn', value: 0, remaining: 5000, stacks: 1 }]

		const withRegen = simulateBattle(clean, dummy({ side: 'enemy', baseMaxHp: 1 }), 1)
		const withBurn = simulateBattle(burned, dummy({ side: 'enemy', baseMaxHp: 1 }), 1)
		// 10 % of 6000 per second = 600/s; the first 250 ms bucket reports 150, halved by the burn.
		const cleanHeal = withRegen.events.find((event) => event.kind === 'heal' && event.side === 'player')
		const burnHeal = withBurn.events.find((event) => event.kind === 'heal' && event.side === 'player')
		expect(cleanHeal?.amount).toBe(150)
		expect(burnHeal?.amount).toBe(75)
	})

	it('poison scaled to the target current HP drains less and less', () => {
		const player = dummy({ name: 'Player' })
		player.weapons.push(
			weapon({
				uid: 'venom',
				interval: 2000,
				damage: 1,
				onHit: [
					{
						chance: 1,
						effects: [
							{
								kind: 'status',
								status: 'poison',
								duration: 4000,
								value: 10,
								scale: 'enemyHpCurrent',
								stacks: 1,
								target: 'enemy',
							},
						],
					},
				],
			}),
		)
		const enemy = dummy({ side: 'enemy', name: 'Enemy', baseMaxHp: 20_000 })
		const result = simulateBattle(player, enemy, 3)
		const dots = result.events.filter((event) => event.kind === 'dot' && (event.amount ?? 0) > 0)
		expect(dots.length).toBeGreaterThan(1)
		// 10 % of 20 000 = 2 000/s, reported every 250 ms → ~500.
		expect(dots[0]!.amount).toBeGreaterThan(300)
		expect(dots.at(-1)!.amount ?? 0).toBeLessThan(dots[0]!.amount ?? 0)
	})
})

describe('damage stacking and Sword Energy', () => {
	it('caps rage stacks at the kit maximum', () => {
		installRetiredItems({
			items: {
				'jade-fury': {
					kits: [
						{
							id: 'rage-on-hit',
							params: {
								value: [10, 10, 10, 10, 10],
								maxStacks: [10, 10, 10, 10, 10],
							},
						},
					],
				},
			},
		})
		const player = dummy({ items: [{ templateId: 'jade-fury', star: 1, slot: 0 }] })
		player.weapons.push(weapon({ uid: 'rage', interval: 200, damage: 10 }))
		const enemy = dummy({ side: 'enemy', baseMaxHp: 1_000_000 })

		const attacks = hits(simulateBattle(player, enemy, 2), 'rage')
		expect(attacks[0]?.amount).toBe(10)
		expect(attacks[10]?.amount).toBe(20)
		expect(attacks[11]?.amount).toBe(20)
	})

	it('grants Sword Energy on hit', () => {
		const player = dummy({ name: 'Player', baseSeRegen: 0 })
		player.weapons.push(
			weapon({
				uid: 'energised',
				interval: 500,
				damage: 1,
				onHit: [{ chance: 1, effects: [{ kind: 'swordEnergy', amount: 6 }] }],
			}),
		)
		const enemy = dummy({ side: 'enemy', baseMaxHp: 50_000 })
		const result = simulateBattle(player, enemy, 4)
		expect(result.events.some((event) => event.text.includes('nạp +6 Kiếm Thế'))).toBe(true)
	})
})

describe('death zone', () => {
	it('starts after 3 minutes and closes out a stalemate with growing damage', () => {
		const player = dummy({ name: 'Player', baseMaxHp: 100_000 })
		const enemy = dummy({ side: 'enemy', name: 'Enemy', baseMaxHp: 100_000 })
		const result = simulateBattle(player, enemy, 6)

		const zone = result.events.filter((event) => event.text.includes('Vùng tử địa'))
		expect(zone.length).toBeGreaterThan(1)
		expect(zone[0]!.t).toBeGreaterThanOrEqual(180_000)
		expect(zone.at(-1)!.amount ?? 0).toBeGreaterThan(zone[0]!.amount ?? 0)
		expect(result.events.at(-1)?.kind).toBe('end')
		expect(['player', 'enemy', 'draw']).toContain(result.winner)
		expect(result.duration).toBeLessThanOrEqual(360_000)
	})
})

describe('owner-relative item numbers', () => {
	const fives = (value: number) => [value, value, value, value, value]
	const wave = (id: string, params: Record<string, number[]>) => ({ id, params }) as never

	it('an item carries its own Cooldown Time, not a delta on the cutie', () => {
		const bladeWith = (cooldown: number) => {
			installRetiredItems({
				items: {
					'wooden-blade': {
						kits: [{ id: 'basic-attack', params: { multiplier: fives(1), cooldown: fives(cooldown) } }] as never,
					},
				},
			})
			const combatant = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 0]))
			return combatant.weapons.find((weapon) => weapon.templateId === 'wooden-blade')
		}
		// Seconds in, milliseconds out — the number the admin page shows *is* the interval.
		expect(bladeWith(1.6)?.interval).toBe(1600)
		expect(bladeWith(0.5)?.interval).toBe(500)
		expect(bladeWith(3)?.interval).toBe(3000)
		// 🔴 The kit's range is the floor: a stored 0 (or a negative) is clamped to 0.1 s, never 0 ms —
		// an interval of 0 would let one weapon swing on every single tick.
		expect(bladeWith(0)?.interval).toBe(100)
		expect(bladeWith(-5)?.interval).toBe(100)
	})

	it('an item swing is the cutie attack × its multiplier, at its own Cooldown Time', () => {
		installRetiredItems({
			items: {
				'wooden-blade': {
					kits: [
						{ id: 'basic-attack', params: { multiplier: fives(2), cooldown: fives(1.6) } },
					] as never,
				},
			},
		})
		const combatant = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 0]))
		const blade = combatant.weapons.find((weapon) => weapon.templateId === 'wooden-blade')!
		// The cutie's own attack is 14; the blade's 1.6 s cooldown is its own, not the cutie's.
		expect(blade.damage).toBe(28)
		expect(blade.interval).toBe(1600)
	})

	it('a damage-boost kit on a weapon lifts that weapon\'s own swings', () => {
		installRetiredItems({
			items: {
				'wooden-blade': {
					kits: [
						{ id: 'basic-attack', params: { multiplier: fives(1), speed: fives(1) } },
						wave('damage-boost', {
							value: fives(50),
							target: fives(0),
							directions: fives(15),
							trigger: fives(0),
							duration: fives(3000),
						}),
					] as never,
				},
			},
		})
		const combatant = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 0]))
		const blade = combatant.weapons.find((weapon) => weapon.templateId === 'wooden-blade')!
		// 14 × 1, then +50 % for good: the boost is part of the weapon's own number.
		expect(blade.damage).toBe(21)
	})

	it('a damage-boost by direction lifts only the weapons on the ticked sides', () => {
		const gem = {
			kits: [
				wave('damage-boost', {
					value: fives(100),
					target: fives(1),
					directions: fives(4),
					trigger: fives(0),
					duration: fives(3000),
				}),
			],
		}
		installRetiredItems({ items: { 'jade-fury': gem } as never })
		// A 1×1 gem between two 1×1 daggers, boosting only the one on its **left**.
		const combatant = buildPlayerCombatant(
			'fire-pup',
			1,
			bag(['poison-dagger', 1, 4], ['jade-fury', 1, 5], ['poison-dagger', 1, 6]),
		)
		const daggers = combatant.weapons.filter((weapon) => weapon.templateId === 'poison-dagger')
		const boosted = daggers.find((weapon) => weapon.slot === 4)!
		const plain = daggers.find((weapon) => weapon.slot === 6)!
		expect(boosted.damage).toBeGreaterThan(plain.damage)
		expect(boosted.damage).toBe(plain.damage * 2)
	})

	it('a triggered damage-boost runs for its duration after the owner is hit', () => {
		installRetiredItems({
			items: {
				'wooden-blade': {
					kits: [
						{ id: 'basic-attack', params: { multiplier: fives(1), speed: fives(4) } },
						wave('damage-boost', {
							value: fives(100),
							target: fives(0),
							directions: fives(15),
							trigger: fives(1),
							duration: fives(2000),
						}),
					] as never,
				},
			},
		})
		const player = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 0]))
		const target = dummy({ baseMaxHp: 100_000 })
		const result = simulateBattle(player, target, 7)
		expect(result.events.some((event) => event.text.includes('tăng sát thương'))).toBe(true)
	})

	it('a sword-energy kit moves regeneration by a share of the cutie\'s own', () => {
		installRetiredItems({
			items: {
				'jade-fury': { kits: [wave('sword-energy', { regen: fives(50) })] },
				'jade-guard': { kits: [wave('sword-energy', { regen: fives(-50) })] },
			},
		})
		const bare = buildPlayerCombatant('fire-pup', 1, [])
		const faster = buildPlayerCombatant('fire-pup', 1, bag(['jade-fury', 1, 0]))
		const slower = buildPlayerCombatant('fire-pup', 1, bag(['jade-guard', 1, 0]))
		expect(faster.seRegen).toBe(bare.seRegen * 1.5)
		expect(slower.seRegen).toBe(bare.seRegen * 0.5)
	})

	it('an item stat table adds its numbers straight to the cutie', () => {
		const bare = buildPlayerCombatant('fire-pup', 1, [])
		const combatant = buildPlayerCombatant('fire-pup', 1, bag(['hide-vest', 1, 0]))
		// +8 armour, exactly as typed — not a share of the bar.
		expect(combatant.shield).toBe(8)
		expect(combatant.maxHp).toBe(bare.maxHp)
	})
})
