/**
 * Chạy trước mỗi file test: khoá mạng thật và đóng Prisma client sau khi xong.
 */

import { afterAll, vi } from 'vitest'
import { disconnectTestPrisma, guardFetch } from './helpers'

// Bất kỳ test nào vô tình gọi ra Internet sẽ đỏ ngay thay vì gọi mạng thật.
vi.stubGlobal('fetch', guardFetch)

afterAll(async () => {
	await disconnectTestPrisma()
})
