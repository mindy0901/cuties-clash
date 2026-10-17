import { itemTemplatesUpToTier, starPrice } from './items'
import { createRng } from './rng'
import { stageTier } from './stages'
import type { ShopOffer, Star } from './types'

export const SHOP_SIZE = 5
export const REROLL_COST = 2
export const STARTING_CURRENCY = 12

/**
 * Chance that an offer already comes upgraded, by map tier.
 *
 * ⚠️ Deliberately tiny (0.5% / 0.1%) and capped at **3★ in the last map**: a shop item above 3★
 * would sell for a fraction of the sixteen copies a 5★ is made of, which breaks the economy.
 * Map 1 never rolls an upgrade — the shop starts plain.
 */
function starChances(stageIndex: number): { two: number; three: number } {
	const tier = stageTier(stageIndex)
	if (tier === 3) return { two: 0.005, three: 0.001 }
	if (tier === 2) return { two: 0.005, three: 0 }
	return { two: 0, three: 0 }
}

export function rollShop(stageIndex: number, seed: number): ShopOffer[] {
	const tier = stageTier(stageIndex)
	const pool = itemTemplatesUpToTier(tier)
	const rng = createRng(seed >>> 0)
	const chances = starChances(stageIndex)
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
