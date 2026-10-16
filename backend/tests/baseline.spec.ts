/** Baseline tạo bảng lúc khởi động: phải chạy được và phải idempotent. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BASELINE_SQL_PATH, ensureTables, splitSqlStatements } from '../src/baseline'
import { buildConfig } from '../src/config'
import { TEST_JWT_SECRET, testEnv, withDb } from './helpers'

describe('splitSqlStatements', () => {
	it('cắt ở dấu ; ngoài chuỗi và ngoài chú thích', () => {
		const statements = splitSqlStatements("SELECT ';' AS a; -- chú thích ;\nSELECT 2")
		expect(statements).toHaveLength(2)
		expect(statements[0]).toContain("SELECT ';' AS a")
		// Dấu ; trong chú thích không cắt câu lệnh; chú thích đi kèm câu lệnh sau.
		expect(statements[1]).toContain('-- chú thích ;')
		expect(statements[1]).toContain('SELECT 2')
	})

	it('giữ nguyên khối $$ … $$ (dấu ; bên trong không bị cắt)', () => {
		const statements = splitSqlStatements('DO $$\nBEGIN\n  SELECT 1;\nEND $$;')
		expect(statements).toHaveLength(1)
		expect(statements[0]).toBe('DO $$\nBEGIN\n  SELECT 1;\nEND $$')
	})

	it('tách đúng file migration 0_init', () => {
		const statements = splitSqlStatements(readFileSync(BASELINE_SQL_PATH, 'utf8'))
		// Khối chú thích đầu file nằm chung với câu lệnh đầu tiên, nên muốn đếm theo
		// loại câu lệnh thì phải bỏ các dòng chú thích.
		const leading = (statement: string): string => {
			for (const line of statement.split('\n')) {
				const trimmed = line.trim()
				if (!trimmed || trimmed.startsWith('--')) continue
				return trimmed
			}
			return ''
		}
		const kinds = statements.map(leading)
		// 1 schema + 3 bảng + 3 unique index + 2 index + 2 khoá ngoại
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
	it('chạy được trên database hiện có và idempotent (chạy hai lần)', async () => {
		const autoCreate = buildConfig(testEnv({ AUTO_CREATE_TABLES: 'true', JWT_SECRET: TEST_JWT_SECRET }))
		expect(autoCreate.autoCreateTables).toBe(true)

		// Toàn bộ DDL nằm trong transaction của test và luôn bị rollback: bảng/index/khoá
		// ngoại đã có sẵn nên câu lệnh chỉ là no-op, và dù có tạo mới cũng không giữ lại.
		await withDb(async (db) => {
			await ensureTables(db, autoCreate)
			await ensureTables(db, autoCreate)
		})
	})

	it('bỏ qua khi AUTO_CREATE_TABLES=false', async () => {
		const disabled = buildConfig(testEnv({ AUTO_CREATE_TABLES: 'false' }))
		await withDb(async (db) => {
			await ensureTables(db, disabled)
		})
	})
})
