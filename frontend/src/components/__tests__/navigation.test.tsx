// @vitest-environment jsdom
/**
 * Điều hướng giữa phòng chuẩn bị (`/`) và trang cửa hàng riêng (`/cua-hang`).
 *
 * Ba điều cần nhớ khi viết test ở đây:
 * - Dùng `render` của @testing-library, **không** dùng `renderToString` (zustand v5
 *   trả state khởi tạo cho `getServerSnapshot`).
 * - Từ khi dùng TanStack Router, **đường dẫn URL là nguồn sự thật** của màn hình đang
 *   mở; store không còn giữ `route`. Vì vậy kiểm tra màn hình đang mở bằng
 *   `window.location.pathname` cộng với nội dung render, ❌ không đọc `route` từ store.
 * - `renderApp` là `async` (RouterProvider khớp route sau khi `router.load()` xong) nên
 *   callback của `it` phải `async` và phải `await renderApp(...)`.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'

/** Về phòng chuẩn bị với tiền và shop sạch (shop bị `persist` giữ lại giữa các test). */
function resetAt() {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: { ...state.run, currency: 99 },
	}))
}

beforeEach(resetAt)
afterEach(cleanup)

describe('điều hướng phòng chuẩn bị ↔ cửa hàng', () => {
	it('phòng chuẩn bị hiện bảng trang bị và nút mua', async () => {
		await renderApp('/')
		// "Trang bị" cũng xuất hiện trong câu gợi ý, nên hỏi theo tiêu đề panel.
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(screen.getAllByText(/Mua Vật Phẩm/).length).toBeGreaterThan(0)
		expect(screen.getByText(/Đấu Thú Cưng/)).toBeTruthy()
		// Hai nút chưa có chức năng vẫn hiện để giữ bố cục.
		expect(screen.getByText(/Nhiệm Vụ/)).toBeTruthy()
		expect(screen.getByText(/Bộ Sưu Tập/)).toBeTruthy()
	})

	it('bấm Mua Vật Phẩm thì mở trang cửa hàng và đổi đường dẫn', async () => {
		await renderApp('/')
		fireEvent.click(screen.getAllByText(/Mua Vật Phẩm/)[0])

		// Chờ màn hình mới render xong rồi mới kiểm tra URL: điều hướng của router là
		// transition bất đồng bộ nên `window.location` có thể đổi sau một nhịp.
		expect(await screen.findByText('Cửa hàng vật phẩm')).toBeTruthy()
		expect(window.location.pathname).toBe('/cua-hang')
		// Trang cửa hàng không còn hiện kho đồ.
		expect(screen.queryByText('Kho đồ')).toBeNull()
	})

	it('nút quay về đưa lại phòng chuẩn bị', async () => {
		await renderApp('/cua-hang')
		expect(screen.getByText('Cửa hàng vật phẩm')).toBeTruthy()

		fireEvent.click(screen.getByText(/Quay về/))

		expect(await screen.findByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(window.location.pathname).toBe('/')
	})

	it('mua được món ngay trong trang cửa hàng', async () => {
		await renderApp('/cua-hang')

		const before = useGameStore.getState().run
		const offer = before.shop[0]
		expect(offer.sold).toBe(false)
		fireEvent.click(screen.getAllByText(/^Mua · /)[0])

		const after = useGameStore.getState().run
		// Trang bị còn chỗ nên món được mang ngay.
		expect(after.equipped).toHaveLength(1)
		expect(after.currency).toBe(before.currency - offer.cost)
		expect(after.shop[0].sold).toBe(true)
	})

	it('mở thẳng /cua-hang thì vào trang cửa hàng', async () => {
		await renderApp('/cua-hang')
		expect(screen.getByText('Cửa hàng vật phẩm')).toBeTruthy()
	})

	it('đường dẫn lạ vẫn về phòng chuẩn bị', async () => {
		await renderApp('/mot-duong-dan-la')
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
	})

	it('nút chưa có chức năng thì báo "sắp có" chứ không im lặng', async () => {
		await renderApp('/')
		fireEvent.click(screen.getByText(/Nhiệm Vụ/))
		expect(useGameStore.getState().toasts.some((toast) => toast.text.includes('sẽ có ở bản sau'))).toBe(true)
	})

	it('đang đánh nhau thì hiện màn đấu dù đang ở đường dẫn cửa hàng', async () => {
		useGameStore.getState().buyOffer(0)
		useGameStore.getState().startBattle('stage')
		await renderApp('/cua-hang')
		expect(useGameStore.getState().phase).toBe('battle')
		// Màn đấu có thanh Kiếm Thế và nút tốc độ.
		expect(screen.getAllByText(/Kiếm Thế/).length).toBeGreaterThan(0)
		expect(screen.getByText(/Bỏ qua/)).toBeTruthy()
	})
})
