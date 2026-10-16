import { REROLL_COST, rollShop } from './economy'
import { ITEM_BY_ID } from './items'
import { repairKhoSlots } from './kho'
import { PETS, getPet, petLevelStats } from './pets'
import { FINAL_STAGE } from './stages'
import type { ItemInstance, RunState, ShopOffer } from './types'

/**
 * Chuẩn hoá một `RunState` đọc từ bản lưu.
 *
 * Bản lưu có thể hỏng theo nhiều cách: thiếu trường mới thêm, `petId` không còn tồn
 * tại, `equipped`/`inventory` là `undefined`, hay món trỏ tới template đã bị xoá.
 * Nếu để lọt, `run.equipped.filter(...)` ném lỗi ngay lúc render và **cả trang
 * trắng** — không có UI để người chơi bấm "Chơi lại".
 *
 * Nguyên tắc: mọi trường đều phải hợp lệ sau hàm này. Trường hỏng thì thay bằng
 * mặc định an toàn, KHÔNG ném lỗi.
 */
export function sanitizeRun(candidate: unknown): RunState {
	const saved = (candidate ?? {}) as Partial<RunState>
	const fallbackPet = PETS[0].id
	const petId = typeof saved.petId === 'string' && PETS.some((pet) => pet.id === saved.petId) ? saved.petId : fallbackPet

	// pets: chỉ giữ id hợp lệ, cấp trong khoảng 1..5.
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

	// Món trang bị không còn vừa lưới hiện tại bị đẩy về kho (xem `sanitizeItems`).
	const equippedRaw = sanitizeItems(saved.equipped, bagSize)
	const equipped = equippedRaw.filter((item) => item.slot >= 0)
	const kickedToInventory = equippedRaw.filter((item) => item.slot < 0)
	// Kho là **lưới tự do**: giữ nguyên vị trí người chơi đã đặt, chỉ xếp lại món thiếu ô
	// (bản lưu cũ dùng `slot: -1`) hoặc trùng ô.
	const inventory = repairKhoSlots([...sanitizeItems(saved.inventory, null), ...kickedToInventory])

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
 * Lọc danh sách món: bỏ món trỏ tới template không còn tồn tại và món thiếu `uid`.
 *
 * `limit` là số ô hợp lệ khi món nằm trong **lưới trang bị**; món có ô ngoài lưới (ví dụ bản
 * lưu của cấp thú cao hơn) được trả về dạng `slot: -1` để hàm gọi chuyển nó sang kho — nếu để
 * nguyên trong `equipped` với `slot: -1` thì món vô hình ở cả hai panel.
 *
 * ⚠️ `limit = null` dùng cho **kho**: kho là lưới tự do nên mọi ô không âm đều hợp lệ, và món
 * thiếu ô được xếp lại ngay sau đó bằng `repairKhoSlots`.
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
			star: clampInt(item.star, 1, 4, 1) as ItemInstance['star'],
			slot: fits ? slot : -1,
			rotated: fits ? Boolean(item.rotated) : false,
			paid: clampInt(item.paid, 0, 1_000_000, 0),
		})
	}
	return result
}

/** Cửa hàng: giữ món hợp lệ; nếu danh sách hỏng thì roll lại từ seed. */
function sanitizeShop(value: unknown, stage: number, seed: number): ShopOffer[] {
	if (!Array.isArray(value) || value.length === 0) return rollShop(stage, seed)
	const offers: ShopOffer[] = []
	for (const entry of value) {
		if (!entry || typeof entry !== 'object') return rollShop(stage, seed)
		const offer = entry as Partial<ShopOffer>
		if (!isKnownTemplate(offer.templateId)) return rollShop(stage, seed)
		offers.push({
			templateId: offer.templateId,
			star: clampInt(offer.star, 1, 4, 1) as ShopOffer['star'],
			cost: clampInt(offer.cost, 0, 100_000, REROLL_COST),
			sold: Boolean(offer.sold),
		})
	}
	return offers
}
