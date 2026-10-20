/** Entry point of the Martial Cutie API. */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import Fastify, {
	type FastifyError,
	type FastifyInstance,
	type FastifyReply,
	type FastifyServerOptions,
} from 'fastify'
import type { Config } from './config'
import type { Db } from './db'
import { ApiError } from './errors'
import { availableProviders } from './oauth'
import { authRoutes } from './routes/auth'
import { contentRoutes } from './routes/content'
import { saveRoutes } from './routes/saves'

export interface BuildAppOptions {
	config: Config
	/** The real Prisma client, or a transaction client (tests pass one in so it can roll back). */
	db: Db
	logger?: FastifyServerOptions['logger']
}

/**
 * Body size ceiling. Saves are capped at 200 000 bytes (`services.ts`), but the **admin art upload** sends
 * a finished Full-HD PNG — up to `ART_MAX_BYTES` (8 MB) — so the transport limit has to sit above it or a
 * large picture would die with `save_too_large` before the art check ever runs.
 */
const BODY_LIMIT_BYTES = 12 * 1024 * 1024

const API_NOT_FOUND = { error: 'not_found', message: 'Không có API này.' } as const
const VALIDATION_MESSAGE = 'Dữ liệu gửi lên không hợp lệ.'
const INTERNAL_MESSAGE = 'Máy chủ gặp lỗi. Hãy thử lại sau.'
const UNSUPPORTED_MEDIA_MESSAGE = 'Định dạng dữ liệu gửi lên không được hỗ trợ.'

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
	const { config, db, logger = false } = options

	const app = Fastify({
		logger,
		// No type coercion: `revision: null` must stay `null`, not become `0`.
		ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
		bodyLimit: BODY_LIMIT_BYTES,
		// Runs behind nginx/proxy: read X-Forwarded-* (equivalent to --proxy-headers).
		trustProxy: true,
	})

	await app.register(fastifyCookie)

	// The frontend sets `Content-Type: application/json` on EVERY call, including bodyless
	// POSTs (`/api/auth/logout`). Fastify treats "JSON content-type + empty body" as a
	// 400 error, while Starlette/FastAPI does not parse when there is no body. Drop the
	// content-type header when the request truly has no body so both sides behave the same —
	// while still keeping Fastify's safe JSON parser for real bodies.
	app.addHook('onRequest', (request, _reply, done) => {
		const { 'content-length': contentLength, 'transfer-encoding': transferEncoding } = request.headers
		const hasNoBody = transferEncoding === undefined && (contentLength === undefined || contentLength === '0')
		if (hasNoBody && request.headers['content-type'] !== undefined) {
			delete request.headers['content-type']
		}
		done()
	})

	if (config.corsOrigins.length > 0) {
		// The session cookie is httpOnly and dev runs on the Vite origin, so credentials must be sent.
		await app.register(fastifyCors, { origin: [...config.corsOrigins], credentials: true })
	}

	app.setErrorHandler<FastifyError>((error, request, reply) => {
		if (error instanceof ApiError) {
			return sendError(reply, error.statusCode, error.code, error.message)
		}

		const code = typeof error.code === 'string' ? error.code : ''
		const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500

		if (error.validation) {
			// Matches FastAPI/pydantic's 422 when the body has the wrong types.
			return sendError(reply, 422, 'validation_error', VALIDATION_MESSAGE)
		}
		if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
			return sendError(reply, 422, 'validation_error', VALIDATION_MESSAGE)
		}
		if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
			// A save larger than the body ceiling must still report the contract's error code.
			return sendError(reply, 400, 'save_too_large', 'Bản lưu quá lớn để đồng bộ.')
		}
		if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
			return sendError(reply, 415, 'unsupported_media_type', UNSUPPORTED_MEDIA_MESSAGE)
		}
		if (statusCode >= 400 && statusCode < 500) {
			return sendError(reply, statusCode, 'bad_request', 'Yêu cầu không hợp lệ.')
		}

		// Log the error without leaking tokens/keys: Fastify only prints the message and stack.
		request.log.error({ err: error }, 'Error while handling the request')
		return sendError(reply, 500, 'internal_error', INTERNAL_MESSAGE)
	})

	await app.register(authRoutes, { config, db })
	await app.register(saveRoutes, { config, db })
	await app.register(contentRoutes, { config, db })

	app.get('/api/health', async () => ({
		status: 'ok',
		environment: config.environment,
		providers: availableProviders(config),
	}))

	const spaIndexHtml = await mountFrontend(app, config)

	app.setNotFoundHandler((request, reply) => {
		if (isApiRequest(request.url) || !spaIndexHtml || request.method !== 'GET') {
			return sendError(reply, 404, 'not_found', API_NOT_FOUND.message)
		}
		return reply.type(INDEX_CONTENT_TYPE).send(spaIndexHtml)
	})

	return app
}

const INDEX_CONTENT_TYPE = 'text/html; charset=utf-8'

function isApiRequest(url: string): boolean {
	const path = url.split('?')[0] ?? ''
	return path === '/api' || path.startsWith('/api/')
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}

/**
 * Serve the Vite build when a dist directory is available.
 *
 * The standard architecture splits the two images: the frontend is served by nginx
 * (frontend/Dockerfile) and the backend only runs the API. This function is kept for the
 * single-process situation (for example: `pnpm build` in the frontend, then run the backend
 * on the machine) — there is no nginx then. In dev the frontend runs on Vite (5190), so this
 * directory does not exist and the whole thing is skipped.
 *
 * @returns the contents of `index.html`, used to serve every path that is not a real file.
 */
async function mountFrontend(app: FastifyInstance, config: Config): Promise<Buffer | null> {
	const dist = config.frontendDistDir
	if (!isDirectory(dist)) return null

	let indexHtml: Buffer
	try {
		indexHtml = readFileSync(join(dist, 'index.html'))
	} catch {
		return null
	}

	// `assets/` and every real file are served by @fastify/static; a path that matches no
	// file falls through to the notFoundHandler above.
	await app.register(fastifyStatic, { root: dist, index: ['index.html'] })
	return indexHtml
}

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
	return reply.code(statusCode).header('X-Error-Code', code).send({ error: code, message })
}
