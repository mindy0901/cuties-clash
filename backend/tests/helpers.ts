/**
 * Fixture dùng chung: Prisma client thật + harness rollback, không đụng dữ liệu thật.
 *
 * ⚠️ Database là Postgres dev thật (DATABASE_URL trong `.env` của repo). Vì vậy
 * **mọi** test chạm database đều chạy trong một transaction và luôn kết thúc bằng
 * rollback — không có gì được ghi lại, kể cả khi test thất bại.
 */

import { PrismaClient, type User } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildConfig, readEnvFiles, type Config, type EnvLike } from '../src/config'
import type { Db } from '../src/db'
import type { OAuthProfile } from '../src/oauth'
import { createSessionToken } from '../src/security'
import { upsertUserFromProfile } from '../src/services'

/** Khoá ký phiên cho test — không phải giá trị của bất kỳ môi trường thật nào. */
export const TEST_JWT_SECRET = 'secret-dung-cho-test-dai-it-nhat-32-byte-de-khong-canh-bao'

export const TEST_FRONTEND_URL = 'http://localhost:5190'

/** Biến môi trường test, đặt sau `process.env` nên luôn thắng (giống conftest.py). */
export const TEST_ENV: EnvLike = {
	JWT_SECRET: TEST_JWT_SECRET,
	GOOGLE_CLIENT_ID: 'google-client-id-test',
	GOOGLE_CLIENT_SECRET: 'google-client-secret-test',
	FRONTEND_URL: TEST_FRONTEND_URL,
	// Test không được chạy DDL lên database thật của người dùng.
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
		`Test cần database Postgres thật, nhưng DATABASE_URL là "${config.databaseUrl}". ` +
			'Hãy kiểm tra file .env ở gốc repo.',
	)
}

/** Client ngoài transaction — chỉ dùng để kiểm tra "không có gì được ghi lại". */
export const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl })

export async function disconnectTestPrisma(): Promise<void> {
	await prisma.$disconnect()
}

/** Chặn mọi lời gọi mạng thật: test phải stub `fetch` khi cần gọi nhà cung cấp. */
export const guardFetch = (): never => {
	throw new Error('Test không được gọi mạng thật. Hãy stub `fetch` cho lời gọi này.')
}

const ROLLBACK_MESSAGE = 'rollback-transaction-cua-test'
class RollbackSignal extends Error {}

export interface TestContext {
	app: FastifyInstance
	db: Db
}

export interface ScanOptions {
	/** Cấu hình khác cho lần chạy này (ví dụ: chưa có khoá Google). */
	config?: Config
}

/** Chạy `run` trong một transaction rồi rollback; mở luôn app Fastify nếu cần. */
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

/** Chạy `run` trong một transaction rồi rollback (không dựng HTTP server). */
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
	/** Giá trị cookie `mc_session` để gửi kèm các request sau. */
	sessionToken: string
}

/** Tạo sẵn một người dùng đã đăng nhập (tương đương fixture `logged_in` của pytest). */
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

/** Header `Cookie` để gửi kèm phiên của một người dùng. */
export function sessionCookies(sessionToken: string): Record<string, string> {
	return { [config.cookieName]: sessionToken }
}

// ── Đọc cookie từ phản hồi ───────────────────────────────────────────────────

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

/** Lấy `state` mà endpoint `/login` vừa đặt vào cookie chống giả mạo. */
export function stateCookieValue(response: HasHeaders): string {
	const value = cookieValue(response, 'mc_oauth_state')
	if (value === null) throw new Error('Phản hồi không đặt cookie mc_oauth_state')
	return value
}

/** Đọc `state` trên URL chuyển hướng tới nhà cung cấp. */
export function stateFromRedirect(location: string): string {
	const state = new URL(location).searchParams.get('state')
	if (!state) throw new Error(`URL chuyển hướng thiếu tham số state: ${location}`)
	return state
}
