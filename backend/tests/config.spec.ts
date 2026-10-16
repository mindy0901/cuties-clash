/**
 * Cấu hình: khoá ký phiên yếu phải bị từ chối để tránh chạy production với khoá mẫu.
 *
 * Mọi test ở đây truyền tường minh một bộ biến môi trường (`buildConfig`) nên không
 * phụ thuộc file `.env` của máy — tương đương `Settings(_env_file=None, …)` bên Python.
 */

import { describe, expect, it } from 'vitest'
import {
	DEFAULT_CORS_ORIGINS,
	PLACEHOLDER_JWT_SECRET,
	buildConfig,
	normalizeDatabaseUrl,
} from '../src/config'
import type { EnvLike } from '../src/config'

const STRONG = 'k'.repeat(48)

function build(env: EnvLike = {}) {
	return buildConfig({ JWT_SECRET: STRONG, ...env })
}

describe('khoá ký phiên', () => {
	it('từ chối khoá mẫu trong .env.example', () => {
		expect(() => buildConfig({ JWT_SECRET: PLACEHOLDER_JWT_SECRET })).toThrow(/JWT_SECRET/)
	})

	it('từ chối khoá ngắn hơn 32 ký tự', () => {
		expect(() => buildConfig({ JWT_SECRET: 'qua-ngan' })).toThrow(/JWT_SECRET/)
	})

	it('từ chối cả khi thiếu hẳn JWT_SECRET', () => {
		expect(() => buildConfig({})).toThrow(/JWT_SECRET/)
	})

	it('nhận khoá đủ mạnh', () => {
		expect(build().jwtSecret).toBe(STRONG)
	})
})

describe('điểm gọi lại OAuth', () => {
	it('callbackUrl dùng origin của frontend', () => {
		expect(build({ FRONTEND_URL: 'http://localhost:5190' }).callbackUrl('google')).toBe(
			'http://localhost:5190/api/auth/google/callback',
		)
	})

	it('oauthRedirectBase ghi đè frontendUrl và bỏ dấu / ở cuối', () => {
		expect(
			build({
				FRONTEND_URL: 'http://localhost:5190',
				OAUTH_REDIRECT_BASE: 'https://game.example.com/',
			}).callbackUrl('google'),
		).toBe('https://game.example.com/api/auth/google/callback')
	})

	it('postLoginRedirect ghi đè nơi quay về sau khi đăng nhập', () => {
		expect(build({ FRONTEND_URL: 'http://localhost:5190', POST_LOGIN_REDIRECT: 'https://x/y/' }).postLoginUrl).toBe(
			'https://x/y',
		)
	})
})

describe('nhà cung cấp đăng nhập', () => {
	it('cần đủ cả hai khoá mới coi là đã cấu hình', () => {
		expect(build({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: '' }).isConfigured('google')).toBe(false)
		expect(build({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: 'secret' }).isConfigured('google')).toBe(false)
		expect(build({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }).isConfigured('google')).toBe(true)
	})

	it('facebook/zing không bao giờ được coi là đã cấu hình', () => {
		const cfg = build({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })
		expect(cfg.isConfigured('facebook')).toBe(false)
		expect(cfg.isConfigured('zing')).toBe(false)
	})
})

describe('giá trị mặc định', () => {
	it('giống bản Python (Settings)', () => {
		const cfg = build()
		expect(cfg.appName).toBe('Martial Cutie API')
		expect(cfg.environment).toBe('development')
		expect(cfg.debug).toBe(false)
		expect(cfg.sqlEcho).toBe(false)
		expect(cfg.autoCreateTables).toBe(true)
		expect(cfg.corsOrigins).toEqual(DEFAULT_CORS_ORIGINS)
		expect(cfg.jwtAlgorithm).toBe('HS256')
		expect(cfg.sessionDays).toBe(30)
		expect(cfg.cookieName).toBe('mc_session')
		expect(cfg.cookieSecure).toBe(false)
		expect(cfg.cookieDomain).toBeUndefined()
		expect(cfg.backendUrl).toBe('http://localhost:8000')
		expect(cfg.frontendUrl).toBe('http://localhost:5190')
		expect(cfg.postLoginUrl).toBe('http://localhost:5190')
		expect(cfg.frontendDist).toBe('../frontend/dist')
		expect(cfg.autoLogin).toBe(false)
	})
})

describe('DATABASE_URL', () => {
	it('bỏ hậu tố driver psycopg để Prisma dùng được', () => {
		expect(normalizeDatabaseUrl('postgresql+psycopg://u:p@localhost:5432/martial_cutie')).toBe(
			'postgresql://u:p@localhost:5432/martial_cutie',
		)
	})

	it('giữ nguyên URL không có hậu tố', () => {
		expect(normalizeDatabaseUrl('postgresql://u:p@db:5432/martial_cutie')).toBe(
			'postgresql://u:p@db:5432/martial_cutie',
		)
	})

	it('áp dụng luôn cho giá trị trong cấu hình', () => {
		expect(build({ DATABASE_URL: 'postgresql+psycopg://u:p@h:5432/d' }).databaseUrl).toBe('postgresql://u:p@h:5432/d')
	})
})

describe('CORS_ORIGINS', () => {
	it('nhận mảng JSON', () => {
		expect(build({ CORS_ORIGINS: '["https://a.example","https://b.example"]' }).corsOrigins).toEqual([
			'https://a.example',
			'https://b.example',
		])
	})

	it('nhận danh sách ngăn bằng dấu phẩy', () => {
		expect(build({ CORS_ORIGINS: 'https://a.example, https://b.example' }).corsOrigins).toEqual([
			'https://a.example',
			'https://b.example',
		])
	})

	it('mảng rỗng nghĩa là tắt CORS', () => {
		expect(build({ CORS_ORIGINS: '[]' }).corsOrigins).toEqual([])
	})
})
