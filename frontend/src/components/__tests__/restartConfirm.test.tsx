// @vitest-environment jsdom
/**
 * The restart button must **ask first** — in an app dialog, ❌ not `window.confirm`.
 *
 * Why it matters: a stray click on "Chơi lại" used to wipe the whole run instantly, and the native
 * browser box could not be styled, translated or tested without stubbing `window`.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { STARTING_CURRENCY } from '../../game/economy'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'

/** A run with visible progress, so a wrong reset is easy to spot. */
function runWithProgress() {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: { ...state.run, gold: 99, stage: 7, clearedStage: 6 },
	}))
}

/** The top bar's restart button (the victory screen has its own, with a different label). */
function restartButton() {
	return screen.getByRole('button', { name: 'Chơi lại' })
}

afterEach(cleanup)

describe('restarting asks for confirmation', () => {
	it('shows a dialog instead of resetting right away', async () => {
		runWithProgress()
		await renderApp('/')

		fireEvent.click(restartButton())

		expect(screen.getByRole('dialog', { name: 'Chơi lại từ đầu?' })).toBeTruthy()
		expect(screen.getByText(/bị xoá/)).toBeTruthy()
		// Progress is untouched while the question is open.
		expect(useGameStore.getState().run.clearedStage).toBe(6)
		expect(useGameStore.getState().run.gold).toBe(99)
	})

	it('keeps the run when the player cancels', async () => {
		runWithProgress()
		await renderApp('/')

		fireEvent.click(restartButton())
		fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }))

		expect(screen.queryByRole('dialog')).toBeNull()
		expect(useGameStore.getState().run.clearedStage).toBe(6)
		expect(useGameStore.getState().run.gold).toBe(99)
	})

	it('resets the run only after confirming', async () => {
		runWithProgress()
		await renderApp('/')

		fireEvent.click(restartButton())
		fireEvent.click(screen.getByRole('button', { name: 'Xoá và chơi lại' }))

		const run = useGameStore.getState().run
		expect(screen.queryByRole('dialog')).toBeNull()
		expect(run.stage).toBe(1)
		expect(run.clearedStage).toBe(0)
		expect(run.gold).toBe(STARTING_CURRENCY)
		expect(run.equipped).toHaveLength(0)
		expect(run.inventory).toHaveLength(0)
	})

	it('cancels with Esc, and the Esc key does not survive the dialog closing', async () => {
		runWithProgress()
		await renderApp('/')

		fireEvent.click(restartButton())
		fireEvent.keyDown(window, { key: 'Escape' })

		expect(screen.queryByRole('dialog')).toBeNull()
		expect(useGameStore.getState().run.clearedStage).toBe(6)

		// Reopening and pressing Esc again must still cancel — proof the listener was removed.
		fireEvent.click(restartButton())
		fireEvent.keyDown(window, { key: 'Escape' })
		expect(screen.queryByRole('dialog')).toBeNull()
		expect(useGameStore.getState().run.clearedStage).toBe(6)
	})

	it('asks on the victory screen too', async () => {
		useGameStore.getState().newRun()
		useGameStore.setState({ phase: 'victory' })
		await renderApp('/')

		fireEvent.click(screen.getByRole('button', { name: 'Chơi lại từ đầu' }))
		expect(screen.getByRole('dialog', { name: 'Chơi lại từ đầu?' })).toBeTruthy()

		// Still on the victory screen — nothing was reset yet.
		expect(useGameStore.getState().phase).toBe('victory')

		fireEvent.click(screen.getByRole('button', { name: 'Xoá và chơi lại' }))
		expect(useGameStore.getState().phase).toBe('prep')
		expect(useGameStore.getState().run.clearedStage).toBe(0)
	})
})
