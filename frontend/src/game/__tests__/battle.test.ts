import { describe, expect, it } from 'vitest'
import { buildCombatant, buildEnemyCombatant, buildPlayerCombatant, estimatePower } from '../build'
import { createItemInstance } from '../bag'
import { COUNTER_COST, simulateBattle } from '../battle'
import { getStage } from '../stages'
import type { ItemInstance } from '../types'

function bag(...entries: [string, 1 | 2 | 3 | 4, number][]): ItemInstance[] {
	return entries.map(([templateId, star, slot]) => createItemInstance(templateId, star, `${templateId}-${slot}`, slot))
}

function dummy(overrides: Partial<Parameters<typeof buildCombatant>[0]> = {}) {
	return buildCombatant({
		side: 'player',
		name: 'Test',
		icon: '🐶',
		baseMaxHp: 600,
		baseMaxSe: 100,
		baseSeRegen: 8,
		baseCounterChance: 0.1,
		baseWeaponName: 'Đòn cơ bản',
		baseWeaponIcon: '✨',
		baseWeaponInterval: 1500,
		baseWeaponDamage: 14,
		items: [],
		gridWidth: 6,
		gridSize: 12,
		...overrides,
	})
}

describe('combatant assembly', () => {
	it('adds armour to the starting shield without touching pet health', () => {
		const bare = buildPlayerCombatant('fire-pup', 1, [])
		const armoured = buildPlayerCombatant('fire-pup', 1, bag(['hide-vest', 1, 0]))
		expect(armoured.shield).toBe(180)
		expect(armoured.maxHp).toBe(bare.maxHp)
	})

	it('aggregates passives from every equipped item', () => {
		const combatant = buildPlayerCombatant('fire-pup', 1, bag(['jade-fury', 2, 0], ['jade-haste', 2, 1]))
		expect(combatant.stats.atk).toBe(10)
		expect(combatant.stats.haste).toBe(12)
		expect(combatant.weapons.length).toBe(1)
	})

	it('only grants an adjacency aura when the required neighbour exists', () => {
		const lonely = buildPlayerCombatant('fire-pup', 1, bag(['war-drum', 1, 3]))
		expect(lonely.stats.atkPct).toBe(0)

		const linked = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 2], ['war-drum', 1, 3]))
		expect(linked.stats.atkPct).toBe(10)
	})

	it('requires a non-weapon neighbour for the silk banner aura', () => {
		const withWeapon = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 0], ['silk-banner', 1, 1]))
		const withArmour = buildPlayerCombatant('fire-pup', 1, bag(['hide-vest', 1, 0], ['silk-banner', 1, 1]))
		// Base pet health is 620; only the armour neighbour unlocks the +25 aura.
		expect(withWeapon.stats.maxHp).toBe(620)
		expect(withArmour.stats.maxHp).toBe(645)
	})

	it('marks weapons with their own attack cadence', () => {
		const combatant = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 0], ['great-axe', 4, 1]))
		expect(combatant.weapons).toHaveLength(3)
		expect(combatant.weapons[2].damage).toBe(150)
	})

	it('scores a geared pet above a bare one', () => {
		const bare = estimatePower(buildPlayerCombatant('fire-pup', 1, []))
		const geared = estimatePower(buildPlayerCombatant('fire-pup', 1, bag(['great-axe', 4, 0], ['warden-plate', 4, 1])))
		expect(geared).toBeGreaterThan(bare)
	})
})

describe('battle engine', () => {
	it('is deterministic for a given seed', () => {
		const player = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 2, 0], ['hide-vest', 1, 1], ['heal-dew', 1, 2]))
		const enemy = buildEnemyCombatant(getStage(1).enemy)
		const first = simulateBattle(player, enemy, 12345)
		const second = simulateBattle(player, enemy, 12345)
		expect(second.events.map((event) => event.text)).toEqual(first.events.map((event) => event.text))
		expect(second.duration).toBe(first.duration)
		expect(second.winner).toBe(first.winner)
	})

	it('always terminates inside the time limit with a winner', () => {
		const player = buildPlayerCombatant('fire-pup', 1, bag(['great-axe', 4, 0], ['warden-plate', 4, 1], ['jade-fury', 4, 2]))
		const enemy = buildEnemyCombatant(getStage(60).enemy)
		const result = simulateBattle(player, enemy, 7)
		expect(result.duration).toBeLessThanOrEqual(90_000)
		expect(['player', 'enemy', 'draw']).toContain(result.winner)
		expect(result.events.at(-1)?.kind).toBe('end')
	})

	it('spends Sword Energy on a counter (Chấn Đao)', () => {
		const attacker = dummy({ side: 'enemy', name: 'Attacker', baseWeaponInterval: 900 })
		const defender = dummy({ name: 'Defender', baseWeaponDamage: 1, baseCounterChance: 1, baseSeRegen: 60, baseMaxHp: 5000 })
		const result = simulateBattle(defender, attacker, 3)
		const counters = result.events.filter((event) => event.kind === 'counter')
		expect(counters.length).toBeGreaterThan(0)
		expect(counters[0].text).toContain('Chấn Đao')
		// Every counter is paid for out of the defender's Sword Energy pool.
		const paidEvents = result.events.filter((event) => event.kind === 'counter')
		for (const event of paidEvents) {
			expect(event.player.se).toBeLessThanOrEqual(defender.maxSe)
		}
		expect(COUNTER_COST).toBe(65)
	})

	it('applies control effects and damage over time', () => {
		const player = dummy({
			name: 'Player',
			baseMaxHp: 4000,
			baseWeaponDamage: 8,
			items: [
				{ templateId: 'frost-seal', star: 1, slot: 0 },
				{ templateId: 'poison-dagger', star: 1, slot: 1 },
			],
		})
		const enemy = dummy({ side: 'enemy', name: 'Enemy', baseMaxHp: 4000, baseWeaponDamage: 8 })
		const result = simulateBattle(player, enemy, 99)
		const texts = result.events.map((event) => event.text).join(' | ')
		expect(texts).toContain('Đóng Băng')
		expect(texts).toContain('Độc')
		const freeze = result.events.find((event) => event.text.includes('Đóng Băng'))
		expect(freeze?.enemy.statuses.some((status) => status.key === 'freeze')).toBe(true)
	})

	it('lets a well-geared pet beat the opening stages', () => {
		const player = buildPlayerCombatant('fire-pup', 2, bag(['wooden-blade', 2, 0], ['hide-vest', 2, 1], ['heal-dew', 1, 2]))
		const enemy = buildEnemyCombatant(getStage(1).enemy)
		expect(simulateBattle(player, enemy, 2026).winner).toBe('player')
	})

	it('lets the final stage punish a starting build', () => {
		const player = buildPlayerCombatant('fire-pup', 1, [])
		const enemy = buildEnemyCombatant(getStage(60).enemy)
		expect(simulateBattle(player, enemy, 5).winner).toBe('enemy')
	})
})
