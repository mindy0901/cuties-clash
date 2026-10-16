import { createRng } from './rng'
import type { Rng } from './rng'
import { STATUS_TEXT } from './labels'
import type { CombatItem, Combatant } from './build'
import type { ActiveEffect, ActiveStatus, BattleEvent, BattleResult, SideState, StatusKey } from './types'

/** Simulation resolution: 20 steps per simulated second. */
const TICK = 50
const MAX_TIME = 90_000
/** Chấn Đao (counter parry) drains 65 Sword Energy. */
export const COUNTER_COST = 65
/** Charged attacks consume 24–40 Sword Energy and land for 2.2× weapon damage. */
const CHARGED_MULTIPLIER = 2.2
const CRIT_MULTIPLIER = 1.8
const MAX_STACKS = 8
/** Taking a hit feeds 4 Sword Energy back to the defender. */
const HIT_ENERGY = 4

interface Runtime {
	c: Combatant
	hp: number
	maxHp: number
	se: number
	shield: number
	statuses: ActiveStatus[]
	immunities: { key: StatusKey; remaining: number }[]
	weaponTimers: number[]
	activeTimers: number[]
	damageDealt: number
	damageTaken: number
}

interface Sim {
	t: number
	rng: Rng
	events: BattleEvent[]
	player: Runtime
	enemy: Runtime
}

function createRuntime(c: Combatant): Runtime {
	return {
		c,
		hp: c.hp,
		maxHp: c.maxHp,
		se: c.se,
		shield: c.shield,
		statuses: c.statuses.map((status) => ({ ...status })),
		immunities: [],
		weaponTimers: c.weapons.map((weapon) => Math.round(weapon.interval * 0.65)),
		activeTimers: c.actives.map((entry) => entry.timer),
		damageDealt: 0,
		damageTaken: 0,
	}
}

function sideState(runtime: Runtime): SideState {
	return {
		hp: Math.max(0, Math.round(runtime.hp)),
		maxHp: Math.round(runtime.maxHp),
		se: Math.round(runtime.se),
		maxSe: runtime.c.maxSe,
		shield: Math.round(runtime.shield),
		statuses: runtime.statuses.map((entry) => ({ ...entry, remaining: Math.max(0, entry.remaining) })),
		cooldowns: [
			...runtime.c.weapons.map((weapon, index) => ({
				uid: weapon.uid,
				remaining: Math.max(0, Math.round(runtime.weaponTimers[index])),
				total: weapon.interval,
			})),
			...runtime.c.actives.map((entry, index) => ({
				uid: entry.item.uid,
				remaining: Math.max(0, Math.round(runtime.activeTimers[index])),
				total: entry.interval,
			})),
		],
	}
}

function push(
	sim: Sim,
	kind: BattleEvent['kind'],
	side: 'player' | 'enemy',
	text: string,
	amount?: number,
	icon?: string,
) {
	if (sim.events.length >= 6000) return
	sim.events.push({
		t: sim.t,
		kind,
		side,
		text,
		amount,
		icon,
		player: sideState(sim.player),
		enemy: sideState(sim.enemy),
	})
}

function opponentOf(sim: Sim, runtime: Runtime): Runtime {
	return runtime === sim.player ? sim.enemy : sim.player
}

function statusValue(runtime: Runtime, key: StatusKey): number {
	const status = runtime.statuses.find((entry) => entry.key === key)
	return status ? status.value : 0
}

function isFrozen(runtime: Runtime): boolean {
	return runtime.statuses.some((entry) => entry.key === 'freeze')
}

function speedFactor(runtime: Runtime): number {
	const haste = runtime.c.haste + statusValue(runtime, 'haste') - statusValue(runtime, 'slow')
	return Math.max(0.25, 1 + haste / 100)
}

function applyStatus(target: Runtime, key: StatusKey, duration: number, value: number, stacks: number): boolean {
	if (target.immunities.some((entry) => entry.key === key)) return false
	const existing = target.statuses.find((entry) => entry.key === key)
	if (existing) {
		existing.remaining = Math.max(existing.remaining, duration)
		existing.stacks = Math.min(MAX_STACKS, existing.stacks + stacks)
		existing.value = Math.max(existing.value, value)
	} else {
		target.statuses.push({ key, value, remaining: duration, stacks: Math.min(MAX_STACKS, stacks) })
	}
	if (key === 'brittle') {
		target.maxHp = Math.max(1, Math.round(target.c.maxHp * (1 - statusValue(target, 'brittle') / 100)))
		target.hp = Math.min(target.hp, target.maxHp)
	}
	return true
}

function expireStatuses(target: Runtime) {
	const brittleExpired = target.statuses.some((entry) => entry.key === 'brittle' && entry.remaining <= 0)
	target.statuses = target.statuses.filter((entry) => entry.remaining > 0)
	if (brittleExpired) {
		target.maxHp = target.c.maxHp
		target.hp = Math.min(target.hp, target.maxHp)
	}
	target.immunities = target.immunities.filter((entry) => entry.remaining > 0)
}

function heal(target: Runtime, amount: number): number {
	const before = target.hp
	target.hp = Math.min(target.maxHp, target.hp + Math.max(0, Math.round(amount)))
	return Math.round(target.hp - before)
}

interface DamageOptions {
	kind: 'attack' | 'charged' | 'counter' | 'active' | 'dot'
	label: string
	icon?: string
	source?: Runtime
}

function dealDamage(sim: Sim, target: Runtime, rawAmount: number, opts: DamageOptions): number {
	const brittle = statusValue(target, 'brittle')
	let amount = rawAmount * (1 + brittle / 100) * (1 - target.c.damageReduction)
	amount = Math.max(1, Math.round(amount))

	let remaining = amount
	if (target.shield > 0) {
		const absorbed = Math.min(target.shield, remaining)
		target.shield -= absorbed
		remaining -= absorbed
	}
	target.hp = Math.max(0, target.hp - remaining)
	target.damageTaken += amount
	if (opts.source) opts.source.damageDealt += amount
	if (opts.kind !== 'dot') target.se = Math.min(target.c.maxSe, target.se + HIT_ENERGY)

	if (opts.kind !== 'dot') {
		push(sim, opts.kind, opts.source ? opts.source.c.side : target.c.side, `${opts.label} −${amount}`, amount, opts.icon)
	}
	return amount
}

function chargedCost(weapon: CombatItem): number {
	return Math.min(40, Math.max(24, Math.round(24 + weapon.interval / 120)))
}

function swing(sim: Sim, attacker: Runtime, defender: Runtime, weapon: CombatItem, charged: boolean) {
	const multiplier = charged ? CHARGED_MULTIPLIER : 1
	let damage = weapon.damage * multiplier

	// ── Chấn Đao: parry for 65 Sword Energy, then counter-attack ────────────
	if (defender.se >= COUNTER_COST && sim.rng.chance(defender.c.counterChance)) {
		defender.se -= COUNTER_COST
		const counterDamage = Math.round(defender.c.referenceAtk * defender.c.counterPower)
		for (let index = 0; index < attacker.weaponTimers.length; index += 1) attacker.weaponTimers[index] += 350
		push(
			sim,
			'counter',
			defender.c.side,
			`${defender.c.name} Chấn Đao! Phá đòn và phản kích ${counterDamage}`,
			counterDamage,
			'🛡️',
		)
		dealDamage(sim, attacker, counterDamage, { kind: 'counter', label: 'Phản kích', icon: '🛡️', source: defender })
		return
	}

	const crit = sim.rng.chance(attacker.c.critRate)
	if (crit) damage *= CRIT_MULTIPLIER

	const label = crit
		? `${weapon.name} chí mạng`
		: charged
			? `${weapon.name} trọng kích`
			: `${weapon.name}`
	const dealt = dealDamage(sim, defender, damage, {
		kind: charged ? 'charged' : 'attack',
		label,
		icon: weapon.icon,
		source: attacker,
	})

	if (attacker.c.lifesteal > 0 && dealt > 0) {
		const healed = heal(attacker, dealt * attacker.c.lifesteal)
		if (healed > 0) push(sim, 'heal', attacker.c.side, `${attacker.c.name} hút máu +${healed}`, healed, '🩸')
	}

	if (weapon.onHit && sim.rng.chance(weapon.onHit.chance)) {
		for (const effect of weapon.onHit.effects) fireEffect(sim, attacker, effect, weapon)
	}
}

function fireEffect(sim: Sim, owner: Runtime, effect: ActiveEffect, item: { name: string; icon: string; linked: boolean }) {
	const opponent = opponentOf(sim, owner)
	switch (effect.kind) {
		case 'damage': {
			const damage = effect.amount + (effect.atkScale ? owner.c.referenceAtk * effect.atkScale : 0)
			dealDamage(sim, opponent, damage, { kind: 'active', label: item.name, icon: item.icon, source: owner })
			break
		}
		case 'heal': {
			const healed = heal(owner, effect.amount)
			push(sim, 'heal', owner.c.side, `${item.name} hồi +${healed} máu`, healed, item.icon)
			break
		}
		case 'shield': {
			owner.shield += effect.amount
			push(sim, 'shield', owner.c.side, `${item.name} tạo khiên +${effect.amount}`, effect.amount, '🔷')
			break
		}
		case 'swordEnergy': {
			const before = owner.se
			owner.se = Math.min(owner.c.maxSe, owner.se + effect.amount)
			const gained = Math.round(owner.se - before)
			push(sim, 'status', owner.c.side, `${item.name} nạp +${gained} Kiếm Thế`, gained, '⚔️')
			break
		}
		case 'status': {
			const target = effect.target === 'enemy' ? opponent : owner
			const applied = applyStatus(target, effect.status, effect.duration, effect.value, effect.stacks)
			const text = applied
				? `${item.name} → ${target.c.name} dính ${STATUS_TEXT[effect.status]}`
				: `${item.name} bị kháng ${STATUS_TEXT[effect.status]}`
			push(sim, 'status', target.c.side, text, undefined, applied ? item.icon : '🚫')
			break
		}
		case 'cleanse': {
			const removed = owner.statuses.filter((entry) => effect.statuses.includes(entry.key)).length
			owner.statuses = owner.statuses.filter((entry) => !effect.statuses.includes(entry.key))
			if (item.linked) {
				// A linked Divine Forger also shields the pet from those debuffs for 2s.
				for (const key of effect.statuses) owner.immunities.push({ key, remaining: 2000 })
			}
			if (removed > 0 || item.linked) {
				push(sim, 'status', owner.c.side, `${item.name} giải ${removed} hiệu ứng bất lợi`, removed, '✨')
			}
			break
		}
		default:
			break
	}
}

/** Full deterministic simulation of one fight. */
export function simulateBattle(playerInput: Combatant, enemyInput: Combatant, seed: number): BattleResult {
	const sim: Sim = {
		t: 0,
		rng: createRng(seed),
		events: [],
		player: createRuntime(playerInput),
		enemy: createRuntime(enemyInput),
	}

	push(sim, 'start', 'player', 'Trận đấu bắt đầu!', undefined, '⚔️')
	push(sim, 'start', 'player', `${sim.player.c.name} — Giáp khởi đầu ${sim.player.shield}`, undefined, sim.player.c.icon)
	push(sim, 'start', 'enemy', `${sim.enemy.c.name} — Giáp khởi đầu ${sim.enemy.shield}`, undefined, sim.enemy.c.icon)

	const sides: Runtime[] = [sim.player, sim.enemy]
	const dotAccum = new Map<Runtime, number>()
	let winner: BattleResult['winner'] | null = null

	while (sim.t < MAX_TIME && !winner) {
		sim.t += TICK
		const dt = TICK / 1000
		dotAccum.clear()

		for (const runtime of sides) {
			const opponent = opponentOf(sim, runtime)

			runtime.se = Math.min(runtime.c.maxSe, runtime.se + runtime.c.seRegen * dt)
			for (const status of runtime.statuses) status.remaining -= TICK
			for (const immunity of runtime.immunities) immunity.remaining -= TICK

			for (const status of runtime.statuses) {
				if (status.remaining <= 0) continue
				if (status.key === 'poison' || status.key === 'burn') {
					const amount = status.value * status.stacks * dt
					dotAccum.set(runtime, (dotAccum.get(runtime) ?? 0) + amount)
				} else if (status.key === 'regen') {
					heal(runtime, status.value * status.stacks * dt)
				}
			}
			expireStatuses(runtime)

			const dotTotal = dotAccum.get(runtime) ?? 0
			if (dotTotal > 0) {
				const active = runtime.statuses.filter((entry) => entry.key === 'poison' || entry.key === 'burn')
				const label = active.map((entry) => STATUS_TEXT[entry.key]).join(' + ') || 'Hiệu ứng'
				dealDamage(sim, runtime, dotTotal, { kind: 'dot', label: `Dính ${label}`, icon: '☠️' })
			}

			if (runtime.hp <= 0) {
				winner = opponent.c.side
				break
			}

			runtime.c.actives.forEach((entry, index) => {
				if (isFrozen(runtime)) return
				runtime.activeTimers[index] -= TICK * speedFactor(runtime)
				if (runtime.activeTimers[index] > 0) return
				runtime.activeTimers[index] += entry.interval
				for (const effect of entry.item.effects) fireEffect(sim, runtime, effect, entry.item)
			})

			runtime.c.weapons.forEach((weapon, index) => {
				if (isFrozen(runtime) || runtime.hp <= 0 || opponent.hp <= 0) return
				runtime.weaponTimers[index] -= TICK * speedFactor(runtime)
				if (runtime.weaponTimers[index] > 0) return
				const cost = chargedCost(weapon)
				const charged = runtime.se >= cost && sim.rng.chance(0.45)
				if (charged) runtime.se -= cost
				runtime.weaponTimers[index] = weapon.interval
				swing(sim, runtime, opponent, weapon, charged)
			})

			if (runtime.hp <= 0) {
				winner = opponent.c.side
				break
			}
			if (opponent.hp <= 0) {
				winner = runtime.c.side
				break
			}
		}
	}

	if (!winner) {
		const playerRatio = sim.player.hp / sim.player.maxHp
		const enemyRatio = sim.enemy.hp / sim.enemy.maxHp
		winner = Math.abs(playerRatio - enemyRatio) < 0.02 ? 'draw' : playerRatio > enemyRatio ? 'player' : 'enemy'
	}

	push(
		sim,
		'end',
		winner === 'enemy' ? 'enemy' : 'player',
		winner === 'player'
			? `${sim.player.c.name} chiến thắng!`
			: winner === 'enemy'
				? `${sim.enemy.c.name} chiến thắng!`
				: 'Hoà — cả hai cùng kiệt sức',
		undefined,
		winner === 'draw' ? '🤝' : '🏆',
	)

	return {
		winner,
		events: sim.events,
		playerPower: Math.round(sim.player.c.maxHp + sim.player.c.shield),
		enemyPower: Math.round(sim.enemy.c.maxHp + sim.enemy.c.shield),
		duration: sim.t,
	}
}
