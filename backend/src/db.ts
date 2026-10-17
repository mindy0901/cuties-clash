/**
 * Shared database access type.
 *
 * `Prisma.TransactionClient` covers both the real `PrismaClient` and a transaction client,
 * so `buildApp()` accepts either one: real runs pass the normal client, tests pass a
 * transaction client and then roll back.
 */

import type { Prisma } from '@prisma/client'

export type Db = Prisma.TransactionClient
