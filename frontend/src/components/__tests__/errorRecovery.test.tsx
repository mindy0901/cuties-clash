// @vitest-environment jsdom
/**
 * Error boundary: when a component throws, the UI must show the recovery screen — it must
 * **not** leave a blank page, because the player would have no way out.
 */
import { createElement, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../AppErrorBoundary'
import { useGameStore } from '../../store/gameStore'
import { useLanguageStore } from '../../i18n'

function Boom(): ReactNode {
	throw new Error('assumed error in test')
}

function Fine() {
	return createElement('p', null, 'normal content')
}

beforeEach(() => {
	window.localStorage.clear()
	useLanguageStore.setState({ language: 'vi' })
	// React prints the error to the console when the boundary catches it; keep the test log clean.
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
	cleanup()
})

describe('AppErrorBoundary', () => {
	it('shows the recovery screen instead of a blank page', () => {
		render(createElement(AppErrorBoundary, null, createElement(Boom)))
		expect(screen.getByText(/Đã xảy ra lỗi khi hiển thị game/)).toBeTruthy()
		expect(screen.getByText(/Xoá bản lưu và chơi lại/)).toBeTruthy()
		// The technical details are there for debugging.
		expect(screen.getByText(/Chi tiết kỹ thuật/)).toBeTruthy()
	})

	it('stays out of the way when everything is normal', () => {
		render(createElement(AppErrorBoundary, null, createElement(Fine)))
		expect(screen.getByText('normal content')).toBeTruthy()
		expect(screen.queryByText(/Đã xảy ra lỗi/)).toBeNull()
	})

	it('the recovery button clears the save from localStorage', () => {
		window.localStorage.setItem('martial-cutie-save', JSON.stringify({ state: {}, version: 2 }))
		// `window.location.assign` does not work in jsdom → stub it.
		const assign = vi.fn()
		Object.defineProperty(window, 'location', { value: { assign }, writable: true })

		render(createElement(AppErrorBoundary, null, createElement(Boom)))
		fireEvent.click(screen.getByText(/Xoá bản lưu và chơi lại/))

		expect(window.localStorage.getItem('martial-cutie-save')).toBeNull()
		expect(assign).toHaveBeenCalledWith('/')
	})
})

describe('the store protects against broken saves', () => {
	it('a save missing equipped/inventory still yields a usable state', async () => {
		// This is the kind of save that blanked the page: version 2 but missing the new fields.
		window.localStorage.setItem(
			'martial-cutie-save',
			JSON.stringify({
				state: {
					run: {
						cutieId: 'fire-pup',
						cuties: { 'fire-pup': 2 },
						unlockedCuties: ['fire-pup'],
						gold: 40,
						stage: 3,
						clearedStage: 2,
						seed: 999,
						shop: [],
						rerolls: 0,
						wins: 1,
						losses: 0,
					},
				},
				version: 2,
			}),
		)
		await useGameStore.persist.rehydrate()

		const run = useGameStore.getState().run
		expect(Array.isArray(run.equipped)).toBe(true)
		expect(Array.isArray(run.inventory)).toBe(true)
		expect(run.gold).toBe(40)
		// Combat stats can be derived → rendering does not throw.
		expect(() => useGameStore.getState().run.equipped.filter(() => true)).not.toThrow()
	})

	it('a v1 save still migrates to equipped + inventory', async () => {
		window.localStorage.setItem(
			'martial-cutie-save',
			JSON.stringify({
				state: {
					run: {
						cutieId: 'fire-pup',
						cuties: { 'fire-pup': 2 },
						unlockedCuties: ['fire-pup'],
						gold: 40,
						stage: 3,
						clearedStage: 2,
						items: [{ uid: 'a', templateId: 'wooden-blade', star: 1, slot: 0, paid: 3 }],
						seed: 999,
						shop: [],
						rerolls: 0,
						wins: 1,
						losses: 0,
					},
				},
				version: 1,
			}),
		)
		await useGameStore.persist.rehydrate()

		const run = useGameStore.getState().run
		expect(run.equipped.map((item) => item.uid)).toEqual(['a'])
		expect(run.inventory).toEqual([])
	})

	it('an unknown cutieId in the save does not crash the state', async () => {
		window.localStorage.setItem(
			'martial-cutie-save',
			JSON.stringify({
				state: { run: { cutieId: 'khong-co', cuties: {}, equipped: [], inventory: [] } },
				version: 2,
			}),
		)
		await useGameStore.persist.rehydrate()
		expect(() => useGameStore.getState().run.cutieId).not.toThrow()
		expect(useGameStore.getState().run.cutieId).toBeTruthy()
	})
})
