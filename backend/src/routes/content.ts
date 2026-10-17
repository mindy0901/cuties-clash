/** Game content (items, pets) edited from the admin page. */

import type { FastifyPluginAsync } from 'fastify'
import type { Config } from '../config'
import {
	assertEntityId,
	deleteContentOverride,
	type ContentKind,
	isContentKind,
	listContentOverrides,
	readContent,
	saveContentOverride,
	validateContentPayload,
} from '../content'
import type { Db } from '../db'
import { requireAdmin } from '../deps'
import { badRequest } from '../errors'

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

	/** Public: the game loads it on boot, including for anonymous players. */
	app.get('/api/content', async () => readContent(db))

	/** Override list (with author) for the admin page. */
	app.get('/api/admin/content', async (request) => {
		await requireAdmin(config, db, request)
		return { overrides: await listContentOverrides(db) }
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
}

function assertKind(value: string): ContentKind {
	if (!isContentKind(value)) {
		throw badRequest('Unknown content kind: only "item" and "pet" are supported.', 'unknown_kind')
	}
	return value
}
