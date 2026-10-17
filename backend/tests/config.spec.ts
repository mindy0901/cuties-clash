/**
 * Configuration: a weak session signing key must be rejected so production never runs with
 * the sample key.
 *
 * Every test here passes an explicit set of environment variables (`buildConfig`), so it does
 * not depend on the machine's `.env` file — equivalent to `Settings(_env_file=None, …)` in
 * Python.
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

describe('session signing key', () => {
	it('rejects the placeholder key from .env.example', () => {
		expect(() => buildConfig({ JWT_SECRET: PLACEHOLDER_JWT_SECRET })).toThrow(/JWT_SECRET/)
	})

	it('rejects a key shorter than 32 characters', () => {
		expect(() => buildConfig({ JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/)
	})

	it('rejects a completely missing JWT_SECRET', () => {
		expect(() => buildConfig({})).toThrow(/JWT_SECRET/)
	})

	it('accepts a key that is strong enough', () => {
		expect(build().jwtSecret).toBe(STRONG)
	})
})

describe('OAuth callback', () => {
	it('callbackUrl uses the frontend origin', () => {
		expect(build({ FRONTEND_URL: 'http://localhost:5190' }).callbackUrl('google')).toBe(
			'http://localhost:5190/api/auth/google/callback',
		)
	})

	it('oauthRedirectBase overrides frontendUrl and strips the trailing /', () => {
		expect(
			build({
				FRONTEND_URL: 'http://localhost:5190',
				OAUTH_REDIRECT_BASE: 'https://game.example.com/',
			}).callbackUrl('google'),
		).toBe('https://game.example.com/api/auth/google/callback')
	})

	it('postLoginRedirect overrides where the browser returns after a login', () => {
		expect(build({ FRONTEND_URL: 'http://localhost:5190', POST_LOGIN_REDIRECT: 'https://x/y/' }).postLoginUrl).toBe(
			'https://x/y',
		)
	})
})

describe('login providers', () => {
	it('needs both keys before it counts as configured', () => {
		expect(build({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: '' }).isConfigured('google')).toBe(false)
		expect(build({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: 'secret' }).isConfigured('google')).toBe(false)
		expect(build({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' }).isConfigured('google')).toBe(true)
	})

	it('facebook/zing are never treated as configured', () => {
		const cfg = build({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })
		expect(cfg.isConfigured('facebook')).toBe(false)
		expect(cfg.isConfigured('zing')).toBe(false)
	})
})

describe('default values', () => {
	it('match the Python version (Settings)', () => {
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
	it('strips the psycopg driver suffix so Prisma can use it', () => {
		expect(normalizeDatabaseUrl('postgresql+psycopg://u:p@localhost:5432/martial_cutie')).toBe(
			'postgresql://u:p@localhost:5432/martial_cutie',
		)
	})

	it('keeps a URL without a suffix as it is', () => {
		expect(normalizeDatabaseUrl('postgresql://u:p@db:5432/martial_cutie')).toBe(
			'postgresql://u:p@db:5432/martial_cutie',
		)
	})

	it('also applies to the value inside the configuration', () => {
		expect(build({ DATABASE_URL: 'postgresql+psycopg://u:p@h:5432/d' }).databaseUrl).toBe('postgresql://u:p@h:5432/d')
	})
})

describe('CORS_ORIGINS', () => {
	it('accepts a JSON array', () => {
		expect(build({ CORS_ORIGINS: '["https://a.example","https://b.example"]' }).corsOrigins).toEqual([
			'https://a.example',
			'https://b.example',
		])
	})

	it('accepts a comma-separated list', () => {
		expect(build({ CORS_ORIGINS: 'https://a.example, https://b.example' }).corsOrigins).toEqual([
			'https://a.example',
			'https://b.example',
		])
	})

	it('an empty array means CORS is off', () => {
		expect(build({ CORS_ORIGINS: '[]' }).corsOrigins).toEqual([])
	})
})
