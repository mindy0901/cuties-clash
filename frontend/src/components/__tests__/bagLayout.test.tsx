// @vitest-environment jsdom
/**
 * Trang bị và Kho đồ là **hai chỗ khác nhau**:
 * - Trang bị: lưới 4 cột, **luôn hiện đủ 4×5**; ô vượt cấp thú bị **khoá** (mờ). Chỉ đồ
 *   trong vùng dùng được mới tham chiến.
 * - Kho: **cùng công thức và UI** nhưng **không giới hạn ô**; kho là **lưới tự do** — món nằm
 *   đúng ô người chơi đặt, kho không xếp hộ. Nhiều món thì cuộn dọc.
 *
 * Render cả `PrepScreen` (không render lẻ từng panel) vì state nhấc/đặt nằm ở cha chung —
 * kho và trang bị là hai panel anh em.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrepScreen } from '../PrepScreen'
import { createItemInstance } from '../../game/bag'
import { GRID_MAX_CELLS } from '../../game/pets'
import { useGameStore } from '../../store/gameStore'
import { useUiStore } from '../../store/uiStore'
import { renderInRouter } from '../../test/router'

function reset() {
	useGameStore.getState().newRun()
	window.history.replaceState({}, '', '/')
}

function renderPrep() {
	return renderInRouter(<PrepScreen />)
}

/** Ô của lưới trang bị (kho dùng `data-inv-cell`). */
function loadoutCells(): HTMLElement[] {
	const panel = [...document.querySelectorAll('section')].find(
		(s) => s.querySelector('h2')?.textContent === 'Trang bị',
	)
	return Array.from(panel?.querySelectorAll<HTMLElement>('[data-cell]') ?? [])
}

/** Ô của **lưới kho đồ** — phải giới hạn theo bảng, vì hai bảng dùng chung `[data-cell]`. */
function inventoryCells(): HTMLElement[] {
	const panel = [...document.querySelectorAll('section')].find(
		(s) => s.querySelector('h2')?.textContent === 'Kho đồ',
	)
	return Array.from(panel?.querySelectorAll<HTMLElement>('[data-cell]') ?? [])
}

beforeEach(reset)
afterEach(cleanup)

describe('Trang bị — lưới luôn đủ 4×5', () => {
	it('luôn hiện đủ 20 ô dù thú mới cấp 1', () => {
		renderPrep()
		expect(loadoutCells()).toHaveLength(GRID_MAX_CELLS)
		expect(GRID_MAX_CELLS).toBe(20)
	})

	it('ô vượt cấp thú bị khoá (mờ), ô trong mức dùng được thì không', () => {
		renderPrep()
		const cells = loadoutCells()
		// Cẩu Hỏa Sài cấp 1 → 3 hàng = 12 ô dùng được.
		const locked = cells.filter((cell) => cell.className.includes('opacity-25'))
		expect(locked).toHaveLength(GRID_MAX_CELLS - 12)
		// Ô khoá nằm ở cuối lưới.
		expect(Number(locked[0].dataset.cell)).toBe(12)
	})

	it('nhãn cho biết đang có bao nhiêu ô khoá', () => {
		renderPrep()
		expect(screen.getByText(/8 ô khoá/)).toBeTruthy()
	})
})

describe('Kho đồ — dự trữ', () => {
	it('kho trống vẫn hiện lưới ô trống, không có text gợi ý', () => {
		renderPrep()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(screen.getByText('0 món · không giới hạn')).toBeTruthy()
		// Kho mặc định hiện đủ **8×8 ô** dù trống.
		expect(inventoryCells().length).toBe(64)
		// ❌ Không còn dòng gợi ý nào trong kho.
		expect(screen.queryByText(/Kho trống/)).toBeNull()
		expect(screen.queryByText(/Giữ chuột kéo món/)).toBeNull()
		expect(inventoryCells().length).toBeGreaterThan(0)
	})

	it('hiện món dự trữ dưới dạng ô trong lưới', () => {
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				inventory: [
					createItemInstance('great-axe', 2, 'axe', 0),
					createItemInstance('wooden-blade', 1, 'sword', 8),
				],
			},
		}))
		renderPrep()
		expect(screen.getByText('2 món · không giới hạn')).toBeTruthy()
		expect(document.querySelector('[data-inv-tile="axe"]')).toBeTruthy()
		expect(document.querySelector('[data-inv-tile="sword"]')).toBeTruthy()
	})

	it('bấm món trong kho thì mở hộp thoại chi tiết, KHÔNG nhấc món', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, inventory: [createItemInstance('jade-fury', 1, 'jade', 0)] },
		}))
		renderPrep()

		fireEvent.click(document.querySelector<HTMLElement>('button[data-inv-tile="jade"]')!)

		expect(useUiStore.getState().itemUid, 'mở chi tiết của đúng món đó').toBe('jade')
		expect(document.querySelector('[data-held-ghost]'), 'bấm không được nhấc món').toBeNull()
		expect(useGameStore.getState().run.inventory[0].slot, 'vị trí không đổi').toBe(0)
	})

	it('bán được món trong kho', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, inventory: [createItemInstance('great-axe', 2, 'axe', 0)] },
		}))
		const before = useGameStore.getState().run.currency
		renderPrep()
		fireEvent.click(screen.getByTitle('Bán món này (hoàn 50%)'))

		expect(useGameStore.getState().run.inventory).toHaveLength(0)
		expect(useGameStore.getState().run.currency).toBeGreaterThan(before)
	})
})

describe('Trang bị — đồ đang mang', () => {
	it('chỉ hiện đồ đang mang, không hiện đồ trong kho', () => {
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [createItemInstance('jade-fury', 1, 'worn', 0)],
				inventory: [createItemInstance('great-axe', 1, 'stored', 0)],
			},
		}))
		renderPrep()

		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		// "1 món · x/y ô · Sức mạnh …" — dùng regex có ngữ cảnh để không khớp "1 món dự trữ".
		expect(screen.getByText(/1 món · \d+\/\d+ ô/)).toBeTruthy()
		// Món trong kho không xuất hiện ở bảng trang bị (Đại Đao chỉ có trong kho).
		expect(screen.queryByTitle(/^Đại Đao/)).toBeNull()
	})

	it('bấm "Tháo hết" thì đưa toàn bộ đồ về kho', () => {
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [
					createItemInstance('jade-fury', 1, 'a', 0),
					createItemInstance('heal-dew', 1, 'b', 1),
				],
			},
		}))
		renderPrep()
		fireEvent.click(screen.getByText(/Tháo hết/))

		const run = useGameStore.getState().run
		expect(run.equipped).toHaveLength(0)
		expect(run.inventory).toHaveLength(2)
		expect(run.inventory.every((item) => item.slot >= 0), 'món về kho phải có ô thật').toBe(true)
	})
})
