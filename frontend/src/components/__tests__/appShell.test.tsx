// @vitest-environment jsdom
/**
 * Safety net for the **application shell**: every screen must render without throwing.
 *
 * ⚠️ Why `renderToString` is no longer used: TanStack Router's `RouterProvider` needs a router that
 * has been `load()`ed and needs the DOM, so it cannot be rendered with `renderToString`
 * (`Cannot read properties of undefined (reading 'matches')`). These tests now run in jsdom with a
 * real router — see `src/test/router.tsx`.
 */
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'

function freshRun() {
	useGameStore.getState().newRun()
}

afterEach(cleanup)

describe('the application shell renders', () => {
	it('shows the preparation room', async () => {
		freshRun()
		await renderApp('/')

		expect(screen.getByText(/Martial Cutie/)).toBeTruthy()
		// Layout: Loadout (carried) is separate from the Inventory (reserves).
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(screen.getAllByText(/Mua Vật Phẩm/).length).toBeGreaterThan(0)
		expect(screen.getByText(/Đấu Thú Cưng/)).toBeTruthy()
	})

	it('shows the battle screen while fighting', async () => {
		freshRun()
		useGameStore.setState((state) => ({ run: { ...state.run, currency: 40 } }))
		useGameStore.getState().buyOffer(0)
		useGameStore.getState().startBattle('stage')

		await renderApp('/')

		expect(screen.getAllByText(/Kiếm Thế/).length).toBeGreaterThan(0)
		expect(screen.getAllByText(/Chấn Đao/).length).toBeGreaterThan(0)
	})
})
