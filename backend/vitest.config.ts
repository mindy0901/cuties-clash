import { defineConfig } from 'vitest/config'

/**
 * Test chạy tuần tự (`fileParallelism: false`) vì mọi test dùng **chung một database
 * thật** (Postgres dev) và mỗi test nằm trong một transaction riêng. Chạy song song
 * thì hai transaction cùng chèn một email sẽ chờ khoá của nhau → dễ deadlock.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
