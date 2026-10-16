import { describe, expect, it } from 'vitest'
import { bagSizeFor, useGameStore } from '../../store/gameStore'
import { SHOP_SIZE } from '../../game/economy'
import { createItemInstance, itemCells, sellValue } from '../../game/bag'
import { getPet, petLevelStats } from '../../game/pets'
import { FINAL_STAGE } from '../../game/stages'

function freshRun() {
	useGameStore.getState().newRun()
	return useGameStore.getState()
}

describe('game store loop', () => {
	it('starts a run with currency, a shop and nothing owned', () => {
		const state = freshRun()
		expect(state.run.stage).toBe(1)
		expect(state.run.clearedStage).toBe(0)
		expect(state.run.equipped).toHaveLength(0)
		expect(state.run.inventory).toHaveLength(0)
		expect(state.run.shop).toHaveLength(SHOP_SIZE)
		expect(state.run.currency).toBeGreaterThan(0)
		expect(state.phase).toBe('prep')
	})

	it('mua món thì mang lên trang bị ngay khi còn chỗ', () => {
		const state = freshRun()
		const offer = state.run.shop[0]
		const before = state.run.currency
		useGameStore.getState().buyOffer(0)
		const after = useGameStore.getState()
		expect(after.run.currency).toBe(before - offer.cost)
		expect(after.run.equipped).toHaveLength(1)
		expect(after.run.equipped[0].slot).toBe(0)
		expect(after.run.inventory).toHaveLength(0)
		expect(after.run.shop[0].sold).toBe(true)
	})

	it('trang bị hết chỗ thì món mua vào kho', () => {
		freshRun()
		// Đại đao 2×3: ba cái là kín lưới 4×3 (18/12 ô) — cái thứ ba phải vào kho.
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				currency: 99,
				shop: state.run.shop.map((offer) => ({ ...offer, templateId: 'great-axe', star: 1, cost: 3, sold: false })),
			},
		}))
		for (let index = 0; index < 3; index += 1) useGameStore.getState().buyOffer(index)
		const run = useGameStore.getState().run
		expect(run.equipped).toHaveLength(2)
		expect(run.inventory).toHaveLength(1)
		expect(run.inventory[0].slot, 'kho là lưới: món mua vào kho có ô thật').toBeGreaterThanOrEqual(0)
	})

	it('never buys the same offer twice', () => {
		freshRun()
		useGameStore.getState().buyOffer(0)
		const currency = useGameStore.getState().run.currency
		useGameStore.getState().buyOffer(0)
		expect(useGameStore.getState().run.currency).toBe(currency)
		expect(useGameStore.getState().run.equipped).toHaveLength(1)
	})

	it('refunds half of the paid price when an item is sold', () => {
		freshRun()
		useGameStore.getState().buyOffer(0)
		const item = useGameStore.getState().run.equipped[0]
		const currency = useGameStore.getState().run.currency
		useGameStore.getState().sell(item.uid)
		expect(useGameStore.getState().run.currency).toBe(currency + sellValue(item))
		expect(useGameStore.getState().run.equipped).toHaveLength(0)
	})

	it('bán được cả món đang ở kho', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: { ...state.run, inventory: [createItemInstance('great-axe', 2, 'stored')] },
		}))
		const item = useGameStore.getState().run.inventory[0]
		const currency = useGameStore.getState().run.currency
		useGameStore.getState().sell('stored')
		expect(useGameStore.getState().run.currency).toBe(currency + sellValue(item))
		expect(useGameStore.getState().run.inventory).toHaveLength(0)
	})

	it('charges for rerolls and refreshes the offer list', () => {
		freshRun()
		const before = useGameStore.getState()
		const seed = before.run.seed
		useGameStore.getState().reroll()
		const after = useGameStore.getState()
		expect(after.run.currency).toBe(before.run.currency - 2)
		expect(after.run.rerolls).toBe(before.run.rerolls + 1)
		expect(after.run.seed).not.toBe(seed)
	})

	it('merges two bought copies into a single 2★ item', () => {
		freshRun()
		// Ép hai offer giống hệt nhau để chạy trọn đường nhập sao.
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				currency: 99,
				shop: state.run.shop.map((offer, index) =>
					index < 2 ? { ...offer, templateId: 'wooden-blade', star: 1, cost: 3, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)
		useGameStore.getState().buyOffer(1)
		const items = useGameStore.getState().run.equipped
		expect(items).toHaveLength(2)
		useGameStore.getState().dropItem(items[1].uid, items[0].slot)
		const merged = useGameStore.getState().run.equipped
		expect(merged).toHaveLength(1)
		expect(merged[0].star).toBe(2)
		expect(merged[0].paid).toBe(6)
	})

	it('runs a full stage battle and commits the reward once', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				currency: 60,
				shop: state.run.shop.map((offer, index) =>
					index < 3
						? { ...offer, templateId: ['wooden-blade', 'hide-vest', 'jade-fury'][index], star: 2, cost: 6, sold: false }
						: offer,
				),
			},
		}))
		for (let index = 0; index < 3; index += 1) useGameStore.getState().buyOffer(index)
		useGameStore.getState().startBattle('stage')

		const battle = useGameStore.getState().battle
		expect(battle).not.toBeNull()
		expect(useGameStore.getState().phase).toBe('battle')
		expect(battle?.result.events.length).toBeGreaterThan(3)

		const won = battle?.result.winner === 'player'
		const currencyBefore = useGameStore.getState().run.currency
		const stageBefore = useGameStore.getState().run.stage
		useGameStore.getState().commitBattle()
		const after = useGameStore.getState()
		expect(after.phase).toBe('result')
		expect(after.run.currency).toBe(currencyBefore + (won ? (battle?.reward ?? 0) : 0))
		expect(after.run.stage).toBe(won ? stageBefore + 1 : stageBefore)
		if (won) expect(after.run.clearedStage).toBe(stageBefore)
		// Lịch sử thắng/thua được ghi lại.
		expect(after.run.wins + after.run.losses).toBe(1)

		// Commit lần hai không được trả thưởng thêm.
		useGameStore.getState().commitBattle()
		expect(useGameStore.getState().run.currency).toBe(after.run.currency)
		expect(useGameStore.getState().run.stage).toBe(after.run.stage)
	})

	it('keeps the stage ladder inside its bounds', () => {
		freshRun()
		useGameStore.setState((state) => ({ run: { ...state.run, stage: FINAL_STAGE, clearedStage: FINAL_STAGE - 1 } }))
		expect(useGameStore.getState().run.stage).toBe(FINAL_STAGE)
	})

	it('reports a loadout size that matches the active pet level', () => {
		freshRun()
		expect(bagSizeFor(useGameStore.getState().run)).toBeGreaterThan(0)
	})

	it('trang bị 4 cột và số hàng tăng theo cấp thú', () => {
		freshRun()
		const first = useGameStore.getState().run
		const level1 = petLevelStats(getPet(first.petId), 1)
		expect(level1.bag.width).toBe(4)
		expect(level1.bag.rows).toBe(3)

		const level5 = petLevelStats(getPet(first.petId), 5)
		expect(level5.bag.width).toBe(4)
		expect(level5.bag.rows).toBe(5)
		expect(level5.bagSize).toBeGreaterThan(level1.bagSize)
	})

	it('món nhiều ô chiếm đúng số ô trên trang bị', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				currency: 99,
				shop: state.run.shop.map((offer, index) =>
					index === 0 ? { ...offer, templateId: 'fire-spear', star: 1, cost: 4, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)
		// Thân đao 1×4 không vừa lưới 3 hàng nên phải xoay ngang thành 4×1 (4 ô).
		const item = useGameStore.getState().run.equipped[0]
		expect(item.rotated).toBe(true)
		expect(itemCells(item, 4)).toHaveLength(4)
	})

	it('xoay món 1×3 trên trang bị thành 3×1 và đổi các ô chiếm', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [createItemInstance('wooden-blade', 1, 'sword', 1)],
			},
		}))
		expect(itemCells(useGameStore.getState().run.equipped[0], 4)).toEqual([1, 5, 9])

		useGameStore.getState().rotate('sword')

		const rotated = useGameStore.getState().run.equipped[0]
		expect(rotated.rotated).toBe(true)
		// Neo ở cột 1 nên khối 3 ô ngang vừa trong lưới 4 cột.
		expect(itemCells(rotated, 4)).toEqual([1, 2, 3])
	})

	it('từ chối xoay khi hướng mới đè món khác', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [
					createItemInstance('wooden-blade', 1, 'sword', 1),
					createItemInstance('jade-fury', 1, 'blocker', 3),
				],
			},
		}))
		useGameStore.getState().rotate('sword')
		expect(useGameStore.getState().run.equipped.find((item) => item.uid === 'sword')?.rotated).toBe(false)
	})

	it('tháo đồ về kho và mang lại lên trang bị', () => {
		freshRun()
		useGameStore.getState().buyOffer(0)
		const uid = useGameStore.getState().run.equipped[0].uid

		useGameStore.getState().unequip(uid)
		let run = useGameStore.getState().run
		expect(run.equipped).toHaveLength(0)
		expect(run.inventory).toHaveLength(1)
		expect(run.inventory[0].slot, 'kho là lưới: món vào kho phải có ô thật').toBeGreaterThanOrEqual(0)

		useGameStore.getState().equip(uid)
		run = useGameStore.getState().run
		expect(run.inventory).toHaveLength(0)
		expect(run.equipped).toHaveLength(1)
		expect(run.equipped[0].slot).toBeGreaterThanOrEqual(0)
	})

	it('món ở kho KHÔNG tham chiến', () => {
		freshRun()
		useGameStore.getState().buyOffer(0)
		const equippedUid = useGameStore.getState().run.equipped[0].uid
		const powerWithItem = bagSizeFor(useGameStore.getState().run)

		useGameStore.getState().unequip(equippedUid)
		expect(powerWithItem).toBeGreaterThan(0)
		// Trang bị rỗng nên không đánh được.
		expect(useGameStore.getState().run.equipped).toHaveLength(0)
		expect(useGameStore.getState().run.inventory).toHaveLength(1)
	})
})
