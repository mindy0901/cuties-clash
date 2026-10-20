// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StageMapDialog } from '../StageMapDialog'
import { useGameStore } from '../../store/gameStore'
import { useLanguageStore } from '../../i18n'

beforeEach(() => {
	useLanguageStore.setState({ language: 'en' })
	useGameStore.getState().newRun()
})

afterEach(cleanup)

describe('PvE journey map', () => {
	it('shows region tabs, a node path, and details for the selected stage', () => {
		render(<StageMapDialog onClose={vi.fn()} />)

		expect(screen.getByRole('dialog', { name: 'Journey Map' })).toBeTruthy()
		expect(screen.getByRole('button', { name: /Map 1 · Tushita/ })).toBeTruthy()
		expect(screen.getByRole('button', { name: /Map 2 · Huo Luo/ })).toHaveProperty('disabled', true)
		expect(screen.getByRole('button', { name: 'Stage 1: Monster · Meadow Mouse · Next' })).toBeTruthy()
		expect(screen.getByText('Stage Reward')).toBeTruthy()
		expect(screen.getByText('Recommended Power')).toBeTruthy()
	})

	it('opens the unlocked region and confirms its next stage', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, stage: 21, clearedStage: 20 },
		}))
		const onClose = vi.fn()
		render(<StageMapDialog onClose={onClose} />)

		fireEvent.click(screen.getByRole('button', { name: /Map 2 · Huo Luo/ }))

		expect(screen.getByRole('button', { name: 'Stage 21: Evil · Ash Goblin · Next' })).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Enter Stage' }))

		expect(useGameStore.getState().run.stage).toBe(21)
		expect(onClose).toHaveBeenCalledOnce()
	})

	it('labels the final region opponents as zombies', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, stage: 41, clearedStage: 40 },
		}))
		render(<StageMapDialog onClose={vi.fn()} />)

		expect(screen.getByRole('button', { name: 'Stage 41: Zombie · Frostbound Bear · Next' })).toBeTruthy()
	})

	it('translates boss node and opponent names', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, stage: 10, clearedStage: 9 },
		}))
		render(<StageMapDialog onClose={vi.fn()} />)

		expect(screen.getByRole('button', { name: 'Stage 10: Boss · Monster · Meadow Guard · Next' })).toBeTruthy()
		expect(screen.getByText('Boss · Monster · Meadow Guard')).toBeTruthy()
	})

	it('allows replaying a cleared stage without unlocking future stages', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, stage: 4, clearedStage: 3 },
		}))
		const onClose = vi.fn()
		render(<StageMapDialog onClose={onClose} />)

		expect(screen.getByRole('button', { name: 'Stage 4: Monster · Wild Boar · Next' })).toBeTruthy()
		expect(screen.getByRole('button', { name: 'Stage 6: Monster · Mountain Goat · Locked' })).toHaveProperty(
			'disabled',
			true,
		)
		fireEvent.click(screen.getByRole('button', { name: 'Stage 2: Monster · Fierce Wild Rooster · Cleared' }))
		fireEvent.click(screen.getByRole('button', { name: 'Enter Stage' }))

		expect(useGameStore.getState().run.stage).toBe(2)
		expect(onClose).toHaveBeenCalledOnce()
	})

	it('closes on Escape and removes its key listener after unmount', () => {
		const onClose = vi.fn()
		const view = render(<StageMapDialog onClose={onClose} />)

		fireEvent.keyDown(window, { key: 'Escape' })
		expect(onClose).toHaveBeenCalledOnce()

		view.unmount()
		onClose.mockClear()
		fireEvent.keyDown(window, { key: 'Escape' })
		expect(onClose).not.toHaveBeenCalled()
	})
})
