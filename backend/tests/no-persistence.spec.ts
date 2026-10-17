/**
 * Proves that the transaction rollback actually works.
 *
 * This test deliberately does NOT use a transaction: it reads the real database with a normal
 * client, so it only sees committed data. If some test forgets to roll back, the emails below
 * would remain and this test would fail.
 */

import { describe, expect, it } from 'vitest'
import { prisma } from './helpers'

/** Every email the test suite creates. */
const TEST_EMAILS = [
	'nguoidung@example.com',
	'nguoidung2@example.com',
	'ai-do@example.com',
	'laplai@example.com',
	'chung@example.com',
	'thieu-sub@example.com',
	'giuten@example.com',
]

describe('nothing is written to the real database', () => {
	it('no test users remain after the run', async () => {
		const users = await prisma.user.findMany({
			where: { email: { in: TEST_EMAILS } },
			select: { id: true, email: true },
		})
		expect(users).toEqual([])
	})

	it('no test saves remain after the run', async () => {
		const saves = await prisma.gameSave.count({ where: { user: { email: { in: TEST_EMAILS } } } })
		expect(saves).toBe(0)
	})

	it('no test OAuth identities remain after the run', async () => {
		const identities = await prisma.oAuthIdentity.count({ where: { email: { in: TEST_EMAILS } } })
		expect(identities).toBe(0)
	})
})
