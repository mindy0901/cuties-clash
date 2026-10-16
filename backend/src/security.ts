/** Token phiên đăng nhập, cookie và khoá chống giả mạo (state). */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyReply } from 'fastify'
import { SignJWT, jwtVerify } from 'jose'
import type { Config } from './config'

/** Cookie giữ `state` của luồng OAuth, sống ngắn và chỉ gửi cho đường dẫn gọi lại. */
export const OAUTH_STATE_COOKIE = 'mc_oauth_state'
export const OAUTH_STATE_TTL_SECONDS = 600

/** Phần `reply` mà các hàm cookie cần — nhỏ để test được mà không dựng cả server. */
export type CookieReply = Pick<FastifyReply, 'setCookie' | 'clearCookie'>

export interface SessionToken {
	token: string
	expiresAt: Date
}

function secretKey(config: Config): Uint8Array {
	return new TextEncoder().encode(config.jwtSecret)
}

/** `secrets.token_urlsafe(n)` của Python: base64url không đệm. */
function randomTokenUrlSafe(bytes: number): string {
	return randomBytes(bytes).toString('base64url')
}

export async function createSessionToken(config: Config, userId: number, epoch = 0): Promise<SessionToken> {
	const issuedAt = Math.floor(Date.now() / 1000)
	const expiresAt = new Date((issuedAt + config.sessionDays * 24 * 3600) * 1000)
	const token = await new SignJWT({ epoch })
		.setProtectedHeader({ alg: config.jwtAlgorithm })
		.setSubject(String(userId))
		.setIssuedAt(issuedAt)
		.setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
		.setJti(randomTokenUrlSafe(12))
		.sign(secretKey(config))
	return { token, expiresAt }
}

/** Đọc `(userId, epoch)` từ token; trả `null` nếu token sai hoặc hết hạn. */
export async function readSessionToken(
	config: Config,
	token: string,
): Promise<{ userId: number; epoch: number } | null> {
	let subject: unknown
	let rawEpoch: unknown
	try {
		const { payload } = await jwtVerify(token, secretKey(config), { algorithms: [config.jwtAlgorithm] })
		subject = payload.sub
		rawEpoch = payload['epoch']
	} catch {
		return null
	}

	if (typeof subject !== 'string' || !/^\d+$/.test(subject)) return null
	const epoch = typeof rawEpoch === 'number' && Number.isInteger(rawEpoch) ? rawEpoch : 0
	return { userId: Number.parseInt(subject, 10), epoch }
}

export function setSessionCookie(reply: CookieReply, config: Config, token: string, expiresAt: Date): void {
	reply.setCookie(config.cookieName, token, {
		path: '/',
		expires: expiresAt,
		maxAge: config.sessionDays * 24 * 3600,
		domain: config.cookieDomain,
		secure: config.cookieSecure,
		httpOnly: true,
		sameSite: 'lax',
	})
}

export function clearSessionCookie(reply: CookieReply, config: Config): void {
	reply.clearCookie(config.cookieName, {
		path: '/',
		domain: config.cookieDomain,
		secure: config.cookieSecure,
		httpOnly: true,
		sameSite: 'lax',
	})
}

export function newState(): string {
	return randomTokenUrlSafe(24)
}

function stateSignature(config: Config, state: string): string {
	// Ký `state` để cookie không dùng được như một giá trị tuỳ ý do kẻ khác đặt.
	const digest = createHmac('sha256', config.jwtSecret).update(state).digest()
	return `${state}.${digest.toString('base64url')}`
}

export function setStateCookie(reply: CookieReply, config: Config, state: string): void {
	reply.setCookie(OAUTH_STATE_COOKIE, stateSignature(config, state), {
		path: '/api/auth',
		maxAge: OAUTH_STATE_TTL_SECONDS,
		domain: config.cookieDomain,
		secure: config.cookieSecure,
		httpOnly: true,
		sameSite: 'lax',
	})
}

export function clearStateCookie(reply: CookieReply, config: Config): void {
	reply.clearCookie(OAUTH_STATE_COOKIE, {
		path: '/api/auth',
		domain: config.cookieDomain,
		secure: config.cookieSecure,
		httpOnly: true,
		sameSite: 'lax',
	})
}

/** So sánh chống dò thời gian: cookie `state` phải khớp chữ ký của `state` trên URL. */
export function verifyState(config: Config, state: string | undefined, cookieValue: string | undefined): boolean {
	if (!state || !cookieValue) return false
	const expected = Buffer.from(stateSignature(config, state), 'utf8')
	const actual = Buffer.from(cookieValue, 'utf8')
	if (expected.length !== actual.length) return false
	return timingSafeEqual(expected, actual)
}
