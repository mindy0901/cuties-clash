/**
 * The **numbers a player reads** about one item: what it swings, how often, what it lands on hit,
 * which stats it adds and what its support gems do.
 *
 * ⚠️ WHY A SHARED MODULE: the click-to-open dialog ([`ItemDetailDialog`](./ItemDetailDialog.tsx)) and
 * the shop's hover card ([`ShopOfferCard`](./ShopOfferCard.tsx)) must say the **same** thing about
 * the same item — one of them drifting would mean two different truths about one weapon. Every value
 * here comes from the same `kits` data the battle reads, so nothing is a second copy of a rule.
 *
 * Lives in `components/` (not `game/`) only because the labels are translated with `translate`;
 * there is no React in here.
 */
import { attackCooldownMs } from '../game/build'
import { DIRECTIONS, DIRECTION_BITS } from '../game/bag'
import { DIRECTION_LABELS, kitDef, kitValue } from '../game/kits'
import { STAT_KEYS, STAT_LABELS, formatStat } from '../game/stats'
import { translate } from '../i18n'
import type { AuraTarget, ItemKit, ItemTemplate, OnHitKit, Star, StatKey } from '../game/types'

/** What an adjacency aura needs next to the item. */
export const AURA_TARGET_LABELS: Record<AuraTarget, string> = {
	adjacent: 'Cần một món liền kề',
	adjacentWeapon: 'Cần một vũ khí liền kề',
	adjacentNonWeapon: 'Cần một món không phải vũ khí liền kề',
	all: 'Luôn có hiệu lực',
}

/** Short name of the stat a scaled on-hit number is a percentage of. */
export const SCALE_NOUNS: Record<number, string> = {
	0: 'Số cố định',
	1: 'ATK',
	2: 'máu tối đa',
	3: 'máu địch tối đa',
	4: 'máu hiện tại',
	5: 'máu hiện tại địch',
}

/** Parameters measured in **percent** — the number alone reads as a count without the sign. */
const PERCENT_PARAM_KEYS = new Set([
	'chance',
	'value',
	'percent',
	'power',
	'boost',
	'slow',
	'regen',
	'dr',
	'cdr',
	'critRate',
	'critDamage',
	'lifesteal',
	'atkPct',
	'amount',
])

/**
 * `amount` is a **percentage of max HP** on a shield / heal, but **absolute Energy points** on the two
 * Energy kits (🔴 Energy is a number on the bar, not a share of it). These pairs print without a `%`.
 */
const ENERGY_AMOUNT_KITS = new Set(['sword-energy-on-hit', 'se-drain'])

/** One option-kit parameter written out: durations in seconds, choices and directions by name. */
export function kitParamText(kit: ItemKit, key: string, star: Star): string {
	const value = kitValue(kit, key, star)
	if (key === 'scaling') return translate(SCALE_NOUNS[Math.round(value)] ?? 'Số cố định')
	if (key === 'duration') return `${Number((value / 1000).toFixed(1))}s`
	if (key === 'directions') {
		const mask = Math.round(value)
		const sides = DIRECTIONS.filter((side) => (mask & DIRECTION_BITS[side]) !== 0).map((side) =>
			translate(DIRECTION_LABELS[side]),
		)
		return sides.length > 0 ? sides.join(' · ') : translate('Không hướng nào')
	}
	// A parameter with a fixed list (`target`) prints the chosen label, not its number.
	const choice = kitDef(kit.id)
		.params.find((param) => param.key === key)
		?.choices?.find((entry) => entry.value === Math.round(value))
	if (choice) return translate(choice.label)
	const number = String(Number(value.toFixed(2)))
	if (key === 'amount' && ENERGY_AMOUNT_KITS.has(kit.id)) return number
	return PERCENT_PARAM_KEYS.has(key) ? `${number}%` : number
}

/**
 * One on-hit effect written out for the player, from the same kit data the battle reads.
 *
 * ⚠️ Every number is **owner-relative** now: a burn / poison is a share of the cutie's attack per
 * second, a shield is a share of its max HP, and Sword Energy amounts are shares of its max bar.
 */
export function onHitText(effect: OnHitKit, star: Star): string {
	const duration = `${Number((kitValue(effect, 'duration', star) / 1000).toFixed(1))}s`
	const num = (value: number) => String(Number(value.toFixed(2)))
	switch (effect.id) {
		case 'burn-on-hit':
		case 'poison-on-hit':
			return `${num(kitValue(effect, 'value', star))}%/s × ${translate('ATK')} · ${duration}`
		case 'slow-on-hit':
			return `−${num(kitValue(effect, 'value', star))}% · ${duration}`
		case 'freeze-on-hit':
			return duration
		case 'lifesteal-on-hit':
			return `+${num(kitValue(effect, 'percent', star))}%`
		case 'shield-on-hit':
			return `+${num(kitValue(effect, 'amount', star))}% ${translate('máu tối đa')}`
		case 'sword-energy-on-hit':
			return `+${num(kitValue(effect, 'amount', star))}% ${translate('Kiếm Thế')}`
		default:
			return num(kitValue(effect, 'value', star))
	}
}

/** The **cutie's** attack — the number every item kit multiplies. */
export interface OwnerStats {
	attack: number
}

/** Everything both item views draw, derived once from the kit data. */
export interface ItemFacts {
	/** Default shape — ❌ not the orientation the item happens to have in a bag. */
	passive: Record<string, number | undefined> | undefined
	/** Stat keys the passive actually sets, in `STAT_KEYS` order. */
	mods: StatKey[]
	/** Kits that swing at all; an item without one never attacks. */
	attackKits: ItemKit[]
	/** Damage of one plain swing of a kit (`owner.attack × multiplier`). */
	hitOf: (kit: ItemKit) => number
	/** Milliseconds of one Cooldown Time of a kit (its own `cooldown`, per star). */
	intervalOf: (kit: ItemKit) => number
	baseAttack: number
	aura: { target: AuraTarget; mods: Record<string, number | undefined> } | undefined
	auraMods: StatKey[]
	parry: ItemKit | undefined
	/** Freeze / slow / heal support gems and the armour kits (everything but stats / aura / parry). */
	extraOptionKits: ItemKit[]
	/** **Every** option kit, in the item's own order (`stats`, `aura`, `parry` included). */
	optionKits: ItemKit[]
}

export function itemFacts(template: ItemTemplate, star: Star, owner: OwnerStats): ItemFacts {
	// Bonus stats come from the `stats` option kit (five tables, one per star).
	const statsKit = template.kits?.find((kit) => kit.id === 'stats')
	const passive = statsKit?.stats?.[star - 1]
	// An item only swings when it carries an attack kit; without one there are no rows. An item has
	// no attack of its own — its kits multiply the **cutie's** attack, which the caller passes in — and
	// it carries its own Cooldown Time. The charged variant rides **inside** the swing (`kit.charge`).
	const attackKits = (template.kits ?? []).filter((kit) => kitDef(kit.id).kind === 'attack')
	const aura = (template.kits ?? []).find((kit) => kit.id === 'aura')?.aura?.[star - 1]
	return {
		passive,
		mods: passive ? STAT_KEYS.filter((key) => passive[key] !== undefined) : [],
		attackKits,
		hitOf: (kit) => Math.round(owner.attack * kitValue(kit, 'multiplier', star)),
		intervalOf: (kit) => attackCooldownMs(kit, star),
		baseAttack: owner.attack,
		aura,
		auraMods: aura ? STAT_KEYS.filter((key) => aura.mods[key] !== undefined) : [],
		// Chấn Đao exists only as a kit, so it is listed like any other: chance, cost, counter power.
		parry: (template.kits ?? []).find((kit) => kit.id === 'parry'),
		extraOptionKits: (template.kits ?? []).filter(
			(kit) => kitDef(kit.id).kind === 'option' && !['stats', 'aura', 'parry'].includes(kit.id),
		),
		optionKits: (template.kits ?? []).filter((kit) => kitDef(kit.id).kind === 'option'),
	}
}

/**
 * Every kit an item carries, **with its own numbers** — one list for the hover card and the detail
 * dialog, so the two can never describe the same item differently.
 *
 * 🔴 `multiplier` and `cooldown` are printed as **the stored values** (`×1.2`, `2.5s`), not only as the
 * resulting damage: the absolute hit depends on the Cutie's attack, so the multiplier is the only number
 * a player can compare between two items.
 */
export interface KitLine {
	/** Parameter key — the header row of a kit's own table. */
	key: string
	/** Vietnamese source string; the view translates it. */
	label: string
	value: string
	/** A gain (green): damage, a stat, a chance. Costs, timings and thresholds stay neutral. */
	good?: boolean
}

export interface KitBlock {
	/** The kit id (a created kit has its own). */
	id: string
	/**
	 * Vietnamese source label; the view translates it. **Empty** for a kit that only adds stats: those
	 * rows are the item's own numbers, so a title over them would only repeat "Bonus stats".
	 */
	label: string
	/**
	 * Carried **inside the attack above it**: a charged hit or an on-hit effect cannot be used without a
	 * basic attack, so the views draw a connector between the two (asked for: "icon link giữa 2 kit").
	 */
	attached?: boolean
	lines: KitLine[]
}

/** Parameters printed plainly: a cost, a threshold or a timing is never a gain. */
const NEUTRAL_PARAM_KEYS = new Set(['cooldown', 'seNeed', 'cost', 'seCost', 'trigger', 'target', 'directions'])

/** Parameters the item card never lists: the buff area is drawn as arrows on the tile itself. */
const HIDDEN_PARAM_KEYS = new Set(['target', 'directions'])

/**
 * `Hồi chiêu (giây, Cooldown Time)` → `Hồi chiêu`: the parenthetical is **admin guidance** (the unit,
 * or a second spelling), and a player-facing row says the same thing in fewer words.
 */
function shortLabel(label: string): string {
	return label.replace(/\s*\([^)]*\)\s*$/, '')
}

/** `1` → `1`, `1.25` → `1.25`: a multiplier is read as typed, never padded with zeros. */
function multiplier(value: number): string {
	return String(Number(value.toFixed(2)))
}

/**
 * **Every kit of the item, with every parameter it has** — one block per kit, in the item's own order.
 *
 * The charged hit and each on-hit effect are **kits of their own** here too (the admin page draws them
 * that way and the engine runs them from the swing that carries them), so a weapon's list reads:
 * `Basic attack` → `Charged attack` → `Burn on hit` → … → the option kits.
 *
 * ⚠️ Each row is **one stored parameter** (`multiplier`, `cooldown`, `chance`, `duration`, `value`…),
 * printed with its own unit — `×1.2`, `2.75s`, `18%`, `100` Energy points. ❌ No sentence that merges
 * several parameters into one line: the point of this list is that the numbers can be read one by one.
 */
export function itemKitBlocks(template: ItemTemplate, star: Star): KitBlock[] {
	// No damage / DPS rows any more (the multiplier is the number a player compares), so the owner's
	// attack is irrelevant here — `itemFacts` still asks for it.
	const facts = itemFacts(template, star, { attack: 0 })
	const blocks: KitBlock[] = []

	for (const kit of template.kits ?? []) {
		const def = kitDef(kit.id)

		if (def.kind === 'attack') {
			const lines = paramLines(kit, star)
			if (lines.length > 0) blocks.push({ id: kit.id, label: def.label, lines })
			if (kit.charge) {
				const chargeDef = kitDef(kit.charge.id)
				blocks.push({
					id: kit.charge.id,
					label: chargeDef.label,
					attached: true,
					lines: paramLines(kit.charge, star),
				})
			}
			for (const effect of kit.onHit ?? []) {
				blocks.push({ id: effect.id, label: kitDef(effect.id).label, attached: true, lines: paramLines(effect, star) })
			}
			continue
		}

		if (kit.id === 'stats') {
			const lines = facts.mods.map((key) => ({
				key,
				label: STAT_LABELS[key],
				value: formatStat(key, facts.passive?.[key] ?? 0),
				good: true,
			}))
			// A stat-only kit has **no title**: its rows are the item's own numbers, and "Chỉ số cộng
			// thêm" over them said nothing (asked for: "xóa text bonus stats").
			if (lines.length > 0) blocks.push({ id: kit.id, label: '', lines })
			continue
		}

		if (kit.id === 'aura') {
			const lines: KitLine[] = facts.aura
				? [
						{ key: 'target', label: 'Áp dụng cho', value: AURA_TARGET_LABELS[facts.aura.target] },
						...facts.auraMods.map((key) => ({
							key,
							label: STAT_LABELS[key],
							value: formatStat(key, facts.aura?.mods[key] ?? 0),
							good: true,
						})),
					]
				: []
			if (lines.length > 0) blocks.push({ id: kit.id, label: def.label, lines })
			continue
		}

		const lines = paramLines(kit, star)
		// A kit with nothing to report (a broken row) is left out rather than drawn empty.
		if (lines.length > 0) blocks.push({ id: kit.id, label: def.label, lines })
	}

	return blocks
}

/** One row per stored parameter of a kit, with the unit its value is read in. */
function paramLines(kit: ItemKit, star: Star): KitLine[] {
	return kitDef(kit.id)
		.params
		// 🔴 `target` / `directions` are **not** listed: the buff area is drawn on the tile in the bag, and
		// "Choose the buff target · Adjacent sides" in a card said nothing a player could use (asked for).
		.filter((param) => !HIDDEN_PARAM_KEYS.has(param.key))
		.map((param) => ({
			key: param.key,
			label: shortLabel(param.label),
			value: paramText(kit, param.key, star),
			good: !NEUTRAL_PARAM_KEYS.has(param.key),
		}))
}

/** A parameter written the way the item shows it: a multiplier, seconds, a percentage or plain points. */
function paramText(kit: ItemKit, key: string, star: Star): string {
	const value = kitValue(kit, key, star)
	if (key === 'multiplier') return `×${multiplier(value)}`
	// A Cooldown Time is stored in **seconds** and read in seconds; everything else goes through the
	// shared formatter (durations in seconds, percentages with their sign, choices and directions by name).
	if (key === 'cooldown') return `${Number(value.toFixed(2))}s`
	return kitParamText(kit, key, star)
}
/**
 * `750` → `0.75s`: the rhythm of a weapon, in the unit the rest of the UI uses.
 *
 * ⚠️ Up to **two** decimals, trimmed: the admin may type `2.75` s, and `toFixed(1)` printed `2.8` — a
 * number the player cannot find anywhere in the item's own data.
 */
export function seconds(ms: number): string {
	return `${Number((ms / 1000).toFixed(2))}s`
}

export { attackCooldownMs }
