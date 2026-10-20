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
import { STAT_KEYS } from '../game/stats'
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
	return String(Number(value.toFixed(2)))
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
	}
}

/** `7.5` → `7.5s`: the rhythm of a weapon, in the unit the rest of the UI uses. */
export function seconds(ms: number): string {
	return `${Number((ms / 1000).toFixed(1))}s`
}

export { attackCooldownMs }
