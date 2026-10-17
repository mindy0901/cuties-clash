/**
 * Runs before every test file: blocks real network access and closes the Prisma client at the end.
 */

import { afterAll, vi } from 'vitest'
import { disconnectTestPrisma, guardFetch } from './helpers'

// Any test that accidentally calls out to the Internet fails immediately instead of using the network.
vi.stubGlobal('fetch', guardFetch)

afterAll(async () => {
	await disconnectTestPrisma()
})
