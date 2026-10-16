import { canPlace, createItemInstance, findFreePlacement, resolveDrop, rotateItem, templateFootprint } from './bag'
import { GRID_MAX_ROWS, getPet, petLevelStats } from './pets'
import { makeUid } from './rng'
import type { ItemInstance, RunState, Star } from './types'

/**
 * Hình dạng lưới trang bị: **luôn đủ `GRID_MAX_ROWS` hàng** (4×5 = 20 ô), còn `usable` là số
 * ô **dùng được** theo cấp thú — phần vượt `usable` là **ô khoá**.
 *
 * ⚠️ Phải tách hai con số này: dùng `usable` làm kích thước lưới thì món không thể nằm ở
 * hàng khoá (đúng), nhưng lưới chỉ cao 3 hàng nên giao diện thiếu ô.
 */
export function loadoutShape(run: RunState) {
	const { bag, bagSize } = petLevelStats(getPet(run.petId), run.pets[run.petId] ?? 1)
	return { width: bag.width, rows: GRID_MAX_ROWS, size: bag.width * GRID_MAX_ROWS, usable: bagSize }
}

/** Những món đang được mang (có ô trong vùng **dùng được** của lưới trang bị). */
export function equippedItems(run: RunState): ItemInstance[] {
	const { usable } = loadoutShape(run)
	return run.equipped.filter((item) => item.slot >= 0 && item.slot < usable)
}

/** Tạo một đồ vật mới ở kho (chưa mang). */
export function inventoryItem(run: RunState, templateId: string, star: Star, seed: number): ItemInstance {
	return createItemInstance(templateId, star, makeUid(seed, `${templateId}-${run.inventory.length}`))
}

/**
 * Mua một món: cố gắng mang lên trang bị trước, hết chỗ thì cất vào kho.
 *
 * Giống hành vi gốc — mua đồ mà trang bị còn slot thì dùng được ngay, nếu không thì
 * vào kho để sau.
 */
export function acquireItem(
	run: RunState,
	templateId: string,
	star: Star,
	seed: number,
): { run: RunState; wentToInventory: boolean } {
	const add = inventoryItem(run, templateId, star, seed)
	const { width, size, usable } = loadoutShape(run)
	const placement = findFreePlacement(run.equipped, templateId, width, size, usable)
	if (!placement) {
		return { run: { ...run, inventory: [...run.inventory, add] }, wentToInventory: true }
	}
	const item: ItemInstance = { ...add, slot: placement.slot, rotated: placement.rotated }
	return { run: { ...run, equipped: [...run.equipped, item] }, wentToInventory: false }
}

export type TransferResult =
	| { ok: true; run: RunState }
	| { ok: false; reason: 'not-found' | 'no-space' }

/**
 * Kho → trang bị **vào đúng ô đã chọn** (ô con trỏ), với hướng đã chọn.
 *
 * Trả `{ ok: false, reason: 'no-space' }` khi hướng đó không vừa ô — chỗ gọi nên lùi về
 * `equipFromInventory` để store tự tìm chỗ (hàm đó thử cả hai hướng).
 */
export function equipFromInventoryAt(
	run: RunState,
	uid: string,
	slot: number,
	rotated: boolean,
): TransferResult {
	const item = run.inventory.find((entry) => entry.uid === uid)
	if (!item) return { ok: false, reason: 'not-found' }
	const { width, size, usable } = loadoutShape(run)
	const footprint = templateFootprint(item.templateId, rotated)
	if (!canPlace(run.equipped, [], slot, footprint, width, size, usable)) return { ok: false, reason: 'no-space' }
	return {
		ok: true,
		run: {
			...run,
			inventory: run.inventory.filter((entry) => entry.uid !== uid),
			equipped: [...run.equipped, { ...item, slot, rotated }],
		},
	}
}

/** Kho → trang bị: tự tìm chỗ trống, **thử cả hai hướng** (xoay nếu hướng gốc không vừa). */
export function equipFromInventory(run: RunState, uid: string): TransferResult {
	const item = run.inventory.find((entry) => entry.uid === uid)
	if (!item) return { ok: false, reason: 'not-found' }
	const { width, size, usable } = loadoutShape(run)
	const placement = findFreePlacement(run.equipped, item.templateId, width, size, usable)
	if (!placement) return { ok: false, reason: 'no-space' }
	return {
		ok: true,
		run: {
			...run,
			inventory: run.inventory.filter((entry) => entry.uid !== uid),
			equipped: [...run.equipped, { ...item, slot: placement.slot, rotated: placement.rotated }],
		},
	}
}

/** Trang bị → kho: bỏ ra khỏi lưới, kho không giới hạn nên luôn thành công. */
export function unequipToInventory(run: RunState, uid: string): TransferResult {
	const item = run.equipped.find((entry) => entry.uid === uid)
	if (!item) return { ok: false, reason: 'not-found' }
	return {
		ok: true,
		run: {
			...run,
			equipped: run.equipped.filter((entry) => entry.uid !== uid),
			inventory: [...run.inventory, { ...item, slot: -1, rotated: false }],
		},
	}
}

/** Bán một món ở kho hoặc ở trang bị; hoàn 50% giá đã trả. */
export function sellItem(run: RunState, uid: string, refund: number): RunState {
	return {
		...run,
		currency: run.currency + refund,
		equipped: run.equipped.filter((item) => item.uid !== uid),
		inventory: run.inventory.filter((item) => item.uid !== uid),
	}
}

/** Xoay một món đang mang. Trả nguyên trạng nếu hướng mới không vừa. */
export function rotateEquipped(run: RunState, uid: string): RunState {
	const { width, size, usable } = loadoutShape(run)
	const next = rotateItem(run.equipped, uid, width, size, usable)
	return next ? { ...run, equipped: next } : run
}

/** Kéo thả trong lưới trang bị. */
export function dropEquipped(run: RunState, uid: string, slot: number, rotated?: boolean) {
	const { width, size, usable } = loadoutShape(run)
	const result = resolveDrop(run.equipped, uid, slot, width, size, rotated, usable)
	return {
		run: { ...run, equipped: result.items },
		merged: result.merged,
		reason: result.reason,
	}
}

/** Tính giá bán của một món (50% số đã trả). */
export function refundOf(item: ItemInstance): number {
	return Math.max(1, Math.floor(item.paid / 2))
}
