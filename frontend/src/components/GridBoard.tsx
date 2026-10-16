import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { templateFootprint, toCell } from '../game/bag'
import type { ItemInstance } from '../game/types'
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
	held: { uid: string; rotated: boolean; templateId: string } | null
	/** Vẽ nội dung một món; nhận sẵn thuộc tính cần gắn. */
	renderItem: (item: ItemInstance, box: ItemBoxProps) => ReactNode
	onPickCell?: (slot: number) => void
	onPickItem?: (item: ItemInstance) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean) => void
	onHoverSlot?: (slot: number | null) => void
	/** Báo **ô neo đang vẽ gợi ý** (khác ô thô khi gợi ý căn giữa con trỏ). */
	onAnchorSlot?: (slot: number | null) => void
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
	onPickCell,
	onPickItem,
	onDragStart,
	onDragEnd,
	onHoverSlot,
	onAnchorSlot,
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
			const slot = Number(fromTarget.dataset.cell)
			setHoverSlot(slot)
			hoverRef.current = slot
			baoOHover(slot)
			return
		}

		const fromPoint = document.elementFromPoint?.(event.clientX, event.clientY) as HTMLElement | null
		const fromPointCell = fromPoint?.closest?.<HTMLElement>('[data-cell]')
		if (fromPointCell?.dataset.cell !== undefined) {
			const slot = Number(fromPointCell.dataset.cell)
			setHoverSlot(slot)
			hoverRef.current = slot
			baoOHover(slot)
			return
		}

		const rect = board.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return
		if (event.clientX < rect.left || event.clientX > rect.right) return
		if (event.clientY < rect.top || event.clientY > rect.bottom) return
		const col = Math.min(width - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * width)))
		const row = Math.min(rows - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * rows)))
		const slot = row * width + col
		setHoverSlot(slot)
		hoverRef.current = slot
		baoOHover(slot)
	}

	/**
	 * Gợi ý chỗ đặt khi đang cầm món.
	 *
	 * ⚠️ **Một nguồn vị trí duy nhất** cho cả ô tô nền lẫn khung đứt. Nếu tính hai chỗ khác
	 * nhau (ví dụ ô tô theo `anchorFor`, khung vẽ theo vị trí căn giữa con trỏ) thì phần bóng
	 * mờ sẽ **lệch** khỏi khung.
	 *
	 * ⚠️ Khối gợi ý **căn giữa theo con trỏ**, không dán vào góc ô: món dài neo ở ô đầu nên
	 * nếu dán vào góc thì khối lệch hẳn khỏi tay người chơi.
	 */
	const tinhGoiY = (slot: number, item: { templateId: string; rotated: boolean } | null) => {
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

		return {
			anchor: drawRow * width + drawCol,
			cells,
			// Hợp lệ khi khối đủ ô **và** mọi ô đều nằm trong vùng dùng được.
			blocked:
				cells.length < size.w * size.h || cells.some((cell) => cell.slot >= usable),
		}
	}

	/**
	 * Báo lên cha **ô neo đang vẽ gợi ý**, để chỗ đặt dùng đúng ô đó.
	 *
	 * ❌ Không báo ô thô dưới con trỏ: gợi ý căn giữa nên ô neo khác ô thô, và nếu chỗ đặt tự
	 * tính lại thì món sẽ rơi lệch khỏi khung người chơi đang thấy.
	 */
	const baoOHover = (slot: number | null) => {
		onHoverSlot?.(slot)
		if (slot === null) {
			onAnchorSlot?.(null)
			return
		}
		onAnchorSlot?.(tinhGoiY(slot, held)?.anchor ?? slot)
	}

	const preview = held && hoverSlot !== null ? tinhGoiY(hoverSlot, held) : null

	useEffect(() => {
		if (!onDragEnd) return
		const finish = () => {
			const moved = pressRef.current?.moved ?? false
			pressRef.current = null
			onDragEnd(moved)
			window.setTimeout(() => {
				draggingRef.current = false
			}, 0)
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
			onClick={(event) => {
				if ((event.target as HTMLElement).closest('button[data-no-drop]')) return
				// Cú `click` đi kèm thao tác kéo không tính là bấm.
				if (draggingRef.current) return
				if (heldRef.current) {
					onPickCell?.(hoverRef.current ?? 0)
					return
				}
				// ❌ Không nhấc món ở đây: `buttonProps.onClick` của chính món đã làm việc đó,
				// và cú `click` này bubble lên nên sẽ chạy lần thứ hai → nhấc rồi bỏ ngay.
			}}
			className={cn('surface-board relative rounded-panel border border-dashed border-line', className)}
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

			{/* Ô gợi ý: cũng là **ô grid thật** nên khớp tuyệt đối với các ô nền. */}
			{preview?.cells.map((cell) => (
				<div
					key={`preview-${cell.slot}`}
					data-preview={cell.slot}
					className="pointer-events-none rounded-md bg-gold/20"
					style={{ gridColumn: `${cell.col + 1}`, gridRow: `${cell.row + 1}` }}
				/>
			))}

			{preview ? (
				<div
					data-preview-outline
					className={cn(
						'pointer-events-none rounded-md border-2 border-dashed',
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
						},
						onClick: () => {
							if (draggingRef.current) return
							onPickItem?.(item)
						},
					},
				})
			})}
			{overlay}
		</div>
	)
}
