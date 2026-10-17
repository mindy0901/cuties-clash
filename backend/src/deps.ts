/** Shared dependencies for the routes: turn the session cookie into a user. */

import type { FastifyRequest } from 'fastify'
import type { User } from '@prisma/client'
import { isAdminEmail, type Config } from './config'
import type { Db } from './db'
import { forbidden, unauthorized } from './errors'
import { readSessionToken } from './security'

export function sessionCookie(request: FastifyRequest, config: Config): string | undefined {
	return request.cookies[config.cookieName]
}

/** Turn the session cookie into a user, checking the epoch too so old tokens cannot be reused. */
export async function resolveSession(
	config: Config,
	db: Db,
	sessionToken: string | undefined,
): Promise<User | null> {
	if (!sessionToken) return null
	const parsed = await readSessionToken(config, sessionToken)
	if (!parsed) return null
	const user = await db.user.findUnique({ where: { id: parsed.userId } })
	if (!user || user.sessionEpoch !== parsed.epoch) return null
	return user
}

/** Anonymous play is allowed: an invalid session returns `null` instead of an error. */
export async function optionalUser(config: Config, db: Db, request: FastifyRequest): Promise<User | null> {
	return resolveSession(config, db, sessionCookie(request, config))
}

/** A login is required. */
export async function currentUser(config: Config, db: Db, request: FastifyRequest): Promise<User> {
	const token = sessionCookie(request, config)
	if (!token) throw unauthorized()
	const user = await resolveSession(config, db, token)
	if (!user) throw unauthorized('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.')
	return user
}

/**
 * Require a session **and** membership of `ADMIN_EMAILS`.
 *
 * ⚠️ An empty list means **nobody** gets in: safe by default, so forgetting to configure it can
 * never open the door to every account.
 */
export async function requireAdmin(config: Config, db: Db, request: FastifyRequest): Promise<User> {
	const user = await currentUser(config, db, request)
	if (!isAdminEmail(config, user.email)) throw forbidden()
	return user
}
