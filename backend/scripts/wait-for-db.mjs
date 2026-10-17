/**
 * Wait for PostgreSQL to be ready before running the migrations.
 *
 * Uses the Prisma client instead of adding `pg_isready` so nothing extra has to be installed,
 * and because this is the very client the app will use — check the right thing with the right
 * tool.
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
		console.log('→ The database is ready.')
		await prisma.$disconnect()
		process.exit(0)
	} catch (error) {
		lastError = error
		await new Promise((done) => setTimeout(done, RETRY_MS))
	}
}

await prisma.$disconnect()
console.error(`!! Could not connect to the database after ${TIMEOUT_MS / 1000} seconds:`, lastError)
process.exit(1)
