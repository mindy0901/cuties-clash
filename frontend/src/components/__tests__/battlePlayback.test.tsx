// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'
import type { ShopOffer } from '../../game/types'

/** End-to-end check of the battle screen: playback, speed controls and commit. */

function gearUp() {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: {
			...state.run,
			currency: 80,
			shop: state.run.shop.map((offer, index): ShopOffer =>
				index < 3
					? {
							...offer,
							templateId: ['great-axe', 'warden-plate', 'jade-fury'][index],
							star: 4,
							cost: 8,
							sold: false,
						}
					: offer,
			),
		},
	}))
	for (let index = 0; index < 3; index += 1) useGameStore.getState().buyOffer(index)
}

function advance(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms)
	})
}

describe('battle screen playback', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
	})

	it('steps through the fight and commits the result on its own', async () => {
		gearUp()
		await renderApp()
		fireEvent.click(screen.getByText(/Đấu Thú Cưng/))

		expect(useGameStore.getState().phase).toBe('battle')
		expect(useGameStore.getState().battle?.committed).toBe(false)

		advance(1200)
		expect(useGameStore.getState().battle?.committed).toBe(false)

		advance(120_000)
		expect(useGameStore.getState().battle?.committed).toBe(true)
		expect(useGameStore.getState().phase).toBe('result')
		expect(screen.getByText(/Chiến thắng!|Thất bại|Hoà/)).toBeTruthy()
	})

	it('commits immediately when the player skips', async () => {
		gearUp()
		await renderApp()
		fireEvent.click(screen.getByText(/Đấu Thú Cưng/))
		fireEvent.click(screen.getByText(/Bỏ qua/))

		expect(useGameStore.getState().battle?.committed).toBe(true)
		expect(useGameStore.getState().phase).toBe('result')
	})

	it('pauses and resumes playback', async () => {
		gearUp()
		await renderApp()
		fireEvent.click(screen.getByText(/Đấu Thú Cưng/))

		fireEvent.click(screen.getByText(/Tạm dừng/))
		advance(30_000)
		expect(useGameStore.getState().phase).toBe('battle')
		expect(useGameStore.getState().battle?.committed).toBe(false)

		fireEvent.click(screen.getByText(/Tiếp tục/))
		advance(120_000)
		expect(useGameStore.getState().battle?.committed).toBe(true)
	})

	it('reuses the loadout grids on the arena, with an avatar frame per side', async () => {
		gearUp()
		await renderApp()
		fireEvent.click(screen.getByText(/Đấu Thú Cưng/))

		// The arena uses the prep room's **own `GridBoard`**: one grid for us, one for the opponent.
		const boards = document.querySelectorAll<HTMLElement>('[data-grid-board]')
		expect(boards, 'two loadout grids on the arena').toHaveLength(2)

		// The avatar frames for both sides — a holder already prepared for avatar art (currently art/emoji).
		expect(document.querySelector('[data-avatar-card="player"]')).toBeTruthy()
		expect(document.querySelector('[data-avatar-card="enemy"]')).toBeTruthy()
		expect(document.querySelectorAll('[data-avatar-holder]')).toHaveLength(2)

		// Our grid shows **exactly** the number of carried items, not a loose list.
		const equipped = useGameStore.getState().run.equipped.filter((item) => item.slot >= 0)
		expect(boards[0].querySelectorAll('[data-item-box]')).toHaveLength(equipped.length)
	})

	it('the summary popup has NO restart-from-scratch button', async () => {
		// Restarting from scratch is an action of the **top bar** (it asks for confirmation). In the
		// summary popup it would sit right next to the continue button, making it easy to hit by
		// accident and wipe all progress.
		gearUp()
		await renderApp()
		fireEvent.click(screen.getByText(/Đấu Thú Cưng/))
		fireEvent.click(screen.getByText(/Bỏ qua/))

		const dialog = screen.getByRole('dialog', { name: 'Kết quả trận đấu' })
		expect(dialog.textContent, 'must not contain a restart-from-scratch button').not.toContain('Chơi lại từ đầu')
		// The popup's way forward is still there.
		expect(screen.getByText(/Sang màn tiếp theo|Về phòng chuẩn bị|Thử lại/)).toBeTruthy()
	})

	it('returns to the preparation room after closing the result', async () => {
		gearUp()
		await renderApp()
		fireEvent.click(screen.getByText(/Đấu Thú Cưng/))
		fireEvent.click(screen.getByText(/Bỏ qua/))
		fireEvent.click(screen.getByText(/Sang màn tiếp theo|Thử lại|Về phòng chuẩn bị/))

		const state = useGameStore.getState()
		expect(state.phase).toBe('prep')
		expect(state.battle).toBeNull()
		// Leaving the battle returns to the preparation room URL.
		expect(window.location.pathname).toBe('/')
		// The preparation room has a loadout board and an inventory area.
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
	})
})
