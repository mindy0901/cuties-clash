// @vitest-environment jsdom
/**
 * Lá chắn lỗi: khi component ném lỗi, UI phải hiện màn hình khôi phục — **không**
 * được để trang trắng, vì người chơi sẽ không còn cách nào thoát.
 */
import { createElement, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../AppErrorBoundary'
import { useGameStore } from '../../store/gameStore'

function Boom(): ReactNode {
	throw new Error('loi gia dinh trong test')
}

function Fine() {
	return createElement('p', null, 'noi dung binh thuong')
}

beforeEach(() => {
	window.localStorage.clear()
	// React in lỗi ra console khi boundary bắt được; giữ log test sạch.
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
	vi.restoreAllMocks()
	cleanup()
})

describe('AppErrorBoundary', () => {
	it('hiện màn hình khôi phục thay vì trang trắng', () => {
		render(createElement(AppErrorBoundary, null, createElement(Boom)))
		expect(screen.getByText(/Đã xảy ra lỗi khi hiển thị game/)).toBeTruthy()
		expect(screen.getByText(/Xoá bản lưu và chơi lại/)).toBeTruthy()
		// Có chi tiết kỹ thuật để gỡ lỗi.
		expect(screen.getByText(/Chi tiết kỹ thuật/)).toBeTruthy()
	})

	it('không can thiệp khi mọi thứ bình thường', () => {
		render(createElement(AppErrorBoundary, null, createElement(Fine)))
		expect(screen.getByText('noi dung binh thuong')).toBeTruthy()
		expect(screen.queryByText(/Đã xảy ra lỗi/)).toBeNull()
	})

	it('nút khôi phục xoá bản lưu trong localStorage', () => {
		window.localStorage.setItem('martial-cutie-save', JSON.stringify({ state: {}, version: 2 }))
		// `window.location.assign` không chạy được trong jsdom → chặn lại.
		const assign = vi.fn()
		Object.defineProperty(window, 'location', { value: { assign }, writable: true })

		render(createElement(AppErrorBoundary, null, createElement(Boom)))
		fireEvent.click(screen.getByText(/Xoá bản lưu và chơi lại/))

		expect(window.localStorage.getItem('martial-cutie-save')).toBeNull()
		expect(assign).toHaveBeenCalledWith('/')
	})
})

describe('store chống bản lưu hỏng', () => {
	it('bản lưu thiếu equipped/inventory vẫn cho state dùng được', async () => {
		// Đây là dạng bản lưu đã làm trắng trang: version 2 nhưng thiếu trường mới.
		window.localStorage.setItem(
			'martial-cutie-save',
			JSON.stringify({
				state: {
					run: {
						petId: 'fire-pup',
						pets: { 'fire-pup': 2 },
						unlockedPets: ['fire-pup'],
						currency: 40,
						stage: 3,
						clearedStage: 2,
						seed: 999,
						shop: [],
						rerolls: 0,
						wins: 1,
						losses: 0,
					},
				},
				version: 2,
			}),
		)
		await useGameStore.persist.rehydrate()

		const run = useGameStore.getState().run
		expect(Array.isArray(run.equipped)).toBe(true)
		expect(Array.isArray(run.inventory)).toBe(true)
		expect(run.currency).toBe(40)
		// Suy ra được chỉ số chiến đấu → render không ném lỗi.
		expect(() => useGameStore.getState().run.equipped.filter(() => true)).not.toThrow()
	})

	it('bản lưu v1 vẫn migrate được sang equipped + inventory', async () => {
		window.localStorage.setItem(
			'martial-cutie-save',
			JSON.stringify({
				state: {
					run: {
						petId: 'fire-pup',
						pets: { 'fire-pup': 2 },
						unlockedPets: ['fire-pup'],
						currency: 40,
						stage: 3,
						clearedStage: 2,
						items: [{ uid: 'a', templateId: 'wooden-blade', star: 1, slot: 0, paid: 3 }],
						seed: 999,
						shop: [],
						rerolls: 0,
						wins: 1,
						losses: 0,
					},
				},
				version: 1,
			}),
		)
		await useGameStore.persist.rehydrate()

		const run = useGameStore.getState().run
		expect(run.equipped.map((item) => item.uid)).toEqual(['a'])
		expect(run.inventory).toEqual([])
	})

	it('petId lạ trong bản lưu không làm sập state', async () => {
		window.localStorage.setItem(
			'martial-cutie-save',
			JSON.stringify({
				state: { run: { petId: 'khong-co', pets: {}, equipped: [], inventory: [] } },
				version: 2,
			}),
		)
		await useGameStore.persist.rehydrate()
		expect(() => useGameStore.getState().run.petId).not.toThrow()
		expect(useGameStore.getState().run.petId).toBeTruthy()
	})
})
