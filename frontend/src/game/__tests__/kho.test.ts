import { describe, expect, it } from 'vitest'
import { createItemInstance } from '../bag'
import { dropInKho, khoRows, khoShape, KHO_WIDTH, repairKhoSlots, rotateInKho, unequipIntoKho } from '../kho'
import type { ItemInstance, RunState } from '../types'

/**
 * Kho đồ là **lưới tự do**: món nằm ở đúng ô người chơi đặt, xoay hướng nào cũng được, và
 * kho ❌ **không** xếp hộ. Bộ test này khoá hành vi đó lại — bản trước tự dồn món nối tiếp nhau
 * và ghi đè vị trí vừa thả nên kéo trong kho trông như không ăn.
 */

/** Run tối thiểu: chỉ cần `equipped` + `inventory` cho các hàm thuần. */
function runWith(inventory: ItemInstance[], equipped: ItemInstance[] = []): RunState {
	return { inventory, equipped } as RunState
}

describe('kho là lưới tự do', () => {
	it('thả món vào ô nào thì nằm đúng ô đó (không dồn về đầu lưới)', () => {
		const gem = createItemInstance('jade-fury', 1, 'gem', 0)
		const { run } = dropInKho(runWith([gem]), 'gem', 20)

		expect(run.inventory[0].slot).toBe(20)
	})

	it('món khác trong kho KHÔNG bị xếp lại khi thả thêm món', () => {
		const a = createItemInstance('jade-fury', 1, 'a', 3)
		const b = createItemInstance('jade-fury', 1, 'b', 11)
		const c = createItemInstance('jade-fury', 1, 'c', 40)

		const { run } = dropInKho(runWith([a, b, c]), 'c', 45)

		expect(run.inventory.map((item) => [item.uid, item.slot])).toEqual([
			['a', 3],
			['b', 11],
			['c', 45],
		])
	})

	it('thả lên món KHÁC LOẠI thì TỪ CHỐI — không hoán đổi, không đẩy món đi', () => {
		// LỖI ĐÃ GẶP: thả đè lên món khác trong kho lại **hoán đổi** hai món, tức món đang nằm yên
		// bị đẩy sang chỗ khác. Kho là lưới tự do nên thao tác đó bị từ chối.
		const blade = createItemInstance('wooden-blade', 1, 'blade', 0)
		const gem = createItemInstance('jade-fury', 1, 'gem', 2)

		const { run, result } = dropInKho(runWith([blade, gem]), 'gem', 0)

		expect(result.reason, 'phải từ chối').toBe('no-space')
		expect(run.inventory.map((item) => [item.uid, item.slot])).toEqual([
			['blade', 0],
			['gem', 2],
		])
	})

	it('thả lên món giống hệt thì nhập sao', () => {
		const a = createItemInstance('jade-fury', 1, 'a', 0)
		const b = createItemInstance('jade-fury', 1, 'b', 9)

		const { run, result } = dropInKho(runWith([a, b]), 'b', 0)

		expect(result.merged).toBe(true)
		expect(run.inventory).toHaveLength(1)
		expect(run.inventory[0].star).toBe(2)
	})

	it('thả ở ô không vừa món dài thì vẫn đặt được (tìm ô neo gần đó)', () => {
		// Ô 5 nằm giữa lưới 8 cột, món 1×4 neo được ngay đó.
		const spear = createItemInstance('fire-spear', 1, 'spear', 0)
		const { run } = dropInKho(runWith([spear]), 'spear', 5)
		expect(run.inventory[0].slot).toBe(5)
	})

	it('xoay món trong kho nếu hướng mới vừa', () => {
		const axe = createItemInstance('great-axe', 1, 'axe', 0)
		const { run } = dropInKho(runWith([axe]), 'axe', 2)

		const rotated = rotateInKho(run, 'axe')
		expect(rotated?.inventory[0].rotated).toBe(true)
		// 2×3 xoay thành 3×2 — vẫn nằm gọn trong 8 cột.
		expect(rotated?.inventory[0].slot).toBe(2)
	})

	it('không xoay được thì trả null (hướng mới chèn ra ngoài lưới)', () => {
		// 1×4 ở **cột 5**: xoay thành 4×1 sẽ tràn qua cột 8 → từ chối.
		const spear = createItemInstance('fire-spear', 1, 'spear', 5)
		const run = runWith([spear])
		expect(rotateInKho(run, 'spear')).toBeNull()
	})
})

describe('kho không giới hạn sức chứa', () => {
	it('lưới cao thêm khi có món nằm thấp hơn', () => {
		expect(khoRows([])).toBe(8)

		const deep = createItemInstance('jade-fury', 1, 'deep', 20 * KHO_WIDTH)
		expect(khoRows([deep])).toBeGreaterThan(20)
	})

	it('mua đồ khi lưới đang hiện đã kín vẫn còn chỗ (lưới cao thêm)', () => {
		// Lấp kín 8×8 đầu tiên bằng món 1 ô, rồi thả thêm một món xuống dưới.
		const full = Array.from({ length: 64 }, (_, index) => createItemInstance('jade-fury', 1, `f${index}`, index))
		const extra = createItemInstance('jade-fury', 1, 'extra', 0)

		const { run } = dropInKho(runWith([...full, extra]), 'extra', 64)

		const placed = run.inventory.find((item) => item.uid === 'extra')!
		expect(placed.slot).toBeGreaterThanOrEqual(64)
		expect(khoShape(run.inventory).usable).toBeGreaterThan(placed.slot)
	})
})

describe('trang bị → kho', () => {
	it('món tháo ra nằm đúng ô đang trỏ', () => {
		const worn = createItemInstance('jade-fury', 1, 'worn', 0)
		const run = unequipIntoKho(runWith([], [worn]), 'worn', 17)

		expect(run.equipped).toHaveLength(0)
		expect(run.inventory[0].slot).toBe(17)
	})

	it('không trỏ ô nào thì kho tự tìm chỗ trống', () => {
		const worn = createItemInstance('jade-fury', 1, 'worn', 0)
		const run = unequipIntoKho(runWith([], [worn]), 'worn', null)
		expect(run.inventory[0].slot).toBe(0)
	})

	it('xếp vào chỗ trống chứ không đè lên món đang ở đó', () => {
		const existing = createItemInstance('jade-fury', 1, 'existing', 0)
		const worn = createItemInstance('jade-fury', 1, 'worn', 0)
		const run = unequipIntoKho(runWith([existing], [worn]), 'worn', null)
		expect(run.inventory.find((item) => item.uid === 'existing')?.slot).toBe(0)
		expect(run.inventory.find((item) => item.uid === 'worn')?.slot).toBe(1)
	})
})

describe('sửa bản lưu cũ', () => {
	it('món thiếu ô (slot -1) được xếp vào chỗ trống, món có ô rồi thì giữ nguyên', () => {
		const placed = createItemInstance('jade-fury', 1, 'placed', 12)
		const tray = { ...createItemInstance('jade-fury', 1, 'tray'), slot: -1 }

		const repaired = repairKhoSlots([placed, tray])

		expect(repaired.find((item) => item.uid === 'placed')?.slot, 'vị trí người chơi đã đặt phải giữ nguyên').toBe(12)
		expect(repaired.find((item) => item.uid === 'tray')?.slot).toBe(0)
	})

	it('hai món cùng ô thì món sau được dời sang ô khác', () => {
		const a = createItemInstance('jade-fury', 1, 'a', 4)
		const b = createItemInstance('jade-fury', 1, 'b', 4)

		const repaired = repairKhoSlots([a, b])

		expect(repaired[0].slot).toBe(4)
		expect(repaired[1].slot).not.toBe(4)
	})
})
