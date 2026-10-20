import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { buildEnemyCombatant, buildPlayerCombatant, estimatePower } from '../game/build'
import { REROLL_COST, STARTING_CURRENCY, rollShop } from '../game/economy'
import { itemTemplateById } from '../game/items'
import {
	dropInStorage as moveInStorage,
	rotateInStorage as rotateStorageItem,
	sortStorage as sortStorageItems,
	unequipIntoStorage,
} from '../game/storage'
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
import { MAX_CUTIE_LEVEL, CUTIES, cutieList, cutieUpgradeCost } from '../game/cuties'
import { migrateV1ToV2, migrateV2ToV3, type PersistedV1 } from '../game/migrate'
import { sanitizeRun } from '../game/sanitize'
import { FINAL_STAGE, getStage, highestAccessibleStage, makeRivalBlueprint } from '../game/stages'
import { TRAINING_HORIZON_MS, makeTrainingBlueprint } from '../game/training'
import { simulateBattle } from '../game/battle'
import type { BattleResult, ItemBlueprint, RunState } from '../game/types'

export type Phase = 'prep' | 'battle' | 'result' | 'victory'

/** Where an item currently lives. Tells a drop target which action to call. */
export type ItemHome = 'equipped' | 'inventory'

/** `training` is the practice room: an immortal dummy, no reward, no stage change. */
export type BattleMode = 'stage' | 'pvp' | 'training'

export interface BattleState {
	mode: BattleMode
	opponentName: string
	opponentItems: ItemBlueprint[]
	stageIndex: number
	result: BattleResult
	committed: boolean
	reward: number
	/** Training only: the setting this session was started with, so "Đánh lại" repeats it exactly. */
	trainingAttacks?: boolean
}

const STARTING_SEED = 20261016

function advanceSeed(seed: number): number {
	return (Math.imul(seed, 1103515245) + 12345) >>> 0
}

function createRun(seed = STARTING_SEED): RunState {
	const runSeed = advanceSeed(seed)
	return {
		cutieId: CUTIES[0].id,
		cuties: { [CUTIES[0].id]: 1 },
		unlockedCuties: [CUTIES[0].id],
		gold: STARTING_CURRENCY,
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
	newRun: () => void
	selectCutie: (cutieId: string) => void
	selectStage: (stageIndex: number) => boolean
	upgradeCutie: () => void
	buyOffer: (index: number) => void
	reroll: () => void
	/** Sells an item, whether it is carried or in storage. */
	sell: (uid: string) => void
	/** Drag and drop inside the loadout grid. */
	dropItem: (uid: string, slot: number, rotated?: boolean) => void
	/** Drag and drop inside the **storage** grid (a free grid, like the loadout). */
	dropInStorage: (uid: string, slot: number | null, rotated?: boolean) => void
	/** Repack the whole storage: strongest items first, no gaps. Only the player can trigger it. */
	sortStorage: () => void
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
	/**
	 * Start a fight. `options.attacks` only matters for `training`: `false` makes the dummy hold its
	 * one weapon without ever swinging.
	 */
	startBattle: (mode: BattleMode, options?: { attacks?: boolean }) => void
	/**
	 * Drop items / shop offers whose template no longer exists anywhere.
	 *
	 * Called once the content overlay is resolved: until then an unknown id may be an item whose row has
	 * not arrived yet (see `contentResolved` in `game/content.ts`), so the run keeps it. ❌ Never call
	 * this before the fetch settles — that is what used to delete a freshly bought created item.
	 */
	pruneUnknownItems: () => void
	commitBattle: () => void
	leaveBattle: () => void
	/** Closes the victory screen but keeps the finished run — see the action's own note. */
	continueRun: () => void
}

type Persisted = { run: RunState }

export const useGameStore = create<GameStore>()(
	persist<GameStore, [], [], Persisted>(
		(set, get) => ({
			run: createRun(),
			phase: 'prep',
			battle: null,

			newRun: () => set({ run: createRun(Date.now() % 100000), phase: 'prep', battle: null }),

			selectCutie: (cutieId) =>
				set((state) => (state.run.unlockedCuties.includes(cutieId) ? { run: { ...state.run, cutieId } } : state)),

			selectStage: (stageIndex) => {
				const state = get()
				if (state.phase !== 'prep') return false
				if (!Number.isInteger(stageIndex) || stageIndex < 1 || stageIndex > highestAccessibleStage(state.run.clearedStage)) {
					return false
				}
				if (stageIndex === state.run.stage) return true

				const seed = advanceSeed(state.run.seed)
				set({
					run: {
						...state.run,
						stage: stageIndex,
						seed,
						shop: rollShop(stageIndex, state.run.clearedStage, seed),
					},
				})
				return true
			},

			// The refusals return before any `set`, so the run stays untouched.
			upgradeCutie: () => {
				const state = get()
				const run = state.run
				const level = run.cuties[run.cutieId] ?? 1
				if (level >= MAX_CUTIE_LEVEL) return
				const cost = cutieUpgradeCost(level)
				if (run.gold < cost) return
				set({
					run: { ...run, gold: run.gold - cost, cuties: { ...run.cuties, [run.cutieId]: level + 1 } },
				})
			},

			buyOffer: (index) =>
				set((state) => {
					const run = state.run
					const offer = run.shop[index]
					if (!offer || offer.sold) return state
					if (run.gold < offer.cost) return state
					const seed = advanceSeed(run.seed)
					const { run: next } = acquireItem(run, offer.templateId, offer.star, seed)
					return {
						run: {
							...next,
							gold: run.gold - offer.cost,
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
					if (run.gold < REROLL_COST) return state
					const seed = advanceSeed(run.seed)
					return {
						run: {
							...run,
							gold: run.gold - REROLL_COST,
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
					return { run: sellItem(run, uid, refund) }
				}),

			dropItem: (uid, slot, rotated) =>
				set((state) => {
					const { run } = dropEquipped(state.run, uid, slot, rotated)
					return { run }
				}),

			dropInStorage: (uid, slot, rotated) =>
				set((state) => {
					const { run } = moveInStorage(state.run, uid, slot, rotated)
					return { run }
				}),

			sortStorage: () => {
				const run = get().run
				if (run.inventory.length < 2) return
				set({ run: { ...run, inventory: sortStorageItems(run.inventory) } })
			},

			rotate: (uid) => {
				const current = get().run
				const next = rotateEquipped(current, uid)
				if (next === current) return false
				set({ run: next })
				return true
			},

			equip: (uid) =>
				set((state) => {
					const result = equipFromInventory(state.run, uid)
					if (!result.ok) return state
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
				if (!next) return false
				set({ run: next })
				return true
			},

			transfer: (uid, from) => {
				if (from === 'inventory') get().equip(uid)
				else get().unequip(uid)
			},

			startBattle: (mode, options = {}) =>
				set((state) => {
					const run = state.run
					const training = mode === 'training'
					// Training is a **mirror**: the player's bar stays full exactly like the dummy's, so a
					// practice session reads as "what my build does", never as "am I about to die".
					const builtPlayer = playerCombatantFor(run)
					const player = training ? { ...builtPlayer, immortal: true } : builtPlayer
					const power = estimatePower(player)
					const seed = advanceSeed(run.seed)
					const blueprint = training
						? makeTrainingBlueprint()
						: mode === 'stage'
							? getStage(run.stage).enemy
							: makeRivalBlueprint(power, run.stage, seed)
					const opponent = buildEnemyCombatant(
						blueprint,
						// Training: the dummy never dies, and it only swings when the toggle says so —
						// its single weapon still sits on the board either way.
						training ? { immortal: true, noSwings: options.attacks !== true } : {},
					)
					const reward = training
						? 0
						: mode === 'stage'
							? getStage(run.stage).reward
							: Math.round(12 + Math.min(45, power / 85))
					const result = simulateBattle(
						player,
						opponent,
						seed,
						// A practice session has **no time limit**: the horizon is only how much the replay
						// pre-computes, and the death zone is off so the clock cannot kill either side.
						training ? { maxTime: TRAINING_HORIZON_MS, noDeathZone: true } : {},
					)
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
							...(training ? { trainingAttacks: options.attacks === true } : {}),
						},
					}
				}),

			pruneUnknownItems: () =>
				set((state) => {
					const run = state.run
					const known = (templateId: string) => Boolean(itemTemplateById(templateId))
					const equipped = run.equipped.filter((item) => known(item.templateId))
					const inventory = run.inventory.filter((item) => known(item.templateId))
					const shop = run.shop.filter((offer) => known(offer.templateId))
					const unchanged =
						equipped.length === run.equipped.length &&
						inventory.length === run.inventory.length &&
						shop.length === run.shop.length
					if (unchanged) return state
					return { run: { ...run, equipped, inventory, shop } }
				}),

			commitBattle: () =>
				set((state) => {
					const battle = state.battle
					if (!battle || battle.committed) return state
					const run = state.run
					const won = battle.result.winner === 'player'
					const committed: BattleState = { ...battle, committed: true }

					// Practice pays nothing and changes nothing: no Vàng, no win/loss, no stage.
					if (battle.mode === 'training') {
						return { battle: committed, phase: 'result' as Phase }
					}

					if (battle.mode === 'pvp') {
						return {
							battle: committed,
							phase: 'result' as Phase,
							run: {
								...run,
								gold: run.gold + (won ? battle.reward : 0),
								wins: run.wins + (won ? 1 : 0),
								losses: run.losses + (won ? 0 : 1),
							},
						}
					}

					if (!won) {
						return {
							battle: committed,
							phase: 'result' as Phase,
							run: { ...run, losses: run.losses + 1 },
						}
					}

					const clearedStage = Math.max(run.clearedStage, run.stage)
					const unlocked = cutieList().filter((cutie) => cutie.unlockStage > 0 && clearedStage >= cutie.unlockStage).map(
						(cutie) => cutie.id,
					)
					const newlyUnlocked = unlocked.filter((id) => !run.unlockedCuties.includes(id))

					const nextStage = Math.min(FINAL_STAGE, run.stage + 1)
					const seed = advanceSeed(run.seed)
					// The victory screen belongs to the **first** full clear only: replaying stage 60 for
					// gold afterwards is an ordinary win and must land on the result panel, otherwise the
					// player would have to dismiss the celebration after every single re-run.
					const firstFullClear = clearedStage >= FINAL_STAGE && run.clearedStage < FINAL_STAGE
					return {
						battle: committed,
						phase: (firstFullClear ? 'victory' : 'result') as Phase,
						run: {
							...run,
							gold: run.gold + battle.reward,
							stage: nextStage,
							clearedStage,
							unlockedCuties: [...run.unlockedCuties, ...newlyUnlocked],
							seed,
							shop: rollShop(nextStage, clearedStage, seed),
							wins: run.wins + 1,
						},
					}
				}),

			leaveBattle: () => set({ phase: 'prep', battle: null }),

			/**
			 * Dismisses the victory screen and **keeps the finished run**: every item, all the Vàng and
			 * all 60 cleared stages stay, so the player can go back to the preparation room, re-fight a
			 * cleared stage, farm, rearrange gear — or start over deliberately from the top bar.
			 *
			 * ❌ Never merge this with `newRun()`: "I am done with the campaign" and "throw everything
			 * away" are different decisions, and the lone Start Over button forced the second one.
			 */
			continueRun: () => set((state) => (state.phase === 'victory' ? { phase: 'prep' as Phase } : state)),
		}),
		{
			name: 'martial-cutie-save',
			version: 3,
			partialize: (state) => ({ run: state.run }),
			/**
			 * v1 → v2: a v1 save only has `run.items` (one list, everything counts as carried), so the
			 * items that still fit the loadout grid stay worn and the rest move into the storage.
			 *
			 * v2 → v3: the domain word `cutie` became **cutie**, and three saved fields were renamed
			 * (`petId` / `pets` / `unlockedPets`). Skipping it would reset the player's Cutie, its level
			 * and everything they unlocked — an old save is still on disk **and** on the server.
			 */
			migrate: (persisted, version) => {
				if (version >= 3) return persisted as Persisted
				const v2 = version >= 2 ? persisted : migrateV1ToV2(persisted as PersistedV1)
				return migrateV2ToV3(v2 as never) as Persisted
			},
			/**
			 * Normalizes the save after migrating. Required: a broken `RunState` (missing
			 * `equipped`, unknown `cutieId`…) makes `run.equipped.filter` throw while rendering and
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
	return buildPlayerCombatant(run.cutieId, run.cuties[run.cutieId] ?? 1, equippedItems(run))
}

export function bagSizeFor(run: RunState): number {
	return loadoutShape(run).size
}
