// @vitest-environment jsdom
/**
 * The login dialog must state the **right cause**.
 *
 * Bug that happened: when the server could not be reached, the dialog still told the user to fill
 * in `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — while the real problem was that the backend was not
 * running. Both situations leave `available_providers` empty but the fix is completely different, so
 * they have to be told apart, and there has to be a **Thử lại** button (the query sets
 * `retry: false`, so the error is "frozen" and does not retry by itself once the backend is up).
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLanguageStore } from '../../i18n'

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
	useLanguageStore.setState({ language: 'vi' })
})

afterEach(cleanup)

describe('LoginDialog', () => {
	it('reports an unreachable server accurately and does NOT mention filling in keys', async () => {
		session.mockRejectedValue(new Error('máy chủ không phản hồi'))
		renderDialog()

		expect(await screen.findByText(/Không kết nối được máy chủ đăng nhập/)).toBeTruthy()
		expect(screen.queryByText(/GOOGLE_CLIENT_ID/)).toBeNull()
	})

	it('only points at the .env file when the server answers but has no keys', async () => {
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

	it('shows the Google login button when the server is configured', async () => {
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

	it('the Thử lại button queries the server again and shows login once the backend is up', async () => {
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
