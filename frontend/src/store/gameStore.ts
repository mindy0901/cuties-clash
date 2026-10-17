import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { buildEnemyCombatant, buildPlayerCombatant, estimatePower } from '../game/build'
import { REROLL_COST, STARTING_CURRENCY, rollShop } from '../game/economy'
import { getTemplate } from '../game/items'
import { dropInKho as moveInKho, rotateInKho as rotateKhoItem, unequipIntoKho } from '../game/kho'
import {
	acquireItem,
	dropEquipped,
	equipFromInventory,
	equipFromInventoryAt,
	equippedItems,
	loadoutShape,
	refundOf,
	rotateEquipped,
	sellItem,
	unequipToInventory,
} from '../game/loadout'
import { PETS, getPet, petUpgradeCost } from '../game/pets'
import { migrateV1ToV2, type PersistedV1 } from '../game/migrate'
import { sanitizeRun } from '../game/sanitize'
import { FINAL_STAGE, getStage, makeRivalBlueprint } from '../game/stages'
import { simulateBattle } from '../game/battle'
import type { BattleResult, ItemBlueprint, RunState } from '../game/types'

export type Phase = 'prep' | 'battle' | 'result' | 'victory'

/** Nơi một món đang nằm. Dùng để biết thả vào đâu thì gọi action nào. */
export type ItemHome = 'equipped' | 'inventory'

export interface BattleState {
	mode: 'stage' | 'pvp'
	opponentName: string
	opponentItems: ItemBlueprint[]
	stageIndex: number
	result: BattleResult
	committed: boolean
	reward: number
}

export interface Toast {
	id: number
	text: string
	tone: 'info' | 'good' | 'bad'
}

let toastId = 0
const STARTING_SEED = 20261016

function advanceSeed(seed: number): number {
	return (Math.imul(seed, 1103515245) + 12345) >>> 0
}

function createRun(seed = STARTING_SEED): RunState {
	const runSeed = advanceSeed(seed)
	return {
		petId: PETS[0].id,
		pets: { [PETS[0].id]: 1 },
		unlockedPets: [PETS[0].id],
		currency: STARTING_CURRENCY,
		stage: 1,
		clearedStage: 0,
		equipped: [],
		inventory: [],
		seed: runSeed,
		shop: rollShop(1, runSeed),
		rerolls: 0,
		wins: 0,
		losses: 0,
	}
}

interface GameStore {
	run: RunState
	phase: Phase
	battle: BattleState | null
	toasts: Toast[]
	newRun: () => void
	selectPet: (petId: string) => void
	upgradePet: () => void
	buyOffer: (index: number) => void
	reroll: () => void
	/** Bán một món, dù đang mang hay đang ở kho. */
	sell: (uid: string) => void
	/** Kéo thả trong lưới trang bị. */
	dropItem: (uid: string, slot: number, rotated?: boolean) => void
	/** Kéo thả trong lưới **kho** (kho là lưới tự do như trang bị). */
	dropInKho: (uid: string, slot: number | null, rotated?: boolean) => void
	/**
	 * Xoay một món đang mang 90° tại chỗ.
	 * Trả `true` nếu xoay được — dùng để gợi ý khi kéo khỏi lệch với thực tế.
	 */
	rotate: (uid: string) => boolean
	/** Xoay một món trong kho tại chỗ. `false` nếu hướng mới không vừa. */
	rotateInKho: (uid: string) => boolean
	/** Kho → trang bị (tự tìm chỗ trống). */
	equip: (uid: string) => void
	/** Đặt món từ kho vào đúng ô; `false` nếu hướng đó không vừa. */
	equipAt: (uid: string, slot: number, rotated: boolean) => boolean
	/** Trang bị → kho ở chỗ trống đầu tiên. */
	unequip: (uid: string) => void
	/** Trang bị → kho **vào đúng ô đang trỏ** (`slot = null` thì tự tìm chỗ). */
	unequipAt: (uid: string, slot: number | null, rotated: boolean) => void
	/** Chuyển một món về phía còn lại, tuỳ nó đang ở đâu. */
	transfer: (uid: string, from: ItemHome) => void
	startBattle: (mode: 'stage' | 'pvp') => void
	commitBattle: () => void
	leaveBattle: () => void
	pushToast: (text: string, tone?: Toast['tone']) => void
	dismissToast: (id: number) => void
}

type Persisted = { run: RunState }

export const useGameStore = create<GameStore>()(
	persist<GameStore, [], [], Persisted>(
		(set, get) => ({
			run: createRun(),
			phase: 'prep',
			battle: null,
			toasts: [],

			pushToast: (text, tone = 'info') => {
				toastId += 1
				const id = toastId
				set((state) => ({ toasts: [...state.toasts, { id, text, tone }] }))
				setTimeout(() => get().dismissToast(id), 2800)
			},

			dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

			newRun: () => set({ run: createRun(Date.now() % 100000), phase: 'prep', battle: null }),

			selectPet: (petId) =>
				set((state) => (state.run.unlockedPets.includes(petId) ? { run: { ...state.run, petId } } : state)),

			upgradePet: () =>
				set((state) => {
					const run = state.run
					const level = run.pets[run.petId] ?? 1
					if (level >= 5) {
						get().pushToast('Thú cưng đã đạt cấp tối đa', 'bad')
						return state
					}
					const cost = petUpgradeCost(level)
					if (run.currency < cost) {
						get().pushToast(`Cần ${cost} Paw Tally để nâng cấp`, 'bad')
						return state
					}
					return {
						run: { ...run, currency: run.currency - cost, pets: { ...run.pets, [run.petId]: level + 1 } },
					}
				}),

			buyOffer: (index) =>
				set((state) => {
					const run = state.run
					const offer = run.shop[index]
					if (!offer || offer.sold) return state
					if (run.currency < offer.cost) {
						get().pushToast('Không đủ Paw Tally', 'bad')
						return state
					}
					const seed = advanceSeed(run.seed)
					const { run: next, wentToInventory } = acquireItem(run, offer.templateId, offer.star, seed)
					const template = getTemplate(offer.templateId)
					if (wentToInventory) {
						get().pushToast(
							`Trang bị hết chỗ — ${template.name} được cất vào kho`,
							'info',
						)
					}
					return {
						run: {
							...next,
							currency: run.currency - offer.cost,
							seed,
							shop: run.shop.map((entry, entryIndex) =>
								entryIndex === index ? { ...entry, sold: true } : entry,
							),
						},
					}
				}),

			reroll: () =>
				set((state) => {
					const run = state.run
					if (run.currency < REROLL_COST) {
						get().pushToast('Không đủ Paw Tally để đổi shop', 'bad')
						return state
					}
					const seed = advanceSeed(run.seed)
					return {
						run: {
							...run,
							currency: run.currency - REROLL_COST,
							seed,
							rerolls: run.rerolls + 1,
							shop: rollShop(run.stage, seed),
						},
					}
				}),

			sell: (uid) =>
				set((state) => {
					const run = state.run
					const item = [...run.equipped, ...run.inventory].find((entry) => entry.uid === uid)
					if (!item) return state
					const refund = refundOf(item)
					get().pushToast(`Đã bán ${getTemplate(item.templateId).name} +${refund} Paw Tally`, 'good')
					return { run: sellItem(run, uid, refund) }
				}),

			dropItem: (uid, slot, rotated) =>
				set((state) => {
					const { run, merged, reason } = dropEquipped(state.run, uid, slot, rotated)
					if (merged) get().pushToast('Nhập thành công — món đồ lên sao!', 'good')
					else if (reason === 'blocked') get().pushToast('Chỗ đó không đủ chỗ cho món này', 'bad')
					else if (reason === 'no-space') get().pushToast('Không đủ chỗ để hoán đổi hai món', 'bad')
					return { run }
				}),

			dropInKho: (uid, slot, rotated) =>
				set((state) => {
					const { run, result } = moveInKho(state.run, uid, slot, rotated)
					if (result.merged) get().pushToast('Nhập thành công — món đồ lên sao!', 'good')
					return { run }
				}),

			rotate: (uid) => {
				const current = get().run
				const next = rotateEquipped(current, uid)
				if (next === current) {
					get().pushToast('Xoay lại thì không vừa chỗ — hãy kéo món ra chỗ khác trước', 'bad')
					return false
				}
				set({ run: next })
				return true
			},

			equip: (uid) =>
				set((state) => {
					const result = equipFromInventory(state.run, uid)
					if (!result.ok) {
						if (result.reason === 'no-space') {
							get().pushToast('Trang bị không còn chỗ — hãy bán hoặc bỏ bớt đồ', 'bad')
						}
						return state
					}
					return { run: result.run }
				}),

			/**
			 * Đặt món từ kho vào **đúng ô đang trỏ tới**.
			 *
			 * Trả `false` khi hướng đang chọn không vừa ô đó — chỗ gọi sẽ lùi về `equip()`
			 * để store tự tìm chỗ (thử cả hai hướng xoay).
			 */
			equipAt: (uid, slot, rotated) => {
				const result = equipFromInventoryAt(get().run, uid, slot, rotated)
				if (!result.ok) return false
				set({ run: result.run })
				return true
			},

			unequip: (uid) =>
				set((state) => {
					const result = unequipToInventory(state.run, uid)
					return result.ok ? { run: result.run } : state
				}),

			unequipAt: (uid, slot, rotated) => set((state) => ({ run: unequipIntoKho(state.run, uid, slot, rotated) })),

			rotateInKho: (uid) => {
				const next = rotateKhoItem(get().run, uid)
				if (!next) {
					get().pushToast('Xoay lại thì không vừa chỗ — hãy kéo món ra chỗ khác trước', 'bad')
					return false
				}
				set({ run: next })
				return true
			},

			transfer: (uid, from) => {
				if (from === 'inventory') get().equip(uid)
				else get().unequip(uid)
			},

			startBattle: (mode) =>
				set((state) => {
					const run = state.run
					const player = playerCombatantFor(run)
					const power = estimatePower(player)
					const seed = advanceSeed(run.seed)
					const blueprint =
						mode === 'stage'
							? getStage(run.stage).enemy
							: makeRivalBlueprint(power, run.stage, seed)
					const opponent = buildEnemyCombatant(blueprint)
					const reward = mode === 'stage' ? getStage(run.stage).reward : Math.round(12 + Math.min(45, power / 85))
					const result = simulateBattle(player, opponent, seed)
					return {
						run: { ...run, seed },
						phase: 'battle' as Phase,
						battle: {
							mode,
							opponentName: opponent.name,
							opponentItems: blueprint.items,
							stageIndex: run.stage,
							result,
							committed: false,
							reward,
						},
					}
				}),

			commitBattle: () =>
				set((state) => {
					const battle = state.battle
					if (!battle || battle.committed) return state
					const run = state.run
					const won = battle.result.winner === 'player'
					const committed: BattleState = { ...battle, committed: true }

					if (battle.mode === 'pvp') {
						if (won) get().pushToast(`Thắng giao hữu +${battle.reward} Paw Tally`, 'good')
						return {
							battle: committed,
							phase: 'result' as Phase,
							run: {
								...run,
								currency: run.currency + (won ? battle.reward : 0),
								wins: run.wins + (won ? 1 : 0),
								losses: run.losses + (won ? 0 : 1),
							},
						}
					}

					if (!won) {
						get().pushToast('Thất bại — sắp xếp lại trang bị rồi thử lại', 'bad')
						return {
							battle: committed,
							phase: 'result' as Phase,
							run: { ...run, losses: run.losses + 1 },
						}
					}

					const clearedStage = Math.max(run.clearedStage, run.stage)
					const unlocked = PETS.filter((pet) => pet.unlockStage > 0 && clearedStage >= pet.unlockStage).map(
						(pet) => pet.id,
					)
					const newlyUnlocked = unlocked.filter((id) => !run.unlockedPets.includes(id))
					for (const id of newlyUnlocked) get().pushToast(`Mở khoá thú cưng: ${getPet(id).name}`, 'good')

					const nextStage = Math.min(FINAL_STAGE, run.stage + 1)
					const seed = advanceSeed(run.seed)
					return {
						battle: committed,
						phase: (clearedStage >= FINAL_STAGE ? 'victory' : 'result') as Phase,
						run: {
							...run,
							currency: run.currency + battle.reward,
							stage: nextStage,
							clearedStage,
							unlockedPets: [...run.unlockedPets, ...newlyUnlocked],
							seed,
							shop: rollShop(nextStage, seed),
							wins: run.wins + 1,
						},
					}
				}),

			leaveBattle: () => set({ phase: 'prep', battle: null }),
		}),
		{
			name: 'martial-cutie-save',
			version: 2,
			partialize: (state) => ({ run: state.run }),
			/**
			 * Bản lưu v1 chỉ có `run.items` (một danh sách, tất cả đều tính là đang mang).
			 * Chuyển sang v2: giữ nguyên những món còn vừa lưới trang bị, phần dư dồn vào kho.
			 */
			migrate: (persisted, version) =>
				version >= 2 ? (persisted as Persisted) : (migrateV1ToV2(persisted as PersistedV1) as Persisted),
			/**
			 * Chuẩn hoá bản lưu sau khi migrate. Bắt buộc: một `RunState` hỏng (thiếu
			 * `equipped`, `petId` lạ…) làm `run.equipped.filter` ném lỗi lúc render và
			 * **cả trang trắng**, không còn UI để người chơi bấm "Chơi lại".
			 */
			merge: (persisted, current) => ({
				...current,
				run: sanitizeRun((persisted as Persisted | undefined)?.run),
			}),
		},
	),
)

/** Combatant của người chơi — **chỉ** đồ đang mang mới tham chiến. */
export function playerCombatantFor(run: RunState) {
	return buildPlayerCombatant(run.petId, run.pets[run.petId] ?? 1, equippedItems(run))
}

export function bagSizeFor(run: RunState): number {
	return loadoutShape(run).size
}
