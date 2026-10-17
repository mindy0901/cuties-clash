import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { isMergeable, itemCells, occupantAt, takenCells, templateFootprint, toCell } from '../game/bag'
import type { ItemInstance } from '../game/types'
import type { HeldItem } from './useHeldItem'
import { cn } from './ui'

/** Ngưỡng (px) để coi là kéo chứ không phải bấm. */
const DRAG_THRESHOLD = 4

/**
 * Bề rộng một cột, tính bằng px.
 *
 * ⚠️ Cố định, ❌ không dùng `1fr`: hai bảng nằm ở hai cột panel rộng khác nhau, nên nếu chia
 * theo bề rộng panel thì ô của kho sẽ to/nhỏ khác ô của trang bị. Cố định thì hai bảng luôn
 * có ô **cùng cỡ**, đúng yêu cầu "kho dùng chung grid với trang bị".
 */
export const CELL_SIZE = 60



export interface ItemBoxProps {
	/** Gắn vào phần tử bao ngoài món. */
	boxProps: {
		key: string
		'data-item-box': string
		className: string
		style: CSSProperties
	}
	/**
	 * Vị trí trong lưới, tính sẵn để chỗ gọi chỉ việc gắn vào style.
	 *
	 * ⚠️ Món phải là **ô grid thật** (`gridColumn`/`gridRow`), ❌ không dùng `position: absolute`
	 * cộng toạ độ `%`: cách đó không bám theo cột/hàng thật nên gợi ý và món bị lệch.
	 */
	grid: { column: string; row: string }
	/** Gắn vào nút bên trong món. */
	buttonProps: {
		onPointerDown: (event: React.PointerEvent) => void
		onClick: () => void
	}
	/** Món này có đang được cầm không. */
	isHeld: boolean
}

export interface GridBoardProps {
	/** Số cột. */
	width: number
	/** Số hàng. */
	rows: number
	/** Cỡ một ô (px). Cả hai bảng dùng chung `CELL_SIZE` nên ô luôn cùng cỡ. */
	cellSize?: number
	/** Số ô dùng được; ô vượt mức này hiển thị mờ như bị khoá. */
	usableCells?: number
	/** Các món (đã có `slot` hợp lệ). */
	items: ItemInstance[]
	/** Món đang được cầm. */
	held: HeldItem | null
	/** Vẽ nội dung một món; nhận sẵn thuộc tính cần gắn. */
	renderItem: (item: ItemInstance, box: ItemBoxProps) => ReactNode
	onItemClick?: (item: ItemInstance) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean) => void
	onHoverSlot?: (slot: number | null) => void
	/** Báo **ô neo đang vẽ gợi ý** (khác ô thô khi gợi ý căn giữa con trỏ) kèm trạng thái chặn. */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	/**
	 * Lưới này có **hoán đổi** khi thả đè lên món khác loại không.
	 *
	 * ✅ Trang bị: có (luật "khác nhau thì hoán đổi vị trí").
	 * ❌ Kho: **không** — kho là lưới tự do nên thả đè lên món khác là **từ chối**, chứ không được
	 * đẩy món đang nằm đó sang chỗ khác.
	 */
	allowSwap?: boolean
	overlay?: ReactNode
	className?: string
}

/**
 * Khung lưới dùng chung cho **Trang bị** và **Kho đồ**.
 *
 * Gồm: ô nền (ô khoá thì mờ), **gợi ý chỗ đặt khi đang cầm món**, và toàn bộ việc theo dõi
 * con trỏ / phân biệt kéo với bấm. Nhờ dùng chung nên hai bảng có cùng công thức và cùng
 * giao diện gợi ý, chỉ khác nguồn dữ liệu và số hàng.
 *
 * ⚠️ Ô tính theo **toạ độ con trỏ**, ❌ không dùng `mouseenter` trên từng ô: món dài phủ lên
 * nhiều ô nên sự kiện bắn lên **món** chứ không phải ô.
 */
export function GridBoard({
	width,
	rows,
	cellSize = CELL_SIZE,
	usableCells,
	items,
	held,
	renderItem,
	onItemClick,
	onDragStart,
	onDragEnd,
	onHoverSlot,
	onAnchorSlot,
	allowSwap = true,
	overlay,
	className,
}: GridBoardProps) {
	const totalSlots = width * rows
	const usable = usableCells ?? totalSlots

	const boardRef = useRef<HTMLDivElement | null>(null)
	const [hoverSlot, setHoverSlot] = useState<number | null>(null)

	const pressRef = useRef<{ x: number; y: number; moved: boolean; uid: string } | null>(null)
	const draggingRef = useRef(false)

	// `click` bắn sau `pointerup`, nên đọc trạng thái qua ref cho tươi.
	const heldRef = useRef(held)
	const itemsRef = useRef(items)
	const hoverRef = useRef<number | null>(null)
	useEffect(() => {
		heldRef.current = held
		itemsRef.current = items
	}, [held, items])

	/** Tính ô dưới con trỏ. */
	const track = (event: { clientX: number; clientY: number; target?: EventTarget | null }) => {
		const board = boardRef.current
		if (!board) return

		const fromTarget = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-cell]')
		if (fromTarget?.dataset.cell !== undefined) {
			datO(Number(fromTarget.dataset.cell))
			return
		}

		const fromPoint = document.elementFromPoint?.(event.clientX, event.clientY) as HTMLElement | null
		const fromPointCell = fromPoint?.closest?.<HTMLElement>('[data-cell]')
		if (fromPointCell?.dataset.cell !== undefined) {
			datO(Number(fromPointCell.dataset.cell))
			return
		}

		const rect = board.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return
		if (event.clientX < rect.left || event.clientX > rect.right) return
		if (event.clientY < rect.top || event.clientY > rect.bottom) return
		const col = Math.min(width - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * width)))
		const row = Math.min(rows - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * rows)))
		datO(row * width + col)
	}

	/**
	 * Gợi ý chỗ đặt khi đang cầm món.
	 *
	 * ⚠️ **Một nguồn vị trí duy nhất** cho cả ô tô nền lẫn khung đứt. Nếu tính hai chỗ khác
	 * nhau (ví dụ ô tô theo `anchorFor`, khung vẽ theo vị trí căn giữa con trỏ) thì phần bóng
	 * mờ sẽ **lệch** khỏi khung.
	 *
	 * ⚠️ Khối gợi ý **căn giữa theo con trỏ**, không dán vào góc ô: món dài neo ở ô đầu nên
	 * nếu dán vào góc thì khối lệch hẳn khỏi tay người chơi. Vì vậy **ô neo khác ô thô** dưới
	 * con trỏ — và ô neo đó được báo lên cha (xem effect bên dưới) để chỗ đặt dùng đúng nó.
	 *
	 * `useCallback` để effect báo ô neo dùng lại được mà không phải tính lại mỗi render.
	 */
	const tinhGoiY = useCallback(
		(slot: number, item: { templateId: string; rotated: boolean } | null) => {
			if (!item || usable <= 0) return null
			const size = templateFootprint(item.templateId, item.rotated)

			const hover = toCell(slot, width)
			const drawCol = Math.round(Math.max(0, Math.min(width - size.w, hover.col + 0.5 - size.w / 2)))
			const drawRow = Math.round(Math.max(0, Math.min(rows - size.h, hover.row + 0.5 - size.h / 2)))

			/** Các ô khối sẽ chiếm, kèm toạ độ lưới để chỗ vẽ gắn thẳng vào grid. */
			const cells: { slot: number; col: number; row: number }[] = []
			for (let r = 0; r < size.h; r += 1) {
				for (let c = 0; c < size.w; c += 1) {
					const row = drawRow + r
					const col = drawCol + c
					if (row >= rows || col >= width) continue
					cells.push({ slot: row * width + col, col, row })
				}
			}
			if (cells.length === 0) return null

			const anchor = drawRow * width + drawCol
			// Vùng đặt: khối có nằm trọn trong phần lưới **dùng được** không (tràn lưới, hoặc lấn ô
			// khoá của cấp thú)?
			const outOfArea = cells.length < size.w * size.h || cells.some((cell) => cell.slot >= usable)

			// Ô **ngay dưới con trỏ**:
			// - **nhập sao** (cùng template + cùng sao) → luôn thả được, `resolveDrop` chỉ gộp vào món
			//   dưới con trỏ nên vị trí khối không còn quan trọng;
			// - khác loại → **hoán đổi**, chỉ khi lưới cho phép (`allowSwap`); kho thì **không**.
			const cursorItem = occupantAt(items, slot, width, held?.uid)
			const mergeable = !!held && !!cursorItem && isMergeable(held, cursorItem)
			const swapHere = allowSwap && !!cursorItem

			// Vướng món khác trong khối (ngoài món dưới con trỏ, vì món đó sẽ được gộp/đổi chỗ).
			//
			// ⚠️ Hai điều kiện phải **tách rời**: tràn vùng đặt thì **luôn** chặn, còn ngoại lệ "trỏ
			// vào một món" chỉ dành cho việc **vướng món**. Gộp chúng lại thì con trỏ đứng trên một món
			// sẽ che mất lỗi tràn vùng — thương 1×4 vẫn hiện viền vàng dù tràn xuống hai hàng khoá
			// (đã gặp đúng lỗi này).
			const cursorCells = cursorItem ? itemCells(cursorItem, width) : []
			const taken = takenCells(items, width, held ? [held.uid] : [])
			const clash = cells.some(
				(cell) => taken.has(cell.slot) && !cursorCells.includes(cell.slot),
			)

			return {
				anchor,
				cells,
				blocked: mergeable ? false : outOfArea || clash || (!!cursorItem && !swapHere),
			}
		},
		[width, rows, usable, items, held, allowSwap],
	)

	/**
	 * Ô đang trỏ → **ô neo đang vẽ gợi ý**, báo lên cha để chỗ đặt dùng đúng ô đó.
	 *
	 * ❌ Không báo ô thô dưới con trỏ: gợi ý căn giữa nên ô neo khác ô thô, và nếu chỗ đặt tự
	 * tính lại thì món sẽ rơi lệch khỏi khung người chơi đang thấy.
	 *
	 * ⚠️ Phải là **effect**, ❌ không báo ngay trong lúc xử lý sự kiện: `held` đổi giữa chừng
	 * (người chơi bấm `R` để xoay) làm gợi ý vẽ lại ở khối khác, nên ô neo cũng phải tính lại.
	 * Báo một lần lúc con trỏ di chuyển thì ô neo **cũ** nằm lại, và món rơi lệch khỏi khung
	 * đang thấy — đã gặp đúng lỗi này khi xoay giữa lúc kéo.
	 */
	useEffect(() => {
		onHoverSlot?.(hoverSlot)
		const goiY = hoverSlot === null ? null : tinhGoiY(hoverSlot, held)
		onAnchorSlot?.(goiY ? goiY.anchor : hoverSlot, Boolean(goiY?.blocked))
	}, [hoverSlot, held, tinhGoiY, onHoverSlot, onAnchorSlot])

	/** Ghi ô đang trỏ — dùng chung cho `hoverSlot` (vẽ gợi ý) và `hoverRef` (đọc lúc thả). */
	const datO = (slot: number | null) => {
		setHoverSlot(slot)
		hoverRef.current = slot
	}

	const preview = held && hoverSlot !== null ? tinhGoiY(hoverSlot, held) : null

	useEffect(() => {
		if (!onDragEnd) return
		const finish = () => {
			const moved = pressRef.current?.moved ?? false
			pressRef.current = null
			onDragEnd(moved)
		}
		document.addEventListener('pointerup', finish)
		document.addEventListener('pointercancel', finish)
		return () => {
			document.removeEventListener('pointerup', finish)
			document.removeEventListener('pointercancel', finish)
		}
	}, [onDragEnd])

	return (
		<div
			ref={boardRef}
			data-grid-board
			onPointerMove={(event) => {
				const press = pressRef.current
				if (press && !press.moved && onDragStart) {
					const far = Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_THRESHOLD
					if (far) {
						press.moved = true
						draggingRef.current = true
						const item = itemsRef.current.find((entry) => entry.uid === press.uid)
						if (item) onDragStart(item)
					}
				}
				if (heldRef.current) track(event)
			}}
			onMouseMove={(event) => {
				if (heldRef.current) track(event)
			}}
			/**
			 * ⚠️ **BẮT BUỘC**: con trỏ rời lưới thì phải xoá ô đang trỏ.
			 *
			 * Ô đang trỏ chỉ được **ghi** khi con trỏ đi qua lưới, nên thiếu hai handler này thì
			 * giá trị cũ nằm lại vĩnh viễn: nhấc một món rồi đưa con trỏ ngang qua lưới (hoặc chỉ
			 * lướt qua trên đường tới chỗ khác) là lưới **vẫn hiện gợi ý ở ô cũ** dù con trỏ đã ở
			 * panel khác — và tệ hơn, `onAnchorSlot` cũng lấy từ cùng biến đó nên **thả chuột ở
			 * chỗ khác lại đặt món vào ô cũ**.
			 */
			onPointerLeave={() => datO(null)}
			onMouseLeave={() => datO(null)}
			/**
			 * ⚠️ `select-none` là **bắt buộc**, không phải trang trí.
			 *
			 * Không có nó thì giữ chuột ở một ô trống là trình duyệt **bắt đầu bôi đen** (các ô là
			 * khối rỗng cạnh nhau vẫn tạo được vùng chọn). Khi đó Chrome chuyển sang thao tác "kéo
			 * vùng bôi đen", và vì lưới không phải chỗ nhận drop nên con trỏ đổi thành **🚫** — người
			 * chơi tưởng ô đó không đặt được đồ, trong khi thật ra chẳng có thao tác kéo nào của game.
			 */
			className={cn(
				'surface-board relative rounded-panel border border-dashed border-line select-none',
				className,
			)}
			style={
				{
					'--board-cols': `${width}`,
					// Ô **vuông cố định `CELL_SIZE` px**, ở **cả hai bảng**.
					//
					// ⚠️ ❌ Không dùng `1fr`/`aspect-ratio`/`calc(100% / n)`: mọi cách chia theo bề
					// rộng panel đều làm hai bảng ra cỡ ô **khác nhau** (đã đo: 35px vs 97px), và
					// `calc(100% / n)` còn giải theo chiều cao nên ra ô dẹt. Cố định px thì hai bảng
					// luôn cùng cỡ, đúng yêu cầu.
					gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
					gridAutoRows: `${cellSize}px`,
					// max-content: bảng luôn đủ chỗ cho `width` cột, ❌ không bị cột cha bóp lại
					// (bị bóp thì các ô ngoài cùng bị cắt và món tràn ra ngoài khung).
					width: 'max-content',
					display: 'grid',
					gap: 4,
					padding: 6,
				} as CSSProperties
			}
		>
			{/* Ô nền: đặt vị trí **tường minh** theo `slot`.
			    ⚠️ Bắt buộc: để CSS Grid tự xếp (auto-placement) thì nó xếp theo **thứ tự DOM**
			    chứ không theo `slot`, nên món dài nằm giữa sẽ đẩy các ô sau sang hàng khác —
			    lưới 20 ô trải thành 6 hàng và gợi ý lệch. Món và ô gợi ý cũng đặt tường minh,
			    nên ❌ **không** dùng `grid-auto-flow: dense` (vô ích khi mọi thứ đã tường minh). */}
			{Array.from({ length: totalSlots }, (_, slot) => {
				const { row, col } = toCell(slot, width)
				return (
					<div
						key={`cell-${slot}`}
						data-cell={slot}
						className={cn('rounded-md border border-white/5 bg-white/2', slot >= usable && 'opacity-25')}
						// `aspect-ratio` giữ ô **vuông**: chiều cao hàng suy ra từ bề rộng cột.
						style={{ gridColumn: `${col + 1}`, gridRow: `${row + 1}`, aspectRatio: '1' }}
					/>
				)
			})}

			{/*
			 * Ô gợi ý: cũng là **ô grid thật** nên khớp tuyệt đối với các ô nền.
			 *
			 * ⚠️ Phải nằm **trên lớp món** (`z-10`): món là ô grid có `relative` nên vẽ sau các ô
			 * gợi ý trong DOM và sẽ **che mất** gợi ý khi khối đè lên món — người chơi không thấy
			 * được mình sắp đặt vào đâu. `z-index` áp dụng cho ô grid kể cả khi không `position`.
			 */}
			{preview?.cells.map((cell) => (
				<div
					key={`preview-${cell.slot}`}
					data-preview={cell.slot}
					className="pointer-events-none z-10 rounded-md bg-gold/20"
					style={{ gridColumn: `${cell.col + 1}`, gridRow: `${cell.row + 1}` }}
				/>
			))}

			{preview ? (
				<div
					data-preview-outline
					className={cn(
						'pointer-events-none z-10 rounded-md border-2 border-dashed',
						preview.blocked ? 'border-danger' : 'border-gold',
					)}
					style={{
						gridColumn: `${Math.min(...preview.cells.map((c) => c.col)) + 1} / span ${
							Math.max(...preview.cells.map((c) => c.col)) -
							Math.min(...preview.cells.map((c) => c.col)) +
							1
						}`,
						gridRow: `${Math.min(...preview.cells.map((c) => c.row)) + 1} / span ${
							Math.max(...preview.cells.map((c) => c.row)) -
							Math.min(...preview.cells.map((c) => c.row)) +
							1
						}`,
					}}
				/>
			) : null}

			{items.map((item) => {
				const size = templateFootprint(item.templateId, item.rotated)
				const { row, col } = toCell(item.slot, width)
				return renderItem(item, {
					isHeld: held?.uid === item.uid,
					// Món là **ô grid thật** → luôn khớp cột/hàng với các ô nền.
					grid: {
						column: `${col + 1} / span ${size.w}`,
						row: `${row + 1} / span ${size.h}`,
					},
					boxProps: {
						key: item.uid,
						'data-item-box': item.uid,
						className: 'group/slot relative',
						style: {
							opacity: held?.uid === item.uid ? 0.45 : 1,
						},
					},
					buttonProps: {
						// `pressRef` chỉ được **ghi** trong handler dưới đây (không đọc lúc render),
						// nên cảnh báo `react(refs)` của oxlint ở đây là dương tính giả.
						onPointerDown: (event: React.PointerEvent) => {
							if (event.button !== 0) return
							pressRef.current = { x: event.clientX, y: event.clientY, moved: false, uid: item.uid }
							// ⚠️ Cờ "vừa kéo" hạ xuống ở **lần giữ chuột kế tiếp**, ❌ không dùng hẹn giờ:
							// trình duyệt bắn `click` ngay sau `pointerup`, nên hẹn giờ 0ms phụ thuộc thứ tự
							// task — có lúc cờ đã hạ trước khi `click` tới, và cú bấm mở chi tiết oan.
							draggingRef.current = false
						},
						onClick: () => {
							// Cú `click` đi kèm thao tác kéo không tính là bấm → không mở chi tiết.
							if (draggingRef.current) return
							onItemClick?.(item)
						},
					},
				})
			})}
			{overlay}
		</div>
	)
}
