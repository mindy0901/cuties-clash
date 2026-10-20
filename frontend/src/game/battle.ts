import { createRng } from './rng'
import type { Rng } from './rng'
import { STATUS_TEXT } from './labels'
import type { CombatItem, Combatant, CooldownBuff, DamageBoost } from './build'
import type { CombatEffect, ActiveStatus, BattleEvent, BattleResult, ScaleMode, SideState, StatusKey } from './types'

/** Simulation resolution: 20 steps per simulated second. */
const TICK = 50
/**
 * A fight can no longer end in a comparison at 90 s: the death zone (below) has to be reached and
 * has to kill. 6 minutes is enough for the zone's own ramp to end any stalemate.
 *
 * It is the **default** limit only: `BattleOptions.maxTime` overrides it, which is how the training
 * room replays a much longer horizon (it turns the death zone off, so nothing else would stop it).
 */
const MAX_TIME = 360_000
/** The death zone opens after 3 minutes: both sides then take a share of their max HP every second. */
const DEATH_ZONE_START = 180_000
/** Base drain of the death zone, as a percentage of max HP per second. */
const DEATH_ZONE_PCT_PER_SECOND = 1
/** The drain grows by this much for every **extra** minute past the start. */
const DEATH_ZONE_GROWTH = 0.1
const MAX_STACKS = 8
/** Safety cap on the replay log (a 6-minute fight can otherwise grow without bound). */
const MAX_EVENTS = 12_000
/** Taking a hit feeds 4 Sword Energy back to the defender. */
const HIT_ENERGY = 4
/** A burning target only takes half of any healing or armour it is given. */
const BURN_WOUND_FACTOR = 0.5

interface WeaponTimed {
	remaining: number
	value: number
}

interface Runtime {
	c: Combatant
	hp: number
	maxHp: number
	/** `c.immortal` cached for the damage path. */
	immortal: boolean
	se: number
	shield: number
	statuses: ActiveStatus[]
	immunities: { key: StatusKey; remaining: number }[]
	weaponTimers: number[]
	/** Per-weapon freeze: the timer is paused, never reset, until this reaches 0. */
	weaponFrozen: number[]
	/** Per-weapon charge penalty (a random weapon slowed by a gem). */
	weaponSlow: WeaponTimed[]
	/** Per-weapon charge bonus (a support gem next to the weapon). */
	weaponCdr: WeaponTimed[]
	/** Per-weapon damage bonus (a triggered `damage-boost` kit), as a percentage. */
	weaponDamage: WeaponTimed[]
	/** Stacks gained by "rage" kits, counted against each kit's own cap. */
	hitStacks: number
	healStacks: number
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
		immortal: c.immortal === true,
		se: c.se,
		shield: c.shield,
		statuses: c.statuses.map((status) => ({ ...status })),
		immunities: [],
		weaponTimers: c.weapons.map((weapon) => Math.round(weapon.interval * 0.65)),
		weaponFrozen: c.weapons.map(() => 0),
		weaponSlow: c.weapons.map(() => ({ remaining: 0, value: 0 })),
		weaponCdr: c.weapons.map(() => ({ remaining: 0, value: 0 })),
		weaponDamage: c.weapons.map(() => ({ remaining: 0, value: 0 })),
		hitStacks: 0,
		healStacks: 0,
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
		cooldowns: runtime.c.weapons.map((weapon, index) => ({
			uid: weapon.uid,
			remaining: Math.max(0, Math.round(runtime.weaponTimers[index])),
			total: weapon.interval,
			...(runtime.weaponFrozen[index] > 0
				? { frozen: Math.max(0, Math.round(runtime.weaponFrozen[index])) }
				: {}),
			...(runtime.weaponSlow[index].remaining > 0
				? { slow: Math.round(runtime.weaponSlow[index].value) }
				: {}),
			...(runtime.weaponCdr[index].remaining > 0
				? { cdr: Math.round(runtime.weaponCdr[index].value) }
				: {}),
		})),
	}
}

function push(
	sim: Sim,
	kind: BattleEvent['kind'],
	side: 'player' | 'enemy',
	text: string,
	amount?: number,
	icon?: string,
	sourceUid?: string,
	critical = false,
) {
	// `end` is always recorded: playback uses the last event as the clock, so dropping it would make
	// a long fight stop before the result.
	if (sim.events.length >= MAX_EVENTS && kind !== 'end') return
	sim.events.push({
		t: sim.t,
		kind,
		side,
		text,
		amount,
		icon,
		sourceUid,
		...(critical ? { critical: true } : {}),
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

/**
 * Cooldown multiplier: 1 is the plain Cooldown Time. cdr (a stat or a temporary buff) lowers it,
 * the slow status raises it, and it never drops under a quarter of the base.
 */
function cooldownFactor(runtime: Runtime): number {
	const delta = statusValue(runtime, 'slow') - (runtime.c.cdr + statusValue(runtime, 'cdr'))
	return Math.max(0.25, 1 + delta / 100)
}

/** Bad statuses that trigger the "debuff heal" kit. */
const BAD_STATUSES: readonly StatusKey[] = ['slow', 'freeze', 'poison', 'burn', 'brittle']

/**
 * A kit's number read at the moment the effect fires: plain points, or a percentage of the owner's
 * attack / max / current HP, or of the target's max / current HP. Rounding keeps the simulation
 * integers.
 */
function scaledValue(value: number, scale: ScaleMode | undefined, owner: Runtime, target: Runtime): number {
	switch (scale) {
		case 'atk':
			return Math.round((owner.c.referenceAtk * value) / 100)
		case 'hp':
			return Math.round((owner.maxHp * value) / 100)
		case 'hpCurrent':
			return Math.round((owner.hp * value) / 100)
		case 'enemyHp':
			return Math.round((target.maxHp * value) / 100)
		case 'enemyHpCurrent':
			return Math.round((target.hp * value) / 100)
		default:
			return value
	}
}

/** Damage gained from every "rage" kit the owner carries, capped per kit. */
function damageBonusPct(runtime: Runtime): number {
	let bonus = 0
	for (const reaction of runtime.c.reactions.damage) {
		if (reaction.rage) {
			bonus += Math.min(runtime.hitStacks, reaction.rage.maxStacks) * reaction.rage.perStack
		}
	}
	for (const reaction of runtime.c.reactions.heal) {
		if (reaction.rage) {
			bonus += Math.min(runtime.healStacks, reaction.rage.maxStacks) * reaction.rage.perStack
		}
	}
	return bonus
}

/** A burning target heals (and gains armour) at half rate — the burn's "deep wound". */
function woundFactor(runtime: Runtime): number {
	return runtime.statuses.some((entry) => entry.key === 'burn' && entry.remaining > 0)
		? BURN_WOUND_FACTOR
		: 1
}

function healingFactor(runtime: Runtime): number {
	return Math.max(0, (1 + runtime.c.healingBoost) * woundFactor(runtime))
}

function heal(target: Runtime, amount: number): number {
	const before = target.hp
	const restored = Math.max(0, Math.round(amount * healingFactor(target)))
	target.hp = Math.min(target.maxHp, target.hp + restored)
	return Math.round(target.hp - before)
}

/** Adds armour after the same healing modifiers a heal would take. */
function grantShield(sim: Sim, target: Runtime, amount: number, text: string, icon: string): number {
	const gained = Math.max(0, Math.round(amount * healingFactor(target)))
	target.shield += gained
	if (gained > 0) push(sim, 'shield', target.c.side, text.replace('{amount}', String(gained)), gained, icon)
	return gained
}

/**
 * Which swings one support gem buffs.
 *
 * `directions` was resolved at build time (the sides the admin ticked); `random` costs one RNG draw,
 * so a gem never changes the stream while it is set to `directions`.
 */
function buffTargets(sim: Sim, owner: Runtime, buff: CooldownBuff): string[] {
	if (buff.mode === 'directions') return buff.weaponUids
	const swings = owner.c.weapons.filter((weapon) => weapon.uid !== 'skill')
	if (swings.length === 0) return []
	return [sim.rng.pick(swings).uid]
}

/**
 * Speed up the weapons a support gem points at, by **reducing their cooldown**.
 *
 * ⚠️ A boost **never stacks**: two gems buffing the same weapon give the **higher** of the two (both
 * durations are equal, so the later, weaker gem must not turn a 100 % boost into 40 %).
 */
function boostWeapons(sim: Sim, owner: Runtime, buff: CooldownBuff): void {
	let boosted = 0
	let effective = 0
	for (const uid of buffTargets(sim, owner, buff)) {
		const index = owner.c.weapons.findIndex((weapon) => weapon.uid === uid)
		if (index < 0) continue
		const slot = owner.weaponCdr[index]
		slot.remaining = Math.max(slot.remaining, buff.duration)
		slot.value = Math.max(slot.value, buff.value)
		effective = Math.max(effective, slot.value)
		boosted += 1
	}
	if (boosted > 0) {
		// The log reports the boost the weapons actually hold, not this gem's own number, so it cannot
		// claim −40 % on a weapon that is still running −100 %.
		push(
			sim,
			'status',
			owner.c.side,
			`${boosted} vũ khí giảm hồi chiêu ${Math.round(effective)}%`,
			Math.round(effective),
			'⚡',
		)
	}
}

/**
 * Freezes **one** enemy weapon at random, preferring one that is not frozen yet. A frozen weapon
 * keeps its charge exactly where it was and resumes from there.
 */
function freezeRandomWeapon(sim: Sim, owner: Runtime, target: Runtime, duration: number): boolean {
	if (duration <= 0 || target.c.weapons.length === 0) return false
	const itemIndices = target.c.weapons
		.map((weapon, index) => ({ weapon, index }))
		.filter((entry) => entry.weapon.uid !== 'skill')
		.map((entry) => entry.index)
	const candidates = itemIndices.length > 0 ? itemIndices : target.c.weapons.map((_weapon, index) => index)
	// "If it is already frozen, freeze the one that is not": never refresh a frozen weapon while an
	// unfrozen one is available, and do nothing when everything is already frozen.
	const open = candidates.filter((index) => target.weaponFrozen[index] <= 0)
	if (open.length === 0) return false
	const index = sim.rng.pick(open)
	target.weaponFrozen[index] = Math.max(target.weaponFrozen[index], duration)
	push(
		sim,
		'status',
		target.c.side,
		`${target.c.weapons[index].name} bị đóng băng ${Number((duration / 1000).toFixed(1))}s`,
		duration,
		'🧊',
		target.c.weapons[index].uid,
	)
	triggerFrozen(sim, target)
	for (const buff of owner.c.reactions.freeze) boostWeapons(sim, owner, buff)
	return true
}

/** Slows **one** enemy weapon at random: its charge runs `value`% slower for `duration`. */
function slowRandomWeapon(sim: Sim, target: Runtime, value: number, duration: number): boolean {
	if (value <= 0 || duration <= 0 || target.c.weapons.length === 0) return false
	const itemIndices = target.c.weapons
		.map((weapon, index) => ({ weapon, index }))
		.filter((entry) => entry.weapon.uid !== 'skill')
		.map((entry) => entry.index)
	const candidates = itemIndices.length > 0 ? itemIndices : target.c.weapons.map((_weapon, index) => index)
	const index = sim.rng.pick(candidates)
	const slot = target.weaponSlow[index]
	slot.remaining = Math.max(slot.remaining, duration)
	slot.value = Math.max(slot.value, value)
	push(
		sim,
		'status',
		target.c.side,
		`${target.c.weapons[index].name} bị làm chậm −${Math.round(value)}%`,
		Math.round(value),
		'🐌',
		target.c.weapons[index].uid,
	)
	return true
}

function triggerDebuff(sim: Sim, target: Runtime): void {
	if (target.c.reactions.debuff.length === 0) return
	const opponent = opponentOf(sim, target)
	for (const reaction of target.c.reactions.debuff) {
		const amount = scaledValue(reaction.amount, reaction.scale, target, opponent)
		const restored = heal(target, amount)
		if (restored > 0) {
			push(sim, 'heal', target.c.side, `${target.c.name} hồi +${restored} khi dính hiệu ứng xấu`, restored, '💚')
		}
	}
}

function triggerFrozen(sim: Sim, target: Runtime): void {
	if (target.c.reactions.frozen.length > 0) {
		const opponent = opponentOf(sim, target)
		for (const reaction of target.c.reactions.frozen) {
			const amount = scaledValue(reaction.amount, reaction.scale, target, opponent)
			const restored = heal(target, amount)
			if (restored > 0) {
				push(sim, 'heal', target.c.side, `${target.c.name} hồi +${restored} khi bị đóng băng`, restored, '🧊')
			}
			if (reaction.boost) boostDamage(sim, target, reaction.boost)
		}
	}
	triggerDebuff(sim, target)
}

/** A weapon of the owner landed a damaging hit: rage stacks, slow gem, Sword Energy drain. */
function triggerDamageDealt(sim: Sim, attacker: Runtime, defender: Runtime): void {
	if (attacker.c.reactions.damage.length === 0) return
	for (const reaction of attacker.c.reactions.damage) {
		if (reaction.rage) attacker.hitStacks += 1
		if (reaction.slow && sim.rng.chance(reaction.chance)) {
			slowRandomWeapon(sim, defender, reaction.slow.value, reaction.slow.duration)
		}
		if (reaction.seDrain && reaction.seDrain.amount > 0 && sim.rng.chance(reaction.chance)) {
			const before = defender.se
			defender.se = Math.max(0, defender.se - reaction.seDrain.amount)
			const lost = Math.round(before - defender.se)
			if (lost > 0) {
				push(sim, 'status', defender.c.side, `Kiếm Thế bị hút −${lost}`, lost, '⚔️')
			}
		}
		if (reaction.boost) boostDamage(sim, attacker, reaction.boost)
	}
}

/** The owner was actually healed: rage stacks, armour, the "hồi tốc" gem and a damage boost. */
function triggerHeal(sim: Sim, target: Runtime, restored: number): void {
	if (restored <= 0 || target.c.reactions.heal.length === 0) return
	for (const reaction of target.c.reactions.heal) {
		if (reaction.rage) target.healStacks += 1
		if (reaction.armor && reaction.armor > 0) {
			grantShield(sim, target, reaction.armor, `Hồi máu → +{amount} giáp`, '🔷')
		}
		if (reaction.cooldown) boostWeapons(sim, target, reaction.cooldown)
		if (reaction.boost) boostDamage(sim, target, reaction.boost)
	}
}

/**
 * Give the swings a `damage-boost` points at a timed damage bonus.
 *
 * ⚠️ Like a speed boost it **never stacks**: the higher percentage wins (and the longer remaining
 * time), so two gems on one weapon cannot turn +20 % into +40 %.
 */
function boostDamage(sim: Sim, owner: Runtime, boost: DamageBoost): void {
	let boosted = 0
	let effective = 0
	for (const uid of boost.uids) {
		const index = owner.c.weapons.findIndex((weapon) => weapon.uid === uid)
		if (index < 0) continue
		const slot = owner.weaponDamage[index]
		slot.remaining = Math.max(slot.remaining, boost.duration)
		slot.value = Math.max(slot.value, boost.value)
		effective = Math.max(effective, slot.value)
		boosted += 1
	}
	if (boosted > 0) {
		push(
			sim,
			'status',
			owner.c.side,
			`${boosted} vũ khí được tăng sát thương +${Math.round(effective)}%`,
			Math.round(effective),
			'💥',
		)
	}
}

/** The owner was hit by an attack: the "phản đòn" gem may freeze an enemy weapon. */
function triggerAttacked(sim: Sim, defender: Runtime, attacker: Runtime): void {
	for (const reaction of defender.c.reactions.attacked) {
		if (sim.rng.chance(reaction.chance)) freezeRandomWeapon(sim, defender, attacker, reaction.freeze)
	}
}

function applyStatus(
	sim: Sim,
	target: Runtime,
	key: StatusKey,
	duration: number,
	value: number,
	stacks: number,
	scale?: ScaleMode,
): boolean {
	if (target.immunities.some((entry) => entry.key === key)) return false
	const existing = target.statuses.find((entry) => entry.key === key)
	if (existing) {
		existing.remaining = Math.max(existing.remaining, duration)
		existing.stacks = Math.min(MAX_STACKS, existing.stacks + stacks)
		existing.value = Math.max(existing.value, value)
		if (scale) existing.scale = scale
	} else {
		target.statuses.push({
			key,
			value,
			remaining: duration,
			stacks: Math.min(MAX_STACKS, stacks),
			...(scale ? { scale } : {}),
		})
	}
	if (key === 'brittle') {
		target.maxHp = Math.max(1, Math.round(target.c.maxHp * (1 - statusValue(target, 'brittle') / 100)))
		target.hp = Math.min(target.hp, target.maxHp)
	}
	if (key === 'freeze') triggerFrozen(sim, target)
	else if (BAD_STATUSES.includes(key)) triggerDebuff(sim, target)
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

interface DamageOptions {
	kind: 'attack' | 'charged' | 'counter' | 'dot'
	label: string
	critical?: boolean
	icon?: string
	source?: Runtime
	sourceUid?: string
}

function dealDamage(sim: Sim, target: Runtime, rawAmount: number, opts: DamageOptions): number {
	const brittle = statusValue(target, 'brittle')
	let amount = rawAmount * (1 + brittle / 100) * (1 - target.c.damageReduction)
	amount = Math.max(1, Math.round(amount))

	// "Đỡ đòn (tỉ lệ)": a direct hit can be halved. Dots are never blocked, and a kit at 0 % draws
	// no RNG at all, so an untouched battle keeps its deterministic stream.
	let blocked = false
	if (opts.kind !== 'dot' && target.c.blockChance > 0 && sim.rng.chance(target.c.blockChance)) {
		amount = Math.max(1, Math.round(amount * 0.5))
		blocked = true
	}

	let remaining = amount
	if (target.shield > 0) {
		const absorbed = Math.min(target.shield, remaining)
		target.shield -= absorbed
		remaining -= absorbed
	}
	// An immortal fighter (the training dummy) takes the hit and keeps its bar: the number is still
	// reported, which is the whole point of a practice fight, but nothing can kill it.
	target.hp = target.immortal ? target.maxHp : Math.max(0, target.hp - remaining)
	target.damageTaken += amount
	if (opts.source) opts.source.damageDealt += amount
	if (opts.kind !== 'dot') target.se = Math.min(target.c.maxSe, target.se + HIT_ENERGY)

	if (opts.kind !== 'dot') {
		push(
			sim,
			opts.kind,
			opts.source ? opts.source.c.side : target.c.side,
			`${opts.label}${blocked ? ' (đỡ 50%)' : ''} −${amount}`,
			amount,
			opts.icon,
			opts.sourceUid,
			opts.critical,
		)
		if (opts.source) triggerAttacked(sim, target, opts.source)
	}
	return amount
}

function swing(sim: Sim, attacker: Runtime, defender: Runtime, weapon: CombatItem, charged: boolean) {
	// A charged swing **replaces** the basic attack's damage with its own heavier number — it is not
	// the basic hit plus a bonus (❌ no stacking).
	let damage = charged ? (weapon.charge?.damage ?? weapon.damage) : weapon.damage
	const swingIndex = attacker.c.weapons.indexOf(weapon)
	const damageSlot = swingIndex >= 0 ? attacker.weaponDamage[swingIndex] : undefined
	if (damageSlot && damageSlot.remaining > 0) damage *= 1 + damageSlot.value / 100
	damage *= 1 + damageBonusPct(attacker) / 100

	// ── Đỡ đòn Trọng kích: enough Sword Energy negates a charged attack outright ─────
	if (charged && defender.c.blockCharged && defender.se >= defender.c.blockCharged.seCost) {
		defender.se -= defender.c.blockCharged.seCost
		push(
			sim,
			'block',
			defender.c.side,
			`${defender.c.name} đỡ đòn Trọng kích!`,
			undefined,
			'🛡️',
			weapon.uid,
		)
		triggerAttacked(sim, defender, attacker)
		return
	}

	// ── Chấn Đao: parry for the item's Sword Energy cost, then counter-attack ────────
	const parry = defender.c.parry
	if (parry && defender.se >= parry.cost && sim.rng.chance(parry.chance)) {
		defender.se -= parry.cost
		const counterDamage = Math.round(defender.c.referenceAtk * parry.power)
		for (let index = 0; index < attacker.weaponTimers.length; index += 1) attacker.weaponTimers[index] += 350
		dealDamage(sim, attacker, counterDamage, {
			kind: 'counter',
			label: `${defender.c.name} Chấn Đao! Phá đòn — phản kích`,
			icon: '🛡️',
			source: defender,
			sourceUid: 'skill',
		})
		return
	}

	const crit = sim.rng.chance(attacker.c.critRate)
	if (crit) damage *= attacker.c.critDamage

	const label = crit ? `${weapon.name} chí mạng` : charged ? `${weapon.name} nạp đầy` : `${weapon.name}`
	const dealt = dealDamage(sim, defender, damage, {
		kind: charged ? 'charged' : 'attack',
		label,
		critical: crit,
		icon: weapon.icon,
		source: attacker,
		sourceUid: weapon.uid,
	})

	if (attacker.c.lifesteal > 0 && dealt > 0) {
		const healed = heal(attacker, dealt * attacker.c.lifesteal)
		if (healed > 0) {
			push(sim, 'heal', attacker.c.side, `${attacker.c.name} hút máu +${healed}`, healed, '🩸')
			triggerHeal(sim, attacker, healed)
		}
	}

	if (dealt > 0) triggerDamageDealt(sim, attacker, defender)

	for (const trigger of weapon.onHit ?? []) {
		if (!sim.rng.chance(trigger.chance)) continue
		for (const effect of trigger.effects) fireEffect(sim, attacker, effect, weapon, dealt)
	}
}

function fireEffect(
	sim: Sim,
	owner: Runtime,
	effect: CombatEffect,
	item: { uid: string; name: string; icon: string; linked: boolean },
	dealt = 0,
) {
	const opponent = opponentOf(sim, owner)
	switch (effect.kind) {
		case 'damage': {
			const damage = effect.amount + (effect.atkScale ? owner.c.referenceAtk * effect.atkScale : 0)
			dealDamage(sim, opponent, damage, {
				kind: 'attack',
				label: item.name,
				icon: item.icon,
				source: owner,
				sourceUid: item.uid,
			})
			break
		}
		case 'heal': {
			const healed = heal(owner, effect.amount)
			push(sim, 'heal', owner.c.side, `${item.name} hồi +${healed} máu`, healed, item.icon)
			triggerHeal(sim, owner, healed)
			break
		}
		case 'shield': {
			// A shield always sits on the owner; `enemyHp` means the **opponent's** bar.
			const amount = scaledValue(effect.amount, effect.scale, owner, opponent)
			grantShield(sim, owner, amount, `${item.name} tạo khiên +{amount}`, '🔷')
			break
		}
		case 'lifesteal': {
			const healed = heal(owner, (dealt * effect.percent) / 100)
			if (healed > 0) {
				push(sim, 'heal', owner.c.side, `${item.name} hút máu +${healed}`, healed, '🩸')
				triggerHeal(sim, owner, healed)
			}
			break
		}
		case 'freezeWeapon':
			freezeRandomWeapon(sim, owner, opponent, effect.duration)
			break
		case 'slowWeapon':
			slowRandomWeapon(sim, opponent, effect.value, effect.duration)
			break
		case 'swordEnergy': {
			const before = owner.se
			owner.se = Math.min(owner.c.maxSe, owner.se + effect.amount)
			const gained = Math.round(owner.se - before)
			push(sim, 'status', owner.c.side, `${item.name} nạp +${gained} Kiếm Thế`, gained, '⚔️')
			break
		}
		case 'status': {
			const target = effect.target === 'enemy' ? opponent : owner
			// A dot that drains a **share of the target's live HP** keeps its raw percentage and is
			// recomputed every tick; everything else is resolved once, when it lands.
			const live = effect.scale === 'enemyHpCurrent'
			const value = live ? effect.value : scaledValue(effect.value, effect.scale, owner, target)
			const applied = applyStatus(
				sim,
				target,
				effect.status,
				effect.duration,
				value,
				effect.stacks,
				live ? effect.scale : undefined,
			)
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
				// A linked Divine Forger also shields the cutie from those debuffs for 2s.
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
/** Options of one simulation. `maxTime` / `noDeathZone` are what the training room uses. */
export interface BattleOptions {
	/**
	 * Stop after this much **simulated** time when neither side has died (the training room replays a
	 * long horizon instead of until a death). The result is then marked `timedOut`.
	 */
	maxTime?: number
	/**
	 * No death zone: the arena never starts burning at 3 minutes. The training room asks for it so the
	 * dummy — immortal, and usually not even swinging — cannot be "killed" by the clock, which would end
	 * a practice session the player never asked to end.
	 */
	noDeathZone?: boolean
}

export function simulateBattle(
	playerInput: Combatant,
	enemyInput: Combatant,
	seed: number,
	options: BattleOptions = {},
): BattleResult {
	const limit = options.maxTime ?? MAX_TIME
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
	const dotFeedback = new Map<Runtime, number>()
	const regenFeedback = new Map<Runtime, number>()
	let winner: BattleResult['winner'] | null = null

	while (sim.t < limit && !winner) {
		sim.t += TICK
		const dt = TICK / 1000
		dotAccum.clear()

		for (const runtime of sides) {
			const opponent = opponentOf(sim, runtime)

			runtime.se = Math.min(runtime.c.maxSe, runtime.se + runtime.c.seRegen * dt)
			for (const status of runtime.statuses) status.remaining -= TICK
			for (const immunity of runtime.immunities) immunity.remaining -= TICK
			// Per-weapon timers: freeze pauses a weapon where it is, slow / boost change how fast its
			// own charge runs. The side-wide `freeze` / `slow` statuses still exist for other sources.
			for (let index = 0; index < runtime.c.weapons.length; index += 1) {
				if (runtime.weaponFrozen[index] > 0) {
					runtime.weaponFrozen[index] = Math.max(0, runtime.weaponFrozen[index] - TICK)
				}
				const slow = runtime.weaponSlow[index]
				if (slow.remaining > 0) {
					slow.remaining = Math.max(0, slow.remaining - TICK)
					if (slow.remaining === 0) slow.value = 0
				}
				const cdr = runtime.weaponCdr[index]
				if (cdr.remaining > 0) {
					cdr.remaining = Math.max(0, cdr.remaining - TICK)
					if (cdr.remaining === 0) cdr.value = 0
				}
				const damageBoost = runtime.weaponDamage[index]
				if (damageBoost.remaining > 0) {
					damageBoost.remaining = Math.max(0, damageBoost.remaining - TICK)
					if (damageBoost.remaining === 0) damageBoost.value = 0
				}
			}

			for (const status of runtime.statuses) {
				if (status.remaining <= 0) continue
				if (status.key === 'poison' || status.key === 'burn') {
					const perSecond =
						status.scale === 'enemyHpCurrent'
							? (runtime.hp * status.value) / 100
							: status.value
					const amount = perSecond * status.stacks * dt
					dotAccum.set(runtime, (dotAccum.get(runtime) ?? 0) + amount)
				} else if (status.key === 'regen') {
					const restored = heal(runtime, status.value * status.stacks * dt)
					regenFeedback.set(runtime, (regenFeedback.get(runtime) ?? 0) + restored)
				}
			}
			// The `regen` kit is a passive heal, not a status: the same feedback bucket as a regen.
			if (runtime.c.regenPct > 0) {
				const restored = heal(runtime, ((runtime.maxHp * runtime.c.regenPct) / 100) * dt)
				regenFeedback.set(runtime, (regenFeedback.get(runtime) ?? 0) + restored)
			}
			if (sim.t % 250 === 0) {
				const restored = regenFeedback.get(runtime) ?? 0
				if (restored > 0) {
					push(sim, 'heal', runtime.c.side, `Hồi phục +${restored}`, restored, '💚')
					triggerHeal(sim, runtime, restored)
				}
				regenFeedback.set(runtime, 0)
			}
			expireStatuses(runtime)

			const dotTotal = dotAccum.get(runtime) ?? 0
			if (dotTotal > 0) {
				const active = runtime.statuses.filter((entry) => entry.key === 'poison' || entry.key === 'burn')
				const label = active.map((entry) => STATUS_TEXT[entry.key]).join(' + ') || 'Hiệu ứng'
				const dealt = dealDamage(sim, runtime, dotTotal, { kind: 'dot', label: `Dính ${label}`, icon: '☠️' })
				dotFeedback.set(runtime, (dotFeedback.get(runtime) ?? 0) + dealt)
			}
			if (sim.t % 250 === 0) {
				const damage = dotFeedback.get(runtime) ?? 0
				if (damage > 0) {
					push(sim, 'dot', runtime.c.side, `Sát thương theo thời gian −${damage}`, damage, '☠️')
				}
				dotFeedback.set(runtime, 0)
			}

			if (runtime.hp <= 0) {
				winner = opponent.c.side
				break
			}

			runtime.c.weapons.forEach((weapon, index) => {
				if (isFrozen(runtime) || runtime.weaponFrozen[index] > 0 || runtime.hp <= 0 || opponent.hp <= 0) {
					return
				}
				const slow = runtime.weaponSlow[index].remaining > 0 ? runtime.weaponSlow[index].value : 0
				const buff = runtime.weaponCdr[index].remaining > 0 ? runtime.weaponCdr[index].value : 0
				// A longer countdown per tick is a slower weapon, so a cooldown multiplier divides. The
				// cutie-wide cdr (stat + status slow) lives in `cooldownFactor`; the per-weapon slow and the
				// temporary gem buff apply on top of it.
				const factor = Math.max(
					0.1,
					Math.min(
						10,
						(1 + slow / 100) / (cooldownFactor(runtime) * Math.max(0.25, 1 - buff / 100)),
					),
				)
				runtime.weaponTimers[index] -= TICK * factor
				if (runtime.weaponTimers[index] > 0) return
				// Sword Energy is spent **only** by a charged attack and by Chấn Đao: no weapon gambles
				// it away on a random heavy hit, so the bar can actually reach `seNeed`.
				let charged = false
				if (weapon.charge) {
					// Once the bar holds `seNeed`, **this** basic attack becomes the charged one (it does
					// not add a second timer) and spends exactly that much — never more than the bar holds.
					const need = Math.min(runtime.c.maxSe, Math.max(0, weapon.charge.seNeed))
					charged = runtime.se >= need
					if (charged) runtime.se -= need
				}
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

		// ── Death zone: past 3 minutes both sides burn, and the burn grows every further minute ──
		if (!winner && !options.noDeathZone && sim.t >= DEATH_ZONE_START && sim.t % 1000 === 0) {
			const minutes = Math.floor((sim.t - DEATH_ZONE_START) / 60_000)
			const factor = 1 + DEATH_ZONE_GROWTH * minutes
			const dead: Runtime[] = []
			for (const runtime of sides) {
				const amount = Math.max(
					1,
					Math.round((runtime.maxHp * DEATH_ZONE_PCT_PER_SECOND * factor) / 100),
				)
				const dealt = dealDamage(sim, runtime, amount, {
					kind: 'dot',
					label: 'Vùng tử địa',
					icon: '☠️',
				})
				push(sim, 'dot', runtime.c.side, `Vùng tử địa −${dealt}`, dealt, '☠️')
				if (runtime.hp <= 0) dead.push(runtime)
			}
			if (dead.length === 1) winner = opponentOf(sim, dead[0]).c.side
			else if (dead.length === 2) winner = 'draw'
		}
	}

	// A capped run (the training room) ends the session instead of comparing health bars: nobody died,
	// so nobody won — there is nothing to declare and no reward to pay.
	const timedOut = !winner && options.maxTime !== undefined
	if (!winner && !timedOut) {
		const playerRatio = sim.player.hp / sim.player.maxHp
		const enemyRatio = sim.enemy.hp / sim.enemy.maxHp
		winner = Math.abs(playerRatio - enemyRatio) < 0.02 ? 'draw' : playerRatio > enemyRatio ? 'player' : 'enemy'
	}
	winner ??= 'draw'

	push(
		sim,
		'end',
		winner === 'enemy' ? 'enemy' : 'player',
		timedOut
			? // The practice room has no time limit: what ran out is the pre-computed log, not the fight.
				options.noDeathZone
				? 'Hết bản ghi mô phỏng'
				: 'Hết giờ tập'
			: winner === 'player'
				? `${sim.player.c.name} chiến thắng!`
				: winner === 'enemy'
					? `${sim.enemy.c.name} chiến thắng!`
					: 'Hoà — cả hai cùng kiệt sức',
		undefined,
		timedOut ? '⏱️' : winner === 'draw' ? '🤝' : '🏆',
	)

	return {
		winner,
		events: sim.events,
		playerPower: Math.round(sim.player.c.maxHp + sim.player.c.shield),
		enemyPower: Math.round(sim.enemy.c.maxHp + sim.enemy.c.shield),
		duration: sim.t,
		...(timedOut ? { timedOut: true } : {}),
	}
}
