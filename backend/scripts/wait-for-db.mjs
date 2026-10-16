/**
 * Chờ PostgreSQL sẵn sàng trước khi chạy migration.
 *
 * Dùng Prisma client thay vì thêm `pg_isready` để không phải cài thêm gì, và vì đây chính
 * là client mà app sẽ dùng — kiểm tra đúng thứ cần đúng.
 */
import { PrismaClient } from '@prisma/client'

const TIMEOUT_MS = 60_000
const RETRY_MS = 2_000

const prisma = new PrismaClient()

const deadline = Date.now() + TIMEOUT_MS
let lastError

while (Date.now() < deadline) {
	try {
		await prisma.$queryRaw`SELECT 1`
		console.log('→ Cơ sở dữ liệu đã sẵn sàng.')
		await prisma.$disconnect()
		process.exit(0)
	} catch (error) {
		lastError = error
		await new Promise((done) => setTimeout(done, RETRY_MS))
	}
}

await prisma.$disconnect()
console.error(`!! Không kết nối được cơ sở dữ liệu sau ${TIMEOUT_MS / 1000} giây:`, lastError)
process.exit(1)
