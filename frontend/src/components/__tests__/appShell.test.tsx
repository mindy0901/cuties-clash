// @vitest-environment jsdom
/**
 * Lưới an toàn cho **vỏ ứng dụng**: mọi màn hình phải render được, không ném lỗi.
 *
 * ⚠️ Vì sao không dùng `renderToString` như trước: `RouterProvider` của TanStack Router
 * cần router đã `load()` và cần DOM, nên không render được bằng `renderToString`
 * (`Cannot read properties of undefined (reading 'matches')`). Từ nay các test này chạy
 * trong jsdom với router thật — xem `src/test/router.tsx`.
 */
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'

function freshRun() {
	useGameStore.getState().newRun()
}

afterEach(cleanup)

describe('vỏ ứng dụng render được', () => {
	it('hiện phòng chuẩn bị', async () => {
		freshRun()
		await renderApp('/')

		expect(screen.getByText(/Martial Cutie/)).toBeTruthy()
		// Bố cục: Trang bị (đang mang) tách khỏi Kho đồ (dự trữ).
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(screen.getAllByText(/Mua Vật Phẩm/).length).toBeGreaterThan(0)
		expect(screen.getByText(/Đấu Thú Cưng/)).toBeTruthy()
	})

	it('hiện màn đấu khi đang đánh nhau', async () => {
		freshRun()
		useGameStore.setState((state) => ({ run: { ...state.run, currency: 40 } }))
		useGameStore.getState().buyOffer(0)
		useGameStore.getState().startBattle('stage')

		await renderApp('/')

		expect(screen.getAllByText(/Kiếm Thế/).length).toBeGreaterThan(0)
		expect(screen.getAllByText(/Chấn Đao/).length).toBeGreaterThan(0)
	})
})
