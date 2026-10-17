/** Nghiệp vụ: liên kết tài khoản OAuth và đọc/ghi tiến trình chơi. */

import type { User } from '@prisma/client'
import { isAdminEmail, type Config } from './config'
import type { Db } from './db'
import { badRequest } from './errors'
import type { OAuthProfile } from './oauth'

/** Kích thước tối đa của một bản lưu (JSON đã mã hoá), tránh payload phình to. */
export const MAX_SAVE_BYTES = 200_000

export const DEFAULT_DISPLAY_NAME = 'Người chơi ẩn danh'
/** Tên do hệ thống đặt — bị thay khi có tên thật từ nhà cung cấp. */
const PLACEHOLDER_DISPLAY_NAME_PREFIX = 'Người chơi'

export interface UserOut {
	id: number
	display_name: string
	email: string | null
	avatar_url: string | null
	/** Nhà cung cấp đã liên kết với tài khoản này, ví dụ `["google"]`. */
	providers: string[]
	/** Email có trong `ADMIN_EMAILS` → hiện được trang quản trị nội dung. */
	is_admin: boolean
}

export interface SaveOut {
	run: Record<string, unknown> | null
	revision: number
	updated_at: string | null
}

export async function providerKeys(db: Db, userId: number): Promise<string[]> {
	const rows = await db.oAuthIdentity.findMany({
		where: { userId },
		select: { provider: true },
		orderBy: { id: 'asc' },
	})
	return rows.map((row) => row.provider)
}

export async function toUserOut(db: Db, user: User, config: Config): Promise<UserOut> {
	return {
		id: user.id,
		display_name: user.displayName,
		email: user.email,
		avatar_url: user.avatarUrl,
		providers: await providerKeys(db, user.id),
		is_admin: isAdminEmail(config, user.email),
	}
}

/**
 * Tìm hoặc tạo người dùng từ hồ sơ OAuth.
 *
 * Ưu tiên khớp theo `(provider, subject)`. Nếu chưa có, khớp tiếp theo email đã xác
 * thực để một người dùng không bị tách thành hai tài khoản.
 */
export async function upsertUserFromProfile(db: Db, profile: OAuthProfile): Promise<User> {
	const identity = await db.oAuthIdentity.findFirst({
		where: { provider: profile.provider, subject: profile.subject },
		include: { user: true },
	})

	let user: User
	if (identity) {
		user = identity.user
	} else {
		// `created_at` / `last_login_at` không có default ở tầng database (giống Alembic)
		// nên phải gửi tường minh.
		const now = new Date()
		user =
			(profile.email ? await db.user.findFirst({ where: { email: profile.email } }) : null) ??
			(await db.user.create({
				data: {
					email: profile.email ?? null,
					displayName: profile.displayName,
					sessionEpoch: 0,
					createdAt: now,
					lastLoginAt: now,
				},
			}))
		await db.oAuthIdentity.create({
			data: {
				userId: user.id,
				provider: profile.provider,
				subject: profile.subject,
				email: profile.email ?? null,
				createdAt: now,
			},
		})
	}

	const data: { avatarUrl?: string; displayName?: string; email?: string; lastLoginAt: Date } = {
		lastLoginAt: new Date(),
	}
	if (profile.avatarUrl) data.avatarUrl = profile.avatarUrl
	if (profile.displayName && (!user.displayName || user.displayName.startsWith(PLACEHOLDER_DISPLAY_NAME_PREFIX))) {
		data.displayName = profile.displayName
	}
	if (profile.email && !user.email) data.email = profile.email

	return db.user.update({ where: { id: user.id }, data })
}

export async function getSave(db: Db, userId: number): Promise<SaveOut> {
	const save = await db.gameSave.findUnique({ where: { userId } })
	if (!save) return { run: null, revision: 0, updated_at: null }
	return {
		run: loadPayload(save.payload),
		revision: save.revision,
		updated_at: save.updatedAt.toISOString(),
	}
}

export async function putSave(
	db: Db,
	userId: number,
	run: Record<string, unknown>,
	revision: number | null,
): Promise<SaveOut> {
	const encoded = JSON.stringify(run)
	if (Buffer.byteLength(encoded, 'utf8') > MAX_SAVE_BYTES) {
		throw badRequest('Bản lưu quá lớn để đồng bộ.', 'save_too_large')
	}

	const save = await db.gameSave.findUnique({ where: { userId } })
	if (!save) {
		const created = await db.gameSave.create({
			data: { userId, payload: encoded, revision: 1, updatedAt: new Date() },
		})
		return { run, revision: created.revision, updated_at: created.updatedAt.toISOString() }
	}

	// Ghi đè có kiểm soát: client gửi revision đã biết, lệch nghĩa là có thiết bị khác vừa lưu.
	if (revision !== null && revision !== save.revision) {
		throw badRequest(
			'Bản lưu trên máy chủ đã thay đổi ở thiết bị khác. Hãy tải lại trước khi ghi đè.',
			'revision_conflict',
		)
	}

	const updated = await db.gameSave.update({
		where: { userId },
		data: { payload: encoded, revision: save.revision + 1, updatedAt: new Date() },
	})
	return { run, revision: updated.revision, updated_at: updated.updatedAt.toISOString() }
}

/** Bản lưu cũ có thể hỏng hoặc không phải object — khi đó coi như chưa có gì. */
function loadPayload(payload: string): Record<string, unknown> | null {
	let value: unknown
	try {
		value = JSON.parse(payload)
	} catch {
		return null
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
	return value as Record<string, unknown>
}
