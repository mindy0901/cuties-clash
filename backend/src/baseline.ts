/**
 * `AUTO_CREATE_TABLES=true` → create missing tables at startup.
 *
 * Runs the migration files themselves, all written idempotent (`CREATE TABLE IF NOT EXISTS`,
 * `CREATE INDEX IF NOT EXISTS`), so a database that already has the tables from Alembic is left
 * untouched — every statement is a no-op.
 *
 * ⚠️ Runs **every** migration in directory-name order, not just `0_init`: a new table (for
 * example `content_overrides`) has to appear in dev environments without anyone remembering to
 * run `prisma migrate deploy`.
 *
 * `prisma migrate deploy` is deliberately not used here: it would write to `_prisma_migrations`
 * and claim the user's database as Prisma-managed.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BACKEND_DIR, type Config } from './config'
import type { Db } from './db'

export const MIGRATIONS_DIR = join(BACKEND_DIR, 'prisma', 'migrations')

export const BASELINE_SQL_PATH = join(MIGRATIONS_DIR, '0_init', 'migration.sql')

/** Every migration file, ordered by directory name (`0_init` → `1_…` → …). */
export function migrationSqlPaths(): string[] {
	return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(MIGRATIONS_DIR, entry.name, 'migration.sql'))
		.sort()
}

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

/**
 * Run every idempotent migration in order. `db` accepts both a `PrismaClient` and a
 * transaction client.
 */
export async function ensureTables(db: Db, config: Config): Promise<void> {
	if (!config.autoCreateTables) return
	for (const path of migrationSqlPaths()) {
		for (const statement of splitSqlStatements(readFileSync(path, 'utf8'))) {
			await db.$executeRawUnsafe(statement)
		}
	}
}
