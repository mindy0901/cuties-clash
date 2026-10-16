// @vitest-environment jsdom
/**
 * Hộp thoại đăng nhập phải nói **đúng nguyên nhân**.
 *
 * Lỗi đã gặp: khi không gọi được máy chủ, hộp thoại vẫn bảo người dùng điền
 * `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — trong khi vấn đề là backend chưa chạy. Hai
 * tình huống cùng cho `available_providers` rỗng nhưng cách sửa khác hẳn nhau, nên phải
 * phân biệt và phải có nút **Thử lại** (query đặt `retry: false` nên lỗi bị "đóng băng",
 * không tự thử lại khi backend được bật lên).
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const session = vi.fn()

vi.mock('../../api/client', async () => {
	const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
	return { ...actual, api: { ...actual.api, session: (...args: unknown[]) => session(...args) } }
})

const { createQueryClient } = await import('../../api/queryClient')
const { LoginDialog } = await import('../LoginDialog')

function renderDialog() {
	return render(
		<QueryClientProvider client={createQueryClient()}>
			<LoginDialog onClose={() => {}} />
		</QueryClientProvider>,
	)
}

beforeEach(() => {
	vi.clearAllMocks()
})

afterEach(cleanup)

describe('LoginDialog', () => {
	it('máy chủ không gọi được thì báo đúng, KHÔNG hướng dẫn điền key', async () => {
		session.mockRejectedValue(new Error('máy chủ không phản hồi'))
		renderDialog()

		expect(await screen.findByText(/Không kết nối được máy chủ đăng nhập/)).toBeTruthy()
		expect(screen.queryByText(/GOOGLE_CLIENT_ID/)).toBeNull()
	})

	it('máy chủ trả lời nhưng chưa có key thì mới hướng dẫn điền .env', async () => {
		session.mockResolvedValue({
			authenticated: false,
			user: null,
			available_providers: [],
			auto_login: false,
		})
		renderDialog()

		expect(await screen.findByText(/GOOGLE_CLIENT_ID/)).toBeTruthy()
		expect(screen.queryByText(/Không kết nối được máy chủ/)).toBeNull()
	})

	it('máy chủ đã cấu hình thì hiện nút đăng nhập Google', async () => {
		session.mockResolvedValue({
			authenticated: false,
			user: null,
			available_providers: ['google'],
			auto_login: false,
		})
		renderDialog()

		const link = await screen.findByText(/Tiếp tục với Google/)
		expect(link.closest('a')?.getAttribute('href')).toBe('/api/auth/google/login')
		expect(screen.queryByText(/GOOGLE_CLIENT_ID/)).toBeNull()
	})

	it('nút Thử lại gọi lại máy chủ và hiện nút đăng nhập khi backend đã lên', async () => {
		session.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
			authenticated: false,
			user: null,
			available_providers: ['google'],
			auto_login: false,
		})
		renderDialog()

		const retry = await screen.findByText('Thử lại')
		expect(session).toHaveBeenCalledTimes(1)

		fireEvent.click(retry)

		expect(await screen.findByText(/Tiếp tục với Google/)).toBeTruthy()
		expect(session).toHaveBeenCalledTimes(2)
		expect(screen.queryByText(/Không kết nối được máy chủ/)).toBeNull()
	})
})
