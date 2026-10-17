/**
 * Apply Prisma migrations, handling the case where the database **already has tables but
 * Prisma does not know about them**.
 *
 * ⚠️ Why this script is needed: the current dev/production database was created by **Alembic**,
 * so a bare `prisma migrate deploy` dies with **P3005 "The database schema is not empty"** —
 * Prisma refuses to apply migration `0_init` to a non-empty schema when there is no history.
 *
 * Three situations, all handled:
 * 1. Empty DB → `migrate deploy` creates everything.
 * 2. DB already has tables but no `_prisma_migrations` → mark baseline `0_init` as **already
 *    applied** (without re-running the DDL), then `deploy`.
 * 3. DB already has `_prisma_migrations` → plain `deploy`.
 *
 * That way nobody has to "baseline by hand" and nobody has to drop anyone's database.
 */
import { spawnSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const BASELINE_MIGRATION = '0_init'

const prisma = new PrismaClient()

/** `::text` so Prisma does not have to map the `regclass` type (which has no equivalent). */
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
	console.log(`→ The database already has tables but no Prisma history: marking ${BASELINE_MIGRATION} as applied.`)
	prismaCli(['migrate', 'resolve', '--applied', BASELINE_MIGRATION])
}

prismaCli(['migrate', 'deploy'])
