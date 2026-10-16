/** Gọi API backend. Dev: Vite proxy `/api` → FastAPI. Production: cùng origin. */

export interface ApiUser {
	id: number
	display_name: string
	email: string | null
	avatar_url: string | null
	providers: string[]
}

export interface ApiSession {
	authenticated: boolean
	user: ApiUser | null
	available_providers: string[]
	/** Backend yêu cầu tự chuyển hướng sang nhà cung cấp khi chưa đăng nhập. */
	auto_login: boolean
}

export interface ApiSave {
	run: Record<string, unknown> | null
	revision: number
	updated_at: string | null
}

export class ApiError extends Error {
	readonly status: number
	readonly code: string

	constructor(status: number, code: string, message: string) {
		super(message)
		this.name = 'ApiError'
		this.status = status
		this.code = code
	}
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

async function parseError(response: Response): Promise<ApiError> {
	let code = 'http_error'
	let message = `Máy chủ trả về lỗi ${response.status}.`
	try {
		const body = (await response.json()) as { error?: string; message?: string; detail?: string }
		if (typeof body.error === 'string') code = body.error
		if (typeof body.message === 'string') message = body.message
		else if (typeof body.detail === 'string') message = body.detail
	} catch {
		// Không phải JSON — giữ thông báo mặc định.
	}
	return new ApiError(response.status, code, message)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		// Cookie phiên là httpOnly nên phải gửi kèm mọi lời gọi.
		credentials: 'include',
		...init,
		headers: { ...JSON_HEADERS, ...init?.headers },
	})
	if (!response.ok) throw await parseError(response)
	if (response.status === 204) return undefined as T
	return (await response.json()) as T
}

export const api = {
	session: () => request<ApiSession>('/api/auth/session'),

	logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

	getSave: () => request<ApiSave>('/api/me/save'),

	putSave: (run: Record<string, unknown>, revision: number) =>
		request<ApiSave>('/api/me/save', {
			method: 'PUT',
			body: JSON.stringify({ run, revision }),
		}),

	/** Đường dẫn bắt đầu đăng nhập — trình duyệt tự chuyển trang tới nhà cung cấp. */
	loginUrl: (provider: string) => `/api/auth/${encodeURIComponent(provider)}/login`,
}
