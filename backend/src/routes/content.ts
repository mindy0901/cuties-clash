/** Game content (items, pets) edited from the admin page. */

import type { FastifyPluginAsync } from 'fastify'
import type { Config } from '../config'
import {
	assertEntityId,
	deleteArt,
	deleteContentOverride,
	type ContentKind,
	isContentKind,
	listArt,
	listContentOverrides,
	readArt,
	readContent,
	saveArt,
	saveContentOverride,
	validateContentPayload,
} from '../content'
import type { Db } from '../db'
import { requireAdmin } from '../deps'
import { badRequest, notFound } from '../errors'

export interface ContentRouteOptions {
	config: Config
	db: Db
}

interface ContentParams {
	kind: string
	id: string
}

/**
 * ⚠️ `id` is deliberately not checked against the catalogue: the catalogue lives in the
 * **frontend** (`game/items.ts`, `game/pets.ts`) and the server must not know game rules. An
 * unknown id just sits in the database and is ignored by clients — harmless, and better than
 * having the server keep a copy of the item list that slowly drifts out of date.
 */
export const contentRoutes: FastifyPluginAsync<ContentRouteOptions> = async (app, options) => {
	const { config, db } = options

	// The admin page uploads the finished PNG as a **raw body**, so Fastify must hand it over as a
	// Buffer instead of trying to parse JSON. (A browser cannot POST multipart without an extra
	// plugin, and base64 inside JSON would inflate the payload by a third.)
	app.addContentTypeParser('image/png', { parseAs: 'buffer' }, (_request, body, done) => {
		done(null, body)
	})

	/** Public: the game loads it on boot, including for anonymous players. */
	app.get('/api/content', async () => readContent(db))

	/**
	 * Public: one uploaded picture.
	 *
	 * `?v=<version>` is part of the URL, so the bytes never change under a given URL — hence
	 * `immutable` caching. A new upload gets a new `v` and shows up immediately.
	 */
	app.get<{ Params: ContentParams }>('/api/content/art/:kind/:id', async (request, reply) => {
		const kind = assertKind(request.params.kind)
		const entityId = assertEntityId(request.params.id)
		const art = await readArt(db, kind, entityId)
		if (!art) throw notFound('Chưa có ảnh nào được tải lên cho mục này.')

		const etag = `"v${art.version}"`
		if (request.headers['if-none-match'] === etag) return reply.code(304).send()
		return reply
			.header('Content-Type', art.mime)
			.header('Cache-Control', 'public, max-age=31536000, immutable')
			.header('ETag', etag)
			.send(art.bytes)
	})

	/** Override list (with author) and which entities have an uploaded picture — admin page only. */
	app.get('/api/admin/content', async (request) => {
		await requireAdmin(config, db, request)
		return { overrides: await listContentOverrides(db), art: await listArt(db) }
	})

	app.put<{ Params: ContentParams; Body: unknown }>(
		'/api/admin/content/:kind/:id',
		async (request) => {
			const user = await requireAdmin(config, db, request)
			const kind = assertKind(request.params.kind)
			const entityId = assertEntityId(request.params.id)
			const payload = validateContentPayload(kind, request.body)
			return { override: await saveContentOverride(db, kind, entityId, payload, user.email) }
		},
	)

	/** Deleting an override puts the entity back on the code default. */
	app.delete<{ Params: ContentParams }>('/api/admin/content/:kind/:id', async (request) => {
		await requireAdmin(config, db, request)
		const kind = assertKind(request.params.kind)
		const entityId = assertEntityId(request.params.id)
		await deleteContentOverride(db, kind, entityId)
		return { ok: true }
	})

	/**
	 * Upload the picture of one entity: `Content-Type: image/png`, body = the PNG bytes.
	 *
	 * ⚠️ Cropping and resizing happen **in the browser** (the admin page) — the server only checks
	 * that the bytes really are a square PNG of a sane size, and stores them.
	 */
	app.put<{ Params: ContentParams; Body: unknown }>(
		'/api/admin/content/:kind/:id/art',
		async (request, reply) => {
			const user = await requireAdmin(config, db, request)
			const kind = assertKind(request.params.kind)
			const entityId = assertEntityId(request.params.id)
			if (!Buffer.isBuffer(request.body)) {
				throw badRequest('Send the picture as an image/png body.', 'invalid_art')
			}
			const art = await saveArt(db, kind, entityId, request.body, user.email)
			return reply.code(201).send({ art })
		},
	)

	/** Remove the uploaded picture (the entity goes back to its static art, then the emoji). */
	app.delete<{ Params: ContentParams }>('/api/admin/content/:kind/:id/art', async (request) => {
		await requireAdmin(config, db, request)
		const kind = assertKind(request.params.kind)
		const entityId = assertEntityId(request.params.id)
		await deleteArt(db, kind, entityId)
		return { ok: true }
	})
}

function assertKind(value: string): ContentKind {
	if (!isContentKind(value)) {
		throw badRequest('Unknown content kind: only "item" and "pet" are supported.', 'unknown_kind')
	}
	return value
}
