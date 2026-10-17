/**
 * Shared fixture: a real Prisma client + a rollback harness, without touching real data.
 *
 * ⚠️ The database is the real dev Postgres (`DATABASE_URL` from the repo's `.env`). Therefore
 * **every** test that touches the database runs inside a transaction and always ends with a
 * rollback — nothing is written back, not even when a test fails.
 */

import { PrismaClient, type User } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildConfig, readEnvFiles, type Config, type EnvLike } from '../src/config'
import type { Db } from '../src/db'
import type { OAuthProfile } from '../src/oauth'
import { createSessionToken } from '../src/security'
import { upsertUserFromProfile } from '../src/services'

/** Session signing key for tests — not the value of any real environment. */
export const TEST_JWT_SECRET = 'test-only-secret-at-least-32-bytes-long-so-no-warning'

export const TEST_FRONTEND_URL = 'http://localhost:5190'

/** Test environment variables, applied after `process.env` so they always win (like conftest.py). */
export const TEST_ENV: EnvLike = {
	JWT_SECRET: TEST_JWT_SECRET,
	GOOGLE_CLIENT_ID: 'google-client-id-test',
	GOOGLE_CLIENT_SECRET: 'google-client-secret-test',
	FRONTEND_URL: TEST_FRONTEND_URL,
	// Tests must not run DDL against the user's real database.
	AUTO_CREATE_TABLES: 'false',
	AUTO_LOGIN: 'false',
	DEBUG: 'false',
	SQL_ECHO: 'false',
	ENVIRONMENT: 'test',
}

export function testEnv(overrides: EnvLike = {}): EnvLike {
	return { ...readEnvFiles(), ...process.env, ...TEST_ENV, ...overrides }
}

export const config: Config = buildConfig(testEnv())

if (!/^postgres(ql)?:\/\//.test(config.databaseUrl)) {
	throw new Error(
		`Tests need a real Postgres database, but DATABASE_URL is "${config.databaseUrl}". ` +
			'Check the .env file at the repo root.',
	)
}

/** Client outside the transaction — used only to check that "nothing was written back". */
export const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl })

export async function disconnectTestPrisma(): Promise<void> {
	await prisma.$disconnect()
}

/** Block every real network call: tests must stub `fetch` when calling a provider. */
export const guardFetch = (): never => {
	throw new Error('Tests must not make real network calls. Stub `fetch` for this call.')
}

const ROLLBACK_MESSAGE = 'test-transaction-rollback'
class RollbackSignal extends Error {}

export interface TestContext {
	app: FastifyInstance
	db: Db
}

export interface ScanOptions {
	/** Different configuration for this run (for example: no Google keys yet). */
	config?: Config
}

/** Run `run` inside a transaction and roll back; also starts a Fastify app when needed. */
export async function withApp(run: (ctx: TestContext) => Promise<void>, options: ScanOptions = {}): Promise<void> {
	await withDb(async (db) => {
		const app = await buildApp({ db, config: options.config ?? config })
		try {
			await run({ app, db })
		} finally {
			await app.close()
		}
	})
}

/** Run `run` inside a transaction and roll back (without starting an HTTP server). */
export async function withDb(run: (db: Db) => Promise<void>): Promise<void> {
	const signal = new RollbackSignal(ROLLBACK_MESSAGE)
	try {
		await prisma.$transaction(
			async (tx) => {
				await run(tx)
				throw signal
			},
			{ timeout: 60_000, maxWait: 30_000 },
		)
	} catch (error) {
		const message = error instanceof Error ? error.message : ''
		if (error === signal || error instanceof RollbackSignal || message === ROLLBACK_MESSAGE) return
		throw error
	}
}

export interface LoggedInUser {
	user: User
	/** Value of the `mc_session` cookie, to send along with later requests. */
	sessionToken: string
}

/** Seed a logged-in user (equivalent to pytest's `logged_in` fixture). */
export async function seedLoggedInUser(db: Db, overrides: Partial<OAuthProfile> = {}): Promise<LoggedInUser> {
	const user = await upsertUserFromProfile(db, {
		provider: 'google',
		subject: 'subject-1',
		email: 'nguoidung@example.com',
		displayName: 'Người chơi Thử Nghiệm',
		avatarUrl: 'https://example.com/a.png',
		...overrides,
	})
	const { token } = await createSessionToken(config, user.id, user.sessionEpoch)
	return { user, sessionToken: token }
}

/** `Cookie` header to send along with a user's session. */
export function sessionCookies(sessionToken: string): Record<string, string> {
	return { [config.cookieName]: sessionToken }
}

// ── Reading cookies from a response ──────────────────────────────────────────

interface HasHeaders {
	headers: Record<string, unknown>
}

function setCookieHeaders(response: HasHeaders): string[] {
	const raw = response.headers['set-cookie']
	if (Array.isArray(raw)) return raw.map((value) => String(value))
	return typeof raw === 'string' ? [raw] : []
}

export function findSetCookie(response: HasHeaders, name: string): string | null {
	for (const header of setCookieHeaders(response)) {
		const [pair = ''] = header.split(';')
		const separator = pair.indexOf('=')
		if (separator < 0) continue
		if (pair.slice(0, separator).trim() === name) return header
	}
	return null
}

export function cookieValue(response: HasHeaders, name: string): string | null {
	const header = findSetCookie(response, name)
	if (header === null) return null
	const [pair = ''] = header.split(';')
	return pair.slice(pair.indexOf('=') + 1).trim()
}

/** Read the `state` the `/login` endpoint just stored in the anti-forgery cookie. */
export function stateCookieValue(response: HasHeaders): string {
	const value = cookieValue(response, 'mc_oauth_state')
	if (value === null) throw new Error('The response did not set the mc_oauth_state cookie')
	return value
}

/** Read the `state` from the redirect URL pointing at the provider. */
export function stateFromRedirect(location: string): string {
	const state = new URL(location).searchParams.get('state')
	if (!state) throw new Error(`The redirect URL is missing the state parameter: ${location}`)
	return state
}
