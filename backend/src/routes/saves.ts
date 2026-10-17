/** Sync play progress per account. */

import type { FastifyPluginAsync } from 'fastify'
import type { Config } from '../config'
import type { Db } from '../db'
import { currentUser } from '../deps'
import { getSave, putSave, toUserOut } from '../services'

export interface SaveRouteOptions {
	config: Config
	db: Db
}

export const saveRoutes: FastifyPluginAsync<SaveRouteOptions> = async (app, options) => {
	const { config, db } = options

	app.get('/api/me', async (request) => toUserOut(db, await currentUser(config, db, request), config))

	/** The save currently on the server; `run = null` means it was never synced. */
	app.get('/api/me/save', async (request) => {
		const user = await currentUser(config, db, request)
		return getSave(db, user.id)
	})

	app.put<{ Body: { run: Record<string, unknown>; revision?: number | null } }>(
		'/api/me/save',
		{
			schema: {
				body: {
					type: 'object',
					required: ['run'],
					properties: {
						run: { type: 'object' },
						revision: { type: ['integer', 'null'] },
					},
				},
			},
		},
		async (request) => {
			const user = await currentUser(config, db, request)
			return putSave(db, user.id, request.body.run, request.body.revision ?? null)
		},
	)
}
