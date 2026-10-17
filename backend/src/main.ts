/** Start the API: connect to the database, create missing tables, then listen on port 8000. */

import { PrismaClient } from '@prisma/client'
import { buildApp } from './app'
import { ensureTables } from './baseline'
import { loadConfig } from './config'

const API_PORT = 8000

// `loadConfig` throws immediately if JWT_SECRET is weak — stop before opening the port.
const config = loadConfig()

const prisma = new PrismaClient({
	datasourceUrl: config.databaseUrl,
	log: config.sqlEcho ? ['query', 'warn', 'error'] : ['error', 'warn'],
})

async function main(): Promise<void> {
	await prisma.$connect()
	await ensureTables(prisma, config)

	const app = await buildApp({
		config,
		db: prisma,
		logger: { level: config.debug ? 'debug' : 'info' },
	})

	await app.listen({ host: '0.0.0.0', port: API_PORT })
	app.log.info(`${config.appName} listening at http://0.0.0.0:${API_PORT}`)

	const shutdown = async (signal: string): Promise<void> => {
		app.log.info(`Received ${signal}, shutting down…`)
		await app.close()
		await prisma.$disconnect()
		process.exit(0)
	}
	process.on('SIGINT', () => void shutdown('SIGINT'))
	process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch(async (error: unknown) => {
	console.error('Could not start the API:', error)
	await prisma.$disconnect()
	process.exit(1)
})
