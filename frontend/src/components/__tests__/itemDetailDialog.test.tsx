// @vitest-environment jsdom
/**
 * Bấm một món (ở kho hoặc ở trang bị) mở **hộp thoại chi tiết** — đây là việc duy nhất mà cú
 * bấm làm, kể từ khi thao tác nhấc/đặt dành hẳn cho kéo-thả.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ItemDetailDialog } from '../ItemDetailDialog'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'
import type { ItemInstance } from '../../game/types'

function item(uid: string, templateId: string, star: ItemInstance['star'] = 1, paid = 3, slot = 0): ItemInstance {
	return { uid, templateId, star, slot, rotated: false, paid }
}

function reset(equipped: ItemInstance[], inventory: ItemInstance[]) {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({ run: { ...state.run, equipped, inventory } }))
}

beforeEach(() => reset([], []))
afterEach(cleanup)

describe('ItemDetailDialog', () => {
	it('hiện tên, lớp, kích thước và nơi món đang nằm', () => {
		reset([], [item('spear', 'fire-spear')])
		render(<ItemDetailDialog uid="spear" onClose={() => {}} />)

		expect(screen.getByText('Thương Lửa')).toBeTruthy()
		expect(screen.getByText('Vũ khí')).toBeTruthy()
		expect(screen.getByText('1×4 ô')).toBeTruthy()
		expect(screen.getByText('Trong kho')).toBeTruthy()
	})

	it('nói rõ khi món đang được mang', () => {
		reset([item('worn', 'jade-fury')], [])
		render(<ItemDetailDialog uid="worn" onClose={() => {}} />)

		expect(screen.getByText('Đang mang')).toBeTruthy()
	})

	it('hiện mô tả, sát thương và giá trị bán lại theo sao', () => {
		reset([], [item('spear', 'fire-spear', 2, 8)])
		render(<ItemDetailDialog uid="spear" onClose={() => {}} />)

		expect(screen.getByText(/Đâm 17 sát thương/)).toBeTruthy()
		expect(screen.getByText('Sát thương mỗi đòn')).toBeTruthy()
		expect(screen.getByText('2★')).toBeTruthy()
		// Đã trả 8 → bán lại 4.
		expect(screen.getByText(/4 🐾 \(hoàn 50%\)/)).toBeTruthy()
	})

	it('liệt kê chỉ số cộng thêm của món có passive', () => {
		reset([], [item('jade', 'jade-sword')])
		render(<ItemDetailDialog uid="jade" onClose={() => {}} />)

		expect(screen.getByText('Hồi Kiếm Thế')).toBeTruthy()
		expect(screen.getByText('Tỉ lệ Chấn Đao')).toBeTruthy()
	})

	it('món không còn tồn tại (đã bán) thì không hiện gì', () => {
		reset([], [])
		const { container } = render(<ItemDetailDialog uid="ghost" onClose={() => {}} />)
		expect(container.firstChild).toBeNull()
	})

	it('bấm "Đóng" thì gọi onClose', () => {
		reset([], [item('gem', 'jade-fury')])
		const onClose = vi.fn()
		render(<ItemDetailDialog uid="gem" onClose={onClose} />)

		fireEvent.click(screen.getByText('Đóng'))

		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it('bấm ra ngoài hộp thoại thì đóng', () => {
		reset([], [item('gem', 'jade-fury')])
		const onClose = vi.fn()
		const { container } = render(<ItemDetailDialog uid="gem" onClose={onClose} />)

		fireEvent.click(container.firstElementChild!)

		expect(onClose).toHaveBeenCalledTimes(1)
	})
})

/**
 * Hộp thoại được render ở layout gốc (`routes/__root.tsx`) chứ không nằm trong `PrepScreen`, nên
 * phải dựng **cả app** mới kiểm được luồng thật: bấm món → hộp thoại hiện ra.
 */
describe('luồng thật trong app', () => {
	it('bấm một món trong kho thì hộp thoại chi tiết hiện ra', async () => {
		reset([], [item('gem', 'jade-fury')])
		await renderApp('/')

		fireEvent.click(document.querySelector<HTMLElement>('button[data-inv-tile="gem"]')!)

		expect(await screen.findByText('Chi tiết món')).toBeTruthy()
		// Hai dòng này chỉ có trong hộp thoại (ô trong kho không có).
		expect(screen.getByText('Trong kho')).toBeTruthy()
		expect(screen.getByText('Bán được')).toBeTruthy()
	})
})
