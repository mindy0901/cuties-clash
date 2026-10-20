import { QUALITY_VALUES, itemTemplatesUpToTier, starPrice } from './items'
import { createRng } from './rng'
import { FINAL_STAGE, stageTier } from './stages'
import type { ItemTemplate, Quality, ShopOffer, Star } from './types'

/**
 * Offers per shop roll — **one per cell of the 2×3 board** (`shop` grid in `ShopScreen`).
 *
 * ⚠️ It is 6 on purpose: rolling 5 left one board slot empty after every reroll, and a slot that
 * never gets an item reads as a bug ("the shop keeps one broken cell"). If the board shape ever
 * changes, change this with it — ❌ never pad the grid with empty cells instead.
 */
export const SHOP_SIZE = 6
export const REROLL_COST = 2
export const STARTING_CURRENCY = 12

/** Cleared stage from which the shop may already offer a 2★ item. */
export const STAR_TWO_FROM_CLEARED = 40
/** Chance of that upgrade, per offer. */
export const STAR_TWO_CHANCE = 0.005
/** Chance of an already 3★ item — only once the whole ladder is cleared. */
export const STAR_THREE_CHANCE = 0.001

/**
 * Chance that an offer already comes upgraded, from the stage the player has **cleared** — the shop
 * is a reward for progress, not for the map being open:
 * - cleared **40** → 0.5% of an offer is already 2★;
 * - cleared **60** (the whole ladder) → those 2★ plus 0.1% of an offer already 3★.
 *
 * ⚠️ ❌ Never 4★–5★: a shop item above 3★ would sell for a fraction of the copies it is made of.
 */
function starChances(clearedStage: number): { two: number; three: number } {
	if (clearedStage >= FINAL_STAGE) return { two: STAR_TWO_CHANCE, three: STAR_THREE_CHANCE }
	if (clearedStage >= STAR_TWO_FROM_CLEARED) return { two: STAR_TWO_CHANCE, three: 0 }
	return { two: 0, three: 0 }
}

/**
 * The odds that **one shop offer** comes out at each star, read straight from `starChances()` — the
 * same numbers `rollShop()` actually rolls, so the shop's info panel can never drift from the code.
 *
 * Only the **cleared** stage matters (see `starChances`); the map being open is not progress.
 */
export function shopStarOdds(clearedStage: number): { one: number; two: number; three: number } {
	const chances = starChances(clearedStage)
	return { one: 1 - chances.two - chances.three, two: chances.two, three: chances.three }
}

/**
 * Rarity **weight** of each quality band — the shop rolls on quality as well as on tier and star.
 *
 * `1` is the baseline; every band above it is rarer, so a gold-orange (5) item shows up ~1/60th as
 * often as a silver (1) one from the same pool. ⚠️ A weight is **relative to the pool**: it is not a
 * percentage, and the real chance of a band is `band weight ÷ total weight of the pool` (see
 * `shopQualityOdds`). Changing a number here changes the real odds immediately — there is no second
 * table to keep in sync.
 */
export const QUALITY_WEIGHTS: Record<Quality, number> = { 1: 100, 2: 45, 3: 18, 4: 6, 5: 1.5 }

/** Weight of one quality band; an out-of-range value can never be silently 100 %. */
export function qualityWeight(quality: Quality): number {
	return QUALITY_WEIGHTS[quality] ?? 1
}

/**
 * Pick one template, **weighted by its quality band**.
 *
 * ⚠️ Uses exactly one `rng.next()` per pick, like `rng.pick()` did, so a seed still replays the same
 * shop — only the distribution changed.
 */
function pickWeighted(rng: { next: () => number }, pool: readonly ItemTemplate[]): ItemTemplate {
	const total = pool.reduce((sum, template) => sum + qualityWeight(template.quality), 0)
	let target = rng.next() * total
	for (const template of pool) {
		target -= qualityWeight(template.quality)
		if (target < 0) return template
	}
	// Floating point: the last item catches the remainder instead of returning `undefined`.
	return pool[pool.length - 1]
}

/**
 * Chance that **one shop offer** comes out at each quality band, for the pool of `stageIndex`.
 *
 * Derived from `QUALITY_WEIGHTS` and the live catalogue, ❌ not written by hand: the shop's info
 * panel and `rollShop()` therefore can never disagree. Bands with no item in the pool report `0`, and
 * a band can be missing from the list only if it does not exist at that tier.
 */
export function shopQualityOdds(stageIndex: number): { quality: Quality; chance: number; count: number }[] {
	const pool = itemTemplatesUpToTier(stageTier(stageIndex))
	const total = pool.reduce((sum, template) => sum + qualityWeight(template.quality), 0)
	return QUALITY_VALUES.map((quality) => {
		const inBand = pool.filter((template) => template.quality === quality)
		const weight = inBand.reduce((sum, template) => sum + qualityWeight(template.quality), 0)
		return { quality, chance: total === 0 ? 0 : weight / total, count: inBand.length }
	})
}

/** Roll the shop for `stageIndex`; `clearedStage` decides whether upgraded offers are allowed. */
export function rollShop(stageIndex: number, clearedStage: number, seed: number): ShopOffer[] {
	const tier = stageTier(stageIndex)
	const pool = itemTemplatesUpToTier(tier)
	// No item of that tier exists yet (the admin has not created any): an empty shop, never a crash.
	if (pool.length === 0) return []
	const rng = createRng(seed >>> 0)
	const chances = starChances(clearedStage)
	const offers: ShopOffer[] = []
	for (let index = 0; index < SHOP_SIZE; index += 1) {
		const template = pickWeighted(rng, pool)
		const roll = rng.next()
		let star: Star = 1
		if (roll < chances.three) star = 3
		else if (roll < chances.three + chances.two) star = 2
		offers.push({ templateId: template.id, star, cost: starPrice(template.cost, star), sold: false })
	}
	return offers
}
