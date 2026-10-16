/**
 * Áp migration Prisma, tự xử lý trường hợp database **đã có bảng nhưng Prisma chưa biết**.
 *
 * ⚠️ Vì sao cần script này: database dev/production hiện tại được tạo bởi **Alembic**, nên
 * `prisma migrate deploy` trần sẽ chết với **P3005 "The database schema is not empty"** —
 * Prisma từ chối áp migration `0_init` lên một schema không rỗng khi chưa có lịch sử.
 *
 * Ba tình huống, xử lý hết:
 * 1. DB rỗng → `migrate deploy` tạo mọi thứ.
 * 2. DB đã có bảng, chưa có `_prisma_migrations` → đánh dấu baseline `0_init` **đã áp dụng**
 *    (không chạy lại DDL) rồi mới `deploy`.
 * 3. DB đã có `_prisma_migrations` → `deploy` như bình thường.
 *
 * Nhờ vậy không phải "baseline bằng tay" và cũng không phải xoá database của ai.
 */
import { spawnSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const BASELINE_MIGRATION = '0_init'

const prisma = new PrismaClient()

/** `::text` để Prisma không phải ánh xạ kiểu `regclass` (không có kiểu tương ứng). */
async function relationExists(name) {
	const rows = await prisma.$queryRaw`SELECT to_regclass(${name})::text AS name`
	return rows[0]?.name != null
}

function prismaCli(args) {
	const result = spawnSync('pnpm', ['exec', 'prisma', ...args], { stdio: 'inherit' })
	if (result.status !== 0) process.exit(result.status ?? 1)
}

const hasAppTables = await relationExists('public.users')
const hasHistory = await relationExists('public._prisma_migrations')
await prisma.$disconnect()

if (hasAppTables && !hasHistory) {
	console.log(`→ Database đã có bảng nhưng chưa có lịch sử Prisma: đánh dấu ${BASELINE_MIGRATION} là đã áp dụng.`)
	prismaCli(['migrate', 'resolve', '--applied', BASELINE_MIGRATION])
}

prismaCli(['migrate', 'deploy'])
