/**
 * Content edited from the admin page: `/api/content` is public, `/api/admin/content` is limited
 * to emails listed in `ADMIN_EMAILS`.
 *
 * Every test runs inside a transaction and rolls back (see `helpers.ts`) — the dev database is
 * left untouched, even when a test fails.
 */

import { describe, expect, it } from 'vitest'
import { buildConfig } from '../src/config'
import { allowedFields, validateContentPayload } from '../src/content'
import type { Db } from '../src/db'
import { seedLoggedInUser, sessionCookies, testEnv, TEST_JWT_SECRET, withApp } from './helpers'

/** Config with admin emails, used by the tests that need access. */
const adminConfig = buildConfig(
	testEnv({ JWT_SECRET: TEST_JWT_SECRET, ADMIN_EMAILS: 'quantri@example.com, nguoidung@example.com' }),
)

/** Seed a logged-in user with the given email (the email decides admin access). */
function seed(db: Db, email: string, subject = 'subject-1') {
	return seedLoggedInUser(db, { email, subject })
}

describe('content payload validation', () => {
	it('accepts a valid row and trims whitespace', () => {
		expect(validateContentPayload('item', { name: '  Wooden Blade  ', cost: 5 })).toEqual({
			name: 'Wooden Blade',
			cost: 5,
		})
	})

	it('accepts per-star fields: exactly 5 entries in 1★ → 5★ order', () => {
		expect(validateContentPayload('item', { damage: [10, 20, 30, 40, 55] })).toEqual({
			damage: [10, 20, 30, 40, 55],
		})
	})

	it('accepts a quality band from 1 to 5 and rejects anything else', () => {
		expect(validateContentPayload('item', { quality: 3 })).toEqual({ quality: 3 })
		expect(() => validateContentPayload('item', { quality: 6 })).toThrow(/between 1 and 5/)
		expect(() => validateContentPayload('item', { quality: 1.5 })).toThrow(/whole number/)
	})

	it('accepts the whole star range in stars, but no star outside it', () => {
		expect(validateContentPayload('item', { stars: [5, 1, 3] })).toEqual({ stars: [1, 3, 5] })
		expect(() => validateContentPayload('item', { stars: [1, 6] })).toThrow(/between 1 and 5/)
	})

	it('rejects fields that are not editable', () => {
		expect(() => validateContentPayload('item', { damage2: [1, 2, 3, 4, 5] })).toThrow(/not editable/)
	})

	it('rejects an unknown stat key inside passive', () => {
		expect(() => validateContentPayload('item', { passive: [{ atk: 5 }, {}, {}, {}, {}] })).toThrow(
			/unknown|least one stat/,
		)
	})

	it('rejects a per-star array with the wrong length', () => {
		expect(() => validateContentPayload('item', { damage: [10, 20] })).toThrow(/exactly 5/)
		expect(() => validateContentPayload('item', { damage: [10, 20, 30, 40] })).toThrow(/exactly 5/)
	})

	it('rejects an invalid footprint', () => {
		expect(() => validateContentPayload('item', { space: { w: 0, h: 3 } })).toThrow(/between 1 and 4/)
	})

	it('keeps the pet bag width at 4 columns', () => {
		const bags = Array.from({ length: 5 }, () => ({ width: 4, rows: 3 }))
		expect(validateContentPayload('pet', { bags })).toEqual({ bags })

		const wider = Array.from({ length: 5 }, () => ({ width: 6, rows: 3 }))
		expect(() => validateContentPayload('pet', { bags: wider })).toThrow(/between 4 and 4/)
	})

	it('rejects an empty payload', () => {
		expect(() => validateContentPayload('pet', {})).toThrow(/nothing to save/)
	})

	it('exposes the editable field list the admin page renders', () => {
		expect(allowedFields('item')).toContain('cost')
		expect(allowedFields('item')).toContain('quality')
		expect(allowedFields('item')).not.toContain('active')
		expect(allowedFields('pet')).toContain('skill')
	})
})

describe('content API', () => {
	it('reads publicly and starts empty', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/content' })
			expect(response.statusCode).toBe(200)
			expect(response.json()).toEqual({ items: {}, pets: {} })
		}))

	it('refuses anonymous edits', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({
				method: 'PUT',
				url: '/api/admin/content/item/wooden-blade',
				payload: { cost: 9 },
			})
			expect(response.statusCode).toBe(401)
		}))

	it('blocks a regular user with 403', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'nguoichoi@example.com')
				const response = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/wooden-blade',
					payload: { cost: 9 },
					cookies: sessionCookies(sessionToken),
				})
				expect(response.statusCode).toBe(403)
				expect(response.json().error).toBe('forbidden')
			},
			{ config: buildConfig(testEnv({ ADMIN_EMAILS: 'quantri@example.com' })) },
		))

	it('lets an admin save and publishes it to the game immediately', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const saved = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/wooden-blade',
					payload: { name: 'Wooden Blade Mk2', cost: 7, quality: 4, damage: [15, 25, 35, 55, 80] },
					cookies: sessionCookies(sessionToken),
				})
				expect(saved.statusCode).toBe(200)
				expect(saved.json().override.updatedBy).toBe('quantri@example.com')

				const published = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(published.items['wooden-blade']).toEqual({
					name: 'Wooden Blade Mk2',
					cost: 7,
					quality: 4,
					damage: [15, 25, 35, 55, 80],
				})

				// The admin page sees the row and who edited it.
				const list = (
					await app.inject({
						method: 'GET',
						url: '/api/admin/content',
						cookies: sessionCookies(sessionToken),
					})
				).json()
				expect(list.overrides).toHaveLength(1)
				expect(list.overrides[0].entityId).toBe('wooden-blade')
			},
			{ config: adminConfig },
		))

	it('deletes an override back to the default', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				await app.inject({
					method: 'PUT',
					url: '/api/admin/content/pet/fire-pup',
					payload: { maxHp: 900 },
					cookies,
				})

				const removed = await app.inject({
					method: 'DELETE',
					url: '/api/admin/content/pet/fire-pup',
					cookies,
				})
				expect(removed.statusCode).toBe(200)
				expect((await app.inject({ method: 'GET', url: '/api/content' })).json()).toEqual({
					items: {},
					pets: {},
				})
			},
			{ config: adminConfig },
		))

	it('stores nothing when the payload is invalid', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const response = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/wooden-blade',
					payload: { notARealField: 1 },
					cookies: sessionCookies(sessionToken),
				})
				expect(response.statusCode).toBe(400)
				expect(response.json().error).toBe('unknown_field')
				expect((await app.inject({ method: 'GET', url: '/api/content' })).json()).toEqual({
					items: {},
					pets: {},
				})
			},
			{ config: adminConfig },
		))

	it('rejects an unknown content kind', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const response = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/stage/1',
					payload: { name: 'x' },
					cookies: sessionCookies(sessionToken),
				})
				expect(response.statusCode).toBe(400)
				expect(response.json().error).toBe('unknown_kind')
			},
			{ config: adminConfig },
		))

	it('reports admin access together with the session', () =>
		withApp(
			async ({ app, db }) => {
				const admin = await seed(db, 'quantri@example.com')
				const member = await seed(db, 'nguoichoi@example.com', 'subject-2')
				const asAdmin = (
					await app.inject({
						method: 'GET',
						url: '/api/me',
						cookies: sessionCookies(admin.sessionToken),
					})
				).json()
				const asMember = (
					await app.inject({
						method: 'GET',
						url: '/api/me',
						cookies: sessionCookies(member.sessionToken),
					})
				).json()
				expect(asAdmin.is_admin).toBe(true)
				expect(asMember.is_admin).toBe(false)
			},
			{ config: adminConfig },
		))
})
