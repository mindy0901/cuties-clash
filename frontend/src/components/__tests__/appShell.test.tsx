// @vitest-environment jsdom
/**
 * Safety net for the **application shell**: every screen must render without throwing.
 *
 * ⚠️ Why `renderToString` is no longer used: TanStack Router's `RouterProvider` needs a router that
 * has been `load()`ed and needs the DOM, so it cannot be rendered with `renderToString`
 * (`Cannot read properties of undefined (reading 'matches')`). These tests now run in jsdom with a
 * real router — see `src/test/router.tsx`.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { installRetiredItems } from '../../test/retiredItems'

installRetiredItems()
import { afterEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { useBattleSettingsStore } from '../../store/battleSettingsStore'
import { renderApp } from '../../test/router'

function freshRun() {
	useGameStore.getState().newRun()
}

afterEach(cleanup)

describe('the application shell renders', () => {
	it('shows the preparation room', async () => {
		freshRun()
		await renderApp('/')

		expect(screen.getByText('Cuties Clash')).toBeTruthy()
		// Layout: Loadout (carried) is separate from the Inventory (reserves).
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(screen.getAllByText(/Mua Vật Phẩm/).length).toBeGreaterThan(0)
		expect(screen.getByText(/Đấu Cutie/)).toBeTruthy()
	})

	it('shows the battle screen while fighting', async () => {
		freshRun()
		useGameStore.setState((state) => ({ run: { ...state.run, gold: 40 } }))
		useGameStore.getState().buyOffer(0)
		useGameStore.getState().startBattle('stage')

		await renderApp('/')

		expect(document.querySelector('[data-battle-screen]')).toBeTruthy()
		expect(screen.getAllByText(/Bỏ qua/).length).toBeGreaterThan(0)
	})

	it('starts the training room with the dummy standing still or striking back', async () => {
		freshRun()
		useBattleSettingsStore.setState({ trainingAttacks: true })
		useGameStore.setState((state) => ({ run: { ...state.run, gold: 40 } }))
		useGameStore.getState().buyOffer(0)
		await renderApp('/')

		const toggle = document.querySelector<HTMLInputElement>('[data-training-attacks]')!
		expect(toggle.checked).toBe(true)
		// The toggle is the only thing that decides whether its one weapon swings.
		fireEvent.click(toggle)
		expect(useBattleSettingsStore.getState().trainingAttacks).toBe(false)

		fireEvent.click(document.querySelector('[data-training-start]')!)
		const battle = useGameStore.getState().battle
		expect(battle?.mode).toBe('training')
		expect(battle?.trainingAttacks).toBe(false)
		expect(battle?.opponentItems).toHaveLength(1)
		expect(document.querySelector('[data-battle-screen]')).toBeTruthy()

		useBattleSettingsStore.setState({ trainingAttacks: true })
	})
})
