/** Luồng OAuth Google — mô phỏng HTTP tới nhà cung cấp, không gọi mạng thật. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildConfig, type Config } from '../src/config'
import { availableProviders, type OAuthProfile } from '../src/oauth'
import { providerKeys, upsertUserFromProfile } from '../src/services'
import {
	cookieValue,
	config,
	findSetCookie,
	guardFetch,
	seedLoggedInUser,
	sessionCookies,
	stateCookieValue,
	stateFromRedirect,
	testEnv,
	withApp,
	withDb,
} from './helpers'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const PROFILE_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const OAUTH_STATE_COOKIE = 'mc_oauth_state'

const configWithoutGoogle: Config = buildConfig(testEnv({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }))

function jsonResponse(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

interface CallLog {
	url: string
	init?: RequestInit
}

/** Stub `fetch` cho đúng hai endpoint của Google và ghi lại lời gọi. */
function stubGoogle(token: Response, profile?: Response): CallLog[] {
	const calls: CallLog[] = []
	vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
		calls.push({ url, ...(init === undefined ? {} : { init }) })
		if (url === TOKEN_URL) return token.clone()
		if (url === PROFILE_URL) {
			if (!profile) throw new Error(`Không mong đợi lời gọi hồ sơ: ${url}`)
			return profile.clone()
		}
		throw new Error(`Test không được gọi URL khác: ${url}`)
	})
	return calls
}

function formOf(call: CallLog): URLSearchParams {
	expect(call.init?.method).toBe('POST')
	expect(String((call.init?.headers as Record<string, string>)['content-type'])).toContain(
		'application/x-www-form-urlencoded',
	)
	return call.init?.body as URLSearchParams
}

function authorizationOf(call: CallLog): string | undefined {
	return (call.init?.headers as Record<string, string> | undefined)?.['authorization']
}

function messageOf(location: string | undefined): string | null {
	return location ? new URL(location).searchParams.get('message') : null
}

afterEach(() => {
	vi.unstubAllGlobals()
	vi.stubGlobal('fetch', guardFetch)
})

describe('bắt đầu đăng nhập', () => {
	it('chuyển hướng sang Google kèm state và cookie chống giả mạo', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/auth/google/login' })
			expect(response.statusCode).toBe(307)

			const location = new URL(String(response.headers.location))
			expect(location.hostname).toBe('accounts.google.com')
			expect(location.pathname).toBe('/o/oauth2/v2/auth')
			const query = location.searchParams
			expect(query.get('client_id')).toBe('google-client-id-test')
			expect(query.get('redirect_uri')).toBe('http://localhost:5190/api/auth/google/callback')
			expect(query.get('response_type')).toBe('code')
			expect(query.get('scope')).toBe('openid email profile')
			expect(query.get('access_type')).toBe('online')
			expect(query.get('prompt')).toBe('select_account')
			expect(query.get('state')).toBeTruthy()

			// Cookie chống giả mạo chỉ gửi cho đường dẫn gọi lại, sống 10 phút.
			const header = findSetCookie(response, OAUTH_STATE_COOKIE)
			expect(header).not.toBeNull()
			const lower = header!.toLowerCase()
			expect(lower).toContain('path=/api/auth')
			expect(lower).toContain('httponly')
			expect(lower).toContain('samesite=lax')
			expect(lower).toContain('max-age=600')
		}))

	it('báo 503 kèm mã lỗi khi chưa cấu hình Google', () =>
		withApp(
			async ({ app }) => {
				const response = await app.inject({ method: 'GET', url: '/api/auth/google/login' })
				expect(response.statusCode).toBe(503)
				expect(response.json().error).toBe('provider_not_configured')
				// Header này dễ bị mất nếu handler lỗi không truyền lại.
				expect(response.headers['x-error-code']).toBe('provider_not_configured')
				expect(response.json().message).toContain('Google')
			},
			{ config: configWithoutGoogle },
		))

	it('từ chối nhà cung cấp đã bị bỏ', () =>
		withApp(async ({ app }) => {
			for (const provider of ['facebook', 'zing']) {
				const response = await app.inject({ method: 'GET', url: `/api/auth/${provider}/login` })
				expect(response.statusCode).toBe(400)
				expect(response.json().error).toBe('unknown_provider')
				expect(response.headers['x-error-code']).toBe('unknown_provider')
				expect(response.json().message).toContain(provider)
			}
		}))

	it('chỉ liệt kê Google là khả dụng', () =>
		withApp(async ({ app }) => {
			expect((await app.inject({ method: 'GET', url: '/api/auth/session' })).json().available_providers).toEqual([
				'google',
			])
			expect((await app.inject({ method: 'GET', url: '/api/health' })).json().providers).toEqual(['google'])
			expect(availableProviders(configWithoutGoogle)).toEqual([])
		}))
})

describe('điểm gọi lại', () => {
	it('từ chối state bị làm giả và không tạo phiên', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({
				method: 'GET',
				url: '/api/auth/google/callback?code=abc&state=bia-dat',
			})
			expect(response.statusCode).toBe(303)
			expect(String(response.headers.location)).toContain('login=error')
			expect(messageOf(response.headers.location)).toBe(
				'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy thử lại.',
			)
			expect((await app.inject({ method: 'GET', url: '/api/auth/session' })).json().authenticated).toBe(false)
		}))

	it('chuyển tiếp lỗi của nhà cung cấp', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({
				method: 'GET',
				url: '/api/auth/google/callback?error=access_denied&error_description=Ng%C6%B0%E1%BB%9Di%20d%C3%B9ng%20t%E1%BB%AB%20ch%E1%BB%91i',
			})
			expect(response.statusCode).toBe(303)
			const location = String(response.headers.location)
			expect(location).toContain('login=error')
			// Thông báo lỗi của nhà cung cấp được chuyển tiếp về UI dưới dạng đã mã hoá URL.
			expect(location).toContain('ch%E1%BB%91i')
			expect(messageOf(location)).toBe('Người dùng từ chối')
		}))

	it('từ chối khi thiếu mã uỷ quyền', () =>
		withApp(async ({ app }) => {
			const login = await app.inject({ method: 'GET', url: '/api/auth/google/login' })
			const state = stateFromRedirect(String(login.headers.location))

			const response = await app.inject({
				method: 'GET',
				url: `/api/auth/google/callback?state=${state}`,
				cookies: { [OAUTH_STATE_COOKIE]: stateCookieValue(login) },
			})
			expect(response.statusCode).toBe(303)
			expect(String(response.headers.location)).toContain('login=error')
			expect(messageOf(response.headers.location)).toBe('Nhà cung cấp không trả về mã uỷ quyền.')
			expect((await app.inject({ method: 'GET', url: '/api/auth/session' })).json().authenticated).toBe(false)
		}))

	it('đổi mã uỷ quyền thành công và tạo phiên', () =>
		withApp(async ({ app }) => {
			const login = await app.inject({ method: 'GET', url: '/api/auth/google/login' })
			const state = stateFromRedirect(String(login.headers.location))
			const calls = stubGoogle(
				jsonResponse({ access_token: 'token-google' }),
				jsonResponse({
					sub: 'google-sub-42',
					email: 'ai-do@example.com',
					name: 'Ai Đó',
					picture: 'https://example.com/p.png',
				}),
			)

			const callback = await app.inject({
				method: 'GET',
				url: `/api/auth/google/callback?code=code-google&state=${state}`,
				cookies: { [OAUTH_STATE_COOKIE]: stateCookieValue(login) },
			})
			expect(callback.statusCode).toBe(303)
			expect(callback.headers.location).toBe('http://localhost:5190/?login=ok')
			// Cookie chống giả mạo được xoá sau khi dùng xong.
			expect(cookieValue(callback, OAUTH_STATE_COOKIE)).toBe('')

			const sessionToken = cookieValue(callback, config.cookieName)
			expect(sessionToken).toBeTruthy()
			const session = (
				await app.inject({ method: 'GET', url: '/api/auth/session', cookies: sessionCookies(sessionToken!) })
			).json()
			expect(session.authenticated).toBe(true)
			expect(session.user.display_name).toBe('Ai Đó')
			expect(session.user.email).toBe('ai-do@example.com')
			expect(session.user.avatar_url).toBe('https://example.com/p.png')
			expect(session.user.providers).toEqual(['google'])

			// Đúng dạng request mà Google yêu cầu khi đổi token.
			const tokenCall = calls.find((call) => call.url === TOKEN_URL)!
			const form = formOf(tokenCall)
			expect(form.get('client_id')).toBe('google-client-id-test')
			expect(form.get('client_secret')).toBe('google-client-secret-test')
			expect(form.get('code')).toBe('code-google')
			expect(form.get('grant_type')).toBe('authorization_code')
			expect(form.get('redirect_uri')).toBe('http://localhost:5190/api/auth/google/callback')
			// Google bắt buộc gửi lại scope khi đổi token.
			expect(form.get('scope')).toBe('openid email profile')

			const profileCall = calls.find((call) => call.url === PROFILE_URL)!
			expect(profileCall.init?.method ?? 'GET').toBe('GET')
			expect(authorizationOf(profileCall)).toBe('Bearer token-google')
		}))

	it('từ chối khi token không có access_token', () =>
		withApp(async ({ app }) => {
			const login = await app.inject({ method: 'GET', url: '/api/auth/google/login' })
			const state = stateFromRedirect(String(login.headers.location))
			stubGoogle(jsonResponse({ scope: 'openid' }))

			const callback = await app.inject({
				method: 'GET',
				url: `/api/auth/google/callback?code=x&state=${state}`,
				cookies: { [OAUTH_STATE_COOKIE]: stateCookieValue(login) },
			})
			expect(callback.statusCode).toBe(303)
			expect(String(callback.headers.location)).toContain('login=error')
			expect(messageOf(callback.headers.location)).toBe('Google không trả về access token.')
			expect((await app.inject({ method: 'GET', url: '/api/auth/session' })).json().authenticated).toBe(false)
		}))

	it('báo lỗi khi Google từ chối đổi mã', () =>
		withApp(async ({ app }) => {
			const login = await app.inject({ method: 'GET', url: '/api/auth/google/login' })
			const state = stateFromRedirect(String(login.headers.location))
			stubGoogle(jsonResponse({ error: 'invalid_grant' }, 400))

			const callback = await app.inject({
				method: 'GET',
				url: `/api/auth/google/callback?code=bad&state=${state}`,
				cookies: { [OAUTH_STATE_COOKIE]: stateCookieValue(login) },
			})
			expect(callback.statusCode).toBe(303)
			expect(String(callback.headers.location)).toContain('login=error')
			expect(messageOf(callback.headers.location)).toBe(
				'Google từ chối đổi mã uỷ quyền: {"error":"invalid_grant"}',
			)
			expect((await app.inject({ method: 'GET', url: '/api/auth/session' })).json().authenticated).toBe(false)
		}))

	it('báo lỗi khi không đọc được hồ sơ', () =>
		withApp(async ({ app }) => {
			const login = await app.inject({ method: 'GET', url: '/api/auth/google/login' })
			const state = stateFromRedirect(String(login.headers.location))
			stubGoogle(jsonResponse({ access_token: 'token-google' }), jsonResponse({ error: 'unavailable' }, 500))

			const callback = await app.inject({
				method: 'GET',
				url: `/api/auth/google/callback?code=x&state=${state}`,
				cookies: { [OAUTH_STATE_COOKIE]: stateCookieValue(login) },
			})
			expect(callback.statusCode).toBe(303)
			expect(messageOf(callback.headers.location)).toBe(
				'Không đọc được hồ sơ từ Google: {"error":"unavailable"}',
			)
		}))

	it('hồ sơ thiếu sub thì không tạo tài khoản', () =>
		withApp(async ({ app }) => {
			const login = await app.inject({ method: 'GET', url: '/api/auth/google/login' })
			const state = stateFromRedirect(String(login.headers.location))
			stubGoogle(
				jsonResponse({ access_token: 'token-google' }),
				jsonResponse({ email: 'thieu-sub@example.com', name: 'Thiếu Sub' }),
			)

			const callback = await app.inject({
				method: 'GET',
				url: `/api/auth/google/callback?code=x&state=${state}`,
				cookies: { [OAUTH_STATE_COOKIE]: stateCookieValue(login) },
			})
			expect(callback.statusCode).toBe(303)
			expect(String(callback.headers.location)).toContain('login=error')
			expect(messageOf(callback.headers.location)).toBe('Không đọc được mã người dùng từ Google.')
			expect((await app.inject({ method: 'GET', url: '/api/auth/session' })).json().authenticated).toBe(false)
		}))

	it('token trả về không phải JSON thì báo lỗi chung', () =>
		withApp(async ({ app }) => {
			const login = await app.inject({ method: 'GET', url: '/api/auth/google/login' })
			const state = stateFromRedirect(String(login.headers.location))
			vi.stubGlobal('fetch', async () => new Response('<html>khong-phai-json</html>', { status: 200 }))

			const callback = await app.inject({
				method: 'GET',
				url: `/api/auth/google/callback?code=x&state=${state}`,
				cookies: { [OAUTH_STATE_COOKIE]: stateCookieValue(login) },
			})
			expect(callback.statusCode).toBe(303)
			expect(messageOf(callback.headers.location)).toBe('Đăng nhập thất bại, hãy thử lại.')
		}))
})

describe('liên kết tài khoản', () => {
	it('đăng nhập lại cùng tài khoản Google không tạo người dùng mới', () =>
		withDb(async (db) => {
			const profile: OAuthProfile = {
				provider: 'google',
				subject: 'g-9',
				email: 'laplai@example.com',
				displayName: 'Lặp Lại',
			}
			const first = await upsertUserFromProfile(db, profile)
			const second = await upsertUserFromProfile(db, profile)
			expect(second.id).toBe(first.id)
			// Đếm theo email để không phụ thuộc dữ liệu thật đang có trong database dev.
			expect(await db.user.count({ where: { email: 'laplai@example.com' } })).toBe(1)
			expect(await providerKeys(db, first.id)).toEqual(['google'])
		}))

	it('cùng email nhưng sub khác vẫn về một tài khoản', () =>
		withDb(async (db) => {
			const first = await upsertUserFromProfile(db, {
				provider: 'google',
				subject: 'g-1',
				email: 'chung@example.com',
				displayName: 'Chung',
			})
			const second = await upsertUserFromProfile(db, {
				provider: 'google',
				subject: 'g-2',
				email: 'chung@example.com',
				displayName: 'Chung',
			})
			expect(second.id).toBe(first.id)
			expect(await db.user.count({ where: { email: 'chung@example.com' } })).toBe(1)
			// Mỗi `sub` khác nhau tạo một liên kết riêng, cùng trỏ về một người dùng.
			expect(new Set(await providerKeys(db, first.id))).toEqual(new Set(['google']))
		}))

	it('giữ tên người chơi đã đổi, chỉ thay tên mặc định', () =>
		withDb(async (db) => {
			const created = await upsertUserFromProfile(db, {
				provider: 'google',
				subject: 'g-giu-ten',
				email: 'giuten@example.com',
				displayName: 'Mindy',
			})
			const updated = await upsertUserFromProfile(db, {
				provider: 'google',
				subject: 'g-giu-ten',
				email: 'giuten@example.com',
				displayName: 'Tên Khác Từ Google',
			})
			expect(updated.id).toBe(created.id)
			expect(updated.displayName).toBe('Mindy')
			expect(updated.lastLoginAt.getTime()).toBeGreaterThanOrEqual(created.lastLoginAt.getTime())
		}))

	it('thay tên mặc định bằng tên thật của Google', () =>
		withDb(async (db) => {
			const created = await upsertUserFromProfile(db, {
				provider: 'google',
				subject: 'g-ten',
				displayName: 'Người chơi Google',
			})
			expect(created.displayName).toBe('Người chơi Google')
			const updated = await upsertUserFromProfile(db, {
				provider: 'google',
				subject: 'g-ten',
				displayName: 'Tên Thật',
			})
			expect(updated.displayName).toBe('Tên Thật')
		}))
})
