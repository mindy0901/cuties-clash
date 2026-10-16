import { describe, expect, it } from 'vitest'
import {
	adjacentUids,
	anchorFor,
	canPlace,
	cellsOf,
	createItemInstance,
	findFreePlacement,
	isMergeable,
	itemCells,
	occupancyOf,
	planAutoArrange,
	resolveDrop,
	rotateItem,
	sellValue,
	templateFootprint,
	toCell,
	toSlot,
} from '../bag'
import { getTemplate } from '../items'
import type { ItemInstance } from '../types'

/** Kho 4 cột × 3 hàng = 12 ô, dùng cho phần lớn test. */
const WIDTH = 4
const SIZE = 12

describe('hình dạng vật phẩm', () => {
	it('cho kiếm 1×3 và đại đao 2×3', () => {
		expect(getTemplate('wooden-blade').space).toEqual({ w: 1, h: 3 })
		expect(getTemplate('great-axe').space).toEqual({ w: 2, h: 3 })
		expect(getTemplate('fire-spear').space).toEqual({ w: 1, h: 4 })
	})

	it('xoay 90° thì hoán đổi w và h', () => {
		expect(templateFootprint('wooden-blade')).toEqual({ w: 1, h: 3 })
		expect(templateFootprint('wooden-blade', true)).toEqual({ w: 3, h: 1 })
		expect(templateFootprint('great-axe', true)).toEqual({ w: 3, h: 2 })
	})

	it('đổi ô thứ tự sang hàng/cột và ngược lại', () => {
		expect(toCell(0, WIDTH)).toEqual({ row: 0, col: 0 })
		expect(toCell(7, WIDTH)).toEqual({ row: 1, col: 3 })
		expect(toSlot({ row: 2, col: 1 }, WIDTH)).toBe(9)
	})
})

describe('ô mà vật phẩm chiếm', () => {
	it('kiếm dọc 1×3 chiếm ba ô cùng cột', () => {
		expect(cellsOf(1, { w: 1, h: 3 }, WIDTH)).toEqual([1, 5, 9])
	})

	it('kiếm xoay ngang 3×1 chiếm ba ô cùng hàng', () => {
		expect(cellsOf(0, { w: 3, h: 1 }, WIDTH)).toEqual([0, 1, 2])
	})

	it('đại đao 2×3 chiếm khối chữ nhật', () => {
		expect(cellsOf(4, { w: 2, h: 3 }, WIDTH)).toEqual([4, 5, 8, 9, 12, 13])
	})

	it('món ở khay chờ không chiếm ô nào', () => {
		expect(itemCells(createItemInstance('wooden-blade', 1, 'a'), WIDTH)).toEqual([])
	})
})

describe('đặt được hay không', () => {
	it('từ chối khi tràn ra ngoài lưới', () => {
		// Lưới 4 cột × 3 hàng. Kiếm dọc 1×3 chỉ đứng được ở hàng 0 (ô 0..3).
		expect(canPlace([], [], 4, { w: 1, h: 3 }, WIDTH, SIZE)).toBe(false)
		expect(canPlace([], [], 0, { w: 1, h: 3 }, WIDTH, SIZE)).toBe(true)
		expect(canPlace([], [], 8, { w: 1, h: 3 }, WIDTH, SIZE)).toBe(false)
	})

	it('từ chối khi tràn sang cột khác', () => {
		// Khối 3 ô ngang chỉ vừa khi neo ở cột 0 hoặc 1.
		console.log('DBG cells', JSON.stringify(cellsOf(3, { w: 3, h: 1 }, WIDTH)), 'WIDTH', WIDTH, 'SIZE', SIZE)
		console.log('DBG @3', canPlace([], [], 3, { w: 3, h: 1 }, WIDTH, SIZE))
		expect(canPlace([], [], 3, { w: 3, h: 1 }, WIDTH, SIZE)).toBe(false)
		expect(canPlace([], [], 1, { w: 3, h: 1 }, WIDTH, SIZE)).toBe(true)
	})

	it('từ chối khi đè lên món khác', () => {
		const items = [createItemInstance('great-axe', 1, 'axe', 0)]
		// Đại đao chiếm 0,1,4,5,8,9. Ô 5 đã bị chiếm.
		expect(occupancyOf(items, WIDTH).get(5)?.uid).toBe('axe')
		expect(canPlace(items, [], 5, { w: 1, h: 1 }, WIDTH, SIZE)).toBe(false)
		expect(canPlace(items, [], 2, { w: 1, h: 1 }, WIDTH, SIZE)).toBe(true)
	})

	it('bỏ qua chính món đang xét', () => {
		const items = [createItemInstance('great-axe', 1, 'axe', 0)]
		expect(canPlace(items, ['axe'], 0, { w: 2, h: 3 }, WIDTH, SIZE)).toBe(true)
	})
})

describe('tìm chỗ trống', () => {
	it('đặt món 1 ô vào ô đầu tiên còn trống', () => {
		const items = [createItemInstance('jade-fury', 1, 'a', 0)]
		expect(findFreePlacement(items, 'jade-fury', WIDTH, SIZE)).toEqual({ slot: 1, rotated: false })
	})

	it('giữ hướng gốc khi hướng đó còn vừa', () => {
		const items = [createItemInstance('jade-fury', 1, 'a', 0)]
		expect(findFreePlacement(items, 'wooden-blade', WIDTH, SIZE)).toEqual({ slot: 1, rotated: false })
	})

	it('tự xoay khi hướng gốc không vừa nhưng hướng xoay vừa', () => {
		// Lưới 4 cột × 3 hàng. Chặn: cả cột 1 và cột 2, hai ô dưới của cột 0,
		// và toàn bộ cột 3 trừ ô trên cùng. Kết quả: chỉ hàng 0 còn trống liền mạch.
		//   ô trống: 0 1 2 3
		//   đã chặn: 4 5 6 7
		//   đã chặn: 8 9 10 11
		const blockedSlots = [4, 5, 6, 7, 8, 9, 10, 11]
		const items = blockedSlots.map((slot, index) =>
			createItemInstance('jade-fury', 1, `b${index}`, slot),
		)
		// Kiếm dọc 1×3 cần 3 ô liền cùng cột — không cột nào còn đủ.
		expect(canPlace(items, [], 0, { w: 1, h: 3 }, WIDTH, SIZE)).toBe(false)
		// Kiếm xoay ngang 3×1 vừa ở hàng 0.
		expect(canPlace(items, [], 0, { w: 3, h: 1 }, WIDTH, SIZE)).toBe(true)
		expect(findFreePlacement(items, 'wooden-blade', WIDTH, SIZE)).toEqual({ slot: 0, rotated: true })
	})

	it('trả null khi hết chỗ', () => {
		const items = Array.from({ length: SIZE }, (_, slot) => createItemInstance('jade-fury', 1, `f${slot}`, slot))
		expect(findFreePlacement(items, 'jade-fury', WIDTH, SIZE)).toBeNull()
	})
})

describe('kéo thả', () => {
	it('di chuyển món sang vùng trống', () => {
		const items = [createItemInstance('jade-fury', 1, 'a', 0)]
		const result = resolveDrop(items, 'a', 7, WIDTH, SIZE)
		expect(result.items.find((item) => item.uid === 'a')?.slot).toBe(7)
		expect(result.reason).toBeUndefined()
	})

	it('đặt kiếm dọc vào đúng ô neo và giữ hướng', () => {
		const items = [createItemInstance('wooden-blade', 1, 'a')]
		const result = resolveDrop(items, 'a', 1, WIDTH, SIZE)
		expect(result.items[0]).toMatchObject({ slot: 1, rotated: false })
		expect(itemCells(result.items[0], WIDTH)).toEqual([1, 5, 9])
	})

	it('neo vào ô hợp lệ gần nhất khi vùng đích tràn lưới', () => {
		const items = [createItemInstance('wooden-blade', 1, 'a')]
		// Ô 8 (hàng cuối) không đủ 3 hàng cho kiếm dọc → phải kẹp lên hàng trên, cùng cột.
		const result = resolveDrop(items, 'a', 8, WIDTH, SIZE)
		expect(result.reason).toBeUndefined()
		const cells = itemCells(result.items.find((item) => item.uid === 'a')!, WIDTH)
		expect(cells, 'vẫn phải là khối 1×3').toHaveLength(3)
		// Cùng cột 0 — không nhảy sang cột khác.
		expect(cells).toEqual([0, 4, 8])
	})

	it('tránh món khác: không đặt đè, mà neo sang chỗ trống', () => {
		const items = [
			createItemInstance('jade-fury', 1, 'block', 5),
			createItemInstance('wooden-blade', 1, 'a', 9),
		]
		// Thả vào ô 1 — ô đó trống nhưng kiếm dọc sẽ đè lên 'block' ở ô 5.
		const result = resolveDrop(items, 'a', 1, WIDTH, SIZE)
		expect(result.reason).toBeUndefined()
		// ⚠️ Phải tìm theo uid: `items[0]` là món 'block', không phải món đang kéo.
		const moved = result.items.find((item) => item.uid === 'a')!
		const cells = itemCells(moved, WIDTH)
		expect(cells, 'không được đè lên món khác').not.toContain(5)
		expect(cells).toHaveLength(3)
	})

	it('nhập hai bản giống hệt thành +1★ và cộng giá đã trả', () => {
		const items = [
			createItemInstance('wooden-blade', 1, 'a', 0),
			createItemInstance('wooden-blade', 1, 'b', 3),
		]
		const result = resolveDrop(items, 'b', 0, WIDTH, SIZE)
		expect(result.merged).toBe(true)
		expect(result.items).toHaveLength(1)
		expect(result.items[0]).toMatchObject({ templateId: 'wooden-blade', star: 2, slot: 0, paid: 6 })
	})

	it('hoán đổi hai món khác loại khi cả hai vừa chỗ', () => {
		const items = [
			createItemInstance('jade-fury', 1, 'one', 0),
			createItemInstance('heal-dew', 1, 'two', 5),
		]
		const result = resolveDrop(items, 'one', 5, WIDTH, SIZE)
		expect(result.swapped).toBe(true)
		expect(result.items.find((item) => item.uid === 'one')?.slot).toBe(5)
		expect(result.items.find((item) => item.uid === 'two')?.slot).toBe(0)
	})

	it('không nhập được khi đã 4★', () => {
		const a = createItemInstance('wooden-blade', 4, 'a')
		const b = createItemInstance('wooden-blade', 4, 'b', 3)
		expect(isMergeable(a, b)).toBe(false)
	})

	it('chỉ nhập khi cùng số sao', () => {
		expect(isMergeable(createItemInstance('wooden-blade', 2, 'a'), createItemInstance('wooden-blade', 1, 'b'))).toBe(false)
	})

	it('từ chối ô ngoài lưới', () => {
		const items = [createItemInstance('jade-fury', 1, 'a')]
		expect(resolveDrop(items, 'a', 99, WIDTH, SIZE).reason).toBe('out-of-bounds')
	})
})

describe('xoay tại chỗ', () => {
	it('xoay được khi hướng mới vẫn vừa', () => {
		const items = [createItemInstance('wooden-blade', 1, 'a', 0)]
		const rotated = rotateItem(items, 'a', WIDTH, SIZE)
		expect(rotated?.[0].rotated).toBe(true)
		expect(itemCells(rotated![0], WIDTH)).toEqual([0, 1, 2])
	})

	it('từ chối xoay khi hướng mới đè món khác', () => {
		const items = [
			createItemInstance('wooden-blade', 1, 'a', 0),
			createItemInstance('jade-fury', 1, 'block', 2),
		]
		expect(rotateItem(items, 'a', WIDTH, SIZE)).toBeNull()
	})

	it('không xoay món đang ở khay chờ', () => {
		const items = [createItemInstance('wooden-blade', 1, 'a')]
		expect(rotateItem(items, 'a', WIDTH, SIZE)).toBeNull()
	})
})

describe('xếp tự động', () => {
	it('đưa món ở khay vào chỗ trống đầu tiên', () => {
		const items = [createItemInstance('jade-fury', 1, 'tray')]
		expect(planAutoArrange(items, WIDTH, SIZE)).toEqual([{ uid: 'tray', slot: 0, rotated: false }])
	})

	it('không xếp món đã nằm trong kho', () => {
		const items = [createItemInstance('jade-fury', 1, 'placed', 0)]
		expect(planAutoArrange(items, WIDTH, SIZE)).toEqual([])
	})

	it('tránh đè lên món đã có trong kho', () => {
		const items = [
			createItemInstance('great-axe', 1, 'axe', 0),
			createItemInstance('jade-fury', 1, 'tray'),
		]
		// Đại đao chiếm 0,1,4,5,8,9 → ô trống đầu tiên là 2.
		expect(planAutoArrange(items, WIDTH, SIZE)).toEqual([{ uid: 'tray', slot: 2, rotated: false }])
	})

	it('không xếp hai món khay chờ vào cùng một ô', () => {
		const items = [
			createItemInstance('jade-fury', 1, 't1'),
			createItemInstance('jade-fury', 1, 't2'),
		]
		const moves = planAutoArrange(items, WIDTH, SIZE)
		expect(moves).toHaveLength(2)
		expect(moves[0].slot).not.toBe(moves[1].slot)
	})

	it('bỏ qua món không còn chỗ', () => {
		const full = Array.from({ length: SIZE }, (_, slot) => createItemInstance('jade-fury', 1, `f${slot}`, slot))
		const items = [...full, createItemInstance('jade-fury', 1, 'tray')]
		expect(planAutoArrange(items, WIDTH, SIZE)).toEqual([])
	})
})

describe('liền kề theo ô', () => {
	it('tính liền kề từ mọi ô của món, không chỉ ô neo', () => {
		// Kiếm dọc ở cột 0 chiếm 0,4,8; ngọc ở ô 1 nằm cạnh ô 0.
		const items: ItemInstance[] = [
			createItemInstance('wooden-blade', 1, 'sword', 0),
			createItemInstance('jade-fury', 1, 'jade', 1),
		]
		const map = occupancyOf(items, WIDTH)
		const swordCells = cellsOf(0, { w: 1, h: 3 }, WIDTH)
		expect(adjacentUids(map, swordCells, WIDTH, SIZE, 'sword')).toEqual(new Set(['jade']))
	})

	it('không tính liền kề khi chỉ chạm chéo góc', () => {
		// Kiếm dọc ở cột 0 chiếm 0,4,8. Ngọc ở ô 5 nằm chéo với ô 0 và 4.
		const items: ItemInstance[] = [
			createItemInstance('wooden-blade', 1, 'sword', 0),
			createItemInstance('jade-fury', 1, 'jade', 5),
		]
		const map = occupancyOf(items, WIDTH)
		// Ô 5 kề ô 4 (trên) → thực ra CÓ liền kề. Dùng ô 6 mới đúng là chéo:
		// 6 nằm ở hàng 1 cột 2, còn kiếm chiếm cột 0 → cách xa, không kề.
		expect(adjacentUids(map, cellsOf(0, { w: 1, h: 3 }, WIDTH), WIDTH, SIZE, 'sword').has('jade')).toBe(true)

		const diagonal: ItemInstance[] = [
			createItemInstance('wooden-blade', 1, 'sword', 0),
			createItemInstance('jade-fury', 1, 'jade', 6),
		]
		const diagonalMap = occupancyOf(diagonal, WIDTH)
		expect(adjacentUids(diagonalMap, cellsOf(0, { w: 1, h: 3 }, WIDTH), WIDTH, SIZE, 'sword').has('jade')).toBe(false)
	})
})

describe('bán lại', () => {
	it('hoàn 50% giá đã trả', () => {
		expect(sellValue(createItemInstance('great-axe', 3, 'a'))).toBe(12)
		expect(sellValue(createItemInstance('hide-vest', 1, 'b'))).toBe(1)
	})
})

/**
 * `anchorFor` là thứ giữ cho **ô gợi ý khi kéo** và **chỗ thả thật** khớp nhau.
 *
 * Lỗi đã gặp: kéo thương 4×1, rê vào ô 5 trong lưới 4 cột → gợi ý sinh ra `[5,6,7,8]`,
 * tràn sang hàng dưới (nhìn như 2 hàng), mà `resolveDrop` lại từ chối ô 5 → chỉ thả
 * được khi trỏ đúng ô 4.
 */
describe('kẹp ô neo (anchorFor)', () => {
	const W = 4
	const SIZE_12 = 12 // lưới 4×3

	it('giữ nguyên khi khối đã nằm trọn trong lưới', () => {
		expect(anchorFor(4, { w: 4, h: 1 }, W, SIZE_12)).toBe(4)
		expect(anchorFor(0, { w: 1, h: 3 }, W, SIZE_12)).toBe(0)
		expect(anchorFor(5, { w: 1, h: 1 }, W, SIZE_12)).toBe(5)
	})

	it('món 4×1 luôn về cột 0, không bao giờ tràn hàng', () => {
		for (const slot of [4, 5, 6, 7]) {
			expect(anchorFor(slot, { w: 4, h: 1 }, W, SIZE_12)).toBe(4)
		}
		for (const slot of [0, 1, 2, 3]) {
			expect(anchorFor(slot, { w: 4, h: 1 }, W, SIZE_12)).toBe(0)
		}
	})

	it('món 3×1 kẹp về cột gần nhất còn đủ chỗ', () => {
		// Cột 0 và 1 đều đủ cho khối rộng 3 (cột 1 + 3 = 4).
		expect(anchorFor(0, { w: 3, h: 1 }, W, SIZE_12)).toBe(0)
		expect(anchorFor(1, { w: 3, h: 1 }, W, SIZE_12)).toBe(1)
		expect(anchorFor(2, { w: 3, h: 1 }, W, SIZE_12)).toBe(1)
		expect(anchorFor(3, { w: 3, h: 1 }, W, SIZE_12)).toBe(1)
	})

	it('món không thể vừa (1×4 trong lưới 3 hàng) kẹp về ô 0 của hàng', () => {
		// Lưới chỉ 3 hàng nên khối cao 4 KHÔNG BAO GIỜ vừa. Kẹp vẫn trả một ô hợp lệ
		// để vẽ gợi ý; việc từ chối thả là của `canPlace`.
		// Hàng kẹp về hàng 0, cột giữ nguyên (ô 11 = hàng 2, cột 3) → ô 3.
		expect(anchorFor(11, { w: 1, h: 4 }, W, SIZE_12)).toBe(3)
		expect(canPlace([], [], 3, { w: 1, h: 4 }, W, SIZE_12)).toBe(false)
	})

	it('món 1×3 kẹp lên hàng gần nhất còn đủ chỗ', () => {
		expect(anchorFor(8, { w: 1, h: 3 }, W, SIZE_12)).toBe(0)
		expect(anchorFor(9, { w: 1, h: 3 }, W, SIZE_12)).toBe(1)
		expect(anchorFor(10, { w: 1, h: 3 }, W, SIZE_12)).toBe(2)
	})

	it('ô âm hoặc ngoài lưới vẫn cho ô neo hợp lệ', () => {
		// Ô âm → về góc trên trái; ô vượt lưới → kẹp về góc dưới phải.
		expect(anchorFor(-1, { w: 2, h: 2 }, W, SIZE_12)).toBe(0)
		expect(anchorFor(999, { w: 2, h: 2 }, W, SIZE_12)).toBe(6)
	})

	it('gợi ý sau khi kẹp luôn nằm gọn trong MỘT hàng cho món 4×1', () => {
		for (const slot of [4, 5, 6, 7]) {
			const anchor = anchorFor(slot, { w: 4, h: 1 }, W, SIZE_12)
			const cells = cellsOf(anchor, { w: 4, h: 1 }, W)
			const rows = new Set(cells.map((cell) => toCell(cell, W).row))
			expect([...rows], `ô ${slot}`).toEqual([1])
			expect(cells).toEqual([4, 5, 6, 7])
		}
	})

	it('nhận thẳng ô con trỏ, không cần kẹp trước', () => {
		// Thân đao 4×1: ô 5 (cột 1) không phải ô neo hợp lệ, nhưng hàm tự thử ô gần đó.
		const blade = createItemInstance('fire-spear', 1, 'spear', 0, true)
		const items = [blade]

		for (const slot of [5, 6, 7]) {
			const result = resolveDrop(items, 'spear', slot, W, SIZE_12, true)
			expect(result.reason, `ô ${slot}`).toBeUndefined()
			expect(itemCells(result.items[0], W)).toHaveLength(4)
		}
	})
})
