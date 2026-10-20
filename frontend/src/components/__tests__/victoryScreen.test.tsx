// @vitest-environment jsdom
/**
 * Clearing stage 60 is not the end of the run.
 *
 * ⚠️ The victory screen used to offer **one** button — "Chơi lại từ đầu" — so the only way past the
 * dialog was to erase the save that had just finished the campaign. "Tiếp tục chơi" keeps the run and
 * closes the dialog; "Chơi lại từ đầu" is still there, behind the existing confirmation.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { installRetiredItems } from '../../test/retiredItems'

installRetiredItems()
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'

beforeEach(() => {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({ run: { ...state.run, gold: 250, clearedStage: 60, stage: 60 } }))
})

afterEach(() => {
	cleanup()
})

describe('victory screen after the 60th stage', () => {
	it('offers a way to keep playing next to Start Over', async () => {
		useGameStore.setState({ phase: 'victory' })
		await renderApp('/')

		expect(screen.getByRole('button', { name: 'Tiếp tục chơi' })).toBeTruthy()
		expect(screen.getByRole('button', { name: 'Chơi lại từ đầu' })).toBeTruthy()
	})

	it('"Tiếp tục chơi" closes the screen and keeps every bit of progress', async () => {
		useGameStore.setState({ phase: 'victory' })
		await renderApp('/')

		fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục chơi' }))

		const after = useGameStore.getState()
		expect(after.phase, 'back to the preparation room').toBe('prep')
		expect(after.run.gold, 'the purse is untouched').toBe(250)
		expect(after.run.clearedStage, 'all 60 stages stay cleared').toBe(60)
		expect(screen.queryByRole('dialog', { name: 'Phá đảo' }), 'the dialog is gone').toBeNull()
	})
})
