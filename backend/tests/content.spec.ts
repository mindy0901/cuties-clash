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

	it('accepts an art flag and rejects a per-star art list', () => {
		expect(validateContentPayload('item', { art: true })).toEqual({ art: true })
		expect(() => validateContentPayload('item', { art: 'yes' })).toThrow(/true or false/)
		// `stars` declared art per star rank — that mechanism is gone, so it must be refused.
		expect(() => validateContentPayload('item', { stars: [1, 2, 3] })).toThrow(/not editable/)
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
	it('reads publicly and is shaped as { items, pets, art }', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/content' })
			expect(response.statusCode).toBe(200)
			// ⚠️ Not "the table is empty": these tests run against the real dev database, so whatever
			// an admin has already saved (including the pictures they uploaded) is there.
			const body = response.json()
			expect(Object.keys(body).sort()).toEqual(['art', 'items', 'pets'])
			expect(body.items['test-art-item']).toBeUndefined()
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
				// Scoped to this entity: the real dev database may hold other rows.
				const body = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(body.pets['fire-pup']).toBeUndefined()
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
				const body = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(body.items['wooden-blade']).toBeUndefined()
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

/**
 * A structurally valid PNG header for the given size: signature + `IHDR`.
 *
 * The server only reads those bytes to reject non-PNGs and non-square pictures, so this is enough
 * to exercise the whole endpoint without shipping binary fixtures.
 */
function pngOfSize(width: number, height: number): Buffer {
	const header = Buffer.alloc(33)
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0)
	header.writeUInt32BE(13, 8)
	header.write('IHDR', 12, 'ascii')
	header.writeUInt32BE(width, 16)
	header.writeUInt32BE(height, 20)
	header[24] = 8
	header[25] = 6
	return header
}

const PNG_HEADERS = { 'content-type': 'image/png' } as const

/**
 * Item id used by these tests.
 *
 * ⚠️ Not `wooden-blade`: the suite runs against the **real dev database**, where an admin may already
 * have uploaded a picture. A dedicated id keeps every assertion about "the first upload" true.
 */
const ART_ID = 'test-art-item'
const ART_URL = `/api/admin/content/item/${ART_ID}/art`

describe('uploaded art', () => {
	it('refuses anonymous uploads', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({
				method: 'PUT',
				url: ART_URL,
				headers: PNG_HEADERS,
				payload: pngOfSize(64, 64),
			})
			expect(response.statusCode).toBe(401)
		}))

	it('blocks a regular user with 403', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'nguoichoi@example.com')
				const response = await app.inject({
					method: 'PUT',
					url: ART_URL,
					headers: PNG_HEADERS,
					payload: pngOfSize(64, 64),
					cookies: sessionCookies(sessionToken),
				})
				expect(response.statusCode).toBe(403)
			},
			{ config: adminConfig },
		))

	it('rejects anything that is not a PNG of a sane size, but accepts any aspect ratio', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const upload = (payload: Buffer, headers: Record<string, string> = PNG_HEADERS) =>
					app.inject({
						method: 'PUT',
						url: ART_URL,
						headers,
						payload,
						cookies: sessionCookies(sessionToken),
					})

				// A JPEG (or any non-PNG) would be served as an image and show as a broken icon.
				const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46])
				expect((await upload(jpeg)).statusCode).toBe(400)
				expect((await upload(jpeg)).json().error).toBe('invalid_art')

				expect((await upload(pngOfSize(4, 4))).json().error).toBe('invalid_art')
				expect((await upload(pngOfSize(4096, 4096))).json().error).toBe('invalid_art')
				expect((await upload(pngOfSize(1, 300))).json().error).toBe('invalid_art')

				// Too large: a valid header padded past the 2 MB limit.
				const huge = Buffer.concat([pngOfSize(64, 64), Buffer.alloc(3 * 1024 * 1024)])
				expect((await upload(huge)).json().error).toBe('art_too_large')

				// A 1×3 sword is cropped to 171×512 — the aspect ratio follows the item's footprint.
				const tall = await upload(pngOfSize(171, 512))
				expect(tall.statusCode).toBe(201)
				expect(tall.json().art).toMatchObject({ width: 171, height: 512 })
			},
			{ config: adminConfig },
		))

	it('publishes the picture and serves it with cache headers', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const first = await app.inject({
					method: 'PUT',
					url: ART_URL,
					headers: PNG_HEADERS,
					payload: pngOfSize(256, 256),
					cookies: sessionCookies(sessionToken),
				})
				expect(first.statusCode).toBe(201)
				expect(first.json().art).toMatchObject({ kind: 'item', entityId: ART_ID, width: 256, height: 256 })

				const overlay = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				const url: string = overlay.art[`item:${ART_ID}`]
				expect(url).toMatch(new RegExp(`^/api/content/art/item/${ART_ID}\\?v=\\d+$`))

				const image = await app.inject({ method: 'GET', url })
				expect(image.statusCode).toBe(200)
				expect(image.headers['content-type']).toBe('image/png')
				expect(image.headers['cache-control']).toContain('immutable')
				expect(image.rawPayload.equals(pngOfSize(256, 256))).toBe(true)

				// Same URL + matching ETag → 304, so a cached icon is revalidated, never re-sent.
				const revalidated = await app.inject({
					method: 'GET',
					url,
					headers: { 'if-none-match': String(image.headers.etag) },
				})
				expect(revalidated.statusCode).toBe(304)
			},
			{ config: adminConfig },
		))

	it('gives every upload a brand new URL, even after the picture was deleted', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				const urlOf = async () =>
					(await app.inject({ method: 'GET', url: '/api/content' })).json().art[`item:${ART_ID}`] as
						| string
						| undefined
				const upload = (bytes: Buffer) =>
					app.inject({ method: 'PUT', url: ART_URL, headers: PNG_HEADERS, payload: bytes, cookies })

				await upload(pngOfSize(256, 256))
				const first = await urlOf()
				expect(first).toBeTruthy()

				// Replace it: a new URL, so a cached copy can never win.
				await new Promise((resolve) => setTimeout(resolve, 5))
				await upload(pngOfSize(85, 256))
				const second = await urlOf()
				expect(second).not.toBe(first)

				// ⚠️ Regression: delete + upload again used to restart the counter at 1, which restored the
				// **first** URL — the browser then kept showing the deleted picture (an axe instead of a sword).
				await app.inject({ method: 'DELETE', url: ART_URL, cookies })
				expect(await urlOf()).toBeUndefined()
				await new Promise((resolve) => setTimeout(resolve, 5))
				await upload(pngOfSize(85, 256))
				const third = await urlOf()
				expect(third).toBeTruthy()
				expect(third).not.toBe(first)
			},
			{ config: adminConfig },
		))

	it('keeps the picture when other fields are edited', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				await app.inject({
					method: 'PUT',
					url: ART_URL,
					headers: PNG_HEADERS,
					payload: pngOfSize(256, 256),
					cookies: sessionCookies(sessionToken),
				})
				// The payload replaces the whole field set on save — the art lives in its own table,
				// so it must survive a normal edit.
				await app.inject({
					method: 'PUT',
					url: `/api/admin/content/item/${ART_ID}`,
					payload: { cost: 9 },
					cookies: sessionCookies(sessionToken),
				})
				const overlay = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(overlay.items[ART_ID]).toEqual({ cost: 9 })
				expect(overlay.art[`item:${ART_ID}`]).toContain(ART_ID)
			},
			{ config: adminConfig },
		))

	it('lists which entities have a picture, without shipping the bytes', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				await app.inject({
					method: 'PUT',
					url: ART_URL,
					headers: PNG_HEADERS,
					payload: pngOfSize(256, 256),
					cookies: sessionCookies(sessionToken),
				})
				const listed = (
					await app.inject({
						method: 'GET',
						url: '/api/admin/content',
						cookies: sessionCookies(sessionToken),
					})
				).json()
				const mine = listed.art.find((entry: { entityId: string }) => entry.entityId === ART_ID)
				expect(mine).toMatchObject({ kind: 'item', entityId: ART_ID, width: 256, height: 256 })
				expect(JSON.stringify(listed)).not.toContain('bytes')
			},
			{ config: adminConfig },
		))

	it('deleting the picture puts the entity back on its own art', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				await app.inject({
					method: 'PUT',
					url: ART_URL,
					headers: PNG_HEADERS,
					payload: pngOfSize(256, 256),
					cookies,
				})

				// The bytes really are in the table — otherwise the checks below would prove nothing.
				const stored = await db.contentArt.findUnique({ where: { id: `item:${ART_ID}` } })
				expect(stored?.bytes.length).toBeGreaterThan(0)

				const removed = await app.inject({ method: 'DELETE', url: ART_URL, cookies })
				expect(removed.statusCode).toBe(200)

				// ⚠️ The **row itself** must be gone, not just hidden from the API: a leftover row keeps the
				// picture in the database (and in every backup) long after the admin removed it.
				expect(await db.contentArt.findUnique({ where: { id: `item:${ART_ID}` } })).toBeNull()

				const overlay = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(overlay.art[`item:${ART_ID}`]).toBeUndefined()
				const gone = await app.inject({ method: 'GET', url: `/api/content/art/item/${ART_ID}` })
				expect(gone.statusCode).toBe(404)

				// Deleting twice is not an error either.
				const again = await app.inject({ method: 'DELETE', url: ART_URL, cookies })
				expect(again.statusCode).toBe(200)
				const remaining = await db.contentArt.count({ where: { id: `item:${ART_ID}` } })
				expect(remaining).toBe(0)
			},
			{ config: adminConfig },
		))
})
