import { cooldownMs, getTemplate, isWeaponClass, itemTemplateById } from './items'
import {
	DIRECTION_BITS,
	DIRECTIONS,
	adjacentUids,
	adjacentUidsByDirection,
	cellsOf,
	occupancy,
	templateFootprint,
} from './bag'
import type { Direction } from './bag'
import { GRID_WIDTH, MAX_BAG_ROWS, getCutie, cutieLevelStats } from './cuties'
import { kitDef, kitValue, mechanicOf } from './kits'
import { BOOST_TARGET_SIDES, BOOST_TRIGGER_ALWAYS, BOOST_TRIGGER_HEAL, BOOST_TRIGGER_HIT } from './kits'
import { addMods, emptyStats, powerScore } from './stats'
import type {
	ActiveStatus,
	AuraSpec,
	BuffTargetMode,
	ItemClass,
	ItemInstance,
	ItemKit,
	ItemKitId,
	OnHitTrigger,
	ScaleMode,
	StatMods,
	StatSheet,
	Star,
	StatusKey,
} from './types'

export interface CombatItem {
	uid: string
	templateId: string
	name: string
	icon: string
	star: Star
	slot: number
	cls: string
	damage: number
	/** Milliseconds between swings. */
	interval: number
	/** Rolls made after a swing lands; one entry per on-hit effect. */
	onHit?: OnHitTrigger[]
	/**
	 * Set by the `charge-attack` **sub-kit of this swing**: once the owner holds `seNeed` Sword Energy,
	 * the next swing becomes the charged attack, spends that much and lands for `damage` — the charged
	 * hit computed from the base attack, ❌ not this swing's own damage plus a bonus.
	 */
	charge?: { multiplier: number; seNeed: number; damage: number }
	linked: boolean
}

/**
 * One reaction kit's data, resolved at build time.
 *
 * Every kit below reacts to something the owner already does: it owns no timer and never swings.
 */
export interface DamageReaction {
	/** 0–1. */
	chance: number
	rage?: { perStack: number; maxStacks: number }
	slow?: { value: number; duration: number }
	seDrain?: { amount: number }
	/** `damage-boost` kit that starts when one of the owner's weapons lands a hit. */
	boost?: DamageBoost
	/** The item that granted it — the arena lights up that tile when the reaction fires. */
	uid?: string
}

export interface HealReaction {
	rage?: { perStack: number; maxStacks: number }
	armor?: number
	cooldown?: CooldownBuff
	/** `damage-boost` kit that starts when the owner is healed. */
	boost?: DamageBoost
	/** The item that granted it (see `DamageReaction.uid`). */
	uid?: string
}

/**
 * A flat damage bonus for a **fixed set of swings**, resolved once per item by the `damage-boost` kit.
 *
 * `always` boosts are folded into `CombatItem.damage` at build time (no runtime bookkeeping); a
 * triggered boost lands in `Runtime.weaponDamage` and expires with its `duration`.
 */
export interface DamageBoost {
	/** Percent of the swing's own damage. */
	value: number
	/** Milliseconds the boost lasts; `0` means it never expires (baked into the damage). */
	duration: number
	/** Swings it lifts, by swing uid (`itemUid` or `itemUid#<kitId>`). */
	uids: string[]
}

/** One support gem's temporary **cooldown reduction**, resolved once per item. */
export interface CooldownBuff {
	/** Cooldown reduction in percent. */
	value: number
	duration: number
	/** Which weapons (melee / ranged / artifact) it lands on (see `BuffTargetMode`). */
	mode: BuffTargetMode
	/** `mode === 'directions'`: the swings on the ticked sides, by swing uid. */
	weaponUids: string[]
	/** The gem that granted it — the arena lights up that tile when the buff lands. */
	uid?: string
}

export type FreezeReaction = CooldownBuff

export interface AttackedReaction {
	/** 0–1. */
	chance: number
	freeze: number
	/** Water's `shield-when-hit`: armour granted (already a share of max HP) when the roll succeeds. */
	shield?: number
	/** Wood's `cleanse`: strip every bad status on the owner when the roll succeeds. */
	cleanse?: boolean
	/** The item that granted it (see `DamageReaction.uid`). */
	uid?: string
}

export interface DebuffReaction {
	amount: number
	scale?: ScaleMode
	/** `damage-boost` kit that starts when the owner is frozen. */
	boost?: DamageBoost
	/** The item that granted it (see `DamageReaction.uid`). */
	uid?: string
}

export interface CombatReactions {
	/** Any of the owner's weapons landed a damaging hit. */
	damage: DamageReaction[]
	/** The owner was actually healed. */
	heal: HealReaction[]
	/** The owner applied a freeze to the enemy. */
	freeze: FreezeReaction[]
	/** The owner was hit by an attack. */
	attacked: AttackedReaction[]
	/** A freeze landed on the owner. */
	frozen: DebuffReaction[]
	/** Any bad status landed on the owner (freeze is fired through `frozen` too). */
	debuff: DebuffReaction[]
}

export interface Combatant {
	side: 'player' | 'enemy'
	name: string
	icon: string
	hp: number
	maxHp: number
	baseMaxHp: number
	shield: number
	se: number
	maxSe: number
	stats: StatSheet
	statuses: ActiveStatus[]
	immunities: { key: string; remaining: number }[]
	weapons: CombatItem[]
	gridWidth: number
	gridSize: number
	/**
	 * Chấn Đao, granted **only** by an item carrying the `parry` kit: chance 0–1, the Sword Energy
	 * one parry costs, and the counter damage as a multiple of `referenceAtk`.
	 */
	parry?: { chance: number; cost: number; power: number; name: string }
	seRegen: number
	critRate: number
	critDamage: number
	lifesteal: number
	damageReduction: number
	cdr: number
	/** Reference attack used by `atkScale` effects and counter damage. */
	referenceAtk: number
	/** Extra healing received, as a fraction (`0.15` = +15 %). */
	healingBoost: number
	/** Heals this share of max HP every second (percent). */
	regenPct: number
	/** Chance (0–1) to take half damage from a direct hit. */
	blockChance: number
	/** Sword Energy a **critical** hit refunds (the `overcharge` kit); `0` when it carries none. */
	critEnergy?: number
	/** Enough Sword Energy negates a **charged** attack outright. */
	blockCharged?: { seCost: number }
	reactions: CombatReactions
	/**
	 * Training dummy: its HP **never leaves the bar**. Damage is still computed and shown (that is
	 * what a practice fight measures), but the bar refills, nothing kills it — and the death zone
	 * cannot end the session either.
	 */
	immortal?: boolean
}

interface BuildInput {
	side: 'player' | 'enemy'
	name: string
	icon: string
	baseMaxHp: number
	baseMaxSe: number
	baseSeRegen: number
	baseWeaponName: string
	baseWeaponIcon: string
	baseWeaponInterval: number
	baseWeaponDamage: number
	baseCritRate?: number
	baseCritDamage?: number
	baseMods?: StatMods
	/**
	 * Kits of the owner **itself** (the cutie), interpreted exactly like an item's attack kits: each
	 * one becomes a swing of its own, scaled by `baseAttack`.
	 */
	baseKits?: ItemKit[]
	/** Reference attack for `baseKits` / `atkScale` effects; defaults to `baseWeaponDamage`. */
	baseAttack?: number
	items: { templateId: string; star: Star; slot: number; rotated?: boolean }[]
	gridWidth: number
	gridSize: number
	/** See `Combatant.immortal`. */
	immortal?: boolean
	/**
	 * The fighter **holds its gear but never swings** — the training dummy with "do not attack" on.
	 * Its items stay on the board (so the arena still shows the one weapon) but no weapon timer runs.
	 */
	noSwings?: boolean
}

/** Stable uid shared by the bag UI and the battle gear rows. */
export function combatItemUid(templateId: string, slot: number): string {
	return `${templateId}-${slot}`
}

/**
 * Time between two swings of one attack kit: its **Cooldown Time** in seconds, in milliseconds.
 *
 * 🔴 There is no attack speed anywhere in the game any more — an item or a skill simply carries the
 * gap by itself, so `1.6` means "a hit every 1.6 s" with nothing added on top.
 *
 * The charged variant has **no cooldown of its own** — it replaces one swing of the basic attack, so
 * an item keeps a single rhythm.
 */
export function attackCooldownMs(attack: ItemKit, star: Star): number {
	return cooldownMs(kitValue(attack, 'cooldown', star))
}

/**
 * Damage per plain swing: the **owner's attack** scaled by this kit's `multiplier`.
 *
 * A charged attack is a property of the swing (`CombatItem.charge`), not another kit, so nothing has
 * to be excluded here.
 */
function attackDamage(attack: ItemKit, star: Star, attackStat: number): number {
	return Math.round(attackStat * kitValue(attack, 'multiplier', star))
}

/** `target` 0 / 1 / 2 → how a support gem picks its weapons (see `BUFF_TARGET` in `kits.ts`). */
const BUFF_MODES: readonly BuffTargetMode[] = ['directions', 'random']

/**
 * One support gem's cooldown-reduction buff, resolved once per item.
 *
 * `weaponUids` is only filled for `directions`: the swings of the weapons on the sides the admin
 * ticked. The other two modes are resolved at runtime, so `battle.ts` can pick the weapon that
 * actually caused the trigger.
 */
function cooldownBuff(
	kit: { id: ItemKitId; params: Record<string, number[]> },
	star: Star,
	swingsOnSide: (side: Direction) => string[],
	/** The gem that grants it; carried onto the event so the arena can light that tile up. */
	uid?: string,
): CooldownBuff | undefined {
	const value = kitValue(kit, 'boost', star)
	if (value <= 0) return undefined
	const mode = BUFF_MODES[Math.round(kitValue(kit, 'target', star))] ?? 'directions'
	const mask = Math.round(kitValue(kit, 'directions', star))
	const weaponUids =
		mode === 'directions'
			? [...new Set(DIRECTIONS.filter((side) => (mask & DIRECTION_BITS[side]) !== 0).flatMap(swingsOnSide))]
			: []
	return { value, mode, duration: Math.round(kitValue(kit, 'duration', star)), weaponUids, uid }
}

/**
 * A `stats` / `aura` table adds its numbers **straight to the owner**: `{ atk: 30 }` is +30 attack,
 * `{ maxHp: 120 }` is +120 max HP, `{ critRate: 5 }` is +5 % critical chance. Nothing is scaled by a
 * percentage — the designer types the amount the Cutie gains, exactly as it reads on the item.
 */
const addItemMods = addMods

/**
 * An Energy amount from a kit is **absolute points**, not a share of the bar: `seNeed: 100` means the
 * owner needs 100 Energy, whatever its `maxSe` is. The simulation compares these numbers against
 * `runtime.se` / `maxSe` directly (`battle.ts`), so no conversion happens here — the value is only
 * rounded (and clamped by `kitValue` to the kit's own range) so a stored `2.5` cannot leak into a bar
 * comparison as a fraction that never lands.
 */
function energyPoints(value: number): number {
	return Math.round(value)
}

/**
 * On-hit rolls attached **inside** one attack kit.
 *
 * A chance of 0 (or a broken entry) is dropped instead of rolled, so an "off" effect costs no RNG
 * draw and does not shift the rest of the deterministic simulation.
 *
 * ⚠️ Every number here is owner-relative: a burn is a share of the **cutie's attack** per second,
 * a shield is a share of its **max HP**, and Sword Energy amounts are a share of its **max bar**.
 */
function onHitTriggers(attack: ItemKit, star: Star): OnHitTrigger[] {
	const triggers: OnHitTrigger[] = []
	for (const effect of attack.onHit ?? []) {
		// The kit stores the chance as a percentage (0–100), the simulation rolls 0–1.
		const chance = kitValue(effect, 'chance', star) / 100
		if (chance <= 0) continue
		switch (mechanicOf(effect.id)) {
			case 'burn-on-hit':
			case 'poison-on-hit': {
				triggers.push({
					chance,
					effects: [
						{
							kind: 'status',
							status: effect.id === 'burn-on-hit' ? 'burn' : 'poison',
							duration: kitValue(effect, 'duration', star),
							value: kitValue(effect, 'value', star),
							// A burn / poison drains a share of the owner's attack every second.
							scale: 'atk' as ScaleMode,
							stacks: 1,
							target: 'enemy',
						},
					],
				})
				break
			}
			case 'slow-on-hit':
				triggers.push({
					chance,
					effects: [
						{
							kind: 'status',
							status: 'slow' as StatusKey,
							duration: kitValue(effect, 'duration', star),
							value: kitValue(effect, 'value', star),
							stacks: 1,
							target: 'enemy',
						},
					],
				})
				break
			case 'freeze-on-hit':
				// One weapon at random, never the whole side: see `freezeWeapon` in `game/types.ts`.
				triggers.push({
					chance,
					effects: [{ kind: 'freezeWeapon', duration: kitValue(effect, 'duration', star) }],
				})
				break
			case 'sword-energy-on-hit':
				triggers.push({
					chance,
					effects: [{ kind: 'swordEnergy', amount: energyPoints(kitValue(effect, 'amount', star)) }],
				})
				break
			case 'lifesteal-on-hit':
				triggers.push({
					chance,
					effects: [{ kind: 'lifesteal', percent: kitValue(effect, 'percent', star) }],
				})
				break
			case 'shield-on-hit':
				triggers.push({
					chance,
					effects: [
						{
							kind: 'shield',
							amount: kitValue(effect, 'amount', star),
							// A shield is a share of the owner's own max HP.
							scale: 'hp' as ScaleMode,
						},
					],
				})
				break
			case 'brittle-on-hit':
			case 'wound-on-hit':
			case 'weaken-on-hit':
				triggers.push({
					chance,
					effects: [
						{
							kind: 'status',
							status: mechanicOf(effect.id) === 'brittle-on-hit'
								? ('brittle' as StatusKey)
								: mechanicOf(effect.id) === 'wound-on-hit'
									? ('wound' as StatusKey)
									: ('weaken' as StatusKey),
							duration: kitValue(effect, 'duration', star),
							value: kitValue(effect, 'value', star),
							stacks: 1,
							target: 'enemy',
						},
					],
				})
				break
			case 'shock-on-hit':
				// Every enemy weapon stops charging — see `stun` in `game/types.ts`.
				triggers.push({
					chance,
					effects: [{ kind: 'stun', duration: kitValue(effect, 'duration', star) }],
				})
				break
		}
	}
	return triggers
}

/**
 * One `CombatItem` per **attack kit** — the layout both an item and a cutie use.
 *
 * An entity may carry several attack kits: each one is **its own swing**, with its own cadence,
 * damage, on-hit rolls and (for `charge-attack`) the Sword Energy rule. A second kit therefore adds
 * a second cadence instead of overwriting the first one. `source.uid` is the tile the swing is drawn
 * from; the extra kits are suffixed so two timers never share an id.
 *
 * ⚠️ `attack` is the **owner's** number and the kit only multiplies it, so a weapon can never
 * introduce damage the cutie does not have. `cooldown` is the kit's own Cooldown Time, in seconds.
 */
function kitSwings(
	kits: ItemKit[] | undefined,
	star: Star,
	attackStat: number,
	source: { uid: string; templateId: string; name: string; icon: string; slot: number; cls: string },
): CombatItem[] {
	const swings: CombatItem[] = []
	const attacks = (kits ?? []).filter((kit) => kitDef(kit.id).kind === 'attack')
	for (const [index, attack] of attacks.entries()) {
		swings.push({
			uid: index === 0 ? source.uid : `${source.uid}#${attack.id}`,
			templateId: source.templateId,
			name: source.name,
			icon: source.icon,
			star,
			slot: source.slot,
			cls: source.cls,
			damage: attackDamage(attack, star, attackStat),
			// `kitValue` clamps to the kit's own range, so this can never be 0 (min 0.1 s).
			interval: attackCooldownMs(attack, star),
			onHit: onHitTriggers(attack, star),
			...(attack.charge
				? {
						charge: {
							multiplier: kitValue(attack.charge, 'multiplier', star),
							seNeed: energyPoints(kitValue(attack.charge, 'seNeed', star)),
							// The charged hit is its own number: owner attack × the charged multiplier.
							// ❌ The basic attack's damage is never added on top of it.
							damage: Math.round(attackStat * kitValue(attack.charge, 'multiplier', star)),
						},
					}
				: {}),
			linked: false,
		})
	}
	return swings
}

/** Does an aura's adjacency condition hold for the item that carries it? */
function auraApplies(aura: AuraSpec | undefined, adjacent: { templateId: string }[]): aura is AuraSpec {
	if (!aura) return false
	if (aura.target === 'all') return true
	if (aura.target === 'adjacent') return adjacent.length > 0
	if (aura.target === 'adjacentWeapon') {
		return adjacent.some((found) => isWeaponClass(getTemplate(found.templateId).cls))
	}
	return adjacent.some((found) => !isWeaponClass(getTemplate(found.templateId).cls))
}

/** Resolves passives + aura adjacency, then assembles the combatant. */
export function buildCombatant(input: BuildInput): Combatant {
	// Attack only exists on the **owner**: every item swing multiplies this number.
	const ownAttack = input.baseAttack ?? input.baseWeaponDamage
	const stats = emptyStats()
	addMods(stats, {
		maxHp: input.baseMaxHp,
		seRegen: input.baseSeRegen,
		critRate: input.baseCritRate ?? 0,
		critDamage: input.baseCritDamage ?? 80,
	})
	addMods(stats, input.baseMods)

	const placed = input.items.filter(
		// A template the admin deleted is skipped instead of throwing: an old save or a stage enemy
		// still referencing it must not take the whole battle down.
		(entry) => entry.slot >= 0 && entry.slot < input.gridSize && Boolean(itemTemplateById(entry.templateId)),
	)
	// Cell → item map so adjacency is evaluated per cell rather than from a single anchor cell.
	// The uid is built just like `combatItemUid` so the original entry can be looked up back.
	const uidOf = (entry: { templateId: string; slot: number }) => combatItemUid(entry.templateId, entry.slot)
	const cellOwner = occupancy(
		placed.map((entry) => ({ ...entry, uid: uidOf(entry) })),
		input.gridWidth,
		(entry) => templateFootprint(entry.templateId, entry.rotated),
	)
	const byUid = new Map(placed.map((entry) => [uidOf(entry), entry]))

	/**
	 * `atk` from the placed `stats` / `aura` tables — the **only** kits that can move the owner's attack.
	 *
	 * A swing's damage is `owner attack × the kit's multiplier`, and the swings below are built before
	 * the per-item kit loop fills `stats`. Reading just this one number up front is what makes "+5 attack
	 * from a jade" land on **every** swing; without it the stat was displayed and never used.
	 */
	const itemAttackBonus = placed.reduce((sum, entry) => {
		const template = getTemplate(entry.templateId)
		const cells = cellsOf(entry.slot, templateFootprint(entry.templateId, entry.rotated), input.gridWidth)
		const adjacent = [...adjacentUids(cellOwner, cells, input.gridWidth, input.gridSize, uidOf(entry))]
			.map((neighbour) => byUid.get(neighbour))
			.filter((found): found is NonNullable<typeof found> => Boolean(found))
		let added = 0
		for (const kit of template.kits ?? []) {
			const mechanic = mechanicOf(kit.id)
			if (mechanic === 'stats') added += kit.stats?.[entry.star - 1]?.atk ?? 0
			const aura = mechanic === 'aura' ? kit.aura?.[entry.star - 1] : undefined
			if (auraApplies(aura, adjacent)) added += aura.mods.atk ?? 0
		}
		return sum + added
	}, 0)
	/** The owner's **real** attack: its own number plus what the equipped tables add. */
	const attackStat = ownAttack + itemAttackBonus

	const items: CombatItem[] = []
	for (const entry of placed) {
		const template = getTemplate(entry.templateId)
		const uid = combatItemUid(entry.templateId, entry.slot)
		// An item has no attack of its own: its kits multiply the **cutie's** attack.
		items.push(
			...kitSwings(template.kits, entry.star, attackStat, {
				uid,
				templateId: entry.templateId,
				name: template.name,
				icon: template.icon,
				slot: entry.slot,
				cls: template.cls,
			}),
		)
	}

	// Stats, aura and reaction kits are read **once per placed item**, never once per swing: a second
	// attack kit must not add the same stat table twice, and a parry is a property of the owner.
	let parry: Combatant['parry']
	const reactions: CombatReactions = {
		damage: [],
		heal: [],
		freeze: [],
		attacked: [],
		frozen: [],
		debuff: [],
	}
	let healingBoost = 0
	let regenPct = 0
	let blockChance = 0
	let blockCharged: Combatant['blockCharged']
	/** Thunder's `overcharge`: the best Sword-Energy refund on a critical hit, `0` when none. */
	let critEnergy = 0
	/** "Always on" `damage-boost` kits, folded into the swings once every item has been read. */
	const permanentBoosts: DamageBoost[] = []
	for (const entry of placed) {
		const template = getTemplate(entry.templateId)
		const uid = uidOf(entry)
		const cells = cellsOf(entry.slot, templateFootprint(entry.templateId, entry.rotated), input.gridWidth)
		const neighbourUids = adjacentUids(cellOwner, cells, input.gridWidth, input.gridSize, uid)
		const adjacent = [...neighbourUids]
			.map((neighbour) => byUid.get(neighbour))
			.filter((found): found is NonNullable<typeof found> => Boolean(found))
		// Swings of the weapons **sharing an edge** with this gem, grouped by the side they sit on. A
		// support gem buffs only the sides its `directions` bitmask selects.
		const bySide = adjacentUidsByDirection(cellOwner, cells, input.gridWidth, input.gridSize, uid)
		// Only weapons (melee / ranged / artifact) take a support buff — jewellery, armour and potions
		// have no charge to shorten.
		const swingsOnSide = (side: Direction) =>
			items
				.filter((swing) => bySide[side].has(swing.uid.split('#')[0]))
				.filter((swing) => isWeaponClass(swing.cls as ItemClass))
				.map((swing) => swing.uid)
		const star = entry.star

		// The `adjacent` aura counts any neighbouring item; the other auras filter by class.
		for (const weapon of items) {
			if (weapon.uid.split('#')[0] === uid) weapon.linked = adjacent.length > 0
		}
		for (const kit of template.kits ?? []) {
			// 🔴 Branch on the **mechanic**, never on `kit.id`: a kit created on the admin page has an id
			// of its own (`burn-on-hit-2`) and no behaviour beyond the mechanic it runs on.
			const mechanic = mechanicOf(kit.id)
			if (mechanic === 'stats') {
				// A stat table adds its numbers straight to the owner.
				addItemMods(stats, kit.stats?.[entry.star - 1])
				continue
			}
			if (mechanic === 'parry') {
				// Best parry wins: the highest chance, then the heavier counter.
				const chance = kitValue(kit, 'chance', entry.star) / 100
				if (chance <= 0) continue
				const candidate = {
					chance,
					cost: energyPoints(kitValue(kit, 'cost', entry.star)),
					power: kitValue(kit, 'power', entry.star) / 100,
					name: template.name,
				}
				if (
					!parry ||
					candidate.chance > parry.chance ||
					(candidate.chance === parry.chance && candidate.power > parry.power)
				) {
					parry = candidate
				}
				continue
			}
			if (mechanic === 'aura') {
				const aura = kit.aura?.[star - 1]
				if (auraApplies(aura, adjacent)) addItemMods(stats, aura.mods)
				continue
			}
			switch (mechanic) {
				case 'freeze-haste': {
					const buff = cooldownBuff(kit, star, swingsOnSide, uid)
					if (buff) reactions.freeze.push(buff)
					break
				}
				case 'freeze-heal':
				case 'debuff-heal': {
					const amount = kitValue(kit, 'amount', star)
					if (amount <= 0) break
					// A heal is a share of the owner's max HP.
					const reaction = { amount, scale: 'hp' as ScaleMode, uid }
					if (mechanic === 'freeze-heal') reactions.frozen.push(reaction)
					else reactions.debuff.push(reaction)
					break
				}
				case 'freeze-reflect': {
					const chance = kitValue(kit, 'chance', star) / 100
					if (chance > 0) {
						reactions.attacked.push({
							chance,
							freeze: Math.round(kitValue(kit, 'duration', star)),
							uid,
						})
					}
					break
				}
				case 'slow-strike': {
					const chance = kitValue(kit, 'chance', star) / 100
					if (chance > 0) {
						reactions.damage.push({
							chance,
							slow: {
								value: kitValue(kit, 'value', star),
								duration: Math.round(kitValue(kit, 'duration', star)),
							},
							uid,
						})
					}
					break
				}
				case 'rage-on-hit':
				case 'rage-on-heal': {
					const rage = {
						perStack: kitValue(kit, 'value', star),
						maxStacks: Math.round(kitValue(kit, 'maxStacks', star)),
					}
					if (mechanic === 'rage-on-hit') reactions.damage.push({ chance: 1, rage, uid })
					else reactions.heal.push({ rage, uid })
					break
				}
				case 'armor-on-heal': {
					// A share of the owner's max HP, resolved once per item.
					const amount = Math.round((input.baseMaxHp * kitValue(kit, 'amount', star)) / 100)
					if (amount > 0) reactions.heal.push({ armor: amount, uid })
					break
				}
				case 'se-drain': {
					const chance = kitValue(kit, 'chance', star) / 100
					if (chance > 0) {
						reactions.damage.push({
							chance,
							seDrain: { amount: energyPoints(kitValue(kit, 'amount', star)) },
							uid,
						})
					}
					break
				}
				case 'heal-haste': {
					const buff = cooldownBuff(kit, star, swingsOnSide, uid)
					if (buff) reactions.heal.push({ cooldown: buff, uid })
					break
				}
				case 'shield-when-hit': {
					// Water's "giáp ảo": the shield only appears once a hit actually lands.
					const chance = kitValue(kit, 'chance', star) / 100
					const amount = Math.round((input.baseMaxHp * kitValue(kit, 'amount', star)) / 100)
					if (chance > 0 && amount > 0) {
						reactions.attacked.push({ chance, freeze: 0, shield: amount, uid })
					}
					break
				}
				case 'cleanse': {
					// Wood: a chance to strip every bad status the moment one lands.
					const chance = kitValue(kit, 'chance', star) / 100
					if (chance > 0) reactions.attacked.push({ chance, freeze: 0, cleanse: true, uid })
					break
				}
				case 'overcharge': {
					const amount = energyPoints(kitValue(kit, 'amount', star))
					if (amount > 0) critEnergy = Math.max(critEnergy, amount)
					break
				}
				case 'damage-reduction':
					stats.dr += kitValue(kit, 'value', star)
					break
				case 'starting-shield':
					stats.shield += kitValue(kit, 'amount', star)
					break
				case 'healing-boost':
					healingBoost += kitValue(kit, 'value', star) / 100
					break
				case 'regen':
					regenPct += kitValue(kit, 'value', star)
					break
				case 'sword-energy':
					// The one kit allowed to move Sword Energy — a negative number slows the refill.
					stats.seRegen += kitValue(kit, 'regen', star)
					break
				case 'damage-boost': {
					const value = kitValue(kit, 'value', star)
					if (value === 0) break
					const sides = Math.round(kitValue(kit, 'target', star)) === BOOST_TARGET_SIDES
					const mask = Math.round(kitValue(kit, 'directions', star))
					const uids = sides
						? [
								...new Set(
									DIRECTIONS.filter((side) => (mask & DIRECTION_BITS[side]) !== 0).flatMap((side) =>
										swingsOnSide(side),
									),
								),
							]
						: items.filter((swing) => swing.uid.split('#')[0] === uid).map((swing) => swing.uid)
					if (uids.length === 0) break
					const trigger = Math.round(kitValue(kit, 'trigger', star))
					const boost = { value, duration: Math.round(kitValue(kit, 'duration', star)), uids }
					if (trigger === BOOST_TRIGGER_ALWAYS) permanentBoosts.push(boost)
					else if (trigger === BOOST_TRIGGER_HIT) reactions.damage.push({ chance: 1, boost, uid })
					else if (trigger === BOOST_TRIGGER_HEAL) reactions.heal.push({ boost, uid })
					else reactions.frozen.push({ amount: 0, boost, uid })
					break
				}
				case 'block-chance':
					blockChance += kitValue(kit, 'chance', star) / 100
					break
				case 'block-charged': {
					const seCost = energyPoints(kitValue(kit, 'seCost', star))
					// The cheapest block wins: two copies must not make the same block cost more.
					if (!blockCharged || seCost < blockCharged.seCost) blockCharged = { seCost }
					break
				}
			}
		}
	}

	// A `damage-boost` set to "always" is part of the weapon's own number, so nothing has to be
	// tracked during the fight.
	for (const boost of permanentBoosts) {
		const factor = 1 + boost.value / 100
		for (const weapon of items) {
			if (!boost.uids.includes(weapon.uid)) continue
			weapon.damage = Math.round(weapon.damage * factor)
			// The charged hit is its own number, so it has to be lifted by the same factor.
			if (weapon.charge) {
				weapon.charge = { ...weapon.charge, damage: Math.round(weapon.charge.damage * factor) }
			}
		}
	}

	const atkPct = stats.atkPct / 100
	const weaponBase = ownAttack + stats.atk
	const baseWeapon: CombatItem = {
		uid: 'skill',
		templateId: 'skill',
		name: input.baseWeaponName,
		icon: input.baseWeaponIcon,
		star: 1,
		slot: -1,
		cls: 'weapon',
		damage: Math.round(weaponBase * (1 + atkPct)),
		interval: input.baseWeaponInterval,
		linked: false,
	}
	// Swings of the owner itself (a cutie's kits). Its plain attack comes from the kits, not from the
	// base weapon, so `baseWeaponInterval` is 0 for a cutie and the row below drops out.
	const own = kitSwings(input.baseKits, 1, attackStat, {
		uid: 'skill',
		templateId: 'skill',
		name: input.baseWeaponName,
		icon: input.baseWeaponIcon,
		slot: -1,
		cls: 'weapon',
	})

	const weapons = input.noSwings
		? []
		: [baseWeapon, ...own, ...items.filter((item) => item.damage > 0 && item.interval > 0)].filter(
				(weapon) => weapon.interval > 0,
			)

	const maxHp = Math.round(stats.maxHp)
	// Percent of cooldown removed; slow (a status) pushes it back up at runtime.
	const cdr = Math.max(-300, stats.cdr)

	return {
		side: input.side,
		name: input.name,
		icon: input.icon,
		hp: maxHp,
		maxHp,
		baseMaxHp: maxHp,
		shield: Math.round(stats.shield),
		se: Math.min(input.baseMaxSe, 35),
		maxSe: input.baseMaxSe,
		stats,
		statuses: [],
		immunities: [],
		weapons,
		gridWidth: input.gridWidth,
		gridSize: input.gridSize,
		seRegen: stats.seRegen,
		critRate: stats.critRate / 100,
		critDamage: 1 + stats.critDamage / 100,
		lifesteal: stats.lifesteal / 100,
		damageReduction: Math.min(0.75, stats.dr / 100),
		cdr,
		healingBoost,
		regenPct,
		blockChance: Math.min(0.9, blockChance),
		...(blockCharged ? { blockCharged } : {}),
		...(critEnergy > 0 ? { critEnergy } : {}),
		reactions,
		// Counter damage and `atkScale` effects read the **owner's** attack, never an item's.
		referenceAtk: Math.round(weaponBase * (1 + atkPct)),
		...(parry ? { parry } : {}),
		...(input.immortal ? { immortal: true } : {}),
	}
}

export function buildPlayerCombatant(cutieId: string, level: number, items: ItemInstance[]): Combatant {
	const cutie = getCutie(cutieId)
	const levelStats = cutieLevelStats(cutie, level)
	const gridSize = levelStats.bagSize
	return buildCombatant({
		side: 'player',
		name: cutie.name,
		icon: cutie.icon,
		baseMaxHp: levelStats.maxHp,
		baseMaxSe: levelStats.maxSe,
		baseSeRegen: levelStats.seRegen,
		baseWeaponName: 'Đòn thường',
		baseWeaponIcon: '👊',
		// The cutie's swings come from its kits, so there is no innate attack of its own.
		baseWeaponInterval: 0,
		baseWeaponDamage: 0,
		baseAttack: levelStats.attack,
		baseKits: cutie.kits,
		baseCritRate: cutie.critRate,
		baseCritDamage: cutie.critDamage,
		items: items.map((item) => ({
			templateId: item.templateId,
			star: item.star,
			slot: item.slot,
			rotated: item.rotated,
		})),
		gridWidth: levelStats.bag.width,
		gridSize,
	})
}

export function buildEnemyCombatant(
	blueprint: import('./types').EnemyBlueprint,
	options: { immortal?: boolean; noSwings?: boolean } = {},
): Combatant {
	return buildCombatant({
		side: 'enemy',
		name: blueprint.name,
		icon: blueprint.icon,
		baseMaxHp: blueprint.maxHp,
		baseMaxSe: blueprint.maxSe,
		baseSeRegen: blueprint.seRegen,
		baseWeaponName: 'Đòn cơ bản',
		baseWeaponIcon: '👊',
		baseWeaponInterval: blueprint.attackInterval,
		baseWeaponDamage: blueprint.attackDamage,
		baseMods: blueprint.mods,
		items: blueprint.items,
		gridWidth: GRID_WIDTH,
		gridSize: GRID_WIDTH * MAX_BAG_ROWS,
		immortal: options.immortal,
		noSwings: options.noSwings,
	})
}

/** Rough offensive pressure used for the PvP matchmaking board. */
export function estimatePower(combatant: Combatant): number {
	const cooldownFactor = Math.max(0.25, 1 - combatant.cdr / 100)
	const criticalFactor = 1 + combatant.critRate * (combatant.critDamage - 1)
	const dps =
		combatant.weapons.reduce((total, weapon) => total + (weapon.damage / weapon.interval) * 1000, 0) *
		cooldownFactor *
		criticalFactor
	return powerScore(combatant.maxHp, dps, combatant.damageReduction * 100, combatant.shield)
}
