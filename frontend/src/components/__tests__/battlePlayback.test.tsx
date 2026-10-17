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

	it('sàn đấu dùng lại lưới trang bị, kèm khung đại diện hai bên', async () => {
		gearUp()
		await renderApp()
		fireEvent.click(screen.getByText(/Đấu Thú Cưng/))

		// Sàn đấu dùng **chính `GridBoard`** của phòng chuẩn bị: một lưới cho mình, một cho đối thủ.
		const boards = document.querySelectorAll<HTMLElement>('[data-grid-board]')
		expect(boards, 'hai lưới trang bị trên sàn đấu').toHaveLength(2)

		// Khung đại diện hai bên — holder đã sẵn sàng cho ảnh đại diện (hiện hiện art/emoji).
		expect(document.querySelector('[data-avatar-card="player"]')).toBeTruthy()
		expect(document.querySelector('[data-avatar-card="enemy"]')).toBeTruthy()
		expect(document.querySelectorAll('[data-avatar-holder]')).toHaveLength(2)

		// Lưới bên mình hiện **đúng** số món đang mang, không phải danh sách rời.
		const equipped = useGameStore.getState().run.equipped.filter((item) => item.slot >= 0)
		expect(boards[0].querySelectorAll('[data-item-box]')).toHaveLength(equipped.length)
	})

	it('quay về phòng chuẩn bị sau khi đóng kết quả', async () => {
		gearUp()
		await renderApp()
		fireEvent.click(screen.getByText(/Đấu Thú Cưng/))
		fireEvent.click(screen.getByText(/Bỏ qua/))
		fireEvent.click(screen.getByText(/Sang màn tiếp theo|Thử lại|Về phòng chuẩn bị/))

		const state = useGameStore.getState()
		expect(state.phase).toBe('prep')
		expect(state.battle).toBeNull()
		// Rời trận thì quay về đường dẫn phòng chuẩn bị.
		expect(window.location.pathname).toBe('/')
		// Phòng chuẩn bị có bảng trang bị và khu kho đồ.
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
	})
})
