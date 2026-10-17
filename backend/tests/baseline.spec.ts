/** The startup baseline that creates tables: it must run and it must be idempotent. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BASELINE_SQL_PATH, ensureTables, splitSqlStatements } from '../src/baseline'
import { buildConfig } from '../src/config'
import { TEST_JWT_SECRET, testEnv, withDb } from './helpers'

describe('splitSqlStatements', () => {
	it('splits on ; outside strings and outside comments', () => {
		const statements = splitSqlStatements("SELECT ';' AS a; -- comment ;\nSELECT 2")
		expect(statements).toHaveLength(2)
		expect(statements[0]).toContain("SELECT ';' AS a")
		// A ; inside a comment does not split the statement; the comment travels with the
		// following statement.
		expect(statements[1]).toContain('-- comment ;')
		expect(statements[1]).toContain('SELECT 2')
	})

	it('keeps $$ … $$ blocks intact (a ; inside does not split)', () => {
		const statements = splitSqlStatements('DO $$\nBEGIN\n  SELECT 1;\nEND $$;')
		expect(statements).toHaveLength(1)
		expect(statements[0]).toBe('DO $$\nBEGIN\n  SELECT 1;\nEND $$')
	})

	it('splits the 0_init migration file correctly', () => {
		const statements = splitSqlStatements(readFileSync(BASELINE_SQL_PATH, 'utf8'))
		// The comment block at the top of the file travels with the first statement, so to
		// count by statement kind the comment lines must be skipped.
		const leading = (statement: string): string => {
			for (const line of statement.split('\n')) {
				const trimmed = line.trim()
				if (!trimmed || trimmed.startsWith('--')) continue
				return trimmed
			}
			return ''
		}
		const kinds = statements.map(leading)
		// 1 schema + 3 tables + 3 unique indexes + 2 indexes + 2 foreign keys
		expect(statements).toHaveLength(11)
		expect(kinds.filter((kind) => kind.startsWith('CREATE SCHEMA IF NOT EXISTS'))).toHaveLength(1)
		expect(kinds.filter((kind) => kind.startsWith('CREATE TABLE IF NOT EXISTS'))).toHaveLength(3)
		expect(kinds.filter((kind) => kind.startsWith('CREATE UNIQUE INDEX IF NOT EXISTS'))).toHaveLength(3)
		expect(kinds.filter((kind) => kind.startsWith('CREATE INDEX IF NOT EXISTS'))).toHaveLength(2)
		const doBlocks = statements.filter((statement) => leading(statement).startsWith('DO $$'))
		expect(doBlocks).toHaveLength(2)
		for (const block of doBlocks) expect(block).toContain('END $$')
	})
})

describe('ensureTables', () => {
	it('runs against the existing database and is idempotent (runs twice)', async () => {
		const autoCreate = buildConfig(testEnv({ AUTO_CREATE_TABLES: 'true', JWT_SECRET: TEST_JWT_SECRET }))
		expect(autoCreate.autoCreateTables).toBe(true)

		// All the DDL lives inside the test transaction and is always rolled back: the
		// tables/indexes/foreign keys already exist so the statements are no-ops, and anything
		// newly created would not be kept anyway.
		await withDb(async (db) => {
			await ensureTables(db, autoCreate)
			await ensureTables(db, autoCreate)
		})
	})

	it('does nothing when AUTO_CREATE_TABLES=false', async () => {
		const disabled = buildConfig(testEnv({ AUTO_CREATE_TABLES: 'false' }))
		await withDb(async (db) => {
			await ensureTables(db, disabled)
		})
	})
})
