/** Calls the backend API. Dev: the Vite proxy sends `/api` → FastAPI. Production: same origin. */

export interface ApiUser {
	id: number
	display_name: string
	email: string | null
	avatar_url: string | null
	providers: string[]
	/** Email listed in `ADMIN_EMAILS` → the content admin page is available. */
	is_admin: boolean
}

export interface ApiSession {
	authenticated: boolean
	user: ApiUser | null
	available_providers: string[]
	/** Backend asks the client to redirect to the provider when signed out. */
	auto_login: boolean
}

export interface ApiSave {
	run: Record<string, unknown> | null
	revision: number
	updated_at: string | null
}

/** Content overlay: `{ items: { id: payload }, pets: { id: payload } }`. */
export interface ApiContent {
	items: Record<string, Record<string, unknown>>
	pets: Record<string, Record<string, unknown>>
}

export interface ApiContentOverride {
	kind: 'item' | 'pet'
	entityId: string
	payload: Record<string, unknown>
	updatedAt: string
	updatedBy: string | null
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
		// Not JSON — keep the default message.
	}
	return new ApiError(response.status, code, message)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		// The session cookie is httpOnly, so it has to be sent with every call.
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

	/** Game content overlay — public, anonymous players included. */
	content: () => request<ApiContent>('/api/content'),

	/** Overridden rows (with author) — admin accounts only. */
	adminContent: () => request<{ overrides: ApiContentOverride[] }>('/api/admin/content'),

	putContent: (kind: 'item' | 'pet', id: string, payload: Record<string, unknown>) =>
		request<{ override: ApiContentOverride }>(
			`/api/admin/content/${kind}/${encodeURIComponent(id)}`,
			{ method: 'PUT', body: JSON.stringify(payload) },
		),

	/** Deleting an override returns the entity to its code default. */
	deleteContent: (kind: 'item' | 'pet', id: string) =>
		request<{ ok: boolean }>(`/api/admin/content/${kind}/${encodeURIComponent(id)}`, {
			method: 'DELETE',
		}),

	/** Login start URL — the browser navigates itself to the provider. */
	loginUrl: (provider: string) => `/api/auth/${encodeURIComponent(provider)}/login`,
}
