import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { buildEnemyCombatant, buildPlayerCombatant, estimatePower } from '../game/build'
import { createItemInstance, findFreeSlot, resolveDrop, sellValue } from '../game/bag'
import { REROLL_COST, STARTING_CURRENCY, rollShop } from '../game/economy'
import { getTemplate } from '../game/items'
import { PETS, getPet, petLevelStats, petUpgradeCost } from '../game/pets'
import { makeUid } from '../game/rng'
import { FINAL_STAGE, getStage, makeRivalBlueprint } from '../game/stages'
import { simulateBattle } from '../game/battle'
import type { BattleResult, ItemInstance, RunState } from '../game/types'

export type Phase = 'prep' | 'battle' | 'result' | 'victory'

export interface BattleState {
	mode: 'stage' | 'pvp'
	opponentName: string
	opponentItems: { templateId: string; star: number; slot: number }[]
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
		items: [],
		seed: runSeed,
		shop: rollShop(1, runSeed),
		rerolls: 0,
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
	sell: (uid: string) => void
	dropItem: (uid: string, slot: number) => void
	dropToTray: (uid: string) => void
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
					const level = run.pets[run.petId] ?? 1
					const bagSize = petLevelStats(getPet(run.petId), level).bagSize
					const seed = advanceSeed(run.seed)
					const base = createItemInstance(
						offer.templateId,
						offer.star,
						makeUid(seed, `${offer.templateId}-${run.items.length}`),
					)
					const freeSlot = findFreeSlot(run.items, bagSize)
					const item: ItemInstance = freeSlot >= 0 ? { ...base, slot: freeSlot } : base
					if (freeSlot < 0) get().pushToast('Túi đã đầy — món đồ nằm ở khay chờ', 'bad')
					return {
						run: {
							...run,
							currency: run.currency - offer.cost,
							items: [...run.items, item],
							shop: run.shop.map((entry, entryIndex) => (entryIndex === index ? { ...entry, sold: true } : entry)),
							seed,
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
					const item = state.run.items.find((entry) => entry.uid === uid)
					if (!item) return state
					const refund = sellValue(item)
					get().pushToast(`Đã bán ${getTemplate(item.templateId).name} +${refund} Paw Tally`, 'good')
					return {
						run: {
							...state.run,
							currency: state.run.currency + refund,
							items: state.run.items.filter((entry) => entry.uid !== uid),
						},
					}
				}),

			dropItem: (uid, slot) =>
				set((state) => {
					const run = state.run
					const level = run.pets[run.petId] ?? 1
					const bagSize = petLevelStats(getPet(run.petId), level).bagSize
					const result = resolveDrop(run.items, uid, slot, bagSize)
					if (result.merged) get().pushToast('Nhập thành công — món đồ lên sao!', 'good')
					return { run: { ...run, items: result.items } }
				}),

			dropToTray: (uid) =>
				set((state) => ({
					run: {
						...state.run,
						items: state.run.items.map((item) => (item.uid === uid ? { ...item, slot: -1 } : item)),
					},
				})),

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
							run: { ...run, currency: run.currency + (won ? battle.reward : 0) },
						}
					}

					if (!won) {
						get().pushToast('Thất bại — sắp xếp lại túi đồ rồi thử lại', 'bad')
						return { battle: committed, phase: 'result' as Phase, run }
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
						},
					}
				}),

			leaveBattle: () => set({ phase: 'prep', battle: null }),
		}),
		{
			name: 'martial-cutie-save',
			version: 1,
			partialize: (state) => ({ run: state.run }),
		},
	),
)

export function playerCombatantFor(run: RunState) {
	return buildPlayerCombatant(run.petId, run.pets[run.petId] ?? 1, run.items)
}

export function bagSizeFor(run: RunState): number {
	return petLevelStats(getPet(run.petId), run.pets[run.petId] ?? 1).bagSize
}
