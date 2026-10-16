/** Token phiên, cookie và khoá chống giả mạo `state`. */

import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import { SignJWT } from 'jose'
import { buildConfig } from '../src/config'
import {
	OAUTH_STATE_COOKIE,
	createSessionToken,
	newState,
	readSessionToken,
	setSessionCookie,
	setStateCookie,
	verifyState,
} from '../src/security'
import { TEST_JWT_SECRET, config, findSetCookie } from './helpers'

const nowSeconds = (): number => Math.floor(Date.now() / 1000)

async function signRaw(claims: Record<string, unknown>, subject: unknown, secret = TEST_JWT_SECRET): Promise<string> {
	const builder = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt(nowSeconds() - 60)
	if (typeof subject === 'string') builder.setSubject(subject)
	return builder.setExpirationTime(nowSeconds() + 600).sign(new TextEncoder().encode(secret))
}

async function cookieTestApp(): Promise<ReturnType<typeof Fastify>> {
	const app = Fastify()
	await app.register(fastifyCookie)
	app.get('/session', async (_request, reply) => {
		const session = await createSessionToken(config, 7, 3)
		setSessionCookie(reply, config, session.token, session.expiresAt)
		return { ok: true }
	})
	app.get('/state', async (_request, reply) => {
		setStateCookie(reply, config, 'state-co-dinh')
		return { ok: true }
	})
	return app
}

describe('token phiên', () => {
	it('đọc lại đúng user id và epoch', async () => {
		const { token } = await createSessionToken(config, 42, 5)
		expect(await readSessionToken(config, token)).toEqual({ userId: 42, epoch: 5 })
	})

	it('mặc định epoch là 0', async () => {
		const { token } = await createSessionToken(config, 42)
		expect(await readSessionToken(config, token)).toEqual({ userId: 42, epoch: 0 })
	})

	it('từ chối token rác', async () => {
		expect(await readSessionToken(config, 'khong-phai-jwt')).toBeNull()
	})

	it('từ chối token ký bằng khoá khác', async () => {
		const token = await signRaw({ epoch: 0 }, '7', 'khoa-khac-dai-it-nhat-32-ky-tu-cho-du-test')
		expect(await readSessionToken(config, token)).toBeNull()
	})

	it('từ chối token đã hết hạn', async () => {
		const token = await new SignJWT({ epoch: 0 })
			.setProtectedHeader({ alg: 'HS256' })
			.setSubject('7')
			.setIssuedAt(nowSeconds() - 3600)
			.setExpirationTime(nowSeconds() - 10)
			.sign(new TextEncoder().encode(TEST_JWT_SECRET))
		expect(await readSessionToken(config, token)).toBeNull()
	})

	it('từ chối `sub` không phải số', async () => {
		const token = await signRaw({ epoch: 0 }, 'nguoi-dung')
		expect(await readSessionToken(config, token)).toBeNull()
	})

	it('epoch thiếu hoặc không nguyên thì coi là 0', async () => {
		expect(await readSessionToken(config, await signRaw({}, '9'))).toEqual({ userId: 9, epoch: 0 })
		expect(await readSessionToken(config, await signRaw({ epoch: 1.5 }, '9'))).toEqual({ userId: 9, epoch: 0 })
	})
})

describe('cookie phiên', () => {
	it('là httpOnly, SameSite=Lax, path=/ và có Max-Age theo SESSION_DAYS', async () => {
		const app = await cookieTestApp()
		try {
			const response = await app.inject({ method: 'GET', url: '/session' })
			const header = findSetCookie(response, 'mc_session')
			expect(header).not.toBeNull()
			const lower = header!.toLowerCase()
			expect(lower).toContain('httponly')
			expect(lower).toContain('samesite=lax')
			expect(lower).toContain('path=/')
			expect(lower).toContain(`max-age=${30 * 24 * 3600}`)
			expect(lower).not.toContain('secure')
		} finally {
			await app.close()
		}
	})

	it('thêm Secure khi COOKIE_SECURE=true', async () => {
		const secureConfig = buildConfig({ JWT_SECRET: TEST_JWT_SECRET, COOKIE_SECURE: 'true' })
		const app = Fastify()
		await app.register(fastifyCookie)
		app.get('/session', async (_request, reply) => {
			const session = await createSessionToken(secureConfig, 7, 0)
			setSessionCookie(reply, secureConfig, session.token, session.expiresAt)
			return { ok: true }
		})
		try {
			const response = await app.inject({ method: 'GET', url: '/session' })
			expect(findSetCookie(response, 'mc_session')!.toLowerCase()).toContain('secure')
		} finally {
			await app.close()
		}
	})
})

describe('state chống giả mạo', () => {
	it('state mới là chuỗi ngẫu nhiên 32 ký tự', () => {
		const first = newState()
		expect(first).toHaveLength(32)
		expect(newState()).not.toBe(first)
	})

	it('chấp nhận state khớp cookie đã ký', async () => {
		const app = await cookieTestApp()
		try {
			const response = await app.inject({ method: 'GET', url: '/state' })
			const header = findSetCookie(response, OAUTH_STATE_COOKIE)
			expect(header).not.toBeNull()
			const value = header!.split(';')[0]!.slice(OAUTH_STATE_COOKIE.length + 1)
			expect(verifyState(config, 'state-co-dinh', value)).toBe(true)
			// State khác, cookie bị sửa, hoặc thiếu một trong hai đều bị từ chối.
			expect(verifyState(config, 'state-khac', value)).toBe(false)
			expect(verifyState(config, 'state-co-dinh', 'state-co-dinh.chu-ky-gia')).toBe(false)
			expect(verifyState(config, 'state-co-dinh', undefined)).toBe(false)
			expect(verifyState(config, undefined, value)).toBe(false)
		} finally {
			await app.close()
		}
	})
})
