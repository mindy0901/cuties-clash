import { MAX_STAR, getTemplate, starPrice } from './items'
import type { GridSpace, ItemInstance, Star } from './types'

/** Ô thứ tự trong lưới: hàng trước, cột sau. */
export interface Cell {
	row: number
	col: number
}

export function toCell(slot: number, width: number): Cell {
	return { row: Math.floor(slot / width), col: slot % width }
}

export function toSlot(cell: Cell, width: number): number {
	return cell.row * width + cell.col
}

/** Kích thước thực tế của một món, đã tính xoay 90°. */
export function footprintOf(space: GridSpace, rotated = false): GridSpace {
	return rotated ? { w: space.h, h: space.w } : space
}

export function templateFootprint(templateId: string, rotated = false): GridSpace {
	return footprintOf(getTemplate(templateId).space, rotated)
}

/** Hai bản sao nhập được khi cùng template, cùng số sao và chưa đạt 4★. */
export function isMergeable(a: ItemInstance, b: ItemInstance): boolean {
	return a.templateId === b.templateId && a.star === b.star && a.star < MAX_STAR
}

/** Mọi ô mà một món chiếm, tính từ ô neo (góc trên trái). */
export function cellsOf(slot: number, size: GridSpace, width: number): number[] {
	if (slot < 0) return []
	const { row: startRow, col: startCol } = toCell(slot, width)
	const cells: number[] = []
	for (let row = startRow; row < startRow + size.h; row += 1) {
		for (let col = startCol; col < startCol + size.w; col += 1) {
			cells.push(toSlot({ row, col }, width))
		}
	}
	return cells
}

/** Ô của một món trong túi, đã tính xoay. Trả [] nếu món nằm ở khay chờ. */
export function itemCells(item: ItemInstance, width: number): number[] {
	if (item.slot < 0) return []
	return cellsOf(item.slot, templateFootprint(item.templateId, item.rotated), width)
}

export function blueprintCells(entry: { templateId: string; slot: number; rotated?: boolean }, width: number): number[] {
	if (entry.slot < 0) return []
	return cellsOf(entry.slot, templateFootprint(entry.templateId, entry.rotated), width)
}

/** Bản đồ ô → món đang chiếm ô đó. Ô trống không xuất hiện trong bản đồ. */
export function occupancy<T extends { slot: number }>(
	items: T[],
	width: number,
	spaceOf: (item: T) => GridSpace,
): Map<number, T> {
	const map = new Map<number, T>()
	for (const item of items) {
		if (item.slot < 0) continue
		for (const cell of cellsOf(item.slot, spaceOf(item), width)) map.set(cell, item)
	}
	return map
}

export function occupancyOf(items: ItemInstance[], width: number): Map<number, ItemInstance> {
	return occupancy(items, width, (item) => templateFootprint(item.templateId, item.rotated))
}

/** Món chiếm ô `slot` (bỏ qua một uid), dùng cho drop và kiểm tra va chạm. */
export function occupantAt(
	items: ItemInstance[],
	slot: number,
	width: number,
	exceptUid?: string,
): ItemInstance | undefined {
	for (const item of items) {
		if (item.uid === exceptUid) continue
		if (itemCells(item, width).includes(slot)) return item
	}
	return undefined
}

/** Tập uid của các món có ít nhất một ô kề cạnh với `cells` (không tính `exceptUid`). */
export function adjacentUids(
	map: Map<number, { uid: string }>,
	cells: number[],
	width: number,
	gridSize: number,
	exceptUid: string,
): Set<string> {
	const rows = Math.ceil(gridSize / width)
	const found = new Set<string>()
	for (const cell of cells) {
		const { row, col } = toCell(cell, width)
		const candidates: Cell[] = [
			{ row: row - 1, col },
			{ row: row + 1, col },
			{ row, col: col - 1 },
			{ row, col: col + 1 },
		]
		for (const candidate of candidates) {
			if (candidate.row < 0 || candidate.col < 0 || candidate.col >= width || candidate.row >= rows) continue
			const neighbour = map.get(toSlot(candidate, width))
			if (neighbour && neighbour.uid !== exceptUid) found.add(neighbour.uid)
		}
	}
	return found
}

/**
 * Các ô neo **hợp lệ** cho khối `size`, xếp theo khoảng cách tới `hoverSlot` gần nhất trước.
 *
 * Khi kéo, con trỏ có thể ở ô mà khối không thể neo (ví dụ ô cuối cột), và ô đó còn có thể
 * **chính món đang kéo** đè lên. Nếu chỉ thử một ô neo thì thao tác thả sẽ thất bại dù món
 * hoàn toàn vừa chỗ khác ngay cạnh.
 */
export function anchorsNear(hoverSlot: number, size: GridSpace, width: number, gridSize: number): number[] {
	const rows = Math.ceil(gridSize / width)
	const { row: hoverRow, col: hoverCol } = toCell(Math.max(0, Math.min(gridSize - 1, hoverSlot)), width)
	const candidates: { slot: number; distance: number }[] = []

	for (let row = 0; row + size.h <= rows; row += 1) {
		for (let col = 0; col + size.w <= width; col += 1) {
			candidates.push({
				slot: toSlot({ row, col }, width),
				distance: Math.abs(row - hoverRow) + Math.abs(col - hoverCol),
			})
		}
	}

	candidates.sort((a, b) => a.distance - b.distance || a.slot - b.slot)
	return candidates.map((entry) => entry.slot)
}

/**
 * Kẹp một ô thành **ô neo hợp lệ** cho khối `size`: giữ nguyên nếu khối đã nằm trọn
 * trong lưới, nếu không thì dịch ô neo về phía gần nhất mà khối vẫn trọn.
 *
 * ⚠️ VÌ SAO CẦN: khi kéo, con trỏ có thể ở ô 5 trong lưới 4 cột. Món 4×1 không thể
 * neo ở cột 1 (`col + 4 > 4`), nên nếu vẽ gợi ý từ ô 5 thì `cellsOf` sinh ra
 * `[5, 6, 7, 8]` — tràn sang hàng dưới, nhìn như hai hàng. Tệ hơn: `resolveDrop` từ
 * chối ô 5 (`blocked`), nên gợi ý và chỗ thả **không khớp nhau** — người chơi chỉ thả
 * được khi trỏ đúng vào ô đầu.
 *
 * Dùng hàm này cho CẢ gợi ý lẫn chỗ thả để hai bên luôn nhất quán.
 */
export function anchorFor(slot: number, size: GridSpace, width: number, gridSize: number): number {
	if (slot < 0) return 0
	const rows = Math.ceil(gridSize / width)
	const { row, col } = toCell(slot, width)
	const safeRow = Math.max(0, Math.min(rows - size.h, row))
	const safeCol = Math.max(0, Math.min(width - size.w, col))
	return toSlot({ row: safeRow, col: safeCol }, width)
}

/**
 * Ô hợp lệ: cả hình chữ nhật (ô neo + kích thước) phải nằm trong lưới.
 *
 * Phải kiểm tra theo ô neo chứ không theo danh sách ô suy ra từ `cellsOf`: khối
 * `3×1` neo ở cột 3 trong lưới 4 cột sẽ sinh ra ô `[3,4,5]`, nhưng ô 4 và 5 thực
 * chất thuộc hàng dưới — kiểm tra theo danh sách sẽ tưởng là hợp lệ.
 */
function cellsInBounds(slot: number, size: GridSpace, width: number, gridSize: number): boolean {
	if (slot < 0 || slot >= gridSize) return false
	const rows = Math.ceil(gridSize / width)
	const { row, col } = toCell(slot, width)
	if (row < 0 || col < 0) return false
	if (col + size.w > width) return false
	if (row + size.h > rows) return false
	return true
}

/**
 * Vị từ lõi: một khối `size` đặt ở `slot` có vừa không, biết trước tập ô đã bị
 * chiếm (`taken`). Mọi thao tác (đặt món, hoán đổi, xoay) đều quy về đây.
 */
export function fitsIn(
	slot: number,
	size: GridSpace,
	width: number,
	gridSize: number,
	taken: Set<number>,
): boolean {
	if (!cellsInBounds(slot, size, width, gridSize)) return false
	const cells = cellsOf(slot, size, width)
	return cells.every((cell) => !taken.has(cell))
}

/** Tập ô đang bị chiếm, bỏ qua các uid được miễn (món đang được di chuyển). */
export function takenCells(
	items: ItemInstance[],
	width: number,
	exceptUids: Iterable<string> = [],
): Set<number> {
	const except = new Set(exceptUids)
	const taken = new Set<number>()
	for (const item of items) {
		if (except.has(item.uid)) continue
		for (const cell of itemCells(item, width)) taken.add(cell)
	}
	return taken
}

/** Đặt được không, bỏ qua chính những món đang được di chuyển. */
export function canPlace(
	items: ItemInstance[],
	exceptUids: Iterable<string>,
	slot: number,
	size: GridSpace,
	width: number,
	gridSize: number,
	/**
	 * Số ô **dùng được** (mặc định bằng cả lưới). Ô vượt mức này là ô **khoá** — thú chưa
	 * đủ cấp, không đặt được.
	 */
	usableCells: number = gridSize,
): boolean {
	if (!cellsInBounds(slot, size, width, Math.min(gridSize, usableCells))) return false
	return fitsIn(slot, size, width, gridSize, takenCells(items, width, exceptUids))
}

export interface Placement {
	slot: number
	rotated: boolean
}

/**
 * Tìm chỗ trống đầu tiên cho một món. Ưu tiên hướng gốc, chỉ xoay khi cần.
 * Trả null nếu không còn chỗ (món sẽ nằm ở khay chờ).
 */
export function findFreePlacement(
	items: ItemInstance[],
	templateId: string,
	width: number,
	gridSize: number,
	/** Số ô dùng được; ô khoá không được tính là chỗ trống. */
	usableCells: number = gridSize,
): Placement | null {
	const base = getTemplate(templateId).space
	for (const rotated of [false, true]) {
		const size = footprintOf(base, rotated)
		// Không thử xoay nếu xoay không đổi hình dạng.
		if (rotated && size.w === base.w && size.h === base.h) break
		for (let slot = 0; slot < gridSize; slot += 1) {
			if (canPlace(items, [], slot, size, width, gridSize, usableCells)) return { slot, rotated }
		}
	}
	return null
}

export interface MoveResult {
	items: ItemInstance[]
	merged: boolean
	swapped: boolean
	rotated: boolean
	reason?: 'blocked' | 'same-slot' | 'out-of-bounds' | 'no-space'
}/**
 * Xử lý kéo thả: thả vào chỗ trống thì đặt món (giữ nguyên ô neo), thả đè lên món
 * giống hệt thì nhập thành +1★, đè lên món khác thì hoán đổi vị trí.
 *
 * `slot` là **ô con trỏ** (không nhất thiết là ô neo hợp lệ). Hàm tự thử các ô neo hợp lệ
 * gần đó, gần nhất trước — nhờ vậy thả ở đâu quanh món cũng ăn, kể cả khi con trỏ đang
 * đè lên chính món đó.
 */
export function resolveDrop(
	items: ItemInstance[],
	movingUid: string,
	slot: number,
	width: number,
	gridSize: number,
	rotated?: boolean,
	/**
	 * Số ô **dùng được** (mặc định cả lưới). Ô vượt mức này là ô **khoá** — thú chưa đủ cấp.
	 */
	usableCells: number = gridSize,
): MoveResult {
	const moving = items.find((item) => item.uid === movingUid)
	if (!moving) return { items, merged: false, swapped: false, rotated: false, reason: 'blocked' }
	if (slot < 0 || slot >= gridSize) {
		return { items, merged: false, swapped: false, rotated: false, reason: 'out-of-bounds' }
	}

	const orientation = rotated ?? moving.rotated ?? false
	const size = templateFootprint(moving.templateId, orientation)

	// (1) Thả đè lên **món khác** → nhập sao (nếu hợp) hoặc hoán đổi.
	const other = occupantAt(items, slot, width, moving.uid)
	if (other) {
		if (isMergeable(moving, other)) {
			const nextStar = (other.star + 1) as Star
			return {
				items: items
					.filter((item) => item.uid !== moving.uid)
					.map((item) =>
						item.uid === other.uid
							? { ...item, star: nextStar, paid: item.paid + moving.paid, slot: other.slot }
							: item,
					),
				merged: true,
				swapped: false,
				rotated: false,
			}
		}

		// Hoán đổi: món đang kéo về ô neo của món kia, và ngược lại. Cả hai rời chỗ cũ nên
		// tập ô bị chiếm phải tính theo vị trí tương lai của cả hai.
		const targetSize = templateFootprint(other.templateId, other.rotated ?? false)
		const movingFrom = moving.slot
		const taken = takenCells(items, width, [moving.uid, other.uid])
		if (
		!fitsIn(slot, size, width, usableCells, taken) ||
		!fitsIn(movingFrom, targetSize, width, usableCells, taken)
	) {
			return { items, merged: false, swapped: false, rotated: false, reason: 'no-space' }
		}
		return {
			items: items.map((item) => {
				if (item.uid === moving.uid) return { ...item, slot, rotated: orientation }
				if (item.uid === other.uid) return { ...item, slot: movingFrom }
				return item
			}),
			merged: false,
			swapped: true,
			rotated: orientation !== (moving.rotated ?? false),
		}
	}

	// (2) Chỗ trống: thử các ô neo hợp lệ gần con trỏ nhất.
	// Bỏ qua chính món đang kéo khi kiểm tra va chạm — nó sắp rời khỏi chỗ cũ.
	const taken = takenCells(items, width, [moving.uid])
	for (const anchor of anchorsNear(slot, size, width, usableCells)) {
		if (!fitsIn(anchor, size, width, usableCells, taken)) continue
		if (anchor === moving.slot && (moving.rotated ?? false) === orientation) {
			return { items, merged: false, swapped: false, rotated: false, reason: 'same-slot' }
		}
		return {
			items: items.map((item) => (item.uid === moving.uid ? { ...item, slot: anchor, rotated: orientation } : item)),
			merged: false,
			swapped: false,
			rotated: orientation !== (moving.rotated ?? false),
		}
	}

	return { items, merged: false, swapped: false, rotated: false, reason: 'no-space' }
}

/** Xoay một món tại chỗ. Trả `null` nếu hướng mới không vừa. */
export function rotateItem(
	items: ItemInstance[],
	uid: string,
	width: number,
	gridSize: number,
	/** Số ô dùng được; hướng mới không được tràn vào ô khoá. */
	usableCells: number = gridSize,
): ItemInstance[] | null {
	const item = items.find((entry) => entry.uid === uid)
	if (!item || item.slot < 0) return null
	const next = !(item.rotated ?? false)
	const size = templateFootprint(item.templateId, next)
	if (!canPlace(items, [uid], item.slot, size, width, gridSize, usableCells)) return null
	return items.map((entry) => (entry.uid === uid ? { ...entry, rotated: next } : entry))
}

/**
 * Xếp mọi món đang ở khay chờ vào kho: lần lượt từng món, ưu tiên hướng gốc và
 * chỉ xoay khi cần. Món nào không còn chỗ thì ở lại khay.
 *
 * Trả về danh sách món đã có vị trí mới; store áp dụng bằng `resolveDrop` cho
 * từng món để giữ nguyên một đường thao tác duy nhất.
 */
export function planAutoArrange(
	items: ItemInstance[],
	width: number,
	gridSize: number,
): { uid: string; slot: number; rotated: boolean }[] {
	// Ô đã bị chiếm bởi những món đang nằm trong kho; món ở khay chưa chiếm gì.
	const taken = takenCells(
		items.filter((item) => item.slot >= 0),
		width,
	)
	const moves: { uid: string; slot: number; rotated: boolean }[] = []

	for (const item of items) {
		if (item.slot >= 0) continue
		const base = getTemplate(item.templateId).space
		let chosen: Placement | null = null
		for (const rotated of [false, true]) {
			const size = footprintOf(base, rotated)
			if (rotated && size.w === base.w && size.h === base.h) break
			for (let slot = 0; slot < gridSize; slot += 1) {
				if (fitsIn(slot, size, width, gridSize, taken)) {
					chosen = { slot, rotated }
					break
				}
			}
			if (chosen) break
		}
		if (!chosen) continue
		// Giữ chỗ ngay để món sau không đè lên món vừa xếp.
		for (const cell of cellsOf(chosen.slot, footprintOf(base, chosen.rotated), width)) taken.add(cell)
		moves.push({ uid: item.uid, slot: chosen.slot, rotated: chosen.rotated })
	}
	return moves
}

/** Bán lại nhận 50% số Paw Tally đã thực trả. */
export function sellValue(item: ItemInstance): number {
	return Math.max(1, Math.floor(item.paid / 2))
}

export function createItemInstance(
	templateId: string,
	star: Star,
	uid: string,
	slot = -1,
	rotated = false,
): ItemInstance {
	const template = getTemplate(templateId)
	return { uid, templateId, star, slot, rotated, paid: starPrice(template.cost, star) }
}
