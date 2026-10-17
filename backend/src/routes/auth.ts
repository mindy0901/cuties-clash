/** Đăng nhập bằng Google và quản lý phiên. */

import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { User } from '@prisma/client'
import type { Config } from '../config'
import type { Db } from '../db'
import { optionalUser } from '../deps'
import { ApiError } from '../errors'
import {
	availableProviders,
	buildAuthorizeUrl,
	exchangeCode,
	fetchProfile,
	getProvider,
} from '../oauth'
import {
	OAUTH_STATE_COOKIE,
	clearSessionCookie,
	clearStateCookie,
	createSessionToken,
	newState,
	setSessionCookie,
	setStateCookie,
	verifyState,
} from '../security'
import { toUserOut, upsertUserFromProfile } from '../services'

export interface AuthRouteOptions {
	config: Config
	db: Db
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, options) => {
	const { config, db } = options

	app.get('/api/auth/session', async (request) => {
		const user = await optionalUser(config, db, request)
		const available = availableProviders(config)
		// Chỉ bật tự chuyển hướng khi thật sự có nhà cung cấp dùng được, nếu không
		// frontend sẽ chuyển hướng vào endpoint chắc chắn trả 503.
		const autoLogin = config.autoLogin && available.length > 0
		if (!user) {
			return { authenticated: false, user: null, available_providers: available, auto_login: autoLogin }
		}
		return {
			authenticated: true,
			user: await toUserOut(db, user, config),
			available_providers: available,
			auto_login: autoLogin,
		}
	})

	app.get<{ Params: { provider: string } }>('/api/auth/:provider/login', async (request, reply) => {
		const provider = getProvider(config, request.params.provider)
		const state = newState()
		setStateCookie(reply, config, state)
		return reply.code(307).header('location', buildAuthorizeUrl(config, provider, state)).send()
	})

	app.get<{
		Params: { provider: string }
		Querystring: { code?: string; state?: string; error?: string; error_description?: string }
	}>('/api/auth/:provider/callback', async (request, reply) => {
		const provider = getProvider(config, request.params.provider)
		const { code, state, error, error_description: errorDescription } = request.query

		if (error) return failureRedirect(config, reply, errorDescription || error)
		if (!verifyState(config, state, request.cookies[OAUTH_STATE_COOKIE])) {
			// Cookie `state` sai hoặc đã hết hạn: từ chối thay vì tin tham số trên URL.
			return failureRedirect(config, reply, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy thử lại.')
		}
		if (!code) return failureRedirect(config, reply, 'Nhà cung cấp không trả về mã uỷ quyền.')

		let user: User
		try {
			const token = await exchangeCode(config, provider, code)
			const accessToken = token['access_token']
			if (typeof accessToken !== 'string' || !accessToken) {
				return failureRedirect(config, reply, `${provider.name} không trả về access token.`)
			}
			const profile = await fetchProfile(config, provider, accessToken)
			if (!profile.subject) {
				return failureRedirect(config, reply, `Không đọc được mã người dùng từ ${provider.name}.`)
			}
			user = await upsertUserFromProfile(db, profile)
		} catch (error) {
			// Mọi lỗi ở đây đều phải đưa người dùng về UI, không được để lộ trang lỗi.
			const message = error instanceof ApiError ? error.message : 'Đăng nhập thất bại, hãy thử lại.'
			return failureRedirect(config, reply, message)
		}

		const session = await createSessionToken(config, user.id, user.sessionEpoch)
		setSessionCookie(reply, config, session.token, session.expiresAt)
		clearStateCookie(reply, config)
		return reply.code(303).header('location', `${config.postLoginUrl}/?login=ok`).send()
	})

	app.post('/api/auth/logout', async (request, reply) => {
		const user = await optionalUser(config, db, request)
		if (user) {
			// Tăng epoch để mọi token cũ của tài khoản hết hiệu lực ngay.
			await db.user.update({
				where: { id: user.id },
				data: { sessionEpoch: user.sessionEpoch + 1 },
			})
		}
		clearSessionCookie(reply, config)
		clearStateCookie(reply, config)
		return { ok: true }
	})
}

function failureRedirect(config: Config, reply: FastifyReply, message: string): FastifyReply {
	const query = new URLSearchParams({ login: 'error', message: message.slice(0, 300) })
	clearStateCookie(reply, config)
	return reply.code(303).header('location', `${config.postLoginUrl}/?${query.toString()}`).send()
}
