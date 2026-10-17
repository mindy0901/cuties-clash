import { REROLL_COST, rollShop } from './economy'
import { ITEM_BY_ID, MAX_STAR } from './items'
import { repairStorageSlots } from './storage'
import { PETS, getPet, petLevelStats } from './pets'
import { FINAL_STAGE } from './stages'
import type { ItemInstance, RunState, ShopOffer } from './types'

/**
 * Normalise a `RunState` read from a save.
 *
 * A save can break in many ways: a missing newly added field, a `petId` that no longer exists,
 * `equipped`/`inventory` being `undefined`, or an item pointing at a deleted template. If any of
 * those slip through, `run.equipped.filter(...)` throws during render and **the whole page goes
 * blank** — leaving the player no UI to press "Chơi lại".
 *
 * Rule: every field must be valid once this returns. A broken field is replaced by a safe default,
 * it does NOT throw.
 */
export function sanitizeRun(candidate: unknown): RunState {
	const saved = (candidate ?? {}) as Partial<RunState>
	const fallbackPet = PETS[0].id
	const petId = typeof saved.petId === 'string' && PETS.some((pet) => pet.id === saved.petId) ? saved.petId : fallbackPet

	// pets: keep only valid ids, with the level clamped to 1..5.
	const pets: Record<string, number> = { [fallbackPet]: 1 }
	if (saved.pets && typeof saved.pets === 'object') {
		for (const pet of PETS) {
			const raw = (saved.pets as Record<string, unknown>)[pet.id]
			if (typeof raw === 'number' && Number.isFinite(raw)) {
				pets[pet.id] = Math.min(5, Math.max(1, Math.round(raw)))
			}
		}
	}
	if (!pets[petId]) pets[petId] = 1

	const unlockedPets = Array.isArray(saved.unlockedPets)
		? PETS.filter((pet) => pet.unlockStage === 0 || saved.unlockedPets!.includes(pet.id)).map((pet) => pet.id)
		: [fallbackPet]
	if (!unlockedPets.includes(petId)) unlockedPets.push(petId)

	const stage = clampInt(saved.stage, 1, FINAL_STAGE, 1)
	const clearedStage = clampInt(saved.clearedStage, 0, FINAL_STAGE, 0)
	const seed = clampInt(saved.seed, 0, 0xffffffff, 20261016)
	const bagSize = petLevelStats(getPet(petId), pets[petId]).bagSize

	// Worn items that no longer fit the current grid are pushed to the storage (see `sanitizeItems`).
	const equippedRaw = sanitizeItems(saved.equipped, bagSize)
	const equipped = equippedRaw.filter((item) => item.slot >= 0)
	const kickedToInventory = equippedRaw.filter((item) => item.slot < 0)
	// The storage is a **free grid**: keep the positions the player chose and only re-lay items that
	// are missing a cell (old saves used `slot: -1`) or that collide.
	const inventory = repairStorageSlots([...sanitizeItems(saved.inventory, null), ...kickedToInventory])

	return {
		petId,
		pets,
		unlockedPets,
		currency: clampInt(saved.currency, 0, 1_000_000, 0),
		stage,
		clearedStage,
		equipped,
		inventory,
		seed,
		shop: sanitizeShop(saved.shop, stage, seed),
		rerolls: clampInt(saved.rerolls, 0, 100_000, 0),
		wins: clampInt(saved.wins, 0, 1_000_000, 0),
		losses: clampInt(saved.losses, 0, 1_000_000, 0),
	}
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
	return Math.min(max, Math.max(min, Math.round(value)))
}

function isKnownTemplate(templateId: unknown): templateId is string {
	return typeof templateId === 'string' && Boolean(ITEM_BY_ID[templateId])
}

/**
 * Filter an item list: drop items pointing at a template that no longer exists and items missing a
 * `uid`.
 *
 * `limit` is the number of valid cells when the item lives in the **equip grid**; an item with a
 * cell outside the grid (for example a save from a higher pet level) is returned as `slot: -1` so
 * the caller can move it to the storage — leaving it in `equipped` with `slot: -1` would make it
 * invisible in both panels.
 *
 * ⚠️ `limit = null` is used for the **storage**: it is a free grid, so every non-negative cell is
 * valid, and items missing a cell are laid out right afterwards by `repairStorageSlots`.
 */
function sanitizeItems(value: unknown, limit: number | null): ItemInstance[] {
	if (!Array.isArray(value)) return []
	const result: ItemInstance[] = []
	const seen = new Set<string>()
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') continue
		const item = entry as Partial<ItemInstance>
		if (typeof item.uid !== 'string' || !item.uid || seen.has(item.uid)) continue
		if (!isKnownTemplate(item.templateId)) continue
		seen.add(item.uid)
		const slot = typeof item.slot === 'number' && Number.isFinite(item.slot) ? Math.round(item.slot) : -1
		const fits = slot >= 0 && (limit === null || slot < limit)
		result.push({
			uid: item.uid,
			templateId: item.templateId,
			star: clampInt(item.star, 1, MAX_STAR, 1) as ItemInstance['star'],
			slot: fits ? slot : -1,
			rotated: fits ? Boolean(item.rotated) : false,
			paid: clampInt(item.paid, 0, 1_000_000, 0),
		})
	}
	return result
}

/** Shop: keep the valid offers; when the list is broken, roll it again from the seed. */
function sanitizeShop(value: unknown, stage: number, seed: number): ShopOffer[] {
	if (!Array.isArray(value) || value.length === 0) return rollShop(stage, seed)
	const offers: ShopOffer[] = []
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') return rollShop(stage, seed)
		const offer = entry as Partial<ShopOffer>
		if (!isKnownTemplate(offer.templateId)) return rollShop(stage, seed)
		offers.push({
			templateId: offer.templateId,
			star: clampInt(offer.star, 1, MAX_STAR, 1) as ShopOffer['star'],
			cost: clampInt(offer.cost, 0, 100_000, REROLL_COST),
			sold: Boolean(offer.sold),
		})
	}
	return offers
}
