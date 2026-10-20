// @vitest-environment jsdom
/**
 * The equipment board on the **shop page** must keep the functions it has in the preparation room:
 * click → details, drag → move, `R` / right click → rotate.
 *
 * ⚠️ WHY THIS FILE EXISTS: the shop board was first rendered as a **read-only** `LoadoutGrid`
 * (`<LoadoutGrid width items />` with no handlers), so nothing on it reacted — no dialog, no drag.
 * These tests pin the wiring.
 */
import { act, cleanup, fireEvent } from '@testing-library/react'
import { installRetiredItems } from '../../test/retiredItems'

installRetiredItems()
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ShopScreen } from '../ShopScreen'
import { useGameStore } from '../../store/gameStore'
import { useUiStore } from '../../store/uiStore'
import { renderInRouter } from '../../test/router'
import type { ItemInstance } from '../../game/types'

/** Ngọc 1×1 — its shape does not change on rotation, handy for testing raw positions. */
function jade(uid: string, slot: number): ItemInstance {
	return { uid, templateId: 'jade-fury', star: 1, slot, rotated: false, paid: 3 }
}

function reset(items: ItemInstance[]) {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: { ...state.run, equipped: items, inventory: [], gold: 99 },
	}))
	useUiStore.setState({ itemUid: null })
	window.history.replaceState({}, '', '/shop')
}

/** The button of one item on the equipment board (the element that receives clicks/presses). */
function buttonOf(uid: string): HTMLElement {
	const button = document.querySelector<HTMLElement>(`[data-item-box="${uid}"] button`)
	if (!button) throw new Error(`item ${uid} not found on the equipment board`)
	return button
}

function cellOf(slot: number): HTMLElement {
	const cell = document.querySelector<HTMLElement>(`[data-cell="${slot}"]`)
	if (!cell) throw new Error(`cell ${slot} not found`)
	return cell
}

/** Hold the mouse and move past the drag threshold, like a real browser. */
function startDrag(target: HTMLElement) {
	fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
	fireEvent.pointerMove(target, { clientX: 300, clientY: 300 })
}

/** Hover a cell — the board reads `data-cell` from the event target (jsdom has no layout). */
function hoverCell(slot: number) {
	fireEvent.mouseMove(cellOf(slot), { clientX: 0, clientY: 0 })
}

/** `pointerup` is listened for on `document`, so it needs `act` to flush the state change. */
function releaseMouse(clientX = 0, clientY = 0) {
	act(() => {
		document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX, clientY }))
	})
}

/**
 * Stubs the sell zone's rectangle (jsdom has no layout, so every rect is 0×0 and a drop could never be
 * "inside" it). Returns the centre point to release the mouse at.
 */
function stubSellZone() {
	const zone = document.querySelector<HTMLElement>('[data-shop-drop-target]')!
	zone.getBoundingClientRect = () =>
		({
			x: 500,
			y: 500,
			left: 500,
			top: 500,
			right: 620,
			bottom: 548,
			width: 120,
			height: 48,
			toJSON: () => ({}),
		}) as DOMRect
	return { x: 560, y: 524 }
}

beforeEach(() => reset([jade('gem', 0)]))
afterEach(cleanup)

describe('the equipment board on the shop page', () => {
	it('clicking an item opens its detail dialog', () => {
		renderInRouter(<ShopScreen />)

		fireEvent.click(buttonOf('gem'))

		expect(useUiStore.getState().itemUid).toBe('gem')
	})

	it('dragging an item onto another cell moves it', () => {
		renderInRouter(<ShopScreen />)

		startDrag(buttonOf('gem'))
		expect(document.querySelector('[data-held-ghost]'), 'the cursor ghost follows').not.toBeNull()

		hoverCell(5)
		releaseMouse()

		expect(useGameStore.getState().run.equipped[0].slot).toBe(5)
		expect(document.querySelector('[data-held-ghost]'), 'the drag ends on release').toBeNull()
	})

	it('rotating while dragging is applied on release', () => {
		renderInRouter(<ShopScreen />)

		startDrag(buttonOf('gem'))
		fireEvent.keyDown(document, { key: 'r' })
		hoverCell(5)
		releaseMouse()

		expect(useGameStore.getState().run.equipped[0]).toMatchObject({ slot: 5, rotated: true })
	})

	it('dragging an item onto the sell zone sells it for half its price', () => {
		renderInRouter(<ShopScreen />)

		const before = useGameStore.getState().run
		const point = stubSellZone()

		startDrag(buttonOf('gem'))
		releaseMouse(point.x, point.y)

		const after = useGameStore.getState().run
		expect(after.equipped, 'the item leaves the bag').toHaveLength(0)
		expect(after.gold, '50% of what was paid comes back').toBe(before.gold + 1)
		expect(document.querySelector('[data-held-ghost]'), 'the drag ends').toBeNull()
	})
})
