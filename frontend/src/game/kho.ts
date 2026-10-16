import {
	canPlace,
	findFreePlacement,
	footprintOf,
	resolveDrop,
	rotateItem,
	templateFootprint,
	toCell,
	type MoveResult,
	type Placement,
} from './bag'
import { getTemplate } from './items'
import type { ItemInstance, RunState } from './types'

/**
 * **Kho đồ là một lưới tự do**, giống hệt lưới Trang bị: mỗi món nằm ở **đúng ô người chơi
 * đặt** và **đúng hướng người chơi chọn**. Kho ❌ **không** tự dồn món về một hàng.
 *
 * ⚠️ VÌ SAO: bản trước xếp món tuần tự (món sau nối tiếp món trước) và **ghi đè** ô mà người
 * chơi vừa thả, nên kéo món trong kho trông như "không kéo được" — thao tác ăn nhưng vị trí
 * bị tính lại ngay. Vị trí trong kho giờ là dữ liệu thật (`slot`/`rotated`), chỉ đổi khi người
 * chơi thao tác.
 */

/** Số cột của kho. */
export const KHO_WIDTH = 8

/** Số hàng tối thiểu — kho trống vẫn hiện đủ lưới. */
export const KHO_MIN_ROWS = 8

/** Số hàng trống giữ thêm ở dưới, để lúc nào cũng còn chỗ thả món mới. */
const KHO_SPARE_ROWS = 1

/**
 * Số hàng cần để chứa hết `items`: đáy của món nằm thấp nhất, cộng hàng dự trữ.
 *
 * Nhờ suy ra từ dữ liệu nên kho vẫn **không giới hạn**: thả món xuống hàng dự trữ là lưới
 * tự cao thêm, không cần "sức chứa" riêng.
 */
export function khoRows(items: ItemInstance[]): number {
	let bottom = 0
	for (const item of items) {
		if (item.slot < 0) continue
		const size = footprintOf(getTemplate(item.templateId).space, item.rotated)
		bottom = Math.max(bottom, toCell(item.slot, KHO_WIDTH).row + size.h)
	}
	return Math.max(KHO_MIN_ROWS, bottom + KHO_SPARE_ROWS)
}

/** Hình dạng lưới kho. Mọi ô đều dùng được — kho không có ô khoá. */
export function khoShape(items: ItemInstance[]) {
	const rows = khoRows(items)
	const size = rows * KHO_WIDTH
	return { width: KHO_WIDTH, rows, size, usable: size }
}

/**
 * Lưới **rộng rãi** dùng khi *tìm* chỗ: món dài nhất cao 4 hàng (món ngang 4×1 chỉ cao 1
 * hàng), nên `count × 4` hàng là luôn đủ cho `count` món.
 *
 * ❌ Không dùng lưới đang hiện để tìm chỗ: lưới đầy tới hàng dự trữ thì thao tác thả sẽ thất
 * bại oan, trong khi kho lẽ ra không giới hạn.
 */
function searchGridSize(count: number): number {
	return Math.max(KHO_MIN_ROWS, count * 4) * KHO_WIDTH
}

/** Chỗ trống gần đầu kho nhất cho một món (ưu tiên hướng gốc, chỉ xoay khi cần). */
export function findKhoPlacement(items: ItemInstance[], templateId: string): Placement | null {
	return findFreePlacement(items, templateId, KHO_WIDTH, searchGridSize(items.length + 1))
}

/**
 * **Sửa chỗ nằm của các món trong kho** khi đọc bản lưu: món thiếu ô (`slot < 0`, dạng bản lưu
 * cũ), ô ngoài lưới, hoặc **trùng ô** với món khác thì được xếp lại vào chỗ trống đầu tiên.
 *
 * Món đang có vị trí hợp lệ được **giữ nguyên** — người chơi đã tự đặt thì không dồn lại.
 */
export function repairKhoSlots(items: ItemInstance[]): ItemInstance[] {
	const gridSize = searchGridSize(items.length + 1)
	const placed: ItemInstance[] = []
	for (const item of items) {
		const size = templateFootprint(item.templateId, item.rotated)
		if (item.slot >= 0 && canPlace(placed, [], item.slot, size, KHO_WIDTH, gridSize)) {
			placed.push(item)
			continue
		}
		const placement = findFreePlacement(placed, item.templateId, KHO_WIDTH, gridSize)
		placed.push(
			placement ? { ...item, slot: placement.slot, rotated: placement.rotated } : { ...item, slot: 0, rotated: false },
		)
	}
	return placed
}

/**
 * Đặt một món **chưa nằm trong kho** vào kho: ưu tiên đúng ô đang trỏ (`slot`), không vừa thì
 * tự tìm chỗ trống (kho không giới hạn nên luôn có chỗ).
 */
function placeNew(items: ItemInstance[], item: ItemInstance, slot: number | null, rotated: boolean) {
	const gridSize = searchGridSize(items.length + 1)
	if (slot !== null) {
		const incoming = [...items, { ...item, slot: -1, rotated }]
		const result = resolveDrop(incoming, item.uid, slot, KHO_WIDTH, gridSize, rotated)
		if (!result.reason) return { items: result.items, merged: result.merged }
	}
	const placement = findFreePlacement(items, item.templateId, KHO_WIDTH, gridSize)
	return {
		items: placement
			? [...items, { ...item, slot: placement.slot, rotated: placement.rotated }]
			: [...items, { ...item, slot: 0, rotated: false }],
		merged: false,
	}
}

/** Trang bị → kho, **vào đúng ô đang trỏ** nếu vừa; không thì tự tìm chỗ. */
export function unequipIntoKho(run: RunState, uid: string, slot: number | null, rotated = false): RunState {
	const item = run.equipped.find((entry) => entry.uid === uid)
	if (!item) return run
	const { items } = placeNew(run.inventory, item, slot, rotated)
	return { ...run, equipped: run.equipped.filter((entry) => entry.uid !== uid), inventory: items }
}

/** Mua đồ khi trang bị hết chỗ: cất món mới vào kho ở chỗ trống đầu tiên. */
export function addToKho(run: RunState, item: ItemInstance): RunState {
	return { ...run, inventory: placeNew(run.inventory, item, null, false).items }
}

/** Di chuyển một món **trong kho**: thả vào ô trống, nhập sao, hoán đổi — như lưới trang bị. */
export function dropInKho(
	run: RunState,
	uid: string,
	slot: number | null,
	rotated?: boolean,
): { run: RunState; result: MoveResult } {
	const empty: MoveResult = {
		items: run.inventory,
		merged: false,
		swapped: false,
		rotated: false,
		reason: 'blocked',
	}
	const moving = run.inventory.find((entry) => entry.uid === uid)
	if (!moving) return { run, result: empty }

	const result =
		slot === null
			? empty
			: resolveDrop(run.inventory, uid, slot, KHO_WIDTH, khoShape(run.inventory).size, rotated)
	if (!result.reason) return { run: { ...run, inventory: result.items }, result }

	// Thả ra vùng trống của kho, hoặc lưới đang hiện đã kín ô → xếp món vào chỗ trống trong
	// **lưới rộng hơn**: kho không giới hạn nên lưới cao thêm, thay vì bỏ thao tác.
	const rest = run.inventory.filter((entry) => entry.uid !== uid)
	const { items } = placeNew(rest, moving, null, rotated ?? moving.rotated ?? false)
	return {
		run: { ...run, inventory: items },
		result: { items, merged: false, swapped: false, rotated: false },
	}
}

/** Xoay một món **trong kho** tại chỗ. Trả `null` nếu hướng mới không vừa. */
export function rotateInKho(run: RunState, uid: string): RunState | null {
	const { size } = khoShape(run.inventory)
	const next = rotateItem(run.inventory, uid, KHO_WIDTH, size)
	return next ? { ...run, inventory: next } : null
}
