/**
 * `AUTO_CREATE_TABLES=true` → tạo bảng còn thiếu lúc khởi động.
 *
 * Dùng đúng file migration `0_init` (đã viết lại thành idempotent: `CREATE TABLE IF
 * NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`), nhờ vậy database dev đã có bảng từ
 * Alembic vẫn chạy nguyên vẹn — mọi câu lệnh đều là no-op.
 *
 * Không dùng `prisma migrate deploy` ở đây: như thế sẽ ghi vào `_prisma_migrations`
 * và coi database của người dùng là do Prisma quản lý.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BACKEND_DIR, type Config } from './config'
import type { Db } from './db'

export const BASELINE_SQL_PATH = join(BACKEND_DIR, 'prisma', 'migrations', '0_init', 'migration.sql')

/**
 * Tách file SQL thành từng câu lệnh.
 *
 * `$executeRawUnsafe` chỉ chạy được một câu lệnh mỗi lần, nên phải cắt ở dấu `;`
 * ngoài chuỗi, ngoài chú thích `--` và ngoài khối `$$ … $$`.
 */
export function splitSqlStatements(sql: string): string[] {
	const statements: string[] = []
	let current = ''
	let index = 0
	let dollarTag: string | null = null
	let inSingleQuote = false
	let inLineComment = false

	while (index < sql.length) {
		const char = sql[index]!
		const next = sql[index + 1]

		if (inLineComment) {
			if (char === '\n') inLineComment = false
			current += char
			index += 1
			continue
		}

		if (dollarTag !== null) {
			if (char === '$' && sql.startsWith(dollarTag, index)) {
				current += dollarTag
				index += dollarTag.length
				dollarTag = null
				continue
			}
			current += char
			index += 1
			continue
		}

		if (inSingleQuote) {
			current += char
			// Hai dấu nháy liền nhau là một dấu nháy được escape.
			if (char === "'" && next === "'") {
				current += next
				index += 2
				continue
			}
			if (char === "'") inSingleQuote = false
			index += 1
			continue
		}

		if (char === '-' && next === '-') {
			inLineComment = true
			current += char
			index += 1
			continue
		}
		if (char === "'") {
			inSingleQuote = true
			current += char
			index += 1
			continue
		}
		if (char === '$') {
			const match = /^\$[A-Za-z_]*\$/.exec(sql.slice(index))
			if (match) {
				dollarTag = match[0]
				current += dollarTag
				index += dollarTag.length
				continue
			}
		}
		if (char === ';') {
			statements.push(current)
			current = ''
			index += 1
			continue
		}

		current += char
		index += 1
	}

	statements.push(current)
	return statements.map((statement) => statement.trim()).filter((statement) => statement.length > 0)
}

function readBaselineSql(): string {
	return readFileSync(BASELINE_SQL_PATH, 'utf8')
}

/** Chạy baseline idempotent. `db` nhận cả `PrismaClient` lẫn client transaction. */
export async function ensureTables(db: Db, config: Config): Promise<void> {
	if (!config.autoCreateTables) return
	for (const statement of splitSqlStatements(readBaselineSql())) {
		await db.$executeRawUnsafe(statement)
	}
}
