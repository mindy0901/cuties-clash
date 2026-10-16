import { describe, expect, it } from 'vitest'
import { sanitizeRun } from '../sanitize'
import { createItemInstance } from '../bag'
import { SHOP_SIZE } from '../economy'
import { FINAL_STAGE } from '../stages'
import { PETS, getPet, petLevelStats } from '../pets'
import type { RunState } from '../types'

/** Bản lưu v2 hợp lệ tối thiểu. */
function validRun(overrides: Partial<RunState> = {}): RunState {
	return {
		petId: 'fire-pup',
		pets: { 'fire-pup': 2 },
		unlockedPets: ['fire-pup'],
		currency: 40,
		stage: 3,
		clearedStage: 2,
		equipped: [],
		inventory: [],
		seed: 999,
		shop: [],
		rerolls: 0,
		wins: 1,
		losses: 0,
		...overrides,
	}
}

describe('sanitizeRun — chống trắng trang', () => {
	it('bản lưu rỗng hoàn toàn vẫn cho RunState dùng được', () => {
		const run = sanitizeRun(undefined)
		expect(run.petId).toBe(PETS[0].id)
		expect(run.equipped).toEqual([])
		expect(run.inventory).toEqual([])
		expect(run.stage).toBe(1)
		expect(run.currency).toBe(0)
		expect(run.shop).toHaveLength(SHOP_SIZE)
	})

	it('thiếu equipped/inventory → mảng rỗng, không phải undefined', () => {
		// Đây chính là bản lưu đã làm cả trang trắng trước đây.
		const run = sanitizeRun({ ...validRun(), equipped: undefined, inventory: undefined })
		expect(Array.isArray(run.equipped)).toBe(true)
		expect(Array.isArray(run.inventory)).toBe(true)
	})

	it('equipped/inventory sai kiểu (chuỗi, số) → mảng rỗng', () => {
		expect(sanitizeRun({ ...validRun(), equipped: 'hong' as never }).equipped).toEqual([])
		expect(sanitizeRun({ ...validRun(), inventory: 42 as never }).inventory).toEqual([])
	})

	it('petId không tồn tại → về thú cưng mặc định', () => {
		const run = sanitizeRun({ ...validRun(), petId: 'khong-co-that' })
		expect(run.petId).toBe(PETS[0].id)
		expect(getPet(run.petId)).toBeTruthy()
	})

	it('pets không có cấp cho petId đang chọn → thêm cấp 1', () => {
		const run = sanitizeRun({ ...validRun(), pets: {} })
		expect(run.pets[run.petId]).toBe(1)
	})

	it('cấp thú ngoài khoảng 1..5 bị kẹp lại', () => {
		expect(sanitizeRun({ ...validRun(), pets: { 'fire-pup': 99 } }).pets['fire-pup']).toBe(5)
		expect(sanitizeRun({ ...validRun(), pets: { 'fire-pup': -3 } }).pets['fire-pup']).toBe(1)
		expect(sanitizeRun({ ...validRun(), pets: { 'fire-pup': Number.NaN } }).pets['fire-pup']).toBe(1)
	})

	it('pets chứa id lạ thì bị bỏ', () => {
		const run = sanitizeRun({ ...validRun(), pets: { 'fire-pup': 2, 'pet-la': 4 } })
		expect('pet-la' in run.pets).toBe(false)
	})

	it('màn và tiến trình bị kẹp trong 1..FINAL_STAGE', () => {
		expect(sanitizeRun({ ...validRun(), stage: 999 }).stage).toBe(FINAL_STAGE)
		expect(sanitizeRun({ ...validRun(), stage: -5 }).stage).toBe(1)
		expect(sanitizeRun({ ...validRun(), clearedStage: 999 }).clearedStage).toBe(FINAL_STAGE)
		expect(sanitizeRun({ ...validRun(), clearedStage: -1 }).clearedStage).toBe(0)
	})

	it('tiền, số lần đổi shop, thắng thua không nhận số âm hay NaN', () => {
		const run = sanitizeRun({ ...validRun(), currency: Number.NaN, rerolls: -2, wins: -1, losses: Number.POSITIVE_INFINITY })
		expect(run.currency).toBe(0)
		expect(run.rerolls).toBe(0)
		expect(run.wins).toBe(0)
		expect(run.losses).toBe(0)
	})

	it('bỏ món trỏ tới template không còn tồn tại', () => {
		const run = sanitizeRun({
			...validRun(),
			equipped: [createItemInstance('wooden-blade', 1, 'ok', 0)],
			inventory: [{ ...createItemInstance('wooden-blade', 1, 'bad'), templateId: 'da-bi-xoa' }],
		})
		expect(run.equipped.map((item) => item.uid)).toEqual(['ok'])
		expect(run.inventory).toEqual([])
	})

	it('bỏ món thiếu uid và bỏ uid trùng', () => {
		const base = createItemInstance('jade-fury', 1, 'a', 0)
		const run = sanitizeRun({
			...validRun(),
			equipped: [base, { ...base }, { ...base, uid: '' }, { ...base, uid: 'b', slot: 1 }],
		})
		expect(run.equipped.map((item) => item.uid)).toEqual(['a', 'b'])
	})

	it('món ở trang bị nhưng ô nằm ngoài lưới hiện tại thì về kho', () => {
		// Cấp 1 có 12 ô; ô 50 là ngoài lưới.
		const run = sanitizeRun({ ...validRun(), pets: { 'fire-pup': 1 }, equipped: [createItemInstance('jade-fury', 1, 'x', 50)] })
		expect(run.equipped).toEqual([])
		expect(run.inventory.map((item) => item.uid)).toEqual(['x'])
		expect(run.inventory[0].slot).toBe(-1)
	})

	it('sao và giá đã trả bị kẹp trong khoảng hợp lệ', () => {
		const run = sanitizeRun({
			...validRun(),
			inventory: [{ ...createItemInstance('jade-fury', 1, 'x'), star: 99 as never, paid: -5 }],
		})
		expect(run.inventory[0].star).toBe(4)
		expect(run.inventory[0].paid).toBe(0)
	})

	it('cửa hàng rỗng hoặc hỏng thì roll lại đủ số món', () => {
		expect(sanitizeRun({ ...validRun(), shop: [] }).shop).toHaveLength(SHOP_SIZE)
		expect(sanitizeRun({ ...validRun(), shop: 'hong' as never }).shop).toHaveLength(SHOP_SIZE)
		expect(sanitizeRun({ ...validRun(), shop: [{ templateId: 'khong-co' }] as never }).shop).toHaveLength(SHOP_SIZE)
	})

	it('thú cưng chưa mở khoá không nằm trong unlockedPets', () => {
		const run = sanitizeRun({ ...validRun(), unlockedPets: ['linh-tinh'] })
		expect(run.unlockedPets).toContain('fire-pup')
		expect(run.unlockedPets).not.toContain('linh-tinh')
	})

	it('kích thước lưới trang bị luôn suy ra được (kể cả bản lưu hỏng)', () => {
		const run = sanitizeRun({ petId: 'la', pets: { la: 3 } })
		expect(petLevelStats(getPet(run.petId), run.pets[run.petId]).bagSize).toBeGreaterThan(0)
	})
})
