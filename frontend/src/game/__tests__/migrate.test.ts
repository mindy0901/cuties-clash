import { describe, expect, it } from 'vitest'
import { migrateV1ToV2 } from '../migrate'
import { createItemInstance } from '../bag'
import { getPet, petLevelStats } from '../pets'
import type { RunState } from '../types'

/** Bản lưu v1 tối thiểu, đủ trường để migrate chạy. */
function v1Run(items: ReturnType<typeof createItemInstance>[]): Parameters<typeof migrateV1ToV2>[0] {
	return {
		run: {
			petId: getPet('fire-pup').id,
			pets: { 'fire-pup': 1 },
			unlockedPets: ['fire-pup'],
			currency: 20,
			stage: 5,
			clearedStage: 4,
			seed: 123,
			shop: [],
			rerolls: 1,
			wins: 2,
			losses: 1,
			items,
		},
	}
}

describe('migrate bản lưu v1 → v2', () => {
	it('cấp 1 có lưới 4×3 = 12 ô', () => {
		const { bagSize } = petLevelStats(getPet('fire-pup'), 1)
		expect(bagSize).toBe(12)
	})

	it('giữ món còn chỗ là đang mang, dồn phần dư vào kho', () => {
		// Cấp 1 chỉ có 12 ô; đặt 13 món 1 ô thì món cuối phải sang kho.
		const items = Array.from({ length: 13 }, (_, slot) => createItemInstance('jade-fury', 1, `i${slot}`, slot))
		const migrated = migrateV1ToV2(v1Run(items)) as { run: RunState }

		expect(migrated.run.equipped).toHaveLength(12)
		expect(migrated.run.inventory).toHaveLength(1)
		expect(migrated.run.inventory[0].uid).toBe('i12')
		expect(migrated.run.inventory[0].slot).toBe(-1)
	})

	it('món ở khay chờ (slot -1) chuyển vào kho', () => {
		const items = [
			createItemInstance('jade-fury', 1, 'worn', 0),
			createItemInstance('great-axe', 1, 'tray'),
		]
		const migrated = migrateV1ToV2(v1Run(items)) as { run: RunState }

		expect(migrated.run.equipped.map((item) => item.uid)).toEqual(['worn'])
		expect(migrated.run.inventory.map((item) => item.uid)).toEqual(['tray'])
	})

	it('giữ nguyên tiền, màn, thú cưng và lịch sử đấu', () => {
		const migrated = migrateV1ToV2(v1Run([createItemInstance('jade-fury', 1, 'a', 0)])) as { run: RunState }
		expect(migrated.run.currency).toBe(20)
		expect(migrated.run.stage).toBe(5)
		expect(migrated.run.clearedStage).toBe(4)
		expect(migrated.run.petId).toBe('fire-pup')
		expect(migrated.run.wins).toBe(2)
		expect(migrated.run.losses).toBe(1)
		// Không còn trường `items` cũ.
		expect('items' in migrated.run).toBe(false)
	})

	it('không mất món nào khi lưới nhỏ hơn số món', () => {
		const items = Array.from({ length: 20 }, (_, slot) => createItemInstance('jade-fury', 1, `i${slot}`, slot))
		const migrated = migrateV1ToV2(v1Run(items)) as { run: RunState }
		expect(migrated.run.equipped.length + migrated.run.inventory.length).toBe(20)
	})

	it('bản lưu rỗng hoặc thiếu run thì trả nguyên trạng, không ném lỗi', () => {
		expect(() => migrateV1ToV2({})).not.toThrow()
		expect(migrateV1ToV2({})).toEqual({})
		const noItems = v1Run([])
		const migrated = migrateV1ToV2(noItems) as { run: RunState }
		expect(migrated.run.equipped).toEqual([])
		expect(migrated.run.inventory).toEqual([])
	})
})
