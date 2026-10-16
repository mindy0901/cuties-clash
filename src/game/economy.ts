import { ITEM_TEMPLATES, starPrice } from './items'
import { createRng } from './rng'
import { stageTier } from './stages'
import type { ShopOffer, Star } from './types'

export const SHOP_SIZE = 5
export const REROLL_COST = 2
export const STARTING_CURRENCY = 12

/** Chance for an offer to be upgraded to a higher star, by map. */
function starChances(stageIndex: number): number[] {
	const tier = stageTier(stageIndex)
	if (tier === 3) return [0.2, 0.24, 0.05]
	if (tier === 2) return [0.3, 0.12, 0]
	return [0.35, 0.03, 0]
}

export function rollShop(stageIndex: number, seed: number): ShopOffer[] {
	const tier = stageTier(stageIndex)
	const pool = ITEM_TEMPLATES.filter((template) => template.tier <= tier)
	const rng = createRng(seed >>> 0)
	const chances = starChances(stageIndex)
	const offers: ShopOffer[] = []
	for (let index = 0; index < SHOP_SIZE; index += 1) {
		const template = rng.pick(pool)
		const roll = rng.next()
		let star: Star = 1
		if (roll < chances[2] && pool.some((entry) => entry.tier === 3)) star = 4
		else if (roll < chances[2] + chances[1]) star = 3
		else if (roll < chances[2] + chances[1] + chances[0]) star = 2
		offers.push({ templateId: template.id, star, cost: starPrice(template.cost, star), sold: false })
	}
	return offers
}
