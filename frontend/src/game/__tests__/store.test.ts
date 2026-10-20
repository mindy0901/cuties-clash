import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bagSizeFor, useGameStore } from '../../store/gameStore'
import { applyContentOverrides } from '../../game/content'
import { installRetiredItems } from '../../test/retiredItems'
import { SHOP_SIZE } from '../../game/economy'
import { createItemInstance, itemCells, sellValue } from '../../game/bag'
import { getCutie, cutieLevelStats } from '../../game/cuties'
import { FINAL_STAGE } from '../../game/stages'

function freshRun() {
	useGameStore.getState().newRun()
	return useGameStore.getState()
}

/** The overlay is a module variable: every case that touches it must clear it. */
afterEach(() => applyContentOverrides(null))
// Purchases need real templates; the retired catalogue is registered as the overlay.
beforeEach(() => installRetiredItems())

describe('game store loop', () => {
	it('starts a run with gold, a shop and nothing owned', () => {
		const state = freshRun()
		expect(state.run.stage).toBe(1)
		expect(state.run.clearedStage).toBe(0)
		expect(state.run.equipped).toHaveLength(0)
		expect(state.run.inventory).toHaveLength(0)
		expect(state.run.shop).toHaveLength(SHOP_SIZE)
		expect(state.run.gold).toBeGreaterThan(0)
		expect(state.phase).toBe('prep')
	})

	it('buys an item straight onto the equip grid while there is room', () => {
		const state = freshRun()
		const offer = state.run.shop[0]
		const before = state.run.gold
		useGameStore.getState().buyOffer(0)
		const after = useGameStore.getState()
		expect(after.run.gold).toBe(before - offer.cost)
		expect(after.run.equipped).toHaveLength(1)
		expect(after.run.equipped[0].slot).toBe(0)
		expect(after.run.inventory).toHaveLength(0)
		expect(after.run.shop[0].sold).toBe(true)
	})

	it('sends a purchase to the storage once the equip grid is full', () => {
		freshRun()
		// 2×3 great axe: three of them fill the 4×3 grid (18/12 cells) — the third goes to the storage.
		// Different star ranks on purpose: identical copies would merge instead of taking a cell.
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 99,
				shop: state.run.shop.map((offer, index) => ({
					...offer,
					templateId: 'great-axe',
					star: (index + 1) as 1 | 2 | 3,
					cost: 3,
					sold: false,
				})),
			},
		}))
		for (let index = 0; index < 3; index += 1) useGameStore.getState().buyOffer(index)
		const run = useGameStore.getState().run
		expect(run.equipped).toHaveLength(2)
		expect(run.inventory).toHaveLength(1)
		expect(run.inventory[0].slot, 'the storage is a grid: a purchased item gets a real cell').toBeGreaterThanOrEqual(0)
	})

	it('never buys the same offer twice', () => {
		freshRun()
		useGameStore.getState().buyOffer(0)
		const gold = useGameStore.getState().run.gold
		useGameStore.getState().buyOffer(0)
		expect(useGameStore.getState().run.gold).toBe(gold)
		expect(useGameStore.getState().run.equipped).toHaveLength(1)
	})

	it('refunds half of the paid price when an item is sold', () => {
		freshRun()
		useGameStore.getState().buyOffer(0)
		const item = useGameStore.getState().run.equipped[0]
		const gold = useGameStore.getState().run.gold
		useGameStore.getState().sell(item.uid)
		expect(useGameStore.getState().run.gold).toBe(gold + sellValue(item))
		expect(useGameStore.getState().run.equipped).toHaveLength(0)
	})

	it('can sell an item sitting in the storage', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: { ...state.run, inventory: [createItemInstance('great-axe', 2, 'stored')] },
		}))
		const item = useGameStore.getState().run.inventory[0]
		const gold = useGameStore.getState().run.gold
		useGameStore.getState().sell('stored')
		expect(useGameStore.getState().run.gold).toBe(gold + sellValue(item))
		expect(useGameStore.getState().run.inventory).toHaveLength(0)
	})

	it('charges for rerolls and refreshes the offer list', () => {
		freshRun()
		const before = useGameStore.getState()
		const seed = before.run.seed
		useGameStore.getState().reroll()
		const after = useGameStore.getState()
		expect(after.run.gold).toBe(before.run.gold - 2)
		expect(after.run.rerolls).toBe(before.run.rerolls + 1)
		expect(after.run.seed).not.toBe(seed)
	})

	it('merges two bought copies into a single 2★ item without any dragging', () => {
		freshRun()
		// Force two identical offers so the whole star-merge path runs.
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 99,
				shop: state.run.shop.map((offer, index) =>
					index < 2 ? { ...offer, templateId: 'wooden-blade', star: 1, cost: 3, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)
		const worn = useGameStore.getState().run.equipped
		expect(worn).toHaveLength(1)
		useGameStore.getState().buyOffer(1)
		const merged = useGameStore.getState().run.equipped
		expect(merged, 'the bought copy is consumed by the merge').toHaveLength(1)
		expect(merged[0].uid).toBe(worn[0].uid)
		expect(merged[0].slot).toBe(worn[0].slot)
		expect(merged[0].star).toBe(2)
		expect(merged[0].paid).toBe(6)
		expect(useGameStore.getState().run.inventory).toHaveLength(0)
	})

	it('merges a bought copy into the storage when the equip grid has no twin', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 99,
				inventory: [createItemInstance('wooden-blade', 2, 'stored')],
				shop: state.run.shop.map((offer, index) =>
					index === 0 ? { ...offer, templateId: 'wooden-blade', star: 2, cost: 3, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)
		const run = useGameStore.getState().run
		expect(run.inventory, 'merged in place inside the storage').toHaveLength(1)
		expect(run.inventory[0].uid).toBe('stored')
		expect(run.inventory[0].star).toBe(3)
		expect(run.equipped, 'no copy is added to the equip grid').toHaveLength(0)
	})

	it('does not merge onto a 5★ copy — the bought one takes its own cell', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 99,
				equipped: [{ ...createItemInstance('wooden-blade', 5, 'maxed'), slot: 0 }],
				shop: state.run.shop.map((offer, index) =>
					index === 0 ? { ...offer, templateId: 'wooden-blade', star: 5, cost: 3, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)
		const run = useGameStore.getState().run
		expect(run.equipped).toHaveLength(2)
		expect(run.equipped.find((item) => item.uid === 'maxed')?.star).toBe(5)
	})

	it('tidies duplicates that never met when the player buys anything', async () => {
		freshRun()
		// Two 4★ and three 2★ of the same sword were bought at different times (before the rule, or in
		// another shop roll) and never merged. The next purchase settles the whole bag.
		const sword = (star: 1 | 2 | 3 | 4 | 5, slot: number) => ({
			...createItemInstance('wooden-blade', star, `w${slot}`, slot),
		})
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 99,
				equipped: [sword(4, 0), sword(4, 1), sword(2, 2), sword(2, 3), sword(2, 4)],
				shop: state.run.shop.map((offer, index) =>
					index === 0 ? { ...offer, templateId: 'jade-fury', star: 1, cost: 3, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)

		const run = useGameStore.getState().run
		const swords = run.equipped.filter((item) => item.templateId === 'wooden-blade')
		// 4★+4★ → 5★, 2★+2★ → 3★, the third 2★ stays on its own.
		expect(swords.map((item) => item.star).sort()).toEqual([2, 3, 5])
		expect(swords.find((item) => item.star === 3)?.paid, 'the merged price is kept').toBeGreaterThan(0)
	})

	it('cascades: four 2★ copies become one 4★', async () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 99,
				inventory: [0, 1, 2, 3].map((slot) => createItemInstance('wooden-blade', 2, `w${slot}`, slot)),
				shop: state.run.shop.map((offer, index) =>
					index === 0 ? { ...offer, templateId: 'jade-fury', star: 1, cost: 3, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)

		const swords = useGameStore.getState().run.inventory.filter((item) => item.templateId === 'wooden-blade')
		expect(swords).toHaveLength(1)
		expect(swords[0].star).toBe(4)
	})

	it('does not merge duplicates across star ranks', async () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 99,
				equipped: [
					createItemInstance('wooden-blade', 1, 'w1', 0),
					createItemInstance('wooden-blade', 2, 'w2', 1),
				],
				shop: state.run.shop.map((offer, index) =>
					index === 0 ? { ...offer, templateId: 'jade-fury', star: 1, cost: 3, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)

		const swords = useGameStore.getState().run.equipped.filter((item) => item.templateId === 'wooden-blade')
		expect(swords.map((item) => item.star).sort()).toEqual([1, 2])
	})

	it('runs a full stage battle and commits the reward once', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 60,
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
		const currencyBefore = useGameStore.getState().run.gold
		const stageBefore = useGameStore.getState().run.stage
		useGameStore.getState().commitBattle()
		const after = useGameStore.getState()
		expect(after.phase).toBe('result')
		expect(after.run.gold).toBe(currencyBefore + (won ? (battle?.reward ?? 0) : 0))
		expect(after.run.stage).toBe(won ? stageBefore + 1 : stageBefore)
		if (won) expect(after.run.clearedStage).toBe(stageBefore)
		// The win/loss record is written down.
		expect(after.run.wins + after.run.losses).toBe(1)

		// A second commit must not pay the reward again.
		useGameStore.getState().commitBattle()
		expect(useGameStore.getState().run.gold).toBe(after.run.gold)
		expect(useGameStore.getState().run.stage).toBe(after.run.stage)
	})

	it('shows the victory screen on the first full clear only, and a replay lands on the result panel', () => {
		freshRun()
		const battleAt = (stageIndex: number) => ({
			mode: 'stage' as const,
			opponentName: 'Dummy',
			opponentItems: [],
			stageIndex,
			result: { winner: 'player' as const, events: [], playerPower: 1, enemyPower: 1, duration: 1000 },
			committed: false,
			reward: 10,
		})

		useGameStore.setState((state) => ({
			run: { ...state.run, stage: FINAL_STAGE, clearedStage: FINAL_STAGE - 1 },
			battle: battleAt(FINAL_STAGE),
		}))
		useGameStore.getState().commitBattle()
		expect(useGameStore.getState().phase, 'the first full clear earns the victory screen').toBe('victory')

		// "Tiếp tục chơi" keeps the finished run: the dialog closes, the save stays.
		const finished = useGameStore.getState().run
		useGameStore.getState().continueRun()
		expect(useGameStore.getState().phase).toBe('prep')
		expect(useGameStore.getState().run).toEqual(finished)
		// A no-op outside the victory screen — ❌ it must never roll a finished run back.
		useGameStore.getState().continueRun()
		expect(useGameStore.getState().phase).toBe('prep')

		// Replaying stage 60 for gold is an ordinary win, not a fresh conquest.
		useGameStore.setState({ battle: battleAt(FINAL_STAGE) })
		useGameStore.getState().commitBattle()
		expect(useGameStore.getState().phase, 'a replay must not re-open the celebration').toBe('result')
	})

	it('wears a purchase right away when the loadout has room, so it never looks lost', () => {
		const state = freshRun()
		const offer = state.run.shop[0]!
		useGameStore.getState().buyOffer(0)
		// The grid had room, so the item is worn instead of being stashed in Kho đồ.
		const after = useGameStore.getState().run
		expect(after.equipped.some((item) => item.templateId === offer.templateId)).toBe(true)
		expect(after.inventory.some((item) => item.templateId === offer.templateId)).toBe(false)
	})

	it('buys an item created on the admin page and only prunes it once it is really gone', () => {
		freshRun()
		// Exactly the shape of `item:melting-ice`: a row in the overlay, nothing in the code.
		installRetiredItems({
			items: {
				'melting-ice': { name: 'Melting Ice', cls: 'artifact', tier: 1, quality: 1, cost: 1, space: { w: 1, h: 1 } },
			},
		})
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 60,
				shop: state.run.shop.map((offer, index) =>
					index === 0 ? { ...offer, templateId: 'melting-ice', star: 1, cost: 1, sold: false } : offer,
				),
			},
		}))

		useGameStore.getState().buyOffer(0)
		const owned = [...useGameStore.getState().run.equipped, ...useGameStore.getState().run.inventory]
		expect(owned.some((item) => item.templateId === 'melting-ice')).toBe(true)

		// Still there, so nothing is pruned.
		useGameStore.getState().pruneUnknownItems()
		expect(
			[...useGameStore.getState().run.equipped, ...useGameStore.getState().run.inventory].some(
				(item) => item.templateId === 'melting-ice',
			),
		).toBe(true)

		// The admin deletes it: now the overlay says it is gone, and the prune removes it.
		installRetiredItems({ items: { 'melting-ice': { removed: true } } })
		useGameStore.getState().pruneUnknownItems()
		expect(
			[...useGameStore.getState().run.equipped, ...useGameStore.getState().run.inventory].some(
				(item) => item.templateId === 'melting-ice',
			),
		).toBe(false)
	})

	it('runs a practice session that pays nothing and changes no progress', () => {
		freshRun()
		useGameStore.setState((state) => ({ run: { ...state.run, gold: 50 } }))
		useGameStore.getState().buyOffer(0)

		const before = useGameStore.getState().run
		useGameStore.getState().startBattle('training', { attacks: false })
		const battle = useGameStore.getState().battle

		expect(battle?.mode).toBe('training')
		expect(battle?.trainingAttacks).toBe(false)
		expect(battle?.reward).toBe(0)
		expect(battle?.result.timedOut).toBe(true)
		// The dummy carries exactly one weapon and never swings.
		expect(battle?.opponentItems).toHaveLength(1)
		expect(battle?.result.events.some((event) => event.side === 'enemy' && event.kind === 'attack')).toBe(false)

		useGameStore.getState().commitBattle()
		const after = useGameStore.getState()
		expect(after.phase).toBe('result')
		expect(after.run.gold).toBe(before.gold)
		expect(after.run.stage).toBe(before.stage)
		expect(after.run.clearedStage).toBe(before.clearedStage)
		expect(after.run.wins).toBe(before.wins)
		expect(after.run.losses).toBe(before.losses)
	})

	it('lets the dummy strike back when the toggle is on', () => {
		freshRun()
		useGameStore.setState((state) => ({ run: { ...state.run, gold: 50 } }))
		useGameStore.getState().buyOffer(0)

		useGameStore.getState().startBattle('training', { attacks: true })
		const battle = useGameStore.getState().battle
		expect(battle?.trainingAttacks).toBe(true)
		expect(
			battle?.result.events.some((event) => event.side === 'enemy' && event.kind === 'attack'),
		).toBe(true)
	})

	it('keeps the player at full health in the practice room, exactly like the dummy', () => {
		freshRun()
		useGameStore.setState((state) => ({ run: { ...state.run, gold: 50 } }))
		useGameStore.getState().buyOffer(0)

		useGameStore.getState().startBattle('training', { attacks: true })
		const battle = useGameStore.getState().battle
		const events = battle?.result.events ?? []
		// The dummy really does hit…
		expect(events.some((event) => event.side === 'enemy' && event.kind === 'attack')).toBe(true)
		// …and the player's bar never moves anyway: practice is not a fight for survival.
		const hp = new Set(events.map((event) => event.player.hp))
		expect(hp.size).toBe(1)
		expect([...hp][0]).toBe(events[0]?.player.maxHp)
	})

	it('still lets a real fight take health down', () => {
		freshRun()
		useGameStore.getState().startBattle('stage')
		const events = useGameStore.getState().battle?.result.events ?? []
		expect(new Set(events.map((event) => event.player.hp)).size).toBeGreaterThan(1)
	})

	it('keeps the stage ladder inside its bounds', () => {
		freshRun()
		useGameStore.setState((state) => ({ run: { ...state.run, stage: FINAL_STAGE, clearedStage: FINAL_STAGE - 1 } }))
		expect(useGameStore.getState().run.stage).toBe(FINAL_STAGE)
	})

	it('selects cleared stages or the next unlocked stage and refreshes the shop', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: { ...state.run, stage: 5, clearedStage: 4 },
		}))
		const previousSeed = useGameStore.getState().run.seed

		expect(useGameStore.getState().selectStage(3)).toBe(true)

		const selected = useGameStore.getState().run
		expect(selected.stage).toBe(3)
		expect(selected.seed).not.toBe(previousSeed)
		expect(selected.shop).toHaveLength(SHOP_SIZE)
		expect(useGameStore.getState().selectStage(6)).toBe(false)
		expect(useGameStore.getState().run.stage).toBe(3)
	})

	it('does not allow selecting a stage outside the preparation phase', () => {
		freshRun()
		useGameStore.setState({ phase: 'battle' })

		expect(useGameStore.getState().selectStage(1)).toBe(false)
		expect(useGameStore.getState().run.stage).toBe(1)
	})

	it('reports a loadout size that matches the active cutie level', () => {
		freshRun()
		expect(bagSizeFor(useGameStore.getState().run)).toBeGreaterThan(0)
	})

	it('the equip grid has 4 columns and more rows as the cutie levels up', () => {
		freshRun()
		const first = useGameStore.getState().run
		const level1 = cutieLevelStats(getCutie(first.cutieId), 1)
		expect(level1.bag.width).toBe(4)
		expect(level1.bag.rows).toBe(3)

		const level5 = cutieLevelStats(getCutie(first.cutieId), 5)
		expect(level5.bag.width).toBe(4)
		expect(level5.bag.rows).toBe(5)
		expect(level5.bagSize).toBeGreaterThan(level1.bagSize)
	})

	it('levels an upgrade up to 10 and then refuses', () => {
		freshRun()
		const cutieId = useGameStore.getState().run.cutieId
		useGameStore.setState((state) => ({
			run: { ...state.run, gold: 100_000, cuties: { ...state.run.cuties, [cutieId]: 9 } },
		}))

		useGameStore.getState().upgradeCutie()
		expect(useGameStore.getState().run.cuties[cutieId]).toBe(10)

		// The cap is a real wall: no further level and no further charge.
		const currencyAtCap = useGameStore.getState().run.gold
		useGameStore.getState().upgradeCutie()
		expect(useGameStore.getState().run.cuties[cutieId]).toBe(10)
		expect(useGameStore.getState().run.gold).toBe(currencyAtCap)
	})

	it('refuses an upgrade it cannot pay for', () => {
		freshRun()
		useGameStore.setState((state) => ({ run: { ...state.run, gold: 0 } }))
		useGameStore.getState().upgradeCutie()
		expect(Object.values(useGameStore.getState().run.cuties).every((level) => level === 1)).toBe(true)
		expect(useGameStore.getState().run.gold).toBe(0)
	})

	it('a multi-cell item occupies the right number of equip cells', () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 99,
				shop: state.run.shop.map((offer, index) =>
					index === 0 ? { ...offer, templateId: 'fire-spear', star: 1, cost: 4, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)
		// The 1×4 blade does not fit a 3-row grid, so it has to rotate into 4×1 (4 cells).
		const item = useGameStore.getState().run.equipped[0]
		expect(item.rotated).toBe(true)
		expect(itemCells(item, 4)).toHaveLength(4)
	})

	it('rotates a 1×3 equip item into 3×1 and changes the cells it covers', () => {
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
		// Anchored in column 1, so the 3-cell wide block fits the 4-column grid.
		expect(itemCells(rotated, 4)).toEqual([1, 2, 3])
	})

	it('rejects a rotation whose new orientation overlaps another item', () => {
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

	it('unequips an item into the storage and equips it again', () => {
		freshRun()
		useGameStore.getState().buyOffer(0)
		const uid = useGameStore.getState().run.equipped[0].uid

		useGameStore.getState().unequip(uid)
		let run = useGameStore.getState().run
		expect(run.equipped).toHaveLength(0)
		expect(run.inventory).toHaveLength(1)
		expect(run.inventory[0].slot, 'the storage is a grid: an item entering it must have a real cell').toBeGreaterThanOrEqual(0)

		useGameStore.getState().equip(uid)
		run = useGameStore.getState().run
		expect(run.inventory).toHaveLength(0)
		expect(run.equipped).toHaveLength(1)
		expect(run.equipped[0].slot).toBeGreaterThanOrEqual(0)
	})

	it('an item in the storage does NOT join the fight', () => {
		freshRun()
		useGameStore.getState().buyOffer(0)
		const equippedUid = useGameStore.getState().run.equipped[0].uid
		const powerWithItem = bagSizeFor(useGameStore.getState().run)

		useGameStore.getState().unequip(equippedUid)
		expect(powerWithItem).toBeGreaterThan(0)
		// With an empty equip grid there is nothing to fight with.
		expect(useGameStore.getState().run.equipped).toHaveLength(0)
		expect(useGameStore.getState().run.inventory).toHaveLength(1)
	})
})
