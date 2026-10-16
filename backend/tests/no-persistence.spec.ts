/**
 * Chứng minh transaction rollback thật sự có tác dụng.
 *
 * Test này CỐ TÌNH không dùng transaction: nó đọc database thật bằng client thường,
 * nên chỉ thấy dữ liệu đã commit. Nếu một test nào đó quên rollback, các email dưới
 * đây sẽ còn lại và test này đỏ.
 */

import { describe, expect, it } from 'vitest'
import { prisma } from './helpers'

/** Mọi email mà bộ test tạo ra. */
const TEST_EMAILS = [
	'nguoidung@example.com',
	'nguoidung2@example.com',
	'ai-do@example.com',
	'laplai@example.com',
	'chung@example.com',
	'thieu-sub@example.com',
	'giuten@example.com',
]

describe('không ghi gì vào database thật', () => {
	it('không còn người dùng test nào sau khi chạy', async () => {
		const users = await prisma.user.findMany({
			where: { email: { in: TEST_EMAILS } },
			select: { id: true, email: true },
		})
		expect(users).toEqual([])
	})

	it('không còn bản lưu test nào sau khi chạy', async () => {
		const saves = await prisma.gameSave.count({ where: { user: { email: { in: TEST_EMAILS } } } })
		expect(saves).toBe(0)
	})

	it('không còn liên kết OAuth test nào sau khi chạy', async () => {
		const identities = await prisma.oAuthIdentity.count({ where: { email: { in: TEST_EMAILS } } })
		expect(identities).toBe(0)
	})
})
