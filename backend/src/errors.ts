/** The single API error type; its messages are shown to the player in Vietnamese. */

export class ApiError extends Error {
	readonly statusCode: number
	readonly code: string

	constructor(statusCode: number, code: string, message: string) {
		super(message)
		this.name = 'ApiError'
		this.statusCode = statusCode
		this.code = code
	}
}

export function badRequest(message: string, code = 'bad_request'): ApiError {
	return new ApiError(400, code, message)
}

export function unauthorized(message = 'Bạn cần đăng nhập để dùng chức năng này.'): ApiError {
	return new ApiError(401, 'unauthorized', message)
}

export function forbidden(message = 'Tài khoản này không có quyền quản trị.'): ApiError {
	return new ApiError(403, 'forbidden', message)
}

export function notConfigured(provider: string): ApiError {
	return new ApiError(
		503,
		'provider_not_configured',
		`Chưa cấu hình đăng nhập bằng ${provider}. Hãy điền client id/secret vào file .env.`,
	)
}

export function notFound(message = 'Không có API này.'): ApiError {
	return new ApiError(404, 'not_found', message)
}
