// @vitest-environment jsdom
/**
 * Navigation between the preparation room (`/`) and the dedicated shop page (`/shop`).
 *
 * Three things to remember when writing tests here:
 * - Use @testing-library's `render`, **not** `renderToString` (zustand v5 returns the initial
 *   state for `getServerSnapshot`).
 * - Since the move to TanStack Router, **the URL is the source of truth** for the open screen; the
 *   store no longer holds `route`. So check the open screen via `window.location.pathname` plus the
 *   rendered content, ❌ never by reading `route` from the store.
 * - `renderApp` is `async` (RouterProvider matches the route after `router.load()` resolves), so
 *   the `it` callback must be `async` and must `await renderApp(...)`.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'

/** Back to the preparation room with clean currency and shop (the shop is kept by `persist` between tests). */
function resetAt() {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: { ...state.run, currency: 99 },
	}))
}

beforeEach(resetAt)
afterEach(cleanup)

describe('navigation between the preparation room and the shop', () => {
	it('the preparation room shows the loadout board and the buy button', async () => {
		await renderApp('/')
		// "Trang bị" also appears in the hint sentence, so ask by panel heading.
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(screen.getAllByText(/Mua Vật Phẩm/).length).toBeGreaterThan(0)
		expect(screen.getByText(/Đấu Thú Cưng/)).toBeTruthy()
		// The two not-yet-functional buttons are still shown to keep the layout.
		expect(screen.getByText(/Nhiệm Vụ/)).toBeTruthy()
		expect(screen.getByText(/Bộ Sưu Tập/)).toBeTruthy()
	})

	it('clicking Mua Vật Phẩm opens the shop page and changes the URL', async () => {
		await renderApp('/')
		fireEvent.click(screen.getAllByText(/Mua Vật Phẩm/)[0])

		// Wait for the new screen to render before checking the URL: router navigation is an async
		// transition, so `window.location` may change a tick later.
		expect(await screen.findByText('Cửa hàng vật phẩm')).toBeTruthy()
		expect(window.location.pathname).toBe('/shop')
		// The shop page no longer shows the inventory.
		expect(screen.queryByText('Kho đồ')).toBeNull()
	})

	it('the back button returns to the preparation room', async () => {
		await renderApp('/shop')
		expect(screen.getByText('Cửa hàng vật phẩm')).toBeTruthy()

		fireEvent.click(screen.getByText(/Quay về/))

		expect(await screen.findByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(window.location.pathname).toBe('/')
	})

	it('items can be bought right on the shop page', async () => {
		await renderApp('/shop')

		const before = useGameStore.getState().run
		const offer = before.shop[0]
		expect(offer.sold).toBe(false)
		fireEvent.click(screen.getAllByText(/^Mua · /)[0])

		const after = useGameStore.getState().run
		// The loadout has room, so the item is carried right away.
		expect(after.equipped).toHaveLength(1)
		expect(after.currency).toBe(before.currency - offer.cost)
		expect(after.shop[0].sold).toBe(true)
	})

	it('opening /shop directly lands on the shop page', async () => {
		await renderApp('/shop')
		expect(screen.getByText('Cửa hàng vật phẩm')).toBeTruthy()
	})

	it('an unknown path still lands on the preparation room', async () => {
		await renderApp('/mot-duong-dan-la')
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
	})

	it('a not-yet-functional button reports "coming soon" instead of staying silent', async () => {
		await renderApp('/')
		fireEvent.click(screen.getByText(/Nhiệm Vụ/))
		expect(useGameStore.getState().toasts.some((toast) => toast.text.includes('sẽ có ở bản sau'))).toBe(true)
	})

	it('during a battle the battle screen is shown even on the shop URL', async () => {
		useGameStore.getState().buyOffer(0)
		useGameStore.getState().startBattle('stage')
		await renderApp('/shop')
		expect(useGameStore.getState().phase).toBe('battle')
		// The battle screen has the Sword Energy bar and the speed buttons.
		expect(screen.getAllByText(/Kiếm Thế/).length).toBeGreaterThan(0)
		expect(screen.getByText(/Bỏ qua/)).toBeTruthy()
	})
})
