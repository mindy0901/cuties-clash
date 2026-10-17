import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { buildEnemyCombatant, buildPlayerCombatant, estimatePower } from '../game/build'
import { REROLL_COST, STARTING_CURRENCY, rollShop } from '../game/economy'
import { getTemplate } from '../game/items'
import { dropInStorage as moveInStorage, rotateInStorage as rotateStorageItem, unequipIntoStorage } from '../game/storage'
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
import { PETS, getPet, petList, petUpgradeCost } from '../game/pets'
import { migrateV1ToV2, type PersistedV1 } from '../game/migrate'
import { sanitizeRun } from '../game/sanitize'
import { FINAL_STAGE, getStage, makeRivalBlueprint } from '../game/stages'
import { simulateBattle } from '../game/battle'
import type { BattleResult, ItemBlueprint, RunState } from '../game/types'

export type Phase = 'prep' | 'battle' | 'result' | 'victory'

/** Where an item currently lives. Tells a drop target which action to call. */
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
		shop: rollShop(1, 0, runSeed),
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
	/** Sells an item, whether it is carried or in storage. */
	sell: (uid: string) => void
	/** Drag and drop inside the loadout grid. */
	dropItem: (uid: string, slot: number, rotated?: boolean) => void
	/** Drag and drop inside the **storage** grid (a free grid, like the loadout). */
	dropInStorage: (uid: string, slot: number | null, rotated?: boolean) => void
	/**
	 * Rotates a carried item 90° in place.
	 * Returns `true` when it rotated — used to keep the hint honest while dragging.
	 */
	rotate: (uid: string) => boolean
	/** Rotates an item in storage in place. `false` when the new orientation does not fit. */
	rotateInStorage: (uid: string) => boolean
	/** Storage → loadout (finds a free spot). */
	equip: (uid: string) => void
	/** Places a storage item on an exact cell; `false` when that orientation does not fit. */
	equipAt: (uid: string, slot: number, rotated: boolean) => boolean
	/** Loadout → storage, on the first free spot. */
	unequip: (uid: string) => void
	/** Loadout → storage, **on the hovered cell** (`slot = null` searches for a spot). */
	unequipAt: (uid: string, slot: number | null, rotated: boolean) => void
	/** Moves an item to the other side, whichever side it is on. */
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
							shop: rollShop(run.stage, run.clearedStage, seed),
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

			dropInStorage: (uid, slot, rotated) =>
				set((state) => {
					const { run, result } = moveInStorage(state.run, uid, slot, rotated)
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
			 * Places a storage item on the **exact hovered cell**.
			 *
			 * Returns `false` when the chosen orientation does not fit that cell — the caller then
			 * falls back to `equip()` so the store can search for a spot (trying both orientations).
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

			unequipAt: (uid, slot, rotated) => set((state) => ({ run: unequipIntoStorage(state.run, uid, slot, rotated) })),

			rotateInStorage: (uid) => {
				const next = rotateStorageItem(get().run, uid)
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
					const unlocked = petList().filter((pet) => pet.unlockStage > 0 && clearedStage >= pet.unlockStage).map(
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
							shop: rollShop(nextStage, clearedStage, seed),
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
			 * A v1 save only has `run.items` (one list, everything counts as carried).
			 * Migrating to v2: keep the items that still fit the loadout grid, dump the rest into
			 * storage.
			 */
			migrate: (persisted, version) =>
				version >= 2 ? (persisted as Persisted) : (migrateV1ToV2(persisted as PersistedV1) as Persisted),
			/**
			 * Normalizes the save after migrating. Required: a broken `RunState` (missing
			 * `equipped`, unknown `petId`…) makes `run.equipped.filter` throw while rendering and
			 * **blanks the whole page**, leaving no UI for the player to press "Chơi lại".
			 */
			merge: (persisted, current) => ({
				...current,
				run: sanitizeRun((persisted as Persisted | undefined)?.run),
			}),
		},
	),
)

/** The player's combatant — **only** carried items take part in the fight. */
export function playerCombatantFor(run: RunState) {
	return buildPlayerCombatant(run.petId, run.pets[run.petId] ?? 1, equippedItems(run))
}

export function bagSizeFor(run: RunState): number {
	return loadoutShape(run).size
}
