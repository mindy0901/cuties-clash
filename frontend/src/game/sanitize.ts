import { REROLL_COST, rollShop } from './economy'
import { contentResolved } from './content'
import { itemTemplateById, MAX_STAR } from './items'
import { repairStorageSlots } from './storage'
import { MAX_CUTIE_LEVEL, CUTIES, getCutie, cutieLevelStats } from './cuties'
import { FINAL_STAGE } from './stages'
import type { ItemInstance, RunState, ShopOffer } from './types'

export interface SanitizeOptions {
	/**
	 * Keep items whose template is not in the catalogue.
	 *
	 * 🔴 The store rehydrates during **module import**, before `/api/content` can answer, so at that
	 * moment a created item (`melting-ice`) looks exactly like a deleted one. Dropping it there eats
	 * the item out of the player's bag on every reload. Default: keep them until the overlay is
	 * resolved (`contentResolved()`); the store prunes the truly deleted ones afterwards.
	 */
	keepUnknownTemplates?: boolean
}

/**
 * Normalise a `RunState` read from a save.
 *
 * A save can break in many ways: a missing newly added field, a `cutieId` that no longer exists,
 * `equipped`/`inventory` being `undefined`, or an item pointing at a deleted template. If any of
 * those slip through, `run.equipped.filter(...)` throws during render and **the whole page goes
 * blank** — leaving the player no UI to press "Chơi lại".
 *
 * Rule: every field must be valid once this returns. A broken field is replaced by a safe default,
 * it does NOT throw.
 */
/**
 * Gold from a save, including the pre-rename field name.
 *
 * The currency was called `currency` until it became gold. An older save (localStorage or the copy on
 * the server) still carries that name, and dropping it would silently reset a player's money to 0 —
 * so both spellings are read, and only the new one is written back.
 */
function legacyGold(saved: Partial<RunState> & { currency?: unknown }): unknown {
	return saved.gold ?? saved.currency
}

/**
 * The three save fields that were renamed when the domain word went from `pet` to **cutie**.
 *
 * 🔴 Same rule as `legacyGold`: an old save (localStorage **or** the copy on the server, which never
 * goes through the zustand `migrate`) still carries `petId` / `pets` / `unlockedPets`. Reading only
 * the new names would silently reset a player's Cutie to the first one, drop every level and lock the
 * Cuties they had unlocked — so both spellings are read and only the new one is written back.
 */
interface LegacyPetRun {
	petId?: unknown
	pets?: unknown
	unlockedPets?: unknown
}

export function sanitizeRun(candidate: unknown, options: SanitizeOptions = {}): RunState {
	const keepUnknown = options.keepUnknownTemplates ?? !contentResolved()
	const saved = (candidate ?? {}) as Partial<RunState>
	const legacy = saved as Partial<RunState> & LegacyPetRun
	const savedCutieId = typeof saved.cutieId === 'string' ? saved.cutieId : legacy.petId
	const savedCuties = (saved.cuties ?? legacy.pets) as Record<string, unknown> | undefined
	const savedUnlocked = Array.isArray(saved.unlockedCuties)
		? saved.unlockedCuties
		: Array.isArray(legacy.unlockedPets)
			? (legacy.unlockedPets as string[])
			: undefined
	const fallbackPet = CUTIES[0].id
	const cutieId = typeof savedCutieId === 'string' && CUTIES.some((cutie) => cutie.id === savedCutieId) ? savedCutieId : fallbackPet

	// cuties: keep only valid ids, with the level clamped to 1..MAX_CUTIE_LEVEL.
	const cuties: Record<string, number> = { [fallbackPet]: 1 }
	if (savedCuties && typeof savedCuties === 'object') {
		for (const cutie of CUTIES) {
			const raw = savedCuties[cutie.id]
			if (typeof raw === 'number' && Number.isFinite(raw)) {
				cuties[cutie.id] = Math.min(MAX_CUTIE_LEVEL, Math.max(1, Math.round(raw)))
			}
		}
	}
	if (!cuties[cutieId]) cuties[cutieId] = 1

	const unlockedCuties = savedUnlocked
		? CUTIES.filter((cutie) => cutie.unlockStage === 0 || savedUnlocked.includes(cutie.id)).map((cutie) => cutie.id)
		: [fallbackPet]
	if (!unlockedCuties.includes(cutieId)) unlockedCuties.push(cutieId)

	const stage = clampInt(saved.stage, 1, FINAL_STAGE, 1)
	const clearedStage = clampInt(saved.clearedStage, 0, FINAL_STAGE, 0)
	const seed = clampInt(saved.seed, 0, 0xffffffff, 20261016)
	const bagSize = cutieLevelStats(getCutie(cutieId), cuties[cutieId]).bagSize

	// Worn items that no longer fit the current grid are pushed to the storage (see `sanitizeItems`).
	const equippedRaw = sanitizeItems(saved.equipped, bagSize, keepUnknown)
	const equipped = equippedRaw.filter((item) => item.slot >= 0)
	const kickedToInventory = equippedRaw.filter((item) => item.slot < 0)
	// The storage is a **free grid**: keep the positions the player chose and only re-lay items that
	// are missing a cell (old saves used `slot: -1`) or that collide.
	const inventory = repairStorageSlots([
		...sanitizeItems(saved.inventory, null, keepUnknown),
		...kickedToInventory,
	])

	return {
		cutieId,
		cuties,
		unlockedCuties,
		gold: clampInt(legacyGold(saved), 0, 1_000_000, 0),
		stage,
		clearedStage,
		equipped,
		inventory,
		seed,
		shop: sanitizeShop(saved.shop, stage, clearedStage, seed, keepUnknown),
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
	return typeof templateId === 'string' && Boolean(itemTemplateById(templateId))
}

/**
 * Filter an item list: drop items pointing at a template that no longer exists and items missing a
 * `uid`.
 *
 * `limit` is the number of valid cells when the item lives in the **equip grid**; an item with a
 * cell outside the grid (for example a save from a higher cutie level) is returned as `slot: -1` so
 * the caller can move it to the storage — leaving it in `equipped` with `slot: -1` would make it
 * invisible in both panels.
 *
 * ⚠️ `limit = null` is used for the **storage**: it is a free grid, so every non-negative cell is
 * valid, and items missing a cell are laid out right afterwards by `repairStorageSlots`.
 */
function sanitizeItems(value: unknown, limit: number | null, keepUnknown: boolean): ItemInstance[] {
	if (!Array.isArray(value)) return []
	const result: ItemInstance[] = []
	const seen = new Set<string>()
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') continue
		const item = entry as Partial<ItemInstance>
		if (typeof item.uid !== 'string' || !item.uid || seen.has(item.uid)) continue
		const templateId = item.templateId
		if (typeof templateId !== 'string' || !templateId) continue
		// A template that is unknown **before** the overlay resolves may be a created item that is
		// about to arrive — keep it (see `SanitizeOptions.keepUnknownTemplates`).
		if (!keepUnknown && !isKnownTemplate(templateId)) continue
		seen.add(item.uid)
		const slot = typeof item.slot === 'number' && Number.isFinite(item.slot) ? Math.round(item.slot) : -1
		const fits = slot >= 0 && (limit === null || slot < limit)
		result.push({
			uid: item.uid,
			templateId,
			star: clampInt(item.star, 1, MAX_STAR, 1) as ItemInstance['star'],
			slot: fits ? slot : -1,
			rotated: fits ? Boolean(item.rotated) : false,
			paid: clampInt(item.paid, 0, 1_000_000, 0),
		})
	}
	return result
}

/** Shop: keep the valid offers; when the list is broken, roll it again from the seed. */
function sanitizeShop(
	value: unknown,
	stage: number,
	clearedStage: number,
	seed: number,
	keepUnknown: boolean,
): ShopOffer[] {
	if (!Array.isArray(value) || value.length === 0) return rollShop(stage, clearedStage, seed)
	const offers: ShopOffer[] = []
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') return rollShop(stage, clearedStage, seed)
		const offer = entry as Partial<ShopOffer>
		const templateId = offer.templateId
		if (typeof templateId !== 'string' || !templateId) return rollShop(stage, clearedStage, seed)
		// Same rule as the bag: an id the overlay has not delivered yet is not a deleted one.
		if (!keepUnknown && !isKnownTemplate(templateId)) return rollShop(stage, clearedStage, seed)
		offers.push({
			templateId,
			star: clampInt(offer.star, 1, MAX_STAR, 1) as ShopOffer['star'],
			cost: clampInt(offer.cost, 0, 100_000, REROLL_COST),
			sold: Boolean(offer.sold),
		})
	}
	return offers
}
