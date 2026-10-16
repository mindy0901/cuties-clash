// @vitest-environment jsdom
/**
 * Nhấc và đặt đồ bằng **bấm chuột** (không kéo-thả), và xoay bằng `R` / chuột phải.
 *
 * ⚠️ VÌ SAO BẤM CHỨ KHÔNG KÉO: cách kéo phải giữ khớp "ô đang trỏ" với "ô sẽ đặt" suốt
 * thao tác — chỗ đó đã sinh lỗi thả không ăn, món nằm nguyên vị trí cũ, và xoay giữa lúc
 * kéo không tới được. Bấm–bấm thì mỗi thao tác là một sự kiện `click` trọn vẹn.
 *
 * Test này khoá hành vi đó lại: nếu ai quay về kéo-thả, các test dưới sẽ đỏ.
 */
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrepScreen } from '../PrepScreen'
import { itemCells, templateFootprint } from '../../game/bag'
import { useGameStore } from '../../store/gameStore'
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

function reset(items: ItemInstance[], inventory: ItemInstance[] = []) {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: { ...state.run, equipped: items, inventory },
	}))
	window.history.replaceState({}, '', '/')
}

function renderPrep() {
	return renderInRouter(<PrepScreen />)
}

/** Vỏ một món trong lưới. */
function boxOf(uid: string): HTMLElement {
	const box = document.querySelector<HTMLElement>(`[data-item-box="${uid}"]`)
	if (!box) throw new Error(`không thấy món ${uid} trong lưới`)
	return box
}

/** Nút bên trong vỏ món (chỗ nhận cú bấm). */
function buttonOf(uid: string): HTMLElement {
	const button = boxOf(uid).querySelector('button')
	if (!button) throw new Error(`món ${uid} không có nút`)
	return button
}

/** Bảng theo tiêu đề. */
function panel(title: string): HTMLElement {
	const found = [...document.querySelectorAll('section')].find(
		(s) => s.querySelector('h2')?.textContent === title,
	)
	if (!found) throw new Error(`không thấy bảng ${title}`)
	return found
}

/**
 * Ô của **lưới trang bị** theo chỉ số.
 *
 * ⚠️ Phải giới hạn theo bảng: kho đồ dùng chung `[data-cell]`, nên truy vấn toàn trang sẽ
 * bắt nhầm ô của kho.
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

/** Ô gợi ý đang được tô. */
function previewSlots(): number[] {
	return Array.from(document.querySelectorAll<HTMLElement>('[data-preview]')).map((node) =>
		Number(node.dataset.preview),
	)
}

/** Khung lưới bên trong một bảng. */
function boardOf(title: string): HTMLElement {
	const board = panel(title).querySelector<HTMLElement>('[data-grid-board]')
	if (!board) throw new Error(`bảng ${title} không có lưới`)
	return board
}

/**
 * Ô gợi ý đang tô **trong một bảng**.
 *
 * ⚠️ Phải giới hạn theo bảng: hai bảng dùng chung `[data-preview]`, nên truy vấn toàn trang
 * sẽ lẫn gợi ý của bảng kia.
 */
function previewSlotsIn(title: string): number[] {
	return Array.from(panel(title).querySelectorAll<HTMLElement>('[data-preview]')).map((node) =>
		Number(node.dataset.preview),
	)
}

/** Đưa con trỏ tới một ô của **kho**. */
function hoverInvCell(slot: number) {
	const cell = panel('Kho đồ').querySelector<HTMLElement>(`[data-cell="${slot}"]`)
	if (!cell) throw new Error(`kho không có ô ${slot}`)
	fireEvent.mouseMove(cell, { clientX: 0, clientY: 0 })
}

/**
 * Đặt vùng của **Kho đồ** (px) — thay cho layout thật mà jsdom không có.
 *
 * ⚠️ Bắt buộc khi cần phân biệt "thả trong kho" với "thả ngoài": jsdom trả `getBoundingClientRect()`
 * toàn số 0 nên vùng kho là 0×0 và mọi điểm đều bị coi là **ngoài** kho.
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

/**
 * Đẩy con trỏ tới toạ độ (px).
 *
 * Bắn trên `document` — chỉ `useHeldItem` (nghe ở `document`) biết, không lưới nào nghe, nên
 * ô đang trỏ của lưới không bị đổi. Dùng để mô phỏng "con trỏ đang ở chỗ khác".
 */
function movePointerTo(x: number, y: number) {
	fireEvent.pointerMove(document, { clientX: x, clientY: y })
}

/**
 * Đưa con trỏ qua một ô.
 *
 * Handler thật tính ô theo **toạ độ** (`mousemove` + `elementFromPoint`), vì món dài đè lên
 * ô nên `mouseenter` sẽ bắn lên món. jsdom không có layout, nên ở đây bắn trực tiếp
 * `mousemove` lên chính ô — component đọc `data-cell` từ phần tử trúng đích.
 */
function hoverCell(slot: number) {
	fireEvent.mouseMove(cellOf(slot), { clientX: 0, clientY: 0 })
}

/**
 * Bấm vào một ô: đưa con trỏ qua ô rồi bấm — giống trình duyệt thật.
 *
 * ⚠️ Không bấm thẳng vào ô được: món dài phủ lên nhiều ô, nên "bấm ô 8" trong trình duyệt
 * thật có thể rơi trúng **món** đang đè lên ô đó. Giao diện vì vậy dựa vào ô đã tính theo
 * con trỏ, nên test cũng phải đi qua `hoverCell`.
 */
function clickCell(slot: number) {
	hoverCell(slot)
	fireEvent.click(cellOf(slot))
}

/** Ảnh món bám theo con trỏ. */
function ghost(): HTMLElement | null {
	return document.querySelector<HTMLElement>('[data-held-ghost]')
}

function pressKey(key: string) {
	fireEvent.keyDown(document, { key })
}

beforeEach(() => reset([blade('sword', 0)]))
afterEach(cleanup)

describe('nhấc món bằng bấm', () => {
	it('bấm món trong lưới thì nhấc lên: món mờ đi và có ảnh bám con trỏ', () => {
		renderPrep()
		expect(ghost()).toBeNull()

		fireEvent.click(buttonOf('sword'))

		expect(boxOf('sword').style.opacity).toBe('0.45')
		expect(ghost(), 'phải có ảnh món khi đang nhấc').not.toBeNull()
		expect(ghost()!.dataset.heldGhost).toBe('wooden-blade')
	})

	it('bấm lại chính món đó thì bỏ nhấc', () => {
		renderPrep()
		fireEvent.click(buttonOf('sword'))
		fireEvent.click(buttonOf('sword'))

		expect(ghost()).toBeNull()
		expect(boxOf('sword').style.opacity).toBe('1')
	})

	it('ảnh món bám theo con trỏ', () => {
		renderPrep()
		fireEvent.click(buttonOf('sword'))

		fireEvent.pointerMove(document, { clientX: 120, clientY: 240 })
		expect(ghost()!.style.left).toBe('120px')
		expect(ghost()!.style.top).toBe('240px')

		fireEvent.pointerMove(document, { clientX: 400, clientY: 80 })
		expect(ghost()!.style.left).toBe('400px')
		expect(ghost()!.style.top).toBe('80px')
	})

	it('Esc thì bỏ nhấc', () => {
		renderPrep()
		fireEvent.click(buttonOf('sword'))
		pressKey('Escape')

		expect(ghost()).toBeNull()
		expect(useGameStore.getState().run.equipped[0].slot).toBe(0)
	})
})

describe('gợi ý chỗ đặt', () => {
	it('đưa chuột qua ô thì tô đúng số ô của món', () => {
		renderPrep()
		fireEvent.click(buttonOf('sword'))
		hoverCell(5)

		// Đao Gỗ dọc 1×3 → 3 ô.
		expect(previewSlots()).toHaveLength(3)
	})

	it('gợi ý nằm gọn trong MỘT cột cho món 1×3', () => {
		reset([blade('sword', 0)], [])
		renderPrep()
		fireEvent.click(buttonOf('sword'))
		hoverCell(5)

		// Món 1×3 thẳng đứng: mọi ô gợi ý phải cùng một cột.
		const columns = new Set(
			previewSlots().map(
				(slot) =>
					panel('Trang bị').querySelector<HTMLElement>(`[data-cell="${slot}"]`)!.style.gridColumn,
			),
		)
		expect([...columns]).toHaveLength(1)
	})

	it('không có gợi ý khi chưa nhấc món nào', () => {
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
		fireEvent.click(buttonOf('sword'))
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
 * khi con trỏ rời đi. Hệ quả: nhấc một món rồi lướt con trỏ qua lưới (hoặc đi ngang qua trên
 * đường tới chỗ khác) là lưới **vẫn hiện gợi ý ở ô cũ** dù con trỏ đã ở panel khác. Tệ hơn,
 * `onAnchorSlot` lấy từ cùng biến đó nên **thả chuột ở chỗ khác lại đặt món vào ô cũ**.
 *
 * ⚠️ Trình tự mới tái hiện được: phải **đang cầm món** thì lưới mới ghi ô đang trỏ.
 */
describe('gợi ý chỉ hiện khi con trỏ ở TRONG bảng', () => {
	it('rời lưới trang bị khi đang cầm món ở kho → lưới không còn gợi ý', () => {
		reset([], [{ uid: 'stored', templateId: 'jade-fury', star: 1, slot: 0, paid: 3 }])
		renderPrep()

		fireEvent.click(invTileOf('stored'))
		hoverCell(9)
		expect(previewSlotsIn('Trang bị'), 'con trỏ vào lưới thì phải có gợi ý').toEqual([9])

		fireEvent.pointerLeave(boardOf('Trang bị'))

		expect(previewSlotsIn('Trang bị'), 'con trỏ đã rời lưới thì không được còn gợi ý').toEqual([])
	})

	it('rời kho khi đang cầm món ở trang bị → kho không còn gợi ý', () => {
		reset([jade('gem', 0)], [])
		renderPrep()

		fireEvent.click(buttonOf('gem'))
		hoverInvCell(0)
		expect(previewSlotsIn('Kho đồ')).toEqual([0])

		fireEvent.pointerLeave(boardOf('Kho đồ'))

		expect(previewSlotsIn('Kho đồ')).toEqual([])
	})

	it('quay lại lưới thì gợi ý hiện lại — và đặt đúng chỗ mới', () => {
		reset([], [{ uid: 'stored', templateId: 'jade-fury', star: 1, slot: 0, paid: 3 }])
		renderPrep()

		fireEvent.click(invTileOf('stored'))
		hoverCell(9)
		fireEvent.pointerLeave(boardOf('Trang bị'))
		expect(previewSlotsIn('Trang bị')).toEqual([])

		hoverCell(0)
		expect(previewSlotsIn('Trang bị'), 'vào lại lưới thì gợi ý phải hiện lại').toEqual([0])

		fireEvent.click(cellOf(0))
		expect(useGameStore.getState().run.equipped[0].slot, 'đặt vào ô đang trỏ, không phải ô cũ').toBe(0)
	})
})

describe('kéo-thả: thả ngoài ô đặt thì huỷ', () => {
	/**
	 * Bắt đầu kéo một món trong kho: `pointerdown` rồi `pointermove` xa hơn ngưỡng 4px.
	 *
	 * 📌 jsdom **không có layout**: mọi `getBoundingClientRect()` trả toàn số 0 và
	 * `document.elementFromPoint` không tồn tại. Vì vậy phải tự đặt vùng cho kho (`stubKhoRect`)
	 * và tự đẩy con trỏ (`movePointerTo`) thì hai nhánh "trong kho" / "ngoài kho" mới phân biệt
	 * được — nếu không, mọi cú thả đều rơi vào nhánh "cất vào kho".
	 */
	function batDauKeoTuKho(uid: string) {
		const tile = invTileOf(uid)
		fireEvent.pointerDown(tile, { button: 0, clientX: 10, clientY: 10 })
		fireEvent.pointerMove(tile, { clientX: 300, clientY: 300 })
		expect(ghost(), 'đã nhấc món lên').not.toBeNull()
	}

	/**
	 * Nhả chuột.
	 *
	 * ⚠️ Phải bọc `act`: `pointerup` ở đây nghe tại `document` (vì con trỏ có thể đang ở panel
	 * khác), nên không đi qua `fireEvent` — thiếu `act` thì state đã đổi mà DOM chưa render lại,
	 * và các câu kiểm tra DOM sẽ đọc phải giao diện cũ.
	 */
	function nhaChuot(x: number, y: number) {
		act(() => {
			document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: x, clientY: y }))
		})
	}

	it('thả ngoài lưới (sau khi con trỏ rời đi) → huỷ, không đặt vào ô cũ', () => {
		reset([], [{ uid: 'stored', templateId: 'jade-fury', star: 1, slot: 0, paid: 3 }])
		renderPrep()
		stubKhoRect(0, 0, 1000, 1000)

		batDauKeoTuKho('stored')
		movePointerTo(500, 500)
		hoverCell(9)
		fireEvent.pointerLeave(boardOf('Trang bị'))
		nhaChuot(500, 500)

		const run = useGameStore.getState().run
		expect(run.equipped, 'thả ngoài lưới thì không được đặt món').toHaveLength(0)
		expect(run.inventory.map((item) => item.uid), 'món vẫn nằm trong kho').toEqual(['stored'])
		expect(ghost(), 'đã nhả chuột thì không được còn ảnh bám con trỏ').toBeNull()
	})

	it('thả trong lưới → đặt đúng ô đang trỏ', () => {
		reset([], [{ uid: 'stored', templateId: 'jade-fury', star: 1, slot: 0, paid: 3 }])
		renderPrep()
		// Vùng kho **không** chứa (0,0) để nhánh "cất vào kho" không chen vào.
		stubKhoRect(200, 200, 100, 100)

		batDauKeoTuKho('stored')
		hoverCell(6)
		nhaChuot(0, 0)

		const run = useGameStore.getState().run
		expect(run.equipped.map((item) => item.slot), 'đặt đúng ô đang trỏ').toEqual([6])
		expect(run.inventory, 'đã rời kho').toHaveLength(0)
		expect(ghost(), 'đặt xong thì bỏ ảnh bám con trỏ').toBeNull()
	})
})

describe('xoay bằng R và chuột phải', () => {
	it('phím R đổi hướng món đang nhấc', () => {
		renderPrep()
		fireEvent.click(buttonOf('sword'))
		hoverCell(1)

		// Dọc 1×3 ở cột 1 → ô 1, 5, 9
		expect(previewSlots()).toEqual([1, 5, 9])

		pressKey('r')

		// Ngang 3×1, khối gợi ý căn giữa con trỏ nên kẹp về cột 0 → ô 0, 1, 2
		expect(previewSlots()).toEqual([0, 1, 2])
	})

	it('chuột phải cũng đổi hướng', () => {
		renderPrep()
		fireEvent.click(buttonOf('sword'))
		hoverCell(0)

		fireEvent.contextMenu(document)

		expect(previewSlots(), 'ngang 3×1 → một hàng 3 ô').toEqual([0, 1, 2])
	})

	it('R hai lần thì quay về hướng cũ', () => {
		renderPrep()
		fireEvent.click(buttonOf('sword'))
		hoverCell(0)

		pressKey('r')
		pressKey('r')

		expect(previewSlots()).toEqual([0, 4, 8])
	})
})

describe('đặt món xuống bằng bấm', () => {
	it('bấm ô thì món tới đúng ô đó', () => {
		reset([jade('gem', 0)], [])
		renderPrep()

		fireEvent.click(buttonOf('gem'))
		clickCell(5)

		const item = useGameStore.getState().run.equipped[0]
		expect(item.slot, 'phải rời ô 0 và tới ô 5').toBe(5)
		expect(ghost(), 'đặt xong thì bỏ nhấc').toBeNull()
	})

	it('hướng đã xoay được áp dụng khi đặt', () => {
		renderPrep()
		fireEvent.click(buttonOf('sword'))
		pressKey('r')
		clickCell(4)

		const item = useGameStore.getState().run.equipped[0]
		expect(item.rotated).toBe(true)
		expect(itemCells(item, 4)).toEqual([4, 5, 6])
	})

	it('bấm ô đang bị chiếm bởi món KHÁC LOẠI thì không nhập sao, không chồng ô', () => {
		// Cùng loại + cùng sao sẽ **nhập sao** (đúng luật), nên dùng hai loại khác nhau.
		reset([jade('a', 4), blade('b', 9)], [])
		renderPrep()
		fireEvent.click(buttonOf('b'))
		clickCell(4)

		// Ô 4 đã có 'a' → không thể hoán đổi (dao 1×3 không vừa chỗ 1 ô) nên 'b' giữ nguyên.
		const run = useGameStore.getState().run
		expect(run.equipped.find((item) => item.uid === 'a')!.slot).toBe(4)
		expect(run.equipped.find((item) => item.uid === 'b')!.slot, 'không được chồng lên ô 4').not.toBe(4)
	})

	it('bấm ô KHOÁ thì món không được đặt vào đó', () => {
		reset([jade('a', 0)], [])
		renderPrep()
		fireEvent.click(buttonOf('a'))
		// Ô 16 nằm hàng 5 — thú cấp 1 chỉ dùng 12 ô.
		clickCell(16)

		const run = useGameStore.getState().run
		expect(run.equipped, 'vẫn còn trên trang bị').toHaveLength(1)
		expect(run.equipped[0].slot, 'không được nằm ở ô khoá').toBeLessThan(12)
	})

	it('không cầm gì mà bấm ô thì không đổi gì', () => {
		renderPrep()
		clickCell(9)
		expect(useGameStore.getState().run.equipped[0].slot).toBe(0)
	})
})

describe('mang đồ từ kho lên', () => {
	it('bấm món trong kho rồi bấm ô thì món được mang lên', () => {
		reset([], [{ uid: 'stored', templateId: 'jade-fury', star: 1, slot: 0, paid: 3 }])
		renderPrep()

		fireEvent.click(invTileOf('stored'))
		clickCell(0)

		const run = useGameStore.getState().run
		expect(run.inventory).toHaveLength(0)
		expect(run.equipped).toHaveLength(1)
		expect(run.equipped[0].uid).toBe('stored')
	})

	it('món kho dài 1×4 tự xoay ngang khi lưới 3 hàng không đủ', () => {
		reset([], [{ uid: 'spear', templateId: 'fire-spear', star: 1, slot: 0, paid: 4 }])
		renderPrep()

		fireEvent.click(invTileOf('spear'))
		clickCell(0)

		const run = useGameStore.getState().run
		expect(run.inventory, 'phải đặt được, không để lại trong kho').toHaveLength(0)
		expect(run.equipped[0].rotated, 'phải xoay ngang mới vừa').toBe(true)
	})

	/**
	 * Cất vào kho giờ chỉ qua **kéo-thả xuống vùng kho** (kho là lưới nên không còn
	 * "bấm vùng trống để cất").
	 */
	it('kéo món của trang bị ra ngoài lưới (xuống vùng kho) thì cất vào kho', () => {
		reset([jade('gem', 0)], [])
		renderPrep()

		// `pointermove` bắn trên **phần tử đang giữ chuột** (nút món) — giống trình duyệt thật.
		const box = boxOf('gem').querySelector('button')!
		fireEvent.pointerDown(box, { button: 0, clientX: 10, clientY: 10 })
		fireEvent.pointerMove(box, { clientX: 400, clientY: 400 })
		expect(ghost(), 'đã nhấc món').not.toBeNull()

		// jsdom không có layout nên vùng lưới là 0×0 → mọi điểm đều coi như ngoài lưới.
		document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 400, clientY: 400 }))

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
