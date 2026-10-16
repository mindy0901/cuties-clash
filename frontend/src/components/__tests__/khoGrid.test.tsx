// @vitest-environment jsdom
/**
 * **Kho đồ là lưới tự do** — khoá lại đúng hai lỗi đã gặp:
 *
 * 1. Kho **tự xếp lại** món: thả ở đâu cũng bị dồn về hàng trên, nên vị trí người chơi chọn
 *    không được giữ.
 * 2. Vì thế **kéo trong kho trông như không ăn** — thao tác có tác dụng nhưng vị trí bị tính
 *    lại ngay, và kéo món trong kho trước đây còn bị bỏ qua hoàn toàn.
 */
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrepScreen } from '../PrepScreen'
import { useGameStore } from '../../store/gameStore'
import { renderInRouter } from '../../test/router'
import type { ItemInstance } from '../../game/types'

function item(uid: string, templateId: string, slot: number, rotated = false): ItemInstance {
	return { uid, templateId, star: 1, slot, rotated, paid: 3 }
}

function reset(equipped: ItemInstance[], inventory: ItemInstance[]) {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({ run: { ...state.run, equipped, inventory } }))
	window.history.replaceState({}, '', '/')
}

function renderPrep() {
	return renderInRouter(<PrepScreen />)
}

/** Bảng theo tiêu đề. */
function panel(title: string): HTMLElement {
	const found = [...document.querySelectorAll('section')].find(
		(s) => s.querySelector('h2')?.textContent === title,
	)
	if (!found) throw new Error(`không thấy bảng ${title}`)
	return found
}

/** Ô của một bảng theo chỉ số (hai bảng dùng chung `[data-cell]`). */
function cellIn(title: string, slot: number): HTMLElement {
	const cell = panel(title).querySelector<HTMLElement>(`[data-cell="${slot}"]`)
	if (!cell) throw new Error(`${title} không có ô ${slot}`)
	return cell
}

/** Nút của một món trong **kho**. */
function tile(uid: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(`button[data-inv-tile="${uid}"]`)
	if (!found) throw new Error(`không thấy món ${uid} trong kho`)
	return found
}

/** Vỏ món (chỗ mang `gridColumn`/`gridRow`). */
function boxOf(uid: string): HTMLElement {
	const found = document.querySelector<HTMLElement>(`[data-item-box="${uid}"]`)
	if (!found) throw new Error(`không thấy vỏ món ${uid}`)
	return found
}

function slotOf(uid: string): number | undefined {
	return useGameStore.getState().run.inventory.find((entry) => entry.uid === uid)?.slot
}

/** Đưa con trỏ qua một ô của **kho**. */
function hoverKhoCell(slot: number) {
	fireEvent.mouseMove(cellIn('Kho đồ', slot), { clientX: 0, clientY: 0 })
}

/**
 * Nhả chuột sau khi kéo. Phải bọc `act` vì `pointerup` được nghe ở `document` (con trỏ có thể
 * đang ở panel khác) nên không đi qua `fireEvent`.
 */
function nhaChuot() {
	act(() => {
		document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }))
	})
}

/** Bắt đầu kéo một món bằng chuột thật (pointerdown + pointermove quá ngưỡng 4px). */
function batDauKeo(uid: string) {
	const button = tile(uid)
	fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 })
	fireEvent.pointerMove(button, { clientX: 300, clientY: 300 })
}

beforeEach(() => reset([], []))
afterEach(cleanup)

describe('kho giữ đúng vị trí người chơi đặt', () => {
	it('món nằm ở đúng ô đã lưu, không bị dồn về đầu lưới', () => {
		reset([], [item('near', 'jade-fury', 5), item('far', 'jade-fury', 40)])
		renderPrep()

		// Ô 5 = hàng 0 cột 5; ô 40 = hàng 5 cột 0 (8 cột).
		expect(boxOf('near').style.gridColumn).toBe('6 / span 1')
		expect(boxOf('near').style.gridRow).toBe('1 / span 1')
		expect(boxOf('far').style.gridColumn).toBe('1 / span 1')
		expect(boxOf('far').style.gridRow).toBe('6 / span 1')
	})

	it('kéo một món trong kho tới ô khác thì món nằm ở ô đó', () => {
		reset([], [item('gem', 'jade-fury', 0)])
		renderPrep()

		batDauKeo('gem')
		hoverKhoCell(20)
		nhaChuot()

		expect(slotOf('gem'), 'nhả ở ô 20 thì món phải ở ô 20').toBe(20)
	})

	it('bấm món trong kho thì mở chi tiết chứ không đổi vị trí', () => {
		reset([], [item('gem', 'jade-fury', 0)])
		renderPrep()

		hoverKhoCell(30)
		fireEvent.click(tile('gem'))

		expect(slotOf('gem'), 'bấm không được di chuyển món').toBe(0)
		expect(document.querySelector('[data-held-ghost]'), 'bấm không được nhấc món').toBeNull()
	})

	it('bán một món KHÔNG làm các món khác nhảy chỗ', () => {
		reset([], [item('sold', 'jade-fury', 3), item('kept', 'great-axe', 20)])
		renderPrep()

		const sellButton = boxOf('sold').querySelector<HTMLElement>('[title="Bán món này (hoàn 50%)"]')!
		fireEvent.click(sellButton)

		expect(slotOf('sold')).toBeUndefined()
		expect(slotOf('kept'), 'món còn lại phải giữ nguyên ô').toBe(20)
	})

	it('xoay món trong kho bằng nút ⟳', () => {
		reset([], [item('blade', 'wooden-blade', 0)])
		renderPrep()

		const rotateButton = panel('Kho đồ').querySelector<HTMLElement>('[title="Xoay 90°"]')!
		fireEvent.click(rotateButton)

		expect(useGameStore.getState().run.inventory[0].rotated).toBe(true)
		// Đao Gỗ 1×3 xoay thành 3×1 — vẫn neo ở ô 0.
		expect(boxOf('blade').style.gridColumn).toBe('1 / span 3')
	})
})

describe('chuyển đồ giữa kho và trang bị theo ô', () => {
	it('kéo món ở trang bị xuống một ô trong kho thì nằm đúng ô đó', () => {
		reset([item('worn', 'jade-fury', 0)], [])
		renderPrep()

		const button = boxOf('worn').querySelector('button')!
		fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 })
		fireEvent.pointerMove(button, { clientX: 300, clientY: 300 })
		hoverKhoCell(17)
		nhaChuot()

		expect(useGameStore.getState().run.equipped).toHaveLength(0)
		expect(slotOf('worn')).toBe(17)
	})

	it('tháo hết đồ thì mọi món vào kho đều có ô thật', () => {
		reset([item('a', 'jade-fury', 0), item('b', 'jade-fury', 1)], [])
		renderPrep()

		fireEvent.click(screen.getByText(/Tháo hết/))

		const inventory = useGameStore.getState().run.inventory
		expect(inventory).toHaveLength(2)
		expect(inventory.every((entry) => entry.slot >= 0), 'không món nào còn slot -1').toBe(true)
		expect(new Set(inventory.map((entry) => entry.slot)).size, 'không chồng ô').toBe(2)
	})
})
