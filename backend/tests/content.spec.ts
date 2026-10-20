/**
 * Content edited from the admin page: `/api/content` is public, `/api/admin/content` is limited
 * to emails listed in `ADMIN_EMAILS`.
 *
 * Every test runs inside a transaction and rolls back (see `helpers.ts`) — the dev database is
 * left untouched, even when a test fails.
 */

import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
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

	it('accepts per-star data: exactly 5 entries in 1★ → 5★ order', () => {
		const kits = [
			{
				id: 'basic-attack',
				params: { damage: [1, 2, 3, 4, 5], speed: [1, 1, 1, 1, 1] },
				onHit: [
					{
						id: 'lifesteal-on-hit',
						params: { chance: [1, 1, 1, 1, 1], percent: [5, 10, 15, 20, 25] },
					},
				],
			},
		]
		expect(validateContentPayload('item', { kits })).toEqual({ kits })
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

	it('accepts the three weapon classes and folds the old `focus` into `artifact`', () => {
		for (const cls of ['melee', 'ranged', 'artifact']) {
			expect(validateContentPayload('item', { cls })).toEqual({ cls })
		}
		// A row saved before the rename still has `focus`; it is stored as the current class so the
		// item keeps counting as a weapon.
		expect(validateContentPayload('item', { cls: 'focus' })).toEqual({ cls: 'artifact' })
		expect(() => validateContentPayload('item', { cls: 'staff' })).toThrow(/must be one of/)
	})

	it('accepts `jade` / `accessory` and folds the old `jewelry` into `jade`', () => {
		for (const cls of ['jade', 'accessory', 'armor', 'potion']) {
			expect(validateContentPayload('item', { cls })).toEqual({ cls })
		}
		// `jewelry` was renamed to `jade` when `accessory` was added; an old row keeps its class.
		expect(validateContentPayload('item', { cls: 'jewelry' })).toEqual({ cls: 'jade' })
	})

	it('rejects fields that are not editable', () => {
		expect(() => validateContentPayload('item', { damage2: [1, 2, 3, 4, 5] })).toThrow(/not editable/)
	})

	it('rejects an unknown stat key inside a stats kit', () => {
		const stats = [{ nope: 5 }, { atk: 1 }, { atk: 1 }, { atk: 1 }, { atk: 1 }]
		expect(() =>
			validateContentPayload('item', { kits: [{ id: 'stats', params: {}, stats }] }),
		).toThrow(/is not a known stat/)
		// An empty table says nothing, so it is refused as well.
		const empty = [{}, { atk: 1 }, { atk: 1 }, { atk: 1 }, { atk: 1 }]
		expect(() =>
			validateContentPayload('item', { kits: [{ id: 'stats', params: {}, stats: empty }] }),
		).toThrow(/at least one stat/)
	})

	it('accepts a critical-damage table but refuses to set Sword Energy through stats', () => {
		const crit = [{ critDamage: 20 }, { critDamage: 20 }, { critDamage: 20 }, { critDamage: 20 }, { critDamage: 20 }]
		expect(validateContentPayload('item', { kits: [{ id: 'stats', params: {}, stats: crit }] })).toEqual({
			kits: [{ id: 'stats', params: {}, stats: crit }],
		})
		// SE has its own kit: a stats / aura table may not touch it.
		const se = [{ seRegen: 5 }, { seRegen: 5 }, { seRegen: 5 }, { seRegen: 5 }, { seRegen: 5 }]
		expect(() =>
			validateContentPayload('item', { kits: [{ id: 'stats', params: {}, stats: se }] }),
		).toThrow(/sword-energy/)
	})

	it('accepts the damage-boost and sword-energy kits', () => {
		const fives = (value: number) => [value, value, value, value, value]
		const kits = [
			{
				id: 'damage-boost',
				params: {
					value: fives(20),
					target: fives(1),
					directions: fives(15),
					trigger: fives(1),
					duration: fives(3000),
				},
			},
			{ id: 'sword-energy', params: { regen: fives(10) } },
		]
		expect(validateContentPayload('item', { kits })).toEqual({ kits })
	})

	it('no longer accepts a per-star attack on an item — attack belongs to the cutie', () => {
		expect(() => validateContentPayload('item', { attack: [1, 2, 3, 4, 5] })).toThrow(/not editable/)
		// The cutie keeps its own attack; the rhythm is each kit's own Cooldown Time.
		expect(validateContentPayload('cutie', { attack: 20 })).toEqual({ attack: 20 })
		// `attackSpeed` was removed from the model, so a stale client cannot write it back.
		expect(() => validateContentPayload('cutie', { attackSpeed: 0.75 })).toThrow(/not editable/)
	})

	it('rejects a kit parameter that is not exactly 5 entries long', () => {
		expect(() =>
			validateContentPayload('item', { kits: [{ id: 'basic-attack', params: { damage: [10, 20] } }] }),
		).toThrow(/exactly 5/)
		expect(() =>
			validateContentPayload('item', { kits: [{ id: 'basic-attack', params: { damage: [10, 20, 30, 40] } }] }),
		).toThrow(/exactly 5/)
	})

	it('rejects an invalid footprint', () => {
		expect(() => validateContentPayload('item', { space: { w: 0, h: 3 } })).toThrow(/between 1 and 4/)
	})

	it('accepts a cutie base attack and its kits, refusing item-only kits', () => {
		const kits = [
			{
				id: 'basic-attack',
				params: { speed: [0.625, 0.625, 0.625, 0.625, 0.625], multiplier: [1, 1, 1, 1, 1] },
				onHit: [
					{
						id: 'burn-on-hit',
						params: { chance: [1, 1, 1, 1, 1], duration: [3000, 3000, 3000, 3000, 3000], value: [1, 1, 1, 1, 1] },
					},
				],
			},
		]
		expect(validateContentPayload('cutie', { attack: 20, kits })).toEqual({ attack: 20, kits })
		// `stats` / `aura` / `parry` describe an item: a cutie only swings.
		for (const id of ['stats', 'aura', 'parry']) {
			expect(() => validateContentPayload('cutie', { kits: [{ id, params: {} }] })).toThrow(
				/attack kit/,
			)
		}
		// The old per-level fields are gone — the bag grows by itself now.
		expect(() => validateContentPayload('cutie', { bags: [] })).toThrow(/not editable/)
		expect(() => validateContentPayload('cutie', { skill: { damage: 5 } })).toThrow(/not editable/)
	})

	it('accepts an item kit and rejects an unknown one', () => {
		const kits = [
			{
				id: 'basic-attack',
				params: { damage: [1, 2, 3, 4, 5], speed: [1, 1, 1, 1, 1] },
				onHit: [
					{
						id: 'burn-on-hit',
						params: { chance: [1, 1, 1, 1, 1], duration: [3000, 3000, 3000, 3000, 3000], value: [1, 1, 1, 1, 1] },
					},
				],
			},
		]
		expect(validateContentPayload('item', { kits })).toEqual({ kits })
		expect(() =>
			validateContentPayload('item', { kits: [{ id: 'not-a-kit', params: {} }] }),
		).toThrow(/attack or an option kit/)
		// An on-hit effect at the item's top level is refused: it belongs inside the attack kit.
		expect(() =>
			validateContentPayload('item', { kits: [{ id: 'burn-on-hit', params: {} }] }),
		).toThrow(/attack or an option kit/)
	})

	it('accepts stats and aura option kits', () => {
		const stats = [{ atk: 5 }, { atk: 6 }, { atk: 7 }, { atk: 8 }, { atk: 9 }]
		const aura = Array.from({ length: 5 }, () => ({ target: 'adjacent', mods: { atkPct: 10 } }))
		const kits = [
			{ id: 'basic-attack', params: { damage: [1, 2, 3, 4, 5], speed: [1, 1, 1, 1, 1] } },
			{ id: 'stats', params: {}, stats },
			{ id: 'aura', params: {}, aura },
		]
		expect(validateContentPayload('item', { kits })).toEqual({ kits })
		// An aura without its `{ target, mods }` shape is refused.
		expect(() =>
			validateContentPayload('item', { kits: [{ id: 'aura', params: {}, aura: [{}] }] }),
		).toThrow(/exactly 5|target/)
	})

	it('accepts two stat kits — a stat kit carries one stat, so a second stat is a second kit', () => {
		const atk = Array.from({ length: 5 }, () => ({ atk: 30 }))
		const maxHp = Array.from({ length: 5 }, () => ({ maxHp: 120 }))
		const kits = [
			{ id: 'stats', params: {}, stats: atk },
			{ id: 'stats', params: {}, stats: maxHp },
		]
		expect(validateContentPayload('item', { kits })).toEqual({ kits })
		// Any other kit is still attached at most once — a second basic attack would be a second swing.
		expect(() =>
			validateContentPayload('item', {
				kits: [
					{ id: 'basic-attack', params: { speed: [1, 1, 1, 1, 1], multiplier: [1, 1, 1, 1, 1] } },
					{ id: 'basic-attack', params: { speed: [1, 1, 1, 1, 1], multiplier: [1, 1, 1, 1, 1] } },
				],
			}),
		).toThrow(/duplicate kit/)
	})

	it('accepts a charged attack inside its basic attack and refuses it at the top level', () => {
		const charge = {
			id: 'charge-attack',
			params: { seNeed: [100, 100, 100, 100, 100], multiplier: [2.2, 2.2, 2.2, 2.2, 2.2] },
		}
		const kits = [{ id: 'basic-attack', params: { speed: [1, 1, 1, 1, 1], multiplier: [1, 1, 1, 1, 1] }, charge }]
		expect(validateContentPayload('item', { kits })).toEqual({ kits })
		// The charged variant has ❌ no rhythm of its own, so it is not a kit: it belongs inside.
		expect(() => validateContentPayload('item', { kits: [charge] })).toThrow(/attack or an option kit/)
		expect(() =>
			validateContentPayload('item', { kits: [{ id: 'basic-attack', params: {}, charge: { id: 'parry', params: {} } }] }),
		).toThrow(/charge-attack sub-kit/)
	})

	it('rejects an empty payload', () => {
		expect(() => validateContentPayload('cutie', {})).toThrow(/nothing to save/)
	})

	it('exposes the editable field list the admin page renders', () => {
		expect(allowedFields('item')).toContain('cost')
		expect(allowedFields('item')).toContain('quality')
		expect(allowedFields('item')).not.toContain('active')
		expect(allowedFields('item')).not.toContain('interval')
		expect(allowedFields('item')).not.toContain('damage')
		expect(allowedFields('item')).not.toContain('passive')
		expect(allowedFields('item')).not.toContain('aura')
		expect(allowedFields('item')).toContain('kits')
		expect(allowedFields('cutie')).toContain('attack')
		expect(allowedFields('cutie')).toContain('kits')
		// The cutie's bag grows by itself and its attack is a kit, so neither is editable any more.
		expect(allowedFields('cutie')).not.toContain('bags')
		expect(allowedFields('cutie')).not.toContain('skill')
	})
})

describe('content API', () => {
	it('reads publicly and is shaped as { items, cuties, kits, art }', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({ method: 'GET', url: '/api/content' })
			expect(response.statusCode).toBe(200)
			// ⚠️ Not "the table is empty": these tests run against the real dev database, so whatever
			// an admin has already saved (including the pictures they uploaded) is there.
			const body = response.json()
			expect(Object.keys(body).sort()).toEqual(['art', 'cuties', 'items', 'kits'])
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
				const kits = [
					{
						id: 'basic-attack',
						params: { multiplier: [1, 1, 1, 1, 1], cooldown: [1.6, 1.5, 1.4, 1.3, 1.2] },
					},
				]
				const saved = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/wooden-blade',
					payload: { name: 'Wooden Blade Mk2', cost: 7, quality: 4, kits },
					cookies: sessionCookies(sessionToken),
				})
				expect(saved.statusCode).toBe(200)
				expect(saved.json().override.updatedBy).toBe('quantri@example.com')

				// An item **is** its row now, so the published payload is the whole row: the columns the
				// payload did not mention keep their stored value instead of disappearing (the dev database
				// already holds a row for `wooden-blade`, and this transaction sees it).
				const published = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(published.items['wooden-blade']).toMatchObject({
					name: 'Wooden Blade Mk2',
					quality: 4,
					cost: 7,
					kits: [
						{ id: 'basic-attack', params: { multiplier: [1, 1, 1, 1, 1], cooldown: [1.6, 1.5, 1.4, 1.3, 1.2] } },
					],
				})
				expect(published.items['wooden-blade'].space).toEqual({ w: 1, h: 3 })

				// The admin page sees the row and who edited it. Scoped to this entity: the real dev
				// database may already hold overrides for other items, and the transaction sees them.
				const list = (
					await app.inject({
						method: 'GET',
						url: '/api/admin/content',
						cookies: sessionCookies(sessionToken),
					})
				).json()
				const rows = list.overrides.filter(
					(entry: { kind: string; entityId: string }) =>
						entry.kind === 'item' && entry.entityId === 'wooden-blade',
				)
				expect(rows).toHaveLength(1)
				expect(rows[0].updatedBy).toBe('quantri@example.com')
			},
			{ config: adminConfig },
		))

	it('creates an item that is not in the code and publishes it', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				// Exactly what the admin page sends for a brand-new item.
				const created = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/test-created-item',
					payload: { name: 'Kiếm Thử', cls: 'melee', tier: 1, quality: 1, cost: 1, space: { w: 1, h: 1 } },
					cookies,
				})
				expect(created.statusCode).toBe(200)

				const published = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(published.items['test-created-item']).toEqual({
					name: 'Kiếm Thử',
					cls: 'melee',
					tier: 1,
					quality: 1,
					cost: 1,
					space: { w: 1, h: 1 },
					kits: [],
				})

				// A created item is only its row, so deleting the row removes the item again.
				await app.inject({ method: 'DELETE', url: '/api/admin/content/item/test-created-item', cookies })
				const after = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(after.items['test-created-item']).toBeUndefined()
			},
			{ config: adminConfig },
		))

	it('hides an item with `removed` while keeping its other fields', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/wooden-blade',
					payload: { name: 'Wooden Blade Mk3', cost: 6 },
					cookies,
				})
				// The page re-sends the stored row with the flag on top, so the item can come back intact.
				const hidden = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/wooden-blade',
					payload: { name: 'Wooden Blade Mk3', cost: 6, removed: true },
					cookies,
				})
				expect(hidden.statusCode).toBe(200)

				const published = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(published.items['wooden-blade']).toMatchObject({
					name: 'Wooden Blade Mk3',
					cost: 6,
					removed: true,
				})
				// The rest of the row survived the round trip — that is what "restore it intact" needs,
				// and a real column makes it checkable instead of hidden inside a JSON string.
				expect(published.items['wooden-blade'].cls).toBe('melee')
				expect(published.items['wooden-blade'].space).toEqual({ w: 1, h: 3 })
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
					url: '/api/admin/content/cutie/fire-pup',
					payload: { maxHp: 900 },
					cookies,
				})

				const removed = await app.inject({
					method: 'DELETE',
					url: '/api/admin/content/cutie/fire-pup',
					cookies,
				})
				expect(removed.statusCode).toBe(200)
				// Scoped to this entity: the real dev database may hold other rows.
				const body = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(body.cuties['fire-pup']).toBeUndefined()
			},
			{ config: adminConfig },
		))

	it('stores nothing when the payload is invalid', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				// The dev database may already hold a valid wooden-blade override; the invariant is that
				// the rejected payload leaves **that** row exactly as it was.
				const before = (await app.inject({ method: 'GET', url: '/api/content' })).json().items['wooden-blade']
				const response = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/wooden-blade',
					payload: { notARealField: 1 },
					cookies: sessionCookies(sessionToken),
				})
				expect(response.statusCode).toBe(400)
				expect(response.json().error).toBe('unknown_field')
				const after = (await app.inject({ method: 'GET', url: '/api/content' })).json().items['wooden-blade']
				expect(after).toEqual(before)
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
 * Deleting a kit from the whole game (`/admin` → Kits).
 *
 * A kit is a **mechanic in code**, so "delete" has two halves and both are checked here: the marker
 * that stops the code copy from coming back, and the cleanup of the items / Cuties already carrying it
 * (including an `onHit` effect or the `charge` variant nested inside an attack kit).
 */
const KIT_ITEM = 'test-kit-item'
const KIT_CUTIE = 'test-kit-cutie'
const FIVE = (value: number) => [value, value, value, value, value]

/** One item carrying a top-level `stats` kit, a nested on-hit effect and the charged variant. */
const KIT_ITEM_PAYLOAD = {
	name: 'Kit Test Blade',
	cls: 'melee',
	tier: 1,
	quality: 1,
	cost: 1,
	space: { w: 1, h: 3 },
	kits: [
		{
			id: 'basic-attack',
			params: { multiplier: FIVE(1), cooldown: FIVE(1) },
			onHit: [
				{
					id: 'burn-on-hit',
					params: { chance: FIVE(30), duration: FIVE(3000), value: FIVE(20) },
				},
			],
			charge: { id: 'charge-attack', params: { seNeed: FIVE(100), multiplier: FIVE(2) } },
		},
		{ id: 'stats', params: {}, stats: [{ atk: 2 }, { atk: 2 }, { atk: 2 }, { atk: 2 }, { atk: 2 }] },
	],
}

/** A Cutie carrying the same attack kit with the on-hit effect inside it. */
const KIT_CUTIE_PAYLOAD = {
	kits: [
		{
			id: 'basic-attack',
			params: { multiplier: FIVE(1), cooldown: FIVE(1) },
			onHit: [
				{ id: 'burn-on-hit', params: { chance: FIVE(30), duration: FIVE(3000), value: FIVE(20) } },
			],
		},
	],
}

describe('deleting a kit from the whole game', () => {
	/** Publish both entities, so a removal has something to detach from. */
	async function seedEntities(app: FastifyInstance, cookies: Record<string, string>) {
		await app.inject({
			method: 'PUT',
			url: `/api/admin/content/item/${KIT_ITEM}`,
			payload: KIT_ITEM_PAYLOAD,
			cookies,
		})
		await app.inject({
			method: 'PUT',
			url: `/api/admin/content/cutie/${KIT_CUTIE}`,
			payload: KIT_CUTIE_PAYLOAD,
			cookies,
		})
	}

	it('removes the kit from every item and Cutie and publishes the marker', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				await seedEntities(app, cookies)

				const before = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(before.items[KIT_ITEM].kits[0].onHit).toHaveLength(1)

				const removed = await app.inject({
					method: 'POST',
					url: '/api/admin/content/kit/burn-on-hit/remove',
					payload: { removed: true },
					cookies,
				})
				expect(removed.statusCode).toBe(200)

				const after = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				// The catalogue row is what tells the client to drop the kit out of its own catalogue.
				expect(after.kits.entries['burn-on-hit']).toEqual({ mechanic: 'burn-on-hit', removed: true })
				// A nested effect is a kit too: the swing stays, the effect does not.
				expect(after.items[KIT_ITEM].kits[0].id).toBe('basic-attack')
				expect(after.items[KIT_ITEM].kits[0].onHit ?? []).toEqual([])
				expect(after.cuties[KIT_CUTIE].kits[0].onHit ?? []).toEqual([])
				// Everything else on the item survived — only that one kit went.
				expect(after.items[KIT_ITEM].kits.map((kit: { id: string }) => kit.id)).toEqual([
					'basic-attack',
					'stats',
				])
			},
			{ config: adminConfig },
		))

	it('deletes a top-level kit row and the charged variant inside an attack kit', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				await seedEntities(app, cookies)

				await app.inject({
					method: 'POST',
					url: '/api/admin/content/kit/stats/remove',
					payload: { removed: true },
					cookies,
				})
				await app.inject({
					method: 'POST',
					url: '/api/admin/content/kit/charge-attack/remove',
					payload: { removed: true },
					cookies,
				})

				const after = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(after.items[KIT_ITEM].kits.map((kit: { id: string }) => kit.id)).toEqual([
					'basic-attack',
				])
				// The charged hit is a sub-kit of the swing it replaced; with it gone the swing is plain.
				expect(after.items[KIT_ITEM].kits[0].charge).toBeUndefined()
			},
			{ config: adminConfig },
		))

	it('cannot be brought back by saving a kit list that still holds it', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				await seedEntities(app, cookies)
				await app.inject({
					method: 'POST',
					url: '/api/admin/content/kit/burn-on-hit/remove',
					payload: { removed: true },
					cookies,
				})

				// The editor's form still holds the old list. It is **refused** (the kit is not in the
				// catalogue any more) instead of being written back — a silent drop would look like a save
				// that worked while the effect stayed gone for no visible reason.
				const saved = await app.inject({
					method: 'PUT',
					url: `/api/admin/content/item/${KIT_ITEM}`,
					payload: KIT_ITEM_PAYLOAD,
					cookies,
				})
				expect(saved.statusCode).toBe(400)

				const after = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(after.items[KIT_ITEM].kits[0].onHit ?? []).toEqual([])
			},
			{ config: adminConfig },
		))

	it('comes back when the marker is deleted', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				await app.inject({
					method: 'PUT',
					url: '/api/admin/content/kit/burn-on-hit',
					payload: { removed: true },
					cookies,
				})

				const restored = await app.inject({
					method: 'DELETE',
					url: '/api/admin/content/kit/burn-on-hit',
					cookies,
				})
				expect(restored.statusCode).toBe(200)

				const after = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(after.kits['burn-on-hit']).toBeUndefined()
			},
			{ config: adminConfig },
		))

	it('refuses any body other than `removed: true` on the remove endpoint', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				// A client that meant "restore" must not delete the kit by accident.
				const response = await app.inject({
					method: 'POST',
					url: '/api/admin/content/kit/burn-on-hit/remove',
					payload: { removed: false },
					cookies,
				})
				expect(response.statusCode).toBe(400)
				const after = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(after.kits.entries['burn-on-hit']).toBeUndefined()
			},
			{ config: adminConfig },
		))

	it('refuses anonymous kit deletions', () =>
		withApp(async ({ app }) => {
			const response = await app.inject({
				method: 'PUT',
				url: '/api/admin/content/kit/burn-on-hit',
				payload: { removed: true },
			})
			expect(response.statusCode).toBe(401)
		}))
})

/**
 * The kit catalogue is **data**: an admin creates kits on top of an engine mechanic, renames them,
 * moves them to another catalogue and manages the catalogues themselves. The mechanics stay in code
 * (the engine and offline play need them), which is why every entry carries its `mechanic`.
 */
describe('kit catalogue', () => {
	it('creates a kit on top of a mechanic and publishes it under its catalogue', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)

				const created = await app.inject({
					method: 'POST',
					url: '/api/admin/content/kit',
					payload: { mechanic: 'burn-on-hit', label: 'Burn II', categoryId: 'control' },
					cookies,
				})
				expect(created.statusCode).toBe(201)
				const entryId = created.json().entry.id as string
				// The code id belongs to the code kit, so a created one is suffixed.
				expect(entryId).toBe('burn-on-hit-2')

				const published = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(published.kits.entries[entryId]).toMatchObject({
					mechanic: 'burn-on-hit',
					label: 'Burn II',
					categoryId: 'control',
				})
				expect(published.kits.categories.map((row: { id: string }) => row.id)).toContain('control')

				// And it is attachable exactly where its mechanic is.
				const saved = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/test-kit-created',
					payload: {
						name: 'Burn Blade',
						cls: 'melee',
						tier: 1,
						quality: 1,
						cost: 1,
						space: { w: 1, h: 3 },
						kits: [
							{
								id: 'basic-attack',
								params: { multiplier: FIVE(1), cooldown: FIVE(1) },
								onHit: [{ id: entryId, params: { chance: FIVE(10) } }],
							},
						],
					},
					cookies,
				})
				expect(saved.statusCode).toBe(200)
			},
			{ config: adminConfig },
		))

	it('moves a kit to another catalogue', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				const moved = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/kit/burn-on-hit',
					payload: { categoryId: 'support', label: 'Fire damage' },
					cookies,
				})
				expect(moved.statusCode).toBe(200)
				expect(moved.json().entry).toMatchObject({ categoryId: 'support', label: 'Fire damage' })

				const published = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(published.kits.entries['burn-on-hit']).toMatchObject({
					categoryId: 'support',
					label: 'Fire damage',
					// The mechanic is not repeated for a code kit: it *is* the mechanic.
					mechanic: 'burn-on-hit',
				})
			},
			{ config: adminConfig },
		))

	it('refuses to change the mechanic of an existing kit', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				const response = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/kit/burn-on-hit',
					payload: { mechanic: 'poison-on-hit' },
					cookies,
				})
				expect(response.statusCode).toBe(400)
				expect(response.json().error).toBe('mechanic_immutable')
			},
			{ config: adminConfig },
		))

	it('creates a catalogue, and refuses to delete one that still holds kits', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				const created = await app.inject({
					method: 'POST',
					url: '/api/admin/content/kit-category',
					payload: { label: 'Khống chế nặng' },
					cookies,
				})
				expect(created.statusCode).toBe(201)
				const id = created.json().category.id as string
				expect(id).toMatch(/^khong-che-nang$/)

				const published = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(published.kits.categories.map((row: { id: string }) => row.id)).toContain(id)

				// Empty → removable.
				const empty = await app.inject({
					method: 'DELETE',
					url: `/api/admin/content/kit-category/${id}`,
					cookies,
				})
				expect(empty.statusCode).toBe(200)

				// In use → refused, with a message that says what to do.
				const second = await app.inject({
					method: 'POST',
					url: '/api/admin/content/kit-category',
					payload: { label: 'Bleed' },
					cookies,
				})
				const secondId = second.json().category.id as string
				await app.inject({
					method: 'POST',
					url: '/api/admin/content/kit',
					payload: { mechanic: 'burn-on-hit', label: 'Bleed hit', categoryId: secondId },
					cookies,
				})
				const used = await app.inject({
					method: 'DELETE',
					url: `/api/admin/content/kit-category/${secondId}`,
					cookies,
				})
				expect(used.statusCode).toBe(400)
				expect(used.json().message).toContain('move them')
			},
			{ config: adminConfig },
		))

	it('renames a catalogue', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				const renamed = await app.inject({
					method: 'PUT',
					url: '/api/admin/content/kit-category/control',
					payload: { label: 'Debuffs' },
					cookies,
				})
				expect(renamed.statusCode).toBe(200)
				const published = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				const control = published.kits.categories.find((row: { id: string }) => row.id === 'control')
				expect(control.label).toBe('Debuffs')
			},
			{ config: adminConfig },
		))
})

/**
 * A structurally valid PNG header for the given size: signature + `IHDR`.
 *
 * The server only reads those bytes to reject non-PNGs and non-square pictures, so this is enough
 * to exercise the whole endpoint without shipping binary fixtures.
 */function pngOfSize(width: number, height: number): Buffer {
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

				// Too large: a valid header padded past the 8 MB limit.
				const huge = Buffer.concat([pngOfSize(64, 64), Buffer.alloc(9 * 1024 * 1024)])
				expect((await upload(huge)).json().error).toBe('art_too_large')

				// A 1×3 sword is cropped to 640×1920 (Full HD portrait) — the aspect ratio follows the
				// item's footprint, and the long side may reach 1920 px.
				const tall = await upload(pngOfSize(640, 1920))
				expect(tall.statusCode).toBe(201)
				expect(tall.json().art).toMatchObject({ width: 640, height: 1920 })
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

	it('stores an item and its kits in typed tables, and cascades the kits on delete', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				await app.inject({
					method: 'PUT',
					url: '/api/admin/content/item/schema-probe',
					payload: {
						name: 'Schema Probe',
						cls: 'jade',
						tier: 2,
						quality: 3,
						cost: 4,
						space: { w: 1, h: 2 },
						kits: [
							{
								id: 'stats',
								params: {},
								stats: [{ atk: 1 }, { atk: 2 }, { atk: 3 }, { atk: 4 }, { atk: 5 }],
							},
						],
					},
					cookies,
				})

				// 🔴 The point of the schema: the values are **columns**, so SQL can filter them — the old
				// `payload TEXT` could not answer "which items are tier 2".
				const row = await db.item.findUnique({
					where: { id: 'schema-probe' },
					include: { kits: { orderBy: { position: 'asc' } } },
				})
				expect(row?.tier).toBe(2)
				expect(row?.quality).toBe(3)
				expect(row?.spaceW).toBe(1)
				expect(row?.spaceH).toBe(2)
				expect(row?.removed).toBe(false)
				expect(row?.kits).toHaveLength(1)
				expect(row?.kits[0].kitId).toBe('stats')
				expect(row?.kits[0].stats).toHaveLength(5)

				// The FK is `ON DELETE CASCADE`: deleting the item cannot leave orphan kit rows behind.
				await app.inject({ method: 'DELETE', url: '/api/admin/content/item/schema-probe', cookies })
				expect(await db.itemKit.count({ where: { itemId: 'schema-probe' } })).toBe(0)
			},
			{ config: adminConfig },
		))

	it('remembers a Cutie whose every kit was removed instead of growing the code kit back', () =>
		withApp(
			async ({ app, db }) => {
				const { sessionToken } = await seed(db, 'quantri@example.com')
				const cookies = sessionCookies(sessionToken)
				// An empty kit list is a **legal choice** ("this Cutie never swings"), so a `NULL` column
				// cannot express it — that is what `kits_synced` is for.
				await app.inject({
					method: 'PUT',
					url: '/api/admin/content/cutie/white-rabbit',
					payload: { kits: [] },
					cookies,
				})
				const row = await db.cutie.findUnique({ where: { id: 'white-rabbit' } })
				expect(row?.kitsSynced).toBe(true)
				expect(await db.cutieKit.count({ where: { cutieId: 'white-rabbit' } })).toBe(0)

				const published = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(published.cuties['white-rabbit'].kits).toEqual([])

				// A column the payload never mentioned stays untouched (`null` = keep the code value).
				expect(row?.maxHp).toBeNull()
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
				// The art lives in its own table, keyed by `item:<id>`, so it must survive a normal edit.
				await app.inject({
					method: 'PUT',
					url: `/api/admin/content/item/${ART_ID}`,
					payload: { cost: 9 },
					cookies: sessionCookies(sessionToken),
				})
				const overlay = (await app.inject({ method: 'GET', url: '/api/content' })).json()
				expect(overlay.items[ART_ID].cost).toBe(9)
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
