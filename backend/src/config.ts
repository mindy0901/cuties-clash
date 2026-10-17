/**
 * Backend configuration, read from environment variables / the `.env` file.
 *
 * Precedence order (matching pydantic-settings' `env_file=(".env", "../.env")`):
 * `../.env` (repo root) → `backend/.env` → `process.env`. A value read later overrides
 * a value read earlier, but `process.env` always wins.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Placeholder value from `.env.example` — must never be used for real. */
export const PLACEHOLDER_JWT_SECRET = 'doi-thanh-khoa-ngau-nhien-dai-it-nhat-32-ky-tu'
export const MIN_JWT_SECRET_LENGTH = 32

export const DEFAULT_CORS_ORIGINS = ['http://localhost:5190', 'http://127.0.0.1:5190']

/** The `backend/` directory — the base for resolving `.env`, `prisma/` and `../dist`. */
export const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export type EnvLike = Record<string, string | undefined>

export type HmacAlgorithm = 'HS256' | 'HS384' | 'HS512'

export interface Config {
	readonly appName: string
	readonly environment: string
	readonly debug: boolean

	readonly databaseUrl: string
	readonly sqlEcho: boolean
	readonly autoCreateTables: boolean

	readonly corsOrigins: readonly string[]

	/**
	 * Emails allowed into the content admin page (`ADMIN_EMAILS`, comma separated).
	 *
	 * Empty means **nobody** gets in — the admin page turns itself off, which is safer than
	 * opening it to every account.
	 */
	readonly adminEmails: readonly string[]

	readonly jwtSecret: string
	readonly jwtAlgorithm: HmacAlgorithm
	readonly sessionDays: number
	readonly cookieName: string
	readonly cookieSecure: boolean
	readonly cookieDomain?: string

	readonly backendUrl: string
	readonly frontendUrl: string
	readonly oauthRedirectBase?: string
	readonly postLoginRedirect?: string

	readonly frontendDist: string
	/** Absolute path of the Vite build (resolved against `backend/`). */
	readonly frontendDistDir: string

	readonly autoLogin: boolean

	readonly googleClientId: string
	readonly googleClientSecret: string

	/** Origin of the OAuth callback endpoint (trailing `/` stripped). */
	readonly redirectBase: string
	readonly postLoginUrl: string
	readonly callbackUrl: (provider: string) => string
	readonly isConfigured: (provider: string) => boolean
}

/** Configuration error — stop at startup instead of running with a dangerous value. */
export class ConfigError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ConfigError'
	}
}

/**
 * A weak session signing key makes tokens forgeable — refuse to start.
 *
 * A pure function so it can be tested without building a whole configuration object.
 */
export function assertStrongJwtSecret(secret: string): void {
	if (secret === PLACEHOLDER_JWT_SECRET || secret.length < MIN_JWT_SECRET_LENGTH) {
		throw new ConfigError(
			'JWT_SECRET is unset or too short. Create a .env file from .env.example and generate a key with: ' +
				`node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"`,
		)
	}
}

/**
 * Strip the driver suffix from the database URL so that both `postgresql+psycopg://…`
 * (the value currently in `.env`) and plain `postgresql://…` work with Prisma.
 */
export function normalizeDatabaseUrl(url: string): string {
	return url.replace(/^([a-z][a-z0-9]*)\+[a-z0-9_]+:\/\//i, '$1://')
}

export function parseHmacAlgorithm(algorithm: string): HmacAlgorithm {
	const normalized = algorithm.trim().toUpperCase()
	if (normalized === 'HS256' || normalized === 'HS384' || normalized === 'HS512') return normalized
	throw new ConfigError(`Unsupported JWT_ALGORITHM: ${algorithm}. Use only HS256, HS384 or HS512.`)
}

function parseEnvFile(path: string): Record<string, string> {
	let raw: string
	try {
		raw = readFileSync(path, 'utf8')
	} catch {
		// A missing file is normal (tests; Docker only passes environment variables).
		return {}
	}

	const values: Record<string, string> = {}
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed)
		if (!match) continue
		const key = match[1]!
		let value = match[2]!.trim()
		if (
			value.length >= 2 &&
			((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
		) {
			value = value.slice(1, -1)
		}
		values[key] = value
	}
	return values
}

/** Read `../.env` then `backend/.env` (a file read later overrides one read earlier). */
export function readEnvFiles(): Record<string, string> {
	const files = [resolve(BACKEND_DIR, '..', '.env'), resolve(BACKEND_DIR, '.env')]
	const values: Record<string, string> = {}
	for (const file of files) {
		Object.assign(values, parseEnvFile(file))
	}
	return values
}

// ── Reading raw values ───────────────────────────────────────────────────────

export function readBoolean(env: EnvLike, key: string, fallback: boolean): boolean {
	const raw = env[key]
	if (raw === undefined || raw.trim() === '') return fallback
	const value = raw.trim().toLowerCase()
	if (['1', 'true', 'yes', 'on', 't', 'y'].includes(value)) return true
	if (['0', 'false', 'no', 'off', 'f', 'n'].includes(value)) return false
	return fallback
}

export function readInteger(env: EnvLike, key: string, fallback: number): number {
	const raw = env[key]
	if (raw === undefined || raw.trim() === '') return fallback
	const value = Number.parseInt(raw.trim(), 10)
	return Number.isFinite(value) ? value : fallback
}

/** `CORS_ORIGINS` accepts both a JSON array (pydantic style) and a comma-separated list. */
export function readOrigins(env: EnvLike, key: string, fallback: readonly string[]): string[] {
	const raw = env[key]
	if (raw === undefined || raw.trim() === '') return [...fallback]
	const trimmed = raw.trim()
	if (trimmed.startsWith('[')) {
		try {
			const parsed: unknown = JSON.parse(trimmed)
			if (Array.isArray(parsed)) return parsed.map((value) => String(value)).filter((value) => value.length > 0)
		} catch {
			return [...fallback]
		}
		return [...fallback]
	}
	return trimmed
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0)
}

function readString(env: EnvLike, key: string, fallback: string): string {
	const raw = env[key]
	return raw === undefined || raw === '' ? fallback : raw
}

/** Whether an email may use the content admin page (case-insensitive). */
export function isAdminEmail(config: Config, email: string | null | undefined): boolean {
	if (!email) return false
	return config.adminEmails.includes(email.trim().toLowerCase())
}

function readOptionalString(env: EnvLike, key: string): string | undefined {
	const raw = env[key]
	return raw === undefined || raw.trim() === '' ? undefined : raw.trim()
}

/** Build the configuration from a given set of environment variables (pure, testable). */
export function buildConfig(env: EnvLike): Config {
	const jwtSecret = readString(env, 'JWT_SECRET', PLACEHOLDER_JWT_SECRET)
	assertStrongJwtSecret(jwtSecret)

	const environment = readString(env, 'ENVIRONMENT', 'development')
	const frontendUrl = readString(env, 'FRONTEND_URL', 'http://localhost:5190')
	const oauthRedirectBase = readOptionalString(env, 'OAUTH_REDIRECT_BASE')
	const postLoginRedirect = readOptionalString(env, 'POST_LOGIN_REDIRECT')
	const cookieDomain = readOptionalString(env, 'COOKIE_DOMAIN')
	const googleClientId = readString(env, 'GOOGLE_CLIENT_ID', '')
	const googleClientSecret = readString(env, 'GOOGLE_CLIENT_SECRET', '')

	const stripTrailingSlash = (value: string): string => (value.endsWith('/') ? value.replace(/\/+$/, '') : value)
	const redirectBase = stripTrailingSlash(oauthRedirectBase ?? frontendUrl)
	const postLoginUrl = stripTrailingSlash(postLoginRedirect ?? frontendUrl)

	const isConfigured = (provider: string): boolean =>
		// Only Google is supported; leftover environment variables for other providers are ignored.
		provider === 'google' && Boolean(googleClientId) && Boolean(googleClientSecret)

	const config: Config = {
		appName: readString(env, 'APP_NAME', 'Martial Cutie API'),
		environment,
		debug: readBoolean(env, 'DEBUG', false),

		databaseUrl: normalizeDatabaseUrl(
			readString(env, 'DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/martial_cutie'),
		),
		sqlEcho: readBoolean(env, 'SQL_ECHO', false),
		autoCreateTables: readBoolean(env, 'AUTO_CREATE_TABLES', true),

		corsOrigins: readOrigins(env, 'CORS_ORIGINS', DEFAULT_CORS_ORIGINS),

		adminEmails: readOrigins(env, 'ADMIN_EMAILS', []).map((email) => email.trim().toLowerCase()),

		jwtSecret,
		jwtAlgorithm: parseHmacAlgorithm(readString(env, 'JWT_ALGORITHM', 'HS256')),
		sessionDays: readInteger(env, 'SESSION_DAYS', 30),
		cookieName: readString(env, 'COOKIE_NAME', 'mc_session'),
		cookieSecure: readBoolean(env, 'COOKIE_SECURE', false),
		...(cookieDomain === undefined ? {} : { cookieDomain }),

		backendUrl: readString(env, 'BACKEND_URL', 'http://localhost:8000'),
		frontendUrl,
		...(oauthRedirectBase === undefined ? {} : { oauthRedirectBase }),
		...(postLoginRedirect === undefined ? {} : { postLoginRedirect }),

		// In this workspace the Vite build directory is `frontend/dist`.
		frontendDist: readString(env, 'FRONTEND_DIST', '../frontend/dist'),
		frontendDistDir: resolve(BACKEND_DIR, readString(env, 'FRONTEND_DIST', '../frontend/dist')),

		autoLogin: readBoolean(env, 'AUTO_LOGIN', false),

		googleClientId,
		googleClientSecret,

		redirectBase,
		postLoginUrl,
		callbackUrl: (provider: string) => `${redirectBase}/api/auth/${provider}/callback`,
		isConfigured,
	}

	return Object.freeze(config)
}

/**
 * Runtime configuration: `.env` files first, `process.env` after (environment wins).
 * Pass `env` to skip `.env` files entirely (used in tests).
 */
export function loadConfig(env?: EnvLike): Config {
	if (env) return buildConfig(env)
	return buildConfig({ ...readEnvFiles(), ...process.env })
}
