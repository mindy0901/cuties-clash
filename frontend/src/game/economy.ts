import { itemTemplatesUpToTier, starPrice } from './items'
import { createRng } from './rng'
import { FINAL_STAGE, stageTier } from './stages'
import type { ShopOffer, Star } from './types'

export const SHOP_SIZE = 5
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

/** Roll the shop for `stageIndex`; `clearedStage` decides whether upgraded offers are allowed. */
export function rollShop(stageIndex: number, clearedStage: number, seed: number): ShopOffer[] {
	const tier = stageTier(stageIndex)
	const pool = itemTemplatesUpToTier(tier)
	const rng = createRng(seed >>> 0)
	const chances = starChances(clearedStage)
	const offers: ShopOffer[] = []
	for (let index = 0; index < SHOP_SIZE; index += 1) {
		const template = rng.pick(pool)
		const roll = rng.next()
		let star: Star = 1
		if (roll < chances.three) star = 3
		else if (roll < chances.three + chances.two) star = 2
		offers.push({ templateId: template.id, star, cost: starPrice(template.cost, star), sold: false })
	}
	return offers
}
