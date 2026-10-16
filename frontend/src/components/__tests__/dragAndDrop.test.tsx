// @vitest-environment jsdom
/**
 * **Kéo-thả là cách duy nhất** để chuyển hoặc đổi chỗ đồ; **bấm** một món thì mở hộp thoại
 * chi tiết (xem `itemDetailDialog.test.tsx`).
 *
 * ⚠️ VÌ SAO BỎ "BẤM–BẤM": trước đây bấm món để nhấc rồi bấm ô để đặt. Hai thao tác đó dùng
 * chung một trạng thái "đang cầm" nên rất dễ sinh trạng thái lửng lơ (món bám con trỏ dù người
 * chơi đã nhả chuột), và cú `click` sau `pointerup` lại vừa nhấc vừa đặt. Giờ mỗi cú click có
 * đúng một nghĩa: nhấc thì phải **giữ chuột và di chuyển**.
 */
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrepScreen } from '../PrepScreen'
import { itemCells, templateFootprint } from '../../game/bag'
import { useGameStore } from '../../store/gameStore'
import { useUiStore } from '../../store/uiStore'
import { renderInRouter } from '../../test/router'
import type { ItemInstance } from '../../game/types'

/** Đao Gỗ 1×3 — xoay được thành 3×1 trong lưới 4 cột. */
function blade(uid: string, slot: number, rotated = false): ItemInstance {
	return { uid, templateId: 'wooden-blade', star: 1, slot, rotated, paid: 3 }
}

/** Ngọc 1×1 — hình không đổi khi xoay, tiện kiểm tra vị trí thuần. */
function jade(uid: string, slot: number): ItemInstance {
	return { uid, templateId: 'jade-fury', star: 1, slot, rotated: false, paid: 3 }
}

/** Món trong **kho** (đã có ô thật — kho là lưới tự do). */
function stored(uid: string, templateId = 'jade-fury', slot = 0): ItemInstance {
	return { uid, templateId, star: 1, slot, rotated: false, paid: 3 }
}

function reset(items: ItemInstance[], inventory: ItemInstance[] = []) {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: { ...state.run, equipped: items, inventory },
	}))
	useUiStore.setState({ itemUid: null })
	window.history.replaceState({}, '', '/')
}

function renderPrep() {
	return renderInRouter(<PrepScreen />)
}

function panel(title: string): HTMLElement {
	const found = [...document.querySelectorAll('section')].find(
		(s) => s.querySelector('h2')?.textContent === title,
	)
	if (!found) throw new Error(`không thấy bảng ${title}`)
	return found
}

/** Vỏ một món trong lưới trang bị. */
function boxOf(uid: string): HTMLElement {
	const box = document.querySelector<HTMLElement>(`[data-item-box="${uid}"]`)
	if (!box) throw new Error(`không thấy món ${uid}`)
	return box
}

/** Nút bên trong vỏ món (chỗ nhận cú bấm/giữ chuột). */
function buttonOf(uid: string): HTMLElement {
	const button = boxOf(uid).querySelector('button')
	if (!button) throw new Error(`món ${uid} không có nút`)
	return button
}

/**
 * Ô của **lưới trang bị** theo chỉ số.
 *
 * ⚠️ Phải giới hạn theo bảng: kho dùng chung `[data-cell]`, nên truy vấn toàn trang sẽ bắt
 * nhầm ô của kho.
 */
function cellOf(slot: number): HTMLElement {
	const cell = panel('Trang bị').querySelector<HTMLElement>(`[data-cell="${slot}"]`)
	if (!cell) throw new Error(`không thấy ô ${slot}`)
	return cell
}

/** Nút của một món trong **kho**. */
function invTileOf(uid: string): HTMLElement {
	const tile = document.querySelector<HTMLElement>(`button[data-inv-tile="${uid}"]`)
	if (!tile) throw new Error(`không thấy món ${uid} trong kho`)
	return tile
}

function boardOf(title: string): HTMLElement {
	const board = panel(title).querySelector<HTMLElement>('[data-grid-board]')
	if (!board) throw new Error(`bảng ${title} không có lưới`)
	return board
}

/** Ô gợi ý đang được tô (cả hai bảng). */
function previewSlots(): number[] {
	return Array.from(document.querySelectorAll<HTMLElement>('[data-preview]')).map((node) =>
		Number(node.dataset.preview),
	)
}

/** Ô gợi ý đang tô **trong một bảng**. */
function previewSlotsIn(title: string): number[] {
	return Array.from(panel(title).querySelectorAll<HTMLElement>('[data-preview]')).map((node) =>
		Number(node.dataset.preview),
	)
}

/** Ảnh món bám theo con trỏ. */
function ghost(): HTMLElement | null {
	return document.querySelector<HTMLElement>('[data-held-ghost]')
}

/** Class của khung gợi ý — `border-danger` nghĩa là chỗ đó **không đặt được**. */
function outlineClass(): string {
	const outline = document.querySelector<HTMLElement>('[data-preview-outline]')
	if (!outline) throw new Error('không có khung gợi ý')
	return outline.className
}

/**
 * Nội dung các thông báo đang hiện.
 *
 * ⚠️ Đọc từ store: `Toasts` nằm ở layout gốc, mà test ở đây chỉ render `PrepScreen`.
 */
function toastText(): string {
	return useGameStore
		.getState()
		.toasts.map((toast) => toast.text)
		.join(' | ')
}

function pressKey(key: string) {
	fireEvent.keyDown(document, { key })
}

/**
 * Đặt vùng của **Kho đồ** (px) — thay cho layout thật mà jsdom không có.
 *
 * ⚠️ Bắt buộc khi cần phân biệt "thả trong kho" với "thả ở lưới": jsdom trả
 * `getBoundingClientRect()` toàn số 0 nên vùng kho là 0×0 và **mọi** điểm đều bị coi là ngoài
 * kho; còn con trỏ mặc định là (0,0) nên cũng có lúc lại nằm trong.
 */
function stubKhoRect(left: number, top: number, width: number, height: number) {
	const section = panel('Kho đồ')
	section.getBoundingClientRect = () =>
		({
			x: left,
			y: top,
			left,
			top,
			right: left + width,
			bottom: top + height,
			width,
			height,
			toJSON: () => ({}),
		}) as DOMRect
}

/** Đưa con trỏ tới toạ độ (px) — chỉ cha nghe, không lưới nào nghe. */
function movePointerTo(x: number, y: number) {
	fireEvent.pointerMove(document, { clientX: x, clientY: y })
}

/** Vùng kho không chứa (0,0) → thao tác thả được hiểu là "ở lưới trang bị". */
function khoRoiXa() {
	stubKhoRect(200, 200, 100, 100)
}

/**
 * Đưa con trỏ qua một ô.
 *
 * Handler thật tính ô theo **toạ độ** (`mousemove` + `elementFromPoint`) vì món dài đè lên ô
 * nên `mouseenter` sẽ bắn lên món. jsdom không có layout, nên ở đây bắn trực tiếp `mousemove`
 * lên chính ô — component đọc `data-cell` từ phần tử trúng đích.
 */
function hoverCell(slot: number) {
	fireEvent.mouseMove(cellOf(slot), { clientX: 0, clientY: 0 })
}

/** Đưa con trỏ qua một ô của **kho**. */
function hoverInvCell(slot: number) {
	const cell = panel('Kho đồ').querySelector<HTMLElement>(`[data-cell="${slot}"]`)
	if (!cell) throw new Error(`kho không có ô ${slot}`)
	fireEvent.mouseMove(cell, { clientX: 0, clientY: 0 })
}

/** Bắt đầu kéo: giữ chuột rồi di chuyển quá ngưỡng 4px (giống trình duyệt thật). */
function batDauKeo(target: HTMLElement) {
	fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10 })
	fireEvent.pointerMove(target, { clientX: 300, clientY: 300 })
}

/**
 * Nhả chuột.
 *
 * ⚠️ Phải bọc `act`: `pointerup` được nghe ở `document` (con trỏ có thể đang ở panel khác) nên
 * không đi qua `fireEvent` — thiếu `act` thì state đã đổi mà DOM chưa render lại.
 */
function nhaChuot() {
	act(() => {
		document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }))
	})
}

beforeEach(() => reset([blade('sword', 0)]))
afterEach(cleanup)

describe('kéo món để nhấc', () => {
	it('kéo món trong lưới thì món mờ đi và có ảnh bám con trỏ', () => {
		renderPrep()

		batDauKeo(buttonOf('sword'))

		expect(boxOf('sword').style.opacity).toBe('0.45')
		expect(ghost()).not.toBeNull()
	})

	it('BẤM món (không kéo) thì KHÔNG nhấc — chỉ mở hộp thoại chi tiết', () => {
		renderPrep()

		fireEvent.click(buttonOf('sword'))

		expect(ghost(), 'bấm không được nhấc món').toBeNull()
		expect(boxOf('sword').style.opacity, 'món không bị làm mờ').toBe('1')
		expect(useUiStore.getState().itemUid, 'hộp thoại chi tiết mở').toBe('sword')
	})

	it('kéo món thì KHÔNG mở hộp thoại chi tiết', () => {
		renderPrep()
		khoRoiXa()

		batDauKeo(buttonOf('sword'))
		hoverCell(4)
		nhaChuot()
		// Trình duyệt vẫn bắn `click` sau `pointerup` — nó phải bị bỏ qua.
		fireEvent.click(buttonOf('sword'))

		expect(useUiStore.getState().itemUid, 'cú click đi kèm thao tác kéo bị bỏ qua').toBeNull()
	})

	it('ảnh món bám theo con trỏ', () => {
		renderPrep()
		batDauKeo(buttonOf('sword'))

		fireEvent.pointerMove(document, { clientX: 120, clientY: 240 })
		expect(ghost()!.style.left).toBe('120px')
		expect(ghost()!.style.top).toBe('240px')

		fireEvent.pointerMove(document, { clientX: 400, clientY: 80 })
		expect(ghost()!.style.left).toBe('400px')
		expect(ghost()!.style.top).toBe('80px')
	})

	it('Esc thì bỏ kéo', () => {
		renderPrep()
		batDauKeo(buttonOf('sword'))

		pressKey('Escape')

		expect(ghost()).toBeNull()
		expect(boxOf('sword').style.opacity).toBe('1')
	})
})

describe('gợi ý chỗ đặt', () => {
	it('đưa chuột qua ô thì tô đúng số ô của món', () => {
		renderPrep()
		batDauKeo(buttonOf('sword'))
		hoverCell(0)

		// Đao Gỗ dọc 1×3 → 3 ô.
		expect(previewSlots()).toHaveLength(3)
	})

	it('gợi ý nằm gọn trong MỘT cột cho món 1×3', () => {
		renderPrep()
		batDauKeo(buttonOf('sword'))
		hoverCell(2)

		const columns = new Set(
			previewSlots().map(
				(slot) =>
					panel('Trang bị').querySelector<HTMLElement>(`[data-cell="${slot}"]`)!.style.gridColumn,
			),
		)
		expect([...columns]).toHaveLength(1)
	})

	it('không có gợi ý khi chưa kéo món nào', () => {
		renderPrep()
		hoverCell(5)
		expect(previewSlots()).toHaveLength(0)
	})

	/**
	 * LỖI ĐÃ GẶP: phần **bóng mờ** (các ô tô nền) và **khung đứt** được tính từ hai vị trí
	 * khác nhau, nên khung lệch khỏi vùng tô. Test này khoá hai thứ đó vào **cùng một khối ô**.
	 */
	it('khung đứt bao đúng các ô đang tô nền (không lệch)', () => {
		renderPrep()
		batDauKeo(buttonOf('sword'))
		hoverCell(5)

		const filled = previewSlots()
		expect(filled.length).toBeGreaterThan(0)

		const outline = document.querySelector<HTMLElement>('[data-preview-outline]')!
		const cols = filled.map((slot) => slot % 4)
		const rowIdx = filled.map((slot) => Math.floor(slot / 4))
		const minCol = Math.min(...cols)
		const minRow = Math.min(...rowIdx)

		expect(outline.style.gridColumn).toBe(`${minCol + 1} / span ${Math.max(...cols) - minCol + 1}`)
		expect(outline.style.gridRow).toBe(`${minRow + 1} / span ${Math.max(...rowIdx) - minRow + 1}`)
	})
})

/**
 * LỖI ĐÃ GẶP: ô đang trỏ chỉ được **ghi** khi con trỏ đi qua lưới, mà **không bao giờ bị xoá**
 * khi con trỏ rời đi — lưới bên kia vẫn hiện gợi ý ở ô cũ, và thả chuột ở chỗ khác lại đặt món
 * vào ô nhớ sẵn đó.
 */
describe('gợi ý chỉ hiện khi con trỏ ở TRONG bảng', () => {
	it('rời lưới trang bị khi đang kéo món ở kho → lưới không còn gợi ý', () => {
		reset([], [stored('stored')])
		renderPrep()

		batDauKeo(invTileOf('stored'))
		hoverCell(9)
		expect(previewSlotsIn('Trang bị'), 'con trỏ vào lưới thì phải có gợi ý').toEqual([9])

		fireEvent.pointerLeave(boardOf('Trang bị'))

		expect(previewSlotsIn('Trang bị'), 'con trỏ đã rời lưới thì không được còn gợi ý').toEqual([])
	})

	it('rời kho khi đang kéo món ở trang bị → kho không còn gợi ý', () => {
		reset([jade('gem', 0)], [])
		renderPrep()

		batDauKeo(buttonOf('gem'))
		hoverInvCell(0)
		expect(previewSlotsIn('Kho đồ')).toEqual([0])

		fireEvent.pointerLeave(boardOf('Kho đồ'))

		expect(previewSlotsIn('Kho đồ')).toEqual([])
	})

	it('quay lại lưới thì gợi ý hiện lại — và thả đúng chỗ mới', () => {
		reset([], [stored('stored')])
		renderPrep()
		khoRoiXa()

		batDauKeo(invTileOf('stored'))
		hoverCell(9)
		fireEvent.pointerLeave(boardOf('Trang bị'))
		expect(previewSlotsIn('Trang bị')).toEqual([])

		hoverCell(6)
		expect(previewSlotsIn('Trang bị'), 'vào lại lưới thì gợi ý phải hiện lại').toEqual([6])

		nhaChuot()
		expect(useGameStore.getState().run.equipped[0].slot, 'đặt vào ô đang trỏ, không phải ô cũ').toBe(6)
	})

	it('rời lưới rồi thả chuột thì huỷ, không đặt vào ô cũ', () => {
		reset([], [stored('stored')])
		renderPrep()
		// Vùng kho chứa (0,0) → thả ở đây **không** phải "cất vào kho".
		stubKhoRect(0, 0, 1000, 1000)

		batDauKeo(invTileOf('stored'))
		movePointerTo(500, 500)
		hoverCell(9)
		fireEvent.pointerLeave(boardOf('Trang bị'))
		nhaChuot()

		const run = useGameStore.getState().run
		expect(run.equipped, 'thả ngoài lưới thì không được đặt món').toHaveLength(0)
		expect(run.inventory.map((item) => item.uid), 'món vẫn nằm trong kho').toEqual(['stored'])
		expect(ghost(), 'đã nhả chuột thì không được còn ảnh bám con trỏ').toBeNull()
	})
})

describe('xoay khi đang kéo', () => {
	it('phím R đổi hướng món đang kéo', () => {
		renderPrep()
		batDauKeo(buttonOf('sword'))
		hoverCell(5)

		// Dọc 1×3 ở cột 1 → ô 1, 5, 9
		expect(previewSlots()).toEqual([1, 5, 9])

		pressKey('r')

		// Ngang 3×1 ở hàng của con trỏ (hàng 1) → ô 4, 5, 6
		expect(previewSlots()).toEqual([4, 5, 6])
	})

	it('chuột phải cũng đổi hướng', () => {
		renderPrep()
		batDauKeo(buttonOf('sword'))

		fireEvent.contextMenu(document)

		expect(templateFootprint('wooden-blade', true)).toEqual({ w: 3, h: 1 })
		expect(ghost()).not.toBeNull()
	})

	it('R hai lần thì quay về hướng cũ', () => {
		renderPrep()
		batDauKeo(buttonOf('sword'))
		hoverCell(5)

		pressKey('r')
		pressKey('R')

		expect(previewSlots(), 'dọc 1×3 ở cột 1 → ô 1, 5, 9').toEqual([1, 5, 9])
	})
})

describe('thả món xuống', () => {
	it('thả trong lưới → món nằm đúng khối gợi ý', () => {
		renderPrep()
		khoRoiXa()

		batDauKeo(buttonOf('sword'))
		hoverCell(6)
		const preview = previewSlots()
		nhaChuot()

		const item = useGameStore.getState().run.equipped[0]
		expect(itemCells(item, 4), 'khối đã đặt phải trùng khối gợi ý').toEqual(preview)
	})

	it('hướng đã xoay được áp dụng khi thả', () => {
		renderPrep()
		khoRoiXa()

		batDauKeo(buttonOf('sword'))
		hoverCell(4)
		pressKey('r')
		const preview = previewSlots()
		nhaChuot()

		const item = useGameStore.getState().run.equipped[0]
		expect(item.rotated).toBe(true)
		expect(itemCells(item, 4), 'món nằm ngang đúng chỗ gợi ý').toEqual(preview)
		expect(preview, 'ngang 3×1 → một hàng ba ô').toEqual([4, 5, 6])
	})

	it('thả lên món khác loại thì hoán đổi vị trí, không chồng ô', () => {
		reset([blade('a', 0), jade('b', 2)], [])
		renderPrep()
		khoRoiXa()

		batDauKeo(buttonOf('b'))
		hoverCell(0)
		nhaChuot()

		const run = useGameStore.getState().run
		const a = run.equipped.find((item) => item.uid === 'a')!
		const b = run.equipped.find((item) => item.uid === 'b')!
		expect(b.slot).toBe(0)
		expect(a.slot).toBe(2)
		expect(new Set([...itemCells(a, 4), ...itemCells(b, 4)]).size).toBe(itemCells(a, 4).length + itemCells(b, 4).length)
	})

	it('gợi ý đè lên món khác → viền đỏ và thả xuống KHÔNG đặt, dù bên dưới còn trống', () => {
		// LỖI ĐÃ GẶP: khối gợi ý đè lên món khác mà vẫn vẽ viền vàng, rồi thả xuống lại "ăn" —
		// món trượt xuống ô trống bên dưới, lệch hẳn khỏi khung người chơi đang thấy.
		reset([blade('sword', 0), jade('gem', 5)], [])
		renderPrep()
		khoRoiXa()

		batDauKeo(buttonOf('sword'))
		hoverCell(1)

		expect(previewSlots(), 'khối gợi ý đè lên Ngọc ở ô 5').toContain(5)
		expect(outlineClass(), 'phải báo đỏ vì vướng món').toContain('border-danger')

		nhaChuot()

		expect(
			useGameStore.getState().run.equipped.find((item) => item.uid === 'sword')?.slot,
			'món phải nằm nguyên chỗ cũ',
		).toBe(0)
		expect(toastText(), 'phải báo cho người chơi biết').toMatch(/không vừa món/)
	})

	it('khối gợi ý lấn ô KHOÁ thì đỏ, dù con trỏ đang đứng trên một món', () => {
		// LỖI ĐÃ GẶP (ảnh người chơi gửi): thương 1×4 kéo từ kho lên, khối gợi ý vừa đè lên Ngọc
		// vừa tràn xuống hai hàng khoá. Con trỏ đứng trên Ngọc nên ngoại lệ "trỏ vào món" (dành cho
		// nhập sao/hoán đổi) **che mất** lỗi tràn vùng → viền vẫn vàng dù thả xuống không được.
		reset([jade('gem', 5)], [stored('spear', 'fire-spear')])
		renderPrep()
		khoRoiXa()

		batDauKeo(invTileOf('spear'))
		hoverCell(5)

		expect(previewSlotsIn('Trang bị'), 'khối lấn sang hàng khoá').toContain(13)
		expect(outlineClass(), 'tràn vùng đặt thì phải báo đỏ').toContain('border-danger')

		nhaChuot()

		const run = useGameStore.getState().run
		expect(run.equipped.map((item) => item.uid), 'món cũ nằm nguyên').toEqual(['gem'])
		expect(run.inventory.map((item) => item.uid), 'không đặt được thì ở lại kho').toEqual([
			'spear',
		])
		expect(toastText(), 'phải chỉ cho người chơi cách xoay').toMatch(/bấm R để xoay/)
	})

	it('ô gợi ý nằm TRÊN lớp món — món không được che gợi ý', () => {
		// Món là ô grid có `relative` nên vẽ **sau** các ô gợi ý trong DOM: thiếu `z-10` là khối gợi ý
		// bị món che mất, người chơi không thấy mình sắp đặt vào đâu.
		//
		// ⚠️ jsdom không vẽ nên ở đây chỉ khoá được **lớp** qua class; kiểm tra thật bằng mắt trên
		// trình duyệt (ảnh chụp) khi đổi giao diện gợi ý.
		reset([blade('sword', 0), jade('gem', 5)], [])
		renderPrep()
		khoRoiXa()

		batDauKeo(buttonOf('sword'))
		hoverCell(1)

		const cells = [...document.querySelectorAll<HTMLElement>('[data-preview]')]
		expect(cells.length, 'đang có khối gợi ý').toBeGreaterThan(0)
		for (const cell of cells) expect(cell.className, 'ô gợi ý phải nổi lên trên').toContain('z-10')
		expect(outlineClass(), 'khung đứt cũng phải nổi lên trên').toContain('z-10')
		expect(boxOf('gem').className, 'món ❌ không được nâng lớp lên trên gợi ý').not.toMatch(
			/(^|\s)z-/,
		)
	})

	it('khối gợi ý vướng món THỨ BA (ngoài món dưới con trỏ) thì đỏ', () => {
		// Ngoại lệ "trỏ vào một món" chỉ dành cho **món đó**: `resolveDrop` chỉ xử lý món nằm dưới con
		// trỏ, nên món thứ ba lọt vào khối là thả không được → gợi ý phải đỏ.
		reset([jade('gem-a', 1), blade('sword', 3), jade('gem-b', 5)], [])
		renderPrep()
		khoRoiXa()

		batDauKeo(buttonOf('sword'))
		hoverCell(5)

		expect(previewSlots(), 'khối đè cả Ngọc ô 5 (dưới con trỏ) lẫn Ngọc ô 1').toEqual(
			expect.arrayContaining([1, 5]),
		)
		expect(outlineClass(), 'vướng món thứ ba thì phải báo đỏ').toContain('border-danger')

		nhaChuot()

		expect(
			useGameStore.getState().run.equipped.map((item) => item.uid),
			'không đặt được thì mọi món nằm nguyên',
		).toEqual(['gem-a', 'sword', 'gem-b'])
	})

	it('thả vào ô KHOÁ thì không đặt được và báo rõ', () => {
		reset([], [stored('stored')])
		renderPrep()
		khoRoiXa()

		batDauKeo(invTileOf('stored'))
		hoverCell(14) // ô khoá (cấp thú 1 chỉ dùng 12 ô đầu)
		nhaChuot()

		expect(useGameStore.getState().run.equipped, 'không được đặt vào ô khoá').toHaveLength(0)
		expect(screen.getByText(/khoá/)).toBeTruthy()
	})

	it('không kéo gì mà bấm ô thì không đổi gì', () => {
		renderPrep()
		hoverCell(9)
		fireEvent.click(cellOf(9))

		expect(useGameStore.getState().run.equipped[0].slot).toBe(0)
		expect(useUiStore.getState().itemUid).toBeNull()
	})
})

describe('kho ↔ trang bị', () => {
	it('kéo món trong kho lên lưới thì được mang', () => {
		reset([], [stored('stored')])
		renderPrep()
		khoRoiXa()

		batDauKeo(invTileOf('stored'))
		hoverCell(0)
		nhaChuot()

		const run = useGameStore.getState().run
		expect(run.inventory).toHaveLength(0)
		expect(run.equipped).toHaveLength(1)
		expect(run.equipped[0].uid).toBe('stored')
	})

	it('món kho dài 1×4 không lọt lưới 3 hàng thì TỪ CHỐI (phải xoay bằng R)', () => {
		reset([], [stored('spear', 'fire-spear')])
		renderPrep()
		khoRoiXa()

		batDauKeo(invTileOf('spear'))
		hoverCell(0)
		expect(outlineClass(), 'gợi ý phải báo đỏ: hướng này không vừa').toContain('border-danger')
		nhaChuot()

		const run = useGameStore.getState().run
		expect(run.inventory, 'không đặt được thì món ở lại kho').toHaveLength(1)
		expect(toastText(), 'phải chỉ cho người chơi cách xoay').toMatch(/bấm R để xoay/)
	})

	it('xoay bằng R trong lúc kéo thì món kho 1×4 vào được lưới 3 hàng', () => {
		reset([], [stored('spear', 'fire-spear')])
		renderPrep()
		khoRoiXa()

		batDauKeo(invTileOf('spear'))
		hoverCell(0)
		pressKey('r')
		expect(outlineClass(), 'xoay xong thì gợi ý hết đỏ').not.toContain('border-danger')
		const preview = previewSlots()
		nhaChuot()

		const run = useGameStore.getState().run
		expect(run.inventory, 'đã mang lên được').toHaveLength(0)
		expect(run.equipped[0].rotated, 'đúng hướng đang thấy').toBe(true)
		expect(itemCells(run.equipped[0], 4)).toEqual(preview)
	})

	it('kéo món của trang bị xuống vùng kho thì cất vào kho', () => {
		reset([jade('gem', 0)], [])
		renderPrep()
		// Vùng kho chứa (0,0) → thả ở đây được hiểu là "trong kho".
		stubKhoRect(0, 0, 1000, 1000)
		movePointerTo(400, 400)

		batDauKeo(buttonOf('gem'))
		nhaChuot()

		const run = useGameStore.getState().run
		expect(run.equipped, 'đã rời trang bị').toHaveLength(0)
		expect(run.inventory, 'đã vào kho').toHaveLength(1)
	})
})

describe('nút ⟳ vẫn hoạt động', () => {
	it('bấm nút xoay thì món đổi hướng', () => {
		renderPrep()
		fireEvent.click(screen.getByTitle('Xoay 90°'))

		expect(useGameStore.getState().run.equipped[0].rotated).toBe(true)
		expect(templateFootprint('wooden-blade', true)).toEqual({ w: 3, h: 1 })
	})
})
