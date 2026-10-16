/**
 * Kiểu truy cập database dùng chung.
 *
 * `Prisma.TransactionClient` bao trùm cả `PrismaClient` thật lẫn client của một
 * transaction, nên `buildApp()` nhận được cả hai: chạy thật truyền client thường,
 * test truyền client transaction rồi rollback.
 */

import type { Prisma } from '@prisma/client'

export type Db = Prisma.TransactionClient
