// @vitest-environment jsdom
/**
 * The **item hover card** — the shop's details panel, extended to the bag and the arena.
 *
 * What it must do everywhere:
 * - open on a **deliberate** stop (the 350 ms hover intent) and close on leave,
 * - never steal the click (the dialog is still what a click opens),
 * - stay away while an item is being dragged across its neighbours,
 * - show the same numbers the shop shows (one card, one source: `itemFacts`).
 */
import { cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrepScreen } from '../PrepScreen'
import { createItemInstance } from '../../game/bag'
import { renderInRouter, renderApp } from '../../test/router'
import { useGameStore } from '../../store/gameStore'
import { installRetiredItems } from '../../test/retiredItems'

const CARD = '[data-item-hover-card]'

function equip(templateId = 'wooden-blade') {
	useGameStore.setState((state) => ({
		run: { ...state.run, equipped: [createItemInstance(templateId, 1, 'a', 0)] },
	}))
}

function tile(uid = 'a'): HTMLElement {
	const box = document.querySelector<HTMLElement>(`[data-item-box="${uid}"] button`)
	if (!box) throw new Error(`no tile for ${uid}`)
	return box
}

beforeEach(() => {
	installRetiredItems()
	useGameStore.getState().newRun()
	window.history.replaceState({}, '', '/')
})

afterEach(cleanup)

describe('the bag in the preparation room', () => {
	it('describes an item after the pointer stops on it, and closes when it leaves', async () => {
		equip()
		renderInRouter(<PrepScreen />)

		fireEvent.pointerEnter(tile())
		expect(document.querySelector(CARD), 'not on the first pixel of contact').toBeNull()

		await waitFor(() => expect(document.querySelector(CARD)).toBeTruthy())
		// `renderInRouter` defaults to Vietnamese (see docs/TESTING.md Trap 8).
		expect(document.querySelector(CARD)?.textContent, 'the card names the item').toContain('Đao Gỗ')

		fireEvent.pointerLeave(tile())
		expect(document.querySelector(CARD), 'leaving the tile closes it').toBeNull()
	})

	it('shows the damage multiplier and Cooldown Time of every swing, then every other kit', async () => {
		// A weapon with a charged hit (multiplier 1.2, cooldown 2.75 s at 2★) plus a Jade's own support
		// kit — every one of them has to be listed. The bow only exists on the admin side, so it is
		// registered as a fixture (see docs/TESTING.md Trap 6b).
		installRetiredItems({
			items: {
				'beginer-s-bow': {
					name: 'Beginer’s Bow',
					cls: 'ranged',
					tier: 1,
					quality: 1,
					cost: 2,
					space: { w: 1, h: 3 },
					kits: [
						{
							id: 'basic-attack',
							params: {
								multiplier: [1, 1.2, 1.3, 1.4, 1.5],
								cooldown: [3, 2.75, 2.5, 2.25, 2],
							},
							charge: {
								id: 'charge-attack',
								params: { seNeed: [100, 100, 100, 100, 100], multiplier: [2, 2, 2, 2, 2] },
							},
						},
					],
				},
			},
		})
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [
					{ uid: 'a', templateId: 'beginer-s-bow', star: 2, slot: 0, rotated: false, paid: 4 },
					{ uid: 'b', templateId: 'jade-guard', star: 1, slot: 4, rotated: false, paid: 3 },
				],
			},
		}))
		renderInRouter(<PrepScreen />)

		fireEvent.pointerEnter(tile('a'))
		await waitFor(() => expect(document.querySelector(CARD)).toBeTruthy())
		const card = document.querySelector(CARD) as HTMLElement
		const text = card.textContent ?? ''

		expect(text, 'the multiplier is the number an item is compared by').toContain('Hệ số sát thương')
		expect(text).toContain('×1.2')
		expect(text).toContain('Hồi chiêu')
		expect(text, 'the Cooldown Time is the stored number, not a rounded one').toContain('2.75s')
		// Only the multiplier is printed — the resulting damage depends on the Cutie, so it is not
		// repeated (asked for: "chỉ cần hiển thị dmg multiplier ko cần hiển thị damage").
		expect(text).not.toContain('Sát thương mỗi đòn')
		expect(text).not.toContain('Sát thương đòn nạp')
		// The charged hit is a **kit of its own**, with its own rows, and it is marked as **attached** to
		// the swing above it (no basic attack ⇒ no charged hit), which the card draws as an elbow.
		expect(card.querySelector('[data-card-kit="basic-attack"]')).toBeTruthy()
		expect(card.querySelector('[data-card-kit="charge-attack"]')).toBeTruthy()
		expect(
			card.querySelector('[data-card-kit="charge-attack"]')?.hasAttribute('data-kit-attached'),
			'the charged hit is joined to its basic attack',
		).toBe(true)
		expect(card.querySelector('[data-card-kit="basic-attack"]')?.hasAttribute('data-kit-attached')).toBe(false)
		// One term for one number — the charged hit's multiplier is a plain `Hệ số sát thương` too.
		const charge = card.querySelector('[data-card-kit="charge-attack"]') as HTMLElement
		expect(charge.textContent).toContain('Hệ số sát thương')
		expect(charge.textContent).toContain('×2')
		// Energy is a number of points, so the row prints no `%`.
		expect(text).toContain('Kiếm Thế cần')
		expect(text).not.toContain('100%')

		fireEvent.pointerLeave(tile('a'))
		fireEvent.pointerEnter(tile('b'))
		await waitFor(() => expect(document.querySelector(CARD)).toBeTruthy())
		const jade = document.querySelector(CARD) as HTMLElement
		expect(jade.querySelector('[data-card-kit]'), 'the jade carries at least one kit').toBeTruthy()
		// A stat-only kit draws **no** title: the row (`Attack +4`) already says it, so "Bonus stats"
		// over it was noise (asked for: "xóa text bonus stats").
		expect(jade.textContent).not.toContain('Chỉ số cộng thêm')
	})

	it('does not open while an item is dragged over its neighbours', async () => {
		equip()
		equip('wooden-blade')
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [createItemInstance('wooden-blade', 2, 'a', 0), createItemInstance('wooden-blade', 1, 'b', 2)],
			},
		}))
		renderInRouter(<PrepScreen />)

		// Pick the first item up with the real sequence the board listens for.
		fireEvent.pointerDown(tile('a'), { button: 0, clientX: 10, clientY: 10 })
		fireEvent.pointerMove(tile('a'), { clientX: 300, clientY: 300 })
		fireEvent.pointerEnter(tile('b'))

		await new Promise((resolve) => setTimeout(resolve, 500))
		expect(document.querySelector(CARD), 'a drag is not an inspect').toBeNull()
	})
})

describe('the arena', () => {
	it('describes the gear of both sides', async () => {
		equip()
		useGameStore.getState().startBattle('stage')
		await renderApp('/')

		const playerTile = document.querySelector<HTMLElement>('[data-battle-side="player"] [data-item-box] button')
		expect(playerTile, 'the player grid is in the arena').toBeTruthy()
		fireEvent.pointerEnter(playerTile!)
		await waitFor(() => expect(document.querySelector(CARD)).toBeTruthy())
		fireEvent.pointerLeave(playerTile!)
		expect(document.querySelector(CARD)).toBeNull()

		// The opponent's grid answers the same way (it is read-only, but still inspectable).
		const enemyTile = document.querySelector<HTMLElement>('[data-battle-side="enemy"] [data-item-box] button')
		if (enemyTile) {
			fireEvent.pointerEnter(enemyTile)
			await waitFor(() => expect(document.querySelector(CARD)).toBeTruthy())
		}
		useGameStore.getState().leaveBattle()
	})
})
