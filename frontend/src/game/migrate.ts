import { repairKhoSlots } from './kho'
import { petLevelStats } from './pets'
import { getPet } from './pets'
import type { ItemInstance, RunState } from './types'

/** Bản lưu v1: chỉ có `items`, mọi món đều được coi là đang mang. */
export interface PersistedV1 {
	run?: Omit<RunState, 'equipped' | 'inventory'> & { items?: ItemInstance[] }
}

export interface PersistedV2 {
	run: RunState
}

/**
 * Chuyển bản lưu v1 (một danh sách `run.items`) sang v2 (`equipped` + `inventory`).
 *
 * Những món còn nằm trong lưới trang bị của cấp thú hiện tại thì giữ nguyên là đang
 * mang; phần vượt sức chứa (hoặc đang ở khay chờ với `slot < 0`) dồn vào kho.
 *
 * ⚠️ Hàm thuần, **không** được ném lỗi: người chơi cũ mất tiến trình nếu migrate hỏng.
 */
export function migrateV1ToV2(persisted: PersistedV1): PersistedV2 | PersistedV1 {
	const saved = persisted?.run
	if (!saved) return persisted
	const { items, ...rest } = saved
	const level = rest.pets?.[rest.petId] ?? 1
	const size = petLevelStats(getPet(rest.petId), level).bagSize
	const all = items ?? []

	const equipped: ItemInstance[] = []
	const inventory: ItemInstance[] = []
	const occupied = new Set<number>()

	// Giữ món theo đúng thứ tự cũ, chỉ nhận những món còn chỗ trong lưới.
	for (const item of all) {
		if (item.slot < 0 || item.slot >= size) {
			inventory.push({ ...item, slot: -1, rotated: false })
			continue
		}
		equipped.push(item)
		occupied.add(item.slot)
	}

	// `size` chỉ là số ô, không phải kiểm tra va chạm: bản lưu cũ vốn đã hợp lệ.
	void occupied
	// Kho là lưới tự do nên món vào kho phải có **ô thật** (❌ không còn `slot: -1`).
	return { run: { ...rest, equipped, inventory: repairKhoSlots(inventory) } as RunState }
}
