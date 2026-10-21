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
import { useUiStore } from '../../store/uiStore'
import { createItemInstance } from '../../game/bag'
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
		// The fight button and the progress bar live in the Adventure dialog now.
		expect(screen.queryByText(/Đấu Cutie/)).toBeNull()
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

	it('the Adventure dialog owns the progress bar and the fight button', async () => {
		freshRun()
		useGameStore.setState((state) => ({
			run: { ...state.run, equipped: [createItemInstance('jade-fury', 1, 'a', 0)] },
		}))
		await renderApp('/')

		// ❌ The footer no longer carries the fight button or the progress bar.
		expect(screen.queryByText(/Đấu Cutie/)).toBeNull()
		expect(screen.queryByText(/Tiến trình màn/)).toBeNull()

		fireEvent.click(screen.getByText('Phiêu Lưu'))

		expect(screen.getByText(/Tiến trình màn 0\/60/)).toBeTruthy()
		const fight = document.querySelector<HTMLButtonElement>('[data-fight-stage]')!
		expect(fight.textContent).toContain('Đấu Cutie')

		fireEvent.click(fight)
		expect(useGameStore.getState().battle?.mode, 'the dialog starts the stage fight itself').toBe('stage')
		expect(useUiStore.getState().mapOpen, 'and closes the map').toBe(false)
		useGameStore.getState().leaveBattle()
	})

	it('starts the training room with the dummy standing still or striking back', async () => {
		freshRun()
		// The switch lives **inside** the practice fight; the footer button only repeats the setting.
		useBattleSettingsStore.setState({ trainingAttacks: false })
		useGameStore.setState((state) => ({ run: { ...state.run, gold: 40 } }))
		useGameStore.getState().buyOffer(0)
		await renderApp('/')

		expect(document.querySelector('[data-training-attacks]')).toBeNull()

		fireEvent.click(document.querySelector('[data-training-start]')!)
		const battle = useGameStore.getState().battle
		expect(battle?.mode).toBe('training')
		expect(battle?.trainingAttacks).toBe(false)
		expect(battle?.opponentItems).toHaveLength(1)
		expect(document.querySelector('[data-battle-screen]')).toBeTruthy()

		useBattleSettingsStore.setState({ trainingAttacks: true })
	})
})
