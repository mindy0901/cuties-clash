/** Phiên đăng nhập và đồng bộ bản lưu. */

import { describe, expect, it } from 'vitest'
import { config, cookieValue, findSetCookie, seedLoggedInUser, sessionCookies, withApp } from './helpers'

const RUN = {
	stage: 7,
	currency: 120,
	items: [{ uid: 'a', templateId: 'great-axe', star: 2, slot: 0 }],
}

describe('phiên đăng nhập', () => {
	it('ẩn danh khi không có cookie', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/auth/session' })
			expect(response.statusCode).toBe(200)
			const body = response.json()
			expect(body.authenticated).toBe(false)
			expect(body.user).toBeNull()
			// Chỉ Google được hỗ trợ và đã có key trong môi trường test.
			expect(body.available_providers).toEqual(['google'])
			expect(body.auto_login).toBe(false)
		}))

	it('báo người dùng khi đã đăng nhập', () =>
		withApp(async ({ app, db }) => {
			const { user, sessionToken } = await seedLoggedInUser(db)
			const body = (
				await app.inject({ method: 'GET', url: '/api/auth/session', cookies: sessionCookies(sessionToken) })
			).json()
			expect(body.authenticated).toBe(true)
			expect(body.user.id).toBe(user.id)
			expect(body.user.display_name).toBe('Người chơi Thử Nghiệm')
			expect(body.user.providers).toEqual(['google'])
		}))

	it('bỏ qua cookie phiên không hợp lệ', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({
				method: 'GET',
				url: '/api/auth/session',
				cookies: sessionCookies('token-bia-dat'),
			})
			expect(response.json().authenticated).toBe(false)
		}))

	it('GET kèm Content-Type JSON (frontend gắn cho mọi lời gọi) vẫn chạy', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const response = await app.inject({
				method: 'GET',
				url: '/api/auth/session',
				cookies: sessionCookies(sessionToken),
				headers: { 'content-type': 'application/json' },
			})
			expect(response.statusCode).toBe(200)
			expect(response.json().authenticated).toBe(true)
		}))

	it('/api/me đòi đăng nhập', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/me' })
			expect(response.statusCode).toBe(401)
			expect(response.json().error).toBe('unauthorized')
			expect(response.headers['x-error-code']).toBe('unauthorized')
		}))

	it('/api/me trả hồ sơ người dùng đang đăng nhập', () =>
		withApp(async ({ app, db }) => {
			const { user, sessionToken } = await seedLoggedInUser(db)
			const body = (await app.inject({ method: 'GET', url: '/api/me', cookies: sessionCookies(sessionToken) })).json()
			expect(body).toEqual({
				id: user.id,
				display_name: 'Người chơi Thử Nghiệm',
				email: 'nguoidung@example.com',
				avatar_url: 'https://example.com/a.png',
				providers: ['google'],
			})
		}))

	it('đăng xuất xoá cookie và thu hồi token cũ', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			expect(
				(await app.inject({ method: 'GET', url: '/api/auth/session', cookies: sessionCookies(sessionToken) })).json()
					.authenticated,
			).toBe(true)

			// Frontend gửi `Content-Type: application/json` kèm body rỗng cho lời gọi này.
			const logout = await app.inject({
				method: 'POST',
				url: '/api/auth/logout',
				cookies: sessionCookies(sessionToken),
				headers: { 'content-type': 'application/json' },
			})
			expect(logout.statusCode).toBe(200)
			expect(logout.json()).toEqual({ ok: true })
			// Cookie phiên bị xoá (giá trị rỗng) trên cùng đường dẫn.
			const cleared = findSetCookie(logout, config.cookieName)
			expect(cleared).not.toBeNull()
			expect(cookieValue(logout, config.cookieName)).toBe('')

			// Token cũ mang epoch cũ nên hết hiệu lực ngay.
			const stale = await app.inject({ method: 'GET', url: '/api/me', cookies: sessionCookies(sessionToken) })
			expect(stale.statusCode).toBe(401)
			expect(stale.json().message).toBe('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.')
		}))
})

describe('đồng bộ bản lưu', () => {
	it('đọc/ghi tròn vòng', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const cookies = sessionCookies(sessionToken)

			const empty = (await app.inject({ method: 'GET', url: '/api/me/save', cookies })).json()
			expect(empty.run).toBeNull()
			expect(empty.revision).toBe(0)
			expect(empty.updated_at).toBeNull()

			const saved = await app.inject({ method: 'PUT', url: '/api/me/save', cookies, payload: { run: RUN } })
			expect(saved.statusCode).toBe(200)
			expect(saved.json().revision).toBe(1)
			expect(saved.json().updated_at).not.toBeNull()

			const loaded = (await app.inject({ method: 'GET', url: '/api/me/save', cookies })).json()
			expect(loaded.run).toEqual(RUN)
			expect(loaded.revision).toBe(1)
			expect(loaded.updated_at).not.toBeNull()
		}))

	it('từ chối revision cũ và giữ nguyên bản lưu', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const cookies = sessionCookies(sessionToken)
			await app.inject({ method: 'PUT', url: '/api/me/save', cookies, payload: { run: { stage: 1 } } })

			const conflict = await app.inject({
				method: 'PUT',
				url: '/api/me/save',
				cookies,
				payload: { run: { stage: 2 }, revision: 99 },
			})
			expect(conflict.statusCode).toBe(400)
			expect(conflict.json().error).toBe('revision_conflict')
			expect(conflict.headers['x-error-code']).toBe('revision_conflict')
			expect(conflict.json().message).toBe(
				'Bản lưu trên máy chủ đã thay đổi ở thiết bị khác. Hãy tải lại trước khi ghi đè.',
			)
			// Bản lưu cũ vẫn nguyên vẹn.
			expect((await app.inject({ method: 'GET', url: '/api/me/save', cookies })).json().run).toEqual({ stage: 1 })
		}))

	it('nhận revision khớp và tăng revision', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const cookies = sessionCookies(sessionToken)
			await app.inject({ method: 'PUT', url: '/api/me/save', cookies, payload: { run: { stage: 1 } } })

			const updated = await app.inject({
				method: 'PUT',
				url: '/api/me/save',
				cookies,
				payload: { run: { stage: 2 }, revision: 1 },
			})
			expect(updated.statusCode).toBe(200)
			expect(updated.json().revision).toBe(2)
			expect((await app.inject({ method: 'GET', url: '/api/me/save', cookies })).json().run).toEqual({ stage: 2 })
		}))

	it('thiếu revision thì ghi đè không kiểm tra', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const cookies = sessionCookies(sessionToken)
			await app.inject({ method: 'PUT', url: '/api/me/save', cookies, payload: { run: { stage: 1 } } })

			const overwritten = await app.inject({
				method: 'PUT',
				url: '/api/me/save',
				cookies,
				payload: { run: { stage: 3 }, revision: null },
			})
			expect(overwritten.statusCode).toBe(200)
			expect(overwritten.json().revision).toBe(2)
			expect(overwritten.json().run).toEqual({ stage: 3 })
		}))

	it('đòi đăng nhập cho cả đọc lẫn ghi', () =>
		withApp(async ({ app }) => {
			expect((await app.inject({ method: 'GET', url: '/api/me/save' })).statusCode).toBe(401)
			expect((await app.inject({ method: 'PUT', url: '/api/me/save', payload: { run: {} } })).statusCode).toBe(401)
		}))

	it('từ chối bản lưu quá lớn', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const response = await app.inject({
				method: 'PUT',
				url: '/api/me/save',
				cookies: sessionCookies(sessionToken),
				payload: { run: { blob: 'x'.repeat(250_000) } },
			})
			expect(response.statusCode).toBe(400)
			expect(response.json().error).toBe('save_too_large')
			expect(response.json().message).toBe('Bản lưu quá lớn để đồng bộ.')
			expect(response.headers['x-error-code']).toBe('save_too_large')
		}))

	it('từ chối body sai kiểu bằng 422', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const response = await app.inject({
				method: 'PUT',
				url: '/api/me/save',
				cookies: sessionCookies(sessionToken),
				payload: { run: 'khong-phai-object' },
			})
			expect(response.statusCode).toBe(422)
			expect(response.json().error).toBe('validation_error')
		}))

	it('body rỗng kèm content-type JSON vẫn là 422 chứ không phải lỗi 400 của Fastify', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const response = await app.inject({
				method: 'PUT',
				url: '/api/me/save',
				cookies: sessionCookies(sessionToken),
				headers: { 'content-type': 'application/json' },
				body: '',
			})
			expect(response.statusCode).toBe(422)
			expect(response.json().error).toBe('validation_error')
		}))

	it('JSON hỏng vẫn là 422', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const response = await app.inject({
				method: 'PUT',
				url: '/api/me/save',
				cookies: sessionCookies(sessionToken),
				headers: { 'content-type': 'application/json' },
				body: '{"run": ',
			})
			expect(response.statusCode).toBe(422)
			expect(response.json().error).toBe('validation_error')
		}))

	it('không để lộ bản lưu của người khác', () =>
		withApp(async ({ app, db }) => {
			const first = await seedLoggedInUser(db)
			const second = await seedLoggedInUser(db, {
				subject: 'subject-2',
				email: 'nguoidung2@example.com',
				displayName: 'Người chơi Khác',
			})
			await app.inject({
				method: 'PUT',
				url: '/api/me/save',
				cookies: sessionCookies(first.sessionToken),
				payload: { run: { stage: 9 } },
			})

			const other = await app.inject({
				method: 'GET',
				url: '/api/me/save',
				cookies: sessionCookies(second.sessionToken),
			})
			expect(other.json().run).toBeNull()
			expect(other.json().revision).toBe(0)
		}))
})

describe('health và đường dẫn lạ', () => {
	it('health báo nhà cung cấp đã cấu hình', () =>
		withApp(async ({ app }) => {
			const body = (await app.inject({ method: 'GET', url: '/api/health' })).json()
			expect(body.status).toBe('ok')
			expect(body.providers).toEqual(['google'])
			expect(body.environment).toBe('test')
		}))

	it('API không tồn tại trả 404 JSON tiếng Việt', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/khong-co' })
			expect(response.statusCode).toBe(404)
			expect(response.json()).toEqual({ error: 'not_found', message: 'Không có API này.' })
			expect(response.headers['x-error-code']).toBe('not_found')
		}))
})
