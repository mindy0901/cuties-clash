/** Login sessions and save syncing. */

import { describe, expect, it } from 'vitest'
import { config, cookieValue, findSetCookie, seedLoggedInUser, sessionCookies, withApp } from './helpers'

const RUN = {
	stage: 7,
	currency: 120,
	items: [{ uid: 'a', templateId: 'great-axe', star: 2, slot: 0 }],
}

describe('login session', () => {
	it('stays anonymous without a cookie', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/auth/session' })
			expect(response.statusCode).toBe(200)
			const body = response.json()
			expect(body.authenticated).toBe(false)
			expect(body.user).toBeNull()
			// Only Google is supported and its keys are present in the test environment.
			expect(body.available_providers).toEqual(['google'])
			expect(body.auto_login).toBe(false)
		}))

	it('reports the user when already signed in', () =>
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

	it('ignores an invalid session cookie', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({
				method: 'GET',
				url: '/api/auth/session',
				cookies: sessionCookies('fake-token'),
			})
			expect(response.json().authenticated).toBe(false)
		}))

	it('still works for a GET with a JSON Content-Type (the frontend sets it on every call)', () =>
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

	it('/api/me requires a login', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/me' })
			expect(response.statusCode).toBe(401)
			expect(response.json().error).toBe('unauthorized')
			expect(response.headers['x-error-code']).toBe('unauthorized')
		}))

	it('/api/me returns the signed-in user profile', () =>
		withApp(async ({ app, db }) => {
			const { user, sessionToken } = await seedLoggedInUser(db)
			const body = (await app.inject({ method: 'GET', url: '/api/me', cookies: sessionCookies(sessionToken) })).json()
			expect(body).toEqual({
				id: user.id,
				display_name: 'Người chơi Thử Nghiệm',
				email: 'nguoidung@example.com',
				avatar_url: 'https://example.com/a.png',
				providers: ['google'],
				// Nobody is an admin by default: `ADMIN_EMAILS` is empty in the test environment.
				is_admin: false,
			})
		}))

	it('logout clears the cookie and revokes old tokens', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			expect(
				(await app.inject({ method: 'GET', url: '/api/auth/session', cookies: sessionCookies(sessionToken) })).json()
					.authenticated,
			).toBe(true)

			// The frontend sends `Content-Type: application/json` with an empty body for this call.
			const logout = await app.inject({
				method: 'POST',
				url: '/api/auth/logout',
				cookies: sessionCookies(sessionToken),
				headers: { 'content-type': 'application/json' },
			})
			expect(logout.statusCode).toBe(200)
			expect(logout.json()).toEqual({ ok: true })
			// The session cookie is cleared (empty value) on the same path.
			const cleared = findSetCookie(logout, config.cookieName)
			expect(cleared).not.toBeNull()
			expect(cookieValue(logout, config.cookieName)).toBe('')

			// The old token carries the old epoch, so it stops working immediately.
			const stale = await app.inject({ method: 'GET', url: '/api/me', cookies: sessionCookies(sessionToken) })
			expect(stale.statusCode).toBe(401)
			expect(stale.json().message).toBe('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.')
		}))
})

describe('save syncing', () => {
	it('round-trips a read/write', () =>
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

	it('rejects a stale revision and leaves the save untouched', () =>
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
			// The old save is still intact.
			expect((await app.inject({ method: 'GET', url: '/api/me/save', cookies })).json().run).toEqual({ stage: 1 })
		}))

	it('accepts the matching revision and increments it', () =>
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

	it('overwrites without checking when revision is missing', () =>
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

	it('requires a login for both read and write', () =>
		withApp(async ({ app }) => {
			expect((await app.inject({ method: 'GET', url: '/api/me/save' })).statusCode).toBe(401)
			expect((await app.inject({ method: 'PUT', url: '/api/me/save', payload: { run: {} } })).statusCode).toBe(401)
		}))

	it('rejects a save that is too large', () =>
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

	it('rejects a body with the wrong types using 422', () =>
		withApp(async ({ app, db }) => {
			const { sessionToken } = await seedLoggedInUser(db)
			const response = await app.inject({
				method: 'PUT',
				url: '/api/me/save',
				cookies: sessionCookies(sessionToken),
				payload: { run: 'not-an-object' },
			})
			expect(response.statusCode).toBe(422)
			expect(response.json().error).toBe('validation_error')
		}))

	it('an empty body with a JSON content-type is still 422, not Fastify\'s 400', () =>
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

	it('malformed JSON is still 422', () =>
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

	it('does not leak another player\'s save', () =>
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

describe('health and unknown paths', () => {
	it('health reports the configured providers', () =>
		withApp(async ({ app }) => {
			const body = (await app.inject({ method: 'GET', url: '/api/health' })).json()
			expect(body.status).toBe('ok')
			expect(body.providers).toEqual(['google'])
			expect(body.environment).toBe('test')
		}))

	it('an unknown API path returns 404 JSON', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/no-such-thing' })
			expect(response.statusCode).toBe(404)
			expect(response.json()).toEqual({ error: 'not_found', message: 'Không có API này.' })
			expect(response.headers['x-error-code']).toBe('not_found')
		}))
})
