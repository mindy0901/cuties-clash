import type { BagShape, ItemKit, ItemKitId, CutieDef } from './types'
import { mergeCutie, cutieOverride } from './content'

export const GRID_WIDTH = 4
export const MAX_BAG_ROWS = 5
/** Rows the bag starts with; it grows by itself as the cutie levels up. */
export const PET_BAG_BASE_ROWS = 3
/** Levels that add one more row (3 → 4 rows, 5 → 5 rows). Nobody configures this per cutie. */
export const BAG_ROW_LEVELS = [3, 5] as const

/**
 * One value per parameter, repeated into all five slots.
 *
 * A cutie has **levels**, not star ranks: its kits carry a single number each, stored in the same
 * five-slot table as an item's kit so both use one format (`kitValue` reads the first slot).
 */
function petKit(id: ItemKitId, params: Record<string, number>): ItemKit {
	const table: Record<string, number[]> = {}
	for (const [key, value] of Object.entries(params)) {
		table[key] = Array.from({ length: 5 }, () => value)
	}
	return { id, params: table }
}

/** Cuties mirror the three cuties of the event; unlock order follows map clears. */
export const CUTIES: CutieDef[] = [
	{
		id: 'fire-pup',
		name: 'Cẩu Hỏa Sài',
		icon: '🐶',
		art: true,
		skillArt: true,
		blurb: 'Chú chó lửa nhỏ nhưng dai sức — cân bằng giữa công và thủ.',
		unlockStage: 0,
		maxHp: 620,
		maxSe: 100,
		seRegen: 5,
		critRate: 5,
		critDamage: 80,
		attack: 14,
		kits: [petKit('basic-attack', { cooldown: 1.6, multiplier: 1 })],
	},
	{
		id: 'white-rabbit',
		name: 'Bạch Thố',
		icon: '🐰',
		art: true,
		skillArt: true,
		blurb: 'Thỏ trắng nhanh nhẹn — tốc độ đánh cao, máu mỏng hơn.',
		unlockStage: 20,
		maxHp: 560,
		maxSe: 120,
		seRegen: 5,
		critRate: 5,
		critDamage: 80,
		attack: 10,
		kits: [petKit('basic-attack', { cooldown: 1.15, multiplier: 1 })],
	},
	{
		id: 'spirit-cat',
		name: 'Linh Miêu',
		icon: '🐱',
		art: true,
		skillArt: true,
		blurb: 'Mèo linh hồn — máu dày, hồi Kiếm Thế mạnh, Chấn Đao uy lực.',
		unlockStage: 40,
		maxHp: 760,
		maxSe: 130,
		seRegen: 5,
		critRate: 5,
		critDamage: 80,
		attack: 18,
		kits: [petKit('basic-attack', { cooldown: 1.45, multiplier: 1 })],
	},
]

export const CUTIE_BY_ID: Record<string, CutieDef> = Object.fromEntries(CUTIES.map((cutie) => [cutie.id, cutie]))

export const MAX_CUTIE_LEVEL = 10

/**
 * Health, base attack and Sword Energy regen gained **per Cutie level**, as a share of the level-1
 * number.
 *
 * Defined from the target rather than a round percentage: a Cutie at `MAX_CUTIE_LEVEL` must hold
 * exactly **twice** its level-1 max HP, attack and regen, so one level is `1 / (MAX_CUTIE_LEVEL - 1)`
 * (≈11.11 %). A Cutie therefore reads 5 → 10 Kiếm Thế/s over its ten levels.
 */
export const CUTIE_GROWTH_PER_LEVEL = 1 / (MAX_CUTIE_LEVEL - 1)

export function getCutie(cutieId: string): CutieDef {
	const cutie = CUTIE_BY_ID[cutieId]
	if (!cutie) throw new Error(`Unknown cutie: ${cutieId}`)
	return mergeCutie(cutie, cutieOverride(cutieId))
}

/** Every cutie **with the admin overlay applied** — for places that need the whole set (unlocks). */
export function cutieList(): CutieDef[] {
	return CUTIES.map((cutie) => getCutie(cutie.id))
}

/**
 * **Skill slots of a Cutie — two, and both empty for now.**
 *
 * The skill system is not built yet: nothing in `build.ts` / `battle.ts` reads a skill, so no skill
 * can activate. The slots are drawn on the battle avatar so the layout is final; filling them is a
 * later change that must start here (this constant) instead of adding a one-off field.
 */
export const CUTIE_SKILL_SLOTS = 2

/** The bag of one level: the base grid plus one row at level 3 and one at level 5. */
export function cutieBag(level: number): BagShape {
	const steps = BAG_ROW_LEVELS.filter((entry) => level >= entry).length
	return { width: GRID_WIDTH, rows: Math.min(MAX_BAG_ROWS, PET_BAG_BASE_ROWS + steps) }
}

export function cutieLevelStats(cutie: CutieDef, level: number) {
	const step = Math.min(Math.max(level, 1), MAX_CUTIE_LEVEL) - 1
	const bag = cutieBag(level)
	return {
		maxHp: Math.round(cutie.maxHp * (1 + CUTIE_GROWTH_PER_LEVEL * step)),
		maxSe: cutie.maxSe,
		/** Kiếm Thế per second — the same growth as health, so 5/s at level 1 and 10/s at level 10. */
		seRegen: Math.round(cutie.seRegen * (1 + CUTIE_GROWTH_PER_LEVEL * step)),
		/** Base attack the cutie's attack kits scale; it grows with the level like its health. */
		attack: Math.round(cutie.attack * (1 + CUTIE_GROWTH_PER_LEVEL * step)),
		bag,
		bagSize: bag.width * bag.rows,
	}
}

/**
 * The number every **item** kit is a multiplier of: the cutie's own attack.
 *
 * An item has no damage of its own any more, so a view that wants to print "30 damage" has to ask
 * for the owner first. ⚠️ A kit's rhythm is **not** owner-relative either: its `cooldown` is a plain
 * Cooldown Time in seconds, so the owner contributes nothing to it.
 */
export function cutieOwnerStats(cutie: CutieDef, level: number): { attack: number } {
	return { attack: cutieLevelStats(cutie, level).attack }
}

/**
 * The **rendered grid always has `MAX_BAG_ROWS` rows**, even when the cutie level is not high enough.
 * Cells past `bagSize` are **locked** — dimmed and not usable yet.
 */
export const GRID_MAX_ROWS = MAX_BAG_ROWS
export const GRID_MAX_CELLS = GRID_WIDTH * GRID_MAX_ROWS

/** Vàng needed to reach the next cutie level. */
export function cutieUpgradeCost(level: number): number {
	return 12 + (level - 1) * 10
}
