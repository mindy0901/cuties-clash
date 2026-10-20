/** Game content (items, cuties) and the kit catalogue, edited from the admin page. */

import type { FastifyPluginAsync } from 'fastify'
import type { Config } from '../config'
import {
	assertEntityId,
	createKit,
	deleteArt,
	deleteContentOverride,
	deleteKitCategory,
	deleteKitEntry,
	type ContentKind,
	isContentKind,
	kitRuntime,
	listArt,
	listContentOverrides,
	readArt,
	readContent,
	removeKit,
	saveArt,
	saveContentOverride,
	saveKitCategory,
	saveKitEntry,
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

interface IdParams {
	id: string
}

/**
 * ⚠️ `id` is deliberately not checked against the catalogue: the catalogue lives in the
 * **frontend** (`game/items.ts`, `game/cuties.ts`) and the server must not know game rules. An
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
	 * `?v=<upload time in ms>` is part of the URL, so the bytes never change under a given URL — hence
	 * `immutable` caching. ⚠️ It must be the **upload time**, not the upload counter: the counter
	 * restarts at 1 after a delete, so a re-upload would reuse an already cached URL and the browser
	 * would keep showing the deleted picture.
	 */
	app.get<{ Params: ContentParams }>('/api/content/art/:kind/:id', async (request, reply) => {
		const kind = assertKind(request.params.kind)
		const entityId = assertEntityId(request.params.id)
		const art = await readArt(db, kind, entityId)
		if (!art) throw notFound('Chưa có ảnh nào được tải lên cho mục này.')

		const etag = `"${art.tag}"`
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
			// A kit list is checked against the **catalogue**, so a kit created on the Kits tab can be
			// attached from the item editor.
			const payload = validateContentPayload(kind, request.body, await kitRuntime(db))
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

	// ── Kit catalogue ──────────────────────────────────────────────────────────
	//
	// A kit is a **mechanic of the engine** plus a catalogue entry on top of it, so it has its own
	// routes: creating one, renaming it, **moving it to another catalogue**, deleting it, and the
	// catalogues themselves.

	/** Create a kit on top of an engine mechanic; the id is generated (`<mechanic>-2`, `-3`…). */
	app.post<{ Body: unknown }>('/api/admin/content/kit', async (request, reply) => {
		const user = await requireAdmin(config, db, request)
		const payload = asObject(request.body)
		return reply.code(201).send({ entry: await createKit(db, payload, user.email) })
	})

	/** Save one kit: label, catalogue (this is the "move"), who may carry it, default numbers, removal. */
	app.put<{ Params: IdParams; Body: unknown }>('/api/admin/content/kit/:id', async (request) => {
		const user = await requireAdmin(config, db, request)
		const payload = asObject(request.body)
		return { entry: await saveKitEntry(db, request.params.id, payload, user.email) }
	})

	/**
	 * Drop the catalogue row completely.
	 *
	 * For a **code** kit that is the way back to `game/kits.ts` (which is what the Restore button
	 * does); for a kit created on this page it removes it for good — there is nothing in code to fall
	 * back to.
	 */
	app.delete<{ Params: IdParams }>('/api/admin/content/kit/:id', async (request) => {
		await requireAdmin(config, db, request)
		await deleteKitEntry(db, request.params.id)
		return { ok: true }
	})

	/** Create a catalogue (a heading on the Kits tab). The id is a slug of the label. */
	app.post<{ Body: unknown }>('/api/admin/content/kit-category', async (request, reply) => {
		const user = await requireAdmin(config, db, request)
		return reply.code(201).send({ category: await saveKitCategory(db, null, asObject(request.body), user.email) })
	})

	/** Rename a catalogue, or move it up / down the list. */
	app.put<{ Params: IdParams; Body: unknown }>(
		'/api/admin/content/kit-category/:id',
		async (request) => {
			const user = await requireAdmin(config, db, request)
			return { category: await saveKitCategory(db, request.params.id, asObject(request.body), user.email) }
		},
	)

	/** Remove a catalogue — refused while it still holds kits (move them first). */
	app.delete<{ Params: IdParams }>('/api/admin/content/kit-category/:id', async (request) => {
		await requireAdmin(config, db, request)
		await deleteKitCategory(db, request.params.id)
		return { ok: true }
	})

	/**
	 * Delete one kit from the **whole game** (detaching it everywhere) — the body is the marker
	 * `{ removed: true }`, so `removeKit` is never reached by a plain field edit.
	 */
	app.post<{ Params: IdParams; Body: unknown }>('/api/admin/content/kit/:id/remove', async (request) => {
		const user = await requireAdmin(config, db, request)
		assertRemovalBody(request.body)
		await removeKit(db, request.params.id, user.email)
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
		throw badRequest('Unknown content kind: only "item" and "cutie" own a picture or a payload.', 'unknown_kind')
	}
	return value
}

/** A JSON object body, or a 400 that says what was expected. */
function asObject(body: unknown): Record<string, unknown> {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw badRequest('Payload must be a JSON object.', 'invalid_content')
	}
	return body as Record<string, unknown>
}

/**
 * The one write `…/remove` accepts: `{ "removed": true }`.
 *
 * ⚠️ Not a plain "ignore the body": a client that meant "restore" would silently get the kit
 * **deleted** instead, and the mistake would only show up on the next page load.
 */
function assertRemovalBody(body: unknown): void {
	if ((body as Record<string, unknown> | null)?.removed !== true) {
		throw badRequest('Deleting a kit sends { "removed": true }.', 'invalid_content')
	}
}
