/** Phụ thuộc dùng chung cho các route: đổi cookie phiên thành người dùng. */

import type { FastifyRequest } from 'fastify'
import type { User } from '@prisma/client'
import type { Config } from './config'
import type { Db } from './db'
import { unauthorized } from './errors'
import { readSessionToken } from './security'

export function sessionCookie(request: FastifyRequest, config: Config): string | undefined {
	return request.cookies[config.cookieName]
}

/** Đổi cookie phiên thành người dùng, kiểm tra cả epoch chống dùng lại token cũ. */
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

/** Cho phép chơi ẩn danh: không có phiên hợp lệ thì trả `null` thay vì lỗi. */
export async function optionalUser(config: Config, db: Db, request: FastifyRequest): Promise<User | null> {
	return resolveSession(config, db, sessionCookie(request, config))
}

/** Bắt buộc đăng nhập. */
export async function currentUser(config: Config, db: Db, request: FastifyRequest): Promise<User> {
	const token = sessionCookie(request, config)
	if (!token) throw unauthorized()
	const user = await resolveSession(config, db, token)
	if (!user) throw unauthorized('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.')
	return user
}
