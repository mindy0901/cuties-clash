import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildCombatant, buildEnemyCombatant, buildPlayerCombatant, estimatePower } from '../build'
import { createItemInstance } from '../bag'
import { simulateBattle } from '../battle'
import { applyContentOverrides } from '../content'
import { installRetiredItems } from '../../test/retiredItems'
import { getStage } from '../stages'
import type { ItemInstance } from '../types'

// The assembly tests build real loadouts, so the retired fixtures are the overlay (see
// `test/retiredCatalogue.ts`); each test starts from a clean overlay with those items registered.
beforeEach(() => installRetiredItems())
afterEach(() => applyContentOverrides(null))

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
	it('gives Cuties a base critical chance and bonus critical damage', () => {
		const combatant = buildPlayerCombatant('fire-pup', 1, [])

		expect(combatant.stats.critRate).toBe(5)
		expect(combatant.stats.critDamage).toBe(80)
		expect(combatant.critRate).toBe(0.05)
		expect(combatant.critDamage).toBe(1.8)
	})

	it('adds armour to the starting shield without touching cutie health', () => {
		const bare = buildPlayerCombatant('fire-pup', 1, [])
		const armoured = buildPlayerCombatant('fire-pup', 1, bag(['hide-vest', 1, 0]))
		// `shield` in an item's stat table is a **flat amount** added to the wearer's armour (8).
		expect(armoured.shield).toBe(8)
		expect(armoured.maxHp).toBe(bare.maxHp)
	})

	it('aggregates passives from every equipped item', () => {
		const combatant = buildPlayerCombatant('fire-pup', 1, bag(['jade-fury', 2, 0], ['jade-haste', 2, 1]))
		// `atk` is a flat amount added to the cutie's attack (+10).
		expect(combatant.stats.atk).toBe(10)
		expect(combatant.stats.cdr).toBe(12)
		expect(combatant.weapons.length).toBe(1)
	})

	it('counts an item’s flat attack in the swings it produces', () => {
		const bare = buildPlayerCombatant('fire-pup', 1, [])
		const armed = buildPlayerCombatant('fire-pup', 1, bag(['jade-fury', 2, 0]))
		const ownSwing = (combatant: typeof bare) => combatant.weapons.find((weapon) => weapon.templateId === 'skill')!
		// `jade-fury` at 2★ adds +10 attack: the panel shows `14 (14 + 10)` and the swing must hit for 24,
		// not 14 — a displayed attack bonus the engine ignored was the bug behind that row.
		expect(armed.stats.atk).toBe(10)
		expect(ownSwing(armed).damage).toBe(ownSwing(bare).damage + 10)
	})

	it('grants the parry only from an item carrying the kit, strongest one winning', () => {
		const bare = buildPlayerCombatant('fire-pup', 1, [])
		expect(bare.parry, 'no kit, no parry — the mechanic lives nowhere else').toBeUndefined()

		const jade = buildPlayerCombatant('fire-pup', 1, bag(['jade-sword', 4, 0]))
		expect(jade.parry).toEqual({ chance: 0.18, cost: 65, power: 1.35, name: 'Hồn Ngọc Kiếm Thế' })

		// Two parry items: the higher chance applies (not a stack).
		const both = buildPlayerCombatant('fire-pup', 1, bag(['jade-sword', 2, 0], ['jade-sword', 4, 1]))
		expect(both.parry?.chance).toBe(0.18)
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
		// Base cutie health is 620; only the armour neighbour unlocks the +25 aura.
		expect(withWeapon.stats.maxHp).toBe(620)
		// The aura adds its 25 max HP straight to the cutie's 620.
		expect(withArmour.stats.maxHp).toBe(645)
	})

	it('marks weapons with their own attack cadence', () => {
		const combatant = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 1, 0], ['great-axe', 4, 1]))
		expect(combatant.weapons).toHaveLength(3)
		// An item has no damage of its own: multiplier 1 × the cutie's attack (14).
		expect(combatant.weapons[2].damage).toBe(14)
	})

	it('scores a geared cutie above a bare one', () => {
		const bare = estimatePower(buildPlayerCombatant('fire-pup', 1, []))
		const geared = estimatePower(buildPlayerCombatant('fire-pup', 1, bag(['great-axe', 4, 0], ['warden-plate', 4, 1])))
		expect(geared).toBeGreaterThan(bare)
	})

	it('takes the cutie swings from its kits — no attack kit, no attack', () => {
		const armed = buildPlayerCombatant('fire-pup', 1, [])
		expect(armed.weapons).toHaveLength(1)
		expect(armed.weapons[0].uid).toBe('skill')

		installRetiredItems({
			cuties: { 'fire-pup': { kits: [] } } })
		const unarmed = buildPlayerCombatant('fire-pup', 1, [])
		expect(unarmed.weapons, 'a cutie without an attack kit never swings').toHaveLength(0)
		// Its base attack still exists — it is what a kit would scale and what counters scale from.
		expect(unarmed.referenceAtk).toBeGreaterThan(0)
		applyContentOverrides(null)
	})

	it('scales the cutie kit with its own numbers, like an item kit', () => {
		installRetiredItems({
			cuties: {
				'fire-pup': {
					attack: 20,
					// A kit owns its own rhythm now: a 1 s Cooldown Time means one swing a second.
					kits: [{ id: 'basic-attack', params: { cooldown: [1], multiplier: [3] } }],
				},
			},
		})
		const [swing] = buildPlayerCombatant('fire-pup', 1, []).weapons
		expect(swing?.damage).toBe(60)
		// 1 s of Cooldown Time → 1000 ms between swings.
		expect(swing?.interval).toBe(1000)
		applyContentOverrides(null)
	})
})

describe('battle engine', () => {
	it('marks critical hits and applies the Cutie critical damage bonus', () => {
		const attacker = dummy({
			baseMaxHp: 5000,
			baseMaxSe: 35,
			baseSeRegen: 0,
			baseWeaponDamage: 20,
			baseCritRate: 100,
			baseCritDamage: 80,
		})
		const defender = dummy({
			side: 'enemy',
			baseMaxHp: 5000,
			baseMaxSe: 0,
			baseSeRegen: 0,
		})

		const critical = simulateBattle(attacker, defender, 41).events.find(
			(event) => event.side === 'player' && (event.kind === 'attack' || event.kind === 'charged'),
		)

		expect(critical?.critical).toBe(true)
		expect(critical?.amount).toBe(36)
	})

	it('is deterministic for a given seed', () => {
		const player = buildPlayerCombatant('fire-pup', 1, bag(['wooden-blade', 2, 0], ['hide-vest', 1, 1], ['heal-dew', 1, 2]))
		const enemy = buildEnemyCombatant(getStage(1).enemy)
		const first = simulateBattle(player, enemy, 12345)
		const second = simulateBattle(player, enemy, 12345)
		expect(second.events.map((event) => event.text)).toEqual(first.events.map((event) => event.text))
		expect(first.events.some((event) => event.kind === 'attack' && event.sourceUid === 'wooden-blade-0')).toBe(true)
		expect(second.duration).toBe(first.duration)
		expect(second.winner).toBe(first.winner)
	})

	it('always terminates inside the time limit with a winner', () => {
		const player = buildPlayerCombatant('fire-pup', 1, bag(['great-axe', 4, 0], ['warden-plate', 4, 1], ['jade-fury', 4, 2]))
		const enemy = buildEnemyCombatant(getStage(60).enemy)
		const result = simulateBattle(player, enemy, 7)
		// The death zone opens at 180 s and the hard stop is 360 s.
		expect(result.duration).toBeLessThanOrEqual(360_000)
		expect(['player', 'enemy', 'draw']).toContain(result.winner)
		expect(result.events.at(-1)?.kind).toBe('end')
	})

	it('parries (Chấn Đao) only with the kit, paying its Sword Energy cost', () => {
		const attacker = dummy({ side: 'enemy', name: 'Attacker', baseWeaponInterval: 900 })
		const defender = dummy({ name: 'Defender', baseWeaponDamage: 1, baseSeRegen: 60, baseMaxHp: 5000 })
		// No kit, no parry: the mechanic does not exist anywhere else.
		expect(defender.parry).toBeUndefined()
		const idle = simulateBattle(defender, attacker, 3)
		expect(idle.events.some((event) => event.kind === 'counter')).toBe(false)
		
		defender.parry = { chance: 1, cost: 40, power: 1.5, name: 'Jade of Fury' }
		const result = simulateBattle(defender, attacker, 3)
		const counters = result.events.filter((event) => event.kind === 'counter')
		expect(counters.length).toBeGreaterThan(0)
		expect(counters.every((event) => /^Defender Chấn Đao! Phá đòn — phản kích −\d+$/.test(event.text))).toBe(true)
		// The parry's own cost is what leaves the bar (the counter itself feeds 4 back).
		expect(counters[0].amount).toBe(Math.round(defender.referenceAtk * 1.5))
	})

	it('applies on-hit control effects and damage over time', () => {
		const player = dummy({
			name: 'Player',
			baseMaxHp: 4000,
			baseWeaponDamage: 8,
			items: [
				{ templateId: 'poison-dagger', star: 1, slot: 0 },
				{ templateId: 'fire-spear', star: 1, slot: 1 },
			],
		})
		const enemy = dummy({ side: 'enemy', name: 'Enemy', baseMaxHp: 4000, baseWeaponDamage: 8 })
		const result = simulateBattle(player, enemy, 99)
		const texts = result.events.map((event) => event.text).join(' | ')
		expect(texts).toContain('Độc')
		expect(texts).toContain('Cháy')
		expect(result.events.some((event) => event.kind === 'dot')).toBe(true)
	})

	it('reads a scaled on-hit number as a percentage when the effect fires', () => {
		const player = dummy({
			name: 'Player',
			baseMaxHp: 10_000,
			baseWeaponDamage: 40,
		})
		const weapon = {
			uid: 'scaled',
			templateId: 'scaled',
			name: 'Scaled',
			icon: '🔥',
			star: 1 as const,
			slot: 0,
			cls: 'weapon',
			damage: 1,
			interval: 1000,
			linked: false,
		}
		// 10% of the owner's attack (40) = 4 per second; 10% of the owner's current HP.
		player.weapons.push({
			...weapon,
			onHit: [
				{
					chance: 1,
					effects: [
						{ kind: 'status', status: 'burn', duration: 2000, value: 10, scale: 'atk', stacks: 1, target: 'enemy' },
						{ kind: 'shield', amount: 10, scale: 'hpCurrent' },
					],
				},
			],
		})
		const enemy = dummy({
			side: 'enemy',
			name: 'Dummy',
			baseMaxHp: 5000,
			baseSeRegen: 0,
			baseWeaponDamage: 0,
		})
		const result = simulateBattle(player, enemy, 7)
		const burn = result.events
			.filter((event) => event.kind === 'status')
			.map((event) => event.text)
			.join(' | ')
		expect(burn).toContain('Cháy')
		// `referenceAtk` is the Cutie's own hit; the shield is 10% of the owner's **current** HP.
		expect(player.referenceAtk).toBe(40)
		const shields = result.events.filter((event) => event.kind === 'shield')
		expect(shields.length).toBeGreaterThan(0)
		// HP at the moment the hit lands, so never above 10% of the full bar.
		for (const event of shields) {
			expect(event.amount).toBeGreaterThan(0)
			expect(event.amount).toBeLessThanOrEqual(1000)
		}
		// A 2s burn at 4/s lands 8 damage in total, well under a fixed 10/s burn.
		const dot = result.events.filter((event) => event.kind === 'dot' && (event.amount ?? 0) > 0)
		expect(dot.length).toBeGreaterThan(0)
		expect(Math.max(...dot.map((event) => event.amount ?? 0))).toBeLessThan(100)
	})

	it('spends the shield before any HP — the shield is virtual armour', () => {
		const player = dummy({ baseMaxHp: 5000, baseWeaponDamage: 100, baseSeRegen: 0 })
		const enemy = dummy({
			side: 'enemy',
			name: 'Tank',
			baseMaxHp: 1000,
			baseSeRegen: 0,
			baseWeaponDamage: 0,
			baseMods: { shield: 250 },
		})
		expect(enemy.shield).toBe(250)

		const result = simulateBattle(player, enemy, 3)
		// A swing can also be the empowered one, so both kinds count as a hit.
		const hits = result.events.filter(
			(event) => (event.kind === 'attack' || event.kind === 'charged') && event.side === 'player',
		)
		expect(hits.length).toBeGreaterThan(2)

		// Every hit goes into the shield first: HP only moves once the shield is empty.
		let shield = 250
		let hp = 1000
		for (const event of hits) {
			const dealt = event.amount ?? 0
			const shieldLost = shield - event.enemy.shield
			const hpLost = hp - event.enemy.hp
			// The last hit can overrun the kill, so only what the pool could take is applied.
			expect(shieldLost + hpLost, `damage applied, not wasted`).toBe(Math.min(dealt, shield + hp))
			expect(shieldLost).toBeLessThanOrEqual(shield)
			if (hpLost > 0) expect(event.enemy.shield, 'HP only drops on an empty shield').toBe(0)
			shield = event.enemy.shield
			hp = event.enemy.hp
		}
		// The shield was big enough to be fully spent, and health dropped afterwards.
		expect(shield).toBe(0)
		expect(hp).toBeLessThan(1000)
		expect(result.winner).not.toBe('enemy')
	})

	it('turns the next basic attack into a heavy hit once the bar holds `seNeed`', () => {
		const player = dummy({
			name: 'Player',
			baseMaxHp: 5000,
			baseMaxSe: 100,
			baseSeRegen: 50,
			// The cutie's own attack would otherwise charge too (its own Sword Energy), drowning the events.
			baseWeaponInterval: 1_000_000,
			baseWeaponDamage: 0,
		})
		player.weapons.push({
			uid: 'charge-kit',
			templateId: 'charge-kit',
			name: 'Charge',
			icon: '⚡',
			star: 1,
			slot: 0,
			cls: 'weapon',
			damage: 20,
			interval: 1000,
			onHit: [],
			// `damage` is the charged hit itself (base attack × multiplier) — it replaces the swing.
			charge: { multiplier: 3, seNeed: 100, damage: 60 },
			linked: false,
		})
		const enemy = dummy({
			side: 'enemy',
			name: 'Dummy',
			baseMaxHp: 100_000,
			baseSeRegen: 0,
			baseWeaponDamage: 0,
		})
		const result = simulateBattle(player, enemy, 11)
		const charged = result.events.filter((event) => event.kind === 'charged')
		expect(charged.length).toBeGreaterThan(0)
		expect(charged[0].text).toContain('nạp đầy')
		// 20 base attack × 3 — ❌ not 20 + 60: the charged hit replaces the basic damage.
		expect(charged[0].amount).toBe(60)
		// A plain swing stays on the basic attack's own number (20, or 36 on a critical), so the two
		// kinds remain distinguishable — a stacked hit would have shown 80.
		const plain = result.events.filter((event) => event.kind === 'attack' && (event.amount ?? 0) > 0)
		expect(plain.every((event) => (event.amount ?? 0) <= 36)).toBe(true)
		// Spending `seNeed` leaves the bar short of full again.
		expect(charged[0].player.se).toBeLessThan(player.maxSe)
	})

	it('charges as soon as the bar holds the sub-kit’s own `seNeed`', () => {
		const player = dummy({
			name: 'Player',
			baseMaxHp: 5000,
			baseMaxSe: 100,
			baseSeRegen: 50,
			baseWeaponInterval: 1_000_000,
			baseWeaponDamage: 0,
		})
		player.weapons.push({
			uid: 'cheap-charge',
			templateId: 'cheap-charge',
			name: 'Cheap',
			icon: '⚡',
			star: 1,
			slot: 0,
			cls: 'weapon',
			damage: 10,
			interval: 1000,
			onHit: [],
			// A third of the bar is enough, so the first basic attack is already charged.
			charge: { multiplier: 2, seNeed: 30, damage: 20 },
			linked: false,
		})
		const enemy = dummy({
			side: 'enemy',
			name: 'Dummy',
			baseMaxHp: 100_000,
			baseSeRegen: 0,
			baseWeaponDamage: 0,
		})
		const charged = simulateBattle(player, enemy, 11).events.filter((event) => event.kind === 'charged')
		expect(charged.length).toBeGreaterThan(0)
		expect(charged[0].amount).toBe(20)
		// 30 points were spent, so the bar stays under the full 100.
		expect(charged[0].player.se).toBeLessThanOrEqual(player.maxSe - 30 + 4)
	})

	it('lets a well-geared cutie beat the opening stages', () => {
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
