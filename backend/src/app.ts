/** Điểm vào của API Martial Cutie. */

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
	/** Client Prisma thật, hoặc client của một transaction (test truyền vào để rollback). */
	db: Db
	logger?: FastifyServerOptions['logger']
}

/** Trần kích thước body — bản lưu bị chặn ở 200 000 byte nên đây là mức rộng rãi. */
const BODY_LIMIT_BYTES = 4 * 1024 * 1024

const API_NOT_FOUND = { error: 'not_found', message: 'Không có API này.' } as const
const VALIDATION_MESSAGE = 'Dữ liệu gửi lên không hợp lệ.'
const INTERNAL_MESSAGE = 'Máy chủ gặp lỗi. Hãy thử lại sau.'
const UNSUPPORTED_MEDIA_MESSAGE = 'Định dạng dữ liệu gửi lên không được hỗ trợ.'

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
	const { config, db, logger = false } = options

	const app = Fastify({
		logger,
		// Không ép kiểu: `revision: null` phải giữ nguyên là `null`, không thành `0`.
		ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
		bodyLimit: BODY_LIMIT_BYTES,
		// Chạy sau nginx/proxy: đọc X-Forwarded-* (tương đương --proxy-headers).
		trustProxy: true,
	})

	await app.register(fastifyCookie)

	// Frontend gắn `Content-Type: application/json` cho MỌI lời gọi, kể cả POST không
	// có body (`/api/auth/logout`). Fastify coi "content-type JSON + body rỗng" là lỗi
	// 400, còn Starlette/FastAPI thì không parse khi không có body. Gỡ header content-type
	// khi request thật sự không có body để hai bên hành xử giống nhau — và vẫn giữ
	// parser JSON an toàn của Fastify cho các body thật.
	app.addHook('onRequest', (request, _reply, done) => {
		const { 'content-length': contentLength, 'transfer-encoding': transferEncoding } = request.headers
		const hasNoBody = transferEncoding === undefined && (contentLength === undefined || contentLength === '0')
		if (hasNoBody && request.headers['content-type'] !== undefined) {
			delete request.headers['content-type']
		}
		done()
	})

	if (config.corsOrigins.length > 0) {
		// Cookie phiên là httpOnly và dev chạy ở origin Vite nên phải cho gửi kèm.
		await app.register(fastifyCors, { origin: [...config.corsOrigins], credentials: true })
	}

	app.setErrorHandler<FastifyError>((error, request, reply) => {
		if (error instanceof ApiError) {
			return sendError(reply, error.statusCode, error.code, error.message)
		}

		const code = typeof error.code === 'string' ? error.code : ''
		const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500

		if (error.validation) {
			// Khớp mã 422 của FastAPI/pydantic khi body sai kiểu.
			return sendError(reply, 422, 'validation_error', VALIDATION_MESSAGE)
		}
		if (code === 'FST_ERR_CTP_INVALID_JSON_BODY' || code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
			return sendError(reply, 422, 'validation_error', VALIDATION_MESSAGE)
		}
		if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
			// Bản lưu lớn hơn trần body vẫn phải báo đúng mã lỗi của hợp đồng.
			return sendError(reply, 400, 'save_too_large', 'Bản lưu quá lớn để đồng bộ.')
		}
		if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
			return sendError(reply, 415, 'unsupported_media_type', UNSUPPORTED_MEDIA_MESSAGE)
		}
		if (statusCode >= 400 && statusCode < 500) {
			return sendError(reply, statusCode, 'bad_request', 'Yêu cầu không hợp lệ.')
		}

		// Log lỗi mà không lộ token/khoá: Fastify chỉ in thông điệp và stack.
		request.log.error({ err: error }, 'Lỗi khi xử lý yêu cầu')
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
 * Phục vụ bản build của Vite nếu có sẵn thư mục dist.
 *
 * Kiến trúc chuẩn tách rời hai image: frontend do nginx phục vụ (frontend/Dockerfile),
 * backend chỉ chạy API. Hàm này giữ lại cho tình huống chạy một tiến trình duy nhất
 * (ví dụ `pnpm build` ở frontend rồi chạy backend trên máy) — khi đó không có nginx.
 * Khi dev, frontend chạy ở Vite (5190) nên thư mục này không tồn tại và bỏ qua.
 *
 * @returns nội dung `index.html` để phục vụ mọi đường dẫn không phải tệp thật.
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

	// `assets/` và mọi tệp thật được @fastify/static phục vụ; đường dẫn không khớp
	// tệp nào rơi xuống notFoundHandler phía trên.
	await app.register(fastifyStatic, { root: dist, index: ['index.html'] })
	return indexHtml
}

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
	return reply.code(statusCode).header('X-Error-Code', code).send({ error: code, message })
}
