import { defineConfig } from 'vitest/config'

/**
 * Tests run sequentially (`fileParallelism: false`) because every test shares **one real
 * database** (the dev Postgres) and each test sits in its own transaction. Running them in
 * parallel would make two transactions inserting the same email wait on each other's lock →
 * deadlock is easy.
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
