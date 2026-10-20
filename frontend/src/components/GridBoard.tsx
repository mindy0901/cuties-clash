import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { isMergeable, itemCells, occupiedSides, occupantAt, takenCells, templateFootprint, toCell } from '../game/bag'
import { getTemplate, isWeaponClass } from '../game/items'
import { buffDirectionMask } from '../game/kits'
import type { ItemInstance } from '../game/types'
import type { HeldItem } from './useHeldItem'
import { DirectionOverlay } from './DirectionOverlay'
import { cn } from './ui'

/** Threshold (px) above which a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4
const BOARD_GAP = 4
const BOARD_PADDING = 6
const BOARD_BORDER = 1
/**
 * Width of one column, in px. 90 px — the same cell the arena uses, so an item looks the same size
 * everywhere.
 *
 * ⚠️ Fixed, ❌ do not use `1fr`: the two boards sit in panel columns of different widths, so
 * dividing by panel width would make the inventory cells bigger/smaller than the loadout cells.
 * With a fixed size both boards always have cells **of the same size**, as required by
 * "inventory shares the grid with loadout".
 */
export const CELL_SIZE = 90

/**
 * Pixel height of a board that has `rows` rows — cells, the gaps between them, the board's own
 * padding and its 1 px dashed border.
 *
 * ⚠️ Used to size a **scroll viewport** so it shows a whole number of rows (the storage shows its
 * default `STORAGE_MIN_ROWS` = 8 rows without a scrollbar): the height is a measurement derived from
 * `CELL_SIZE`, ❌ never a hand-picked `max-h-[600px]` that cuts the last row in half. `BOARD_BORDER`
 * is the `border` class on the board itself — leaving it out makes the viewport 2 px short and a
 * scrollbar appears on a board that fits.
 */
export function boardHeight(rows: number, cellSize = CELL_SIZE) {
	const scale = cellSize / CELL_SIZE
	return (
		rows * cellSize +
		(rows - 1) * BOARD_GAP * scale +
		2 * BOARD_PADDING * scale +
		2 * BOARD_BORDER
	)
}

export interface PointerPosition {
	x: number
	y: number
}

export interface ItemBoxProps {
	/** Attached to the item's outer element. */
	boxProps: {
		'data-item-box': string
		className: string
		style: CSSProperties
	}
	/**
	 * Grid position, precomputed so callers only have to spread it into `style`.
	 *
	 * ⚠️ An item must be a **real grid cell** (`gridColumn`/`gridRow`), ❌ do not use
	 * `position: absolute` with `%` coordinates: that does not follow the real columns/rows, so
	 * the hint and the item end up misaligned.
	 */
	grid: { column: string; row: string }
	/** Attached to the item's inner button. */
	buttonProps: {
		onPointerDown: (event: React.PointerEvent) => void
		onClick: () => void
	}
	/** Whether this item is currently held. */
	isHeld: boolean
}

export interface GridBoardProps {
	/** Number of columns. */
	width: number
	/** Number of rows. */
	rows: number
	/** Fixed cell size (px); loadout and inventory use `CELL_SIZE` by default. */
	cellSize?: number
	/** Number of usable cells; cells past this limit are dimmed as if locked. */
	usableCells?: number
	/** The items (already carrying a valid `slot`). */
	items: ItemInstance[]
	/** The item currently held. */
	held: HeldItem | null
	/** Renders one item's content; receives the attributes it must attach. */
	renderItem: (item: ItemInstance, box: ItemBoxProps) => ReactNode
	onItemClick?: (item: ItemInstance) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean, releasePosition: PointerPosition | null) => void
	onHoverSlot?: (slot: number | null) => void
	/** Reports the **anchor cell the hint is drawn from** (differs from the raw cell when the hint
	 * centers on the cursor) together with the blocked state. */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	/**
	 * Whether this board **swaps** items when dropped onto an item of a different kind.
	 *
	 * ✅ Loadout: yes (the rule "different items swap places").
	 * ❌ Inventory: **no** — it is a free grid, so dropping onto another item is **rejected**;
	 * the item already there must not be pushed elsewhere.
	 */
	allowSwap?: boolean
	overlay?: ReactNode
	className?: string
}

/**
 * Shared grid frame for **Loadout** and **Inventory**.
 *
 * It owns: the background cells (locked ones are dimmed), the **placement hint shown while an
 * item is held**, and all cursor tracking / drag-vs-click detection. Sharing it keeps the two
 * boards on the same formulas and the same hint look; only the data source and row count differ.
 *
 * ⚠️ Cells are derived from **cursor coordinates**, ❌ not from `mouseenter` on each cell: a long
 * item covers several cells, so the event fires on the **item**, not on the cell.
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
	const boardScale = cellSize / CELL_SIZE
	const cellGap = BOARD_GAP * boardScale
	const boardPadding = BOARD_PADDING * boardScale

	const boardRef = useRef<HTMLDivElement | null>(null)
	const [hoverSlot, setHoverSlot] = useState<number | null>(null)

	const pressRef = useRef<{ x: number; y: number; moved: boolean; uid: string } | null>(null)
	const draggingRef = useRef(false)

	// `click` fires after `pointerup`, so read the state through refs to keep it fresh.
	const heldRef = useRef(held)
	const itemsRef = useRef(items)
	const hoverRef = useRef<number | null>(null)
	useEffect(() => {
		heldRef.current = held
		itemsRef.current = items
	}, [held, items])

	/** Works out the cell under the cursor. */
	const track = (event: { clientX: number; clientY: number; target?: EventTarget | null }) => {
		const board = boardRef.current
		if (!board) return

		const fromTarget = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-cell]')
		if (fromTarget?.dataset.cell !== undefined) {
			setHover(Number(fromTarget.dataset.cell))
			return
		}

		const fromPoint = document.elementFromPoint?.(event.clientX, event.clientY) as HTMLElement | null
		const fromPointCell = fromPoint?.closest?.<HTMLElement>('[data-cell]')
		if (fromPointCell?.dataset.cell !== undefined) {
			setHover(Number(fromPointCell.dataset.cell))
			return
		}

		const rect = board.getBoundingClientRect()
		if (rect.width <= 0 || rect.height <= 0) return
		if (event.clientX < rect.left || event.clientX > rect.right) {
			setHover(null)
			return
		}
		if (event.clientY < rect.top || event.clientY > rect.bottom) {
			setHover(null)
			return
		}
		// Map against the fixed cell pitch; the outer rect also includes borders, padding and gaps.
		const x = event.clientX - rect.left - board.clientLeft - boardPadding
		const y = event.clientY - rect.top - board.clientTop - boardPadding
		const col = Math.min(width - 1, Math.max(0, Math.round((x - cellSize / 2) / (cellSize + cellGap))))
		const row = Math.min(rows - 1, Math.max(0, Math.round((y - cellSize / 2) / (cellSize + cellGap))))
		setHover(row * width + col)
	}

	/**
	 * Placement hint shown while an item is held.
	 *
	 * ⚠️ **A single source of position** for both the shaded cells and the dashed outline. If the
	 * two were computed differently (for example shading from `anchorFor` and the outline from
	 * the cursor-centered position), the shading would be **offset** from the outline.
	 *
	 * ⚠️ The hint block is **centered on the cursor**, not stuck to the corner of a cell: a long
	 * item is anchored at its first cell, so sticking it to the corner would pull the block far
	 * away from the player's hand. That is why the **anchor cell differs from the raw cell** under
	 * the cursor — and that anchor is reported to the parent (see the effect below) so that
	 * placement uses exactly it.
	 *
	 * `useCallback` so the anchor-reporting effect can reuse it without recomputing every render.
	 */
	const computePreview = useCallback(
		(slot: number, item: { templateId: string; rotated: boolean } | null) => {
			if (!item || usable <= 0) return null
			const size = templateFootprint(item.templateId, item.rotated)

			const hover = toCell(slot, width)
			const drawCol = Math.round(Math.max(0, Math.min(width - size.w, hover.col + 0.5 - size.w / 2)))
			const drawRow = Math.round(Math.max(0, Math.min(rows - size.h, hover.row + 0.5 - size.h / 2)))

			/** The cells the block will occupy, with grid coordinates so the drawing can plug
			 * straight into the grid. */
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
			// Drop area: does the block fit entirely inside the **usable** part of the grid (overflows
			// the board, or overlaps a locked cell of the cutie's level)?
			const outOfArea = cells.length < size.w * size.h || cells.some((cell) => cell.slot >= usable)

			// The cell **right under the cursor**:
			// - **star merge** (same template + same star) → always droppable, `resolveDrop` only folds
			//   it into the item under the cursor so the block's position no longer matters;
			// - different kind → **swap**, only when the board allows it (`allowSwap`); the inventory
			//   does **not**.
			const cursorItem = occupantAt(items, slot, width, held?.uid)
			const mergeable = !!held && !!cursorItem && isMergeable(held, cursorItem)
			const swapHere = allowSwap && !!cursorItem

			// Clashing with another item inside the block (other than the item under the cursor, since
			// that one is going to be merged/swapped).
			//
			// ⚠️ The two conditions must stay **separate**: overflowing the drop area is **always**
			// blocked, while the "pointing at an item" exception exists only to allow a **clash**.
			// Merging them would let a cursor standing on an item hide the overflow error — a 1×4
			// spear would still show a golden outline even when it spills two locked rows down
			// (this exact bug happened).
			const cursorCells = cursorItem ? itemCells(cursorItem, width) : []
			const taken = takenCells(items, width, held ? [held.uid] : [])
			const clash = cells.some(
				(cell) => taken.has(cell.slot) && !cursorCells.includes(cell.slot),
			)

			/**
			 * The held item's **direction overlay**, read at the cell it is hovering over: a support gem
			 * shows its four sides, and each side whose neighbour there is a weapon turns gold. This is
			 * the whole point of the preview for those items — "will my buff reach that blade?".
			 */
			const directionMask = held ? buffDirectionMask(getTemplate(held.templateId).kits, held.star) : 0
			const directionSides =
				directionMask === 0
					? { up: false, down: false, left: false, right: false }
					: occupiedSides(items, cells.map((cell) => cell.slot), held?.uid, width, rows * width, (templateId) =>
							isWeaponClass(getTemplate(templateId).cls),
						)

			return {
				anchor,
				cells,
				directionMask,
				directionSides,
				blocked: mergeable ? false : outOfArea || clash || (!!cursorItem && !swapHere),
			}
		},
		[width, rows, usable, items, held, allowSwap],
	)

	/**
	 * Cell under the cursor → **anchor cell the hint is drawn from**, reported to the parent so
	 * placement uses exactly that cell.
	 *
	 * ❌ Do not report the raw cell under the cursor: the hint is centered, so the anchor cell
	 * differs from the raw one; if placement recomputed it, the item would land off the outline
	 * the player is looking at.
	 *
	 * ⚠️ This must be an **effect**, ❌ not reported straight inside the event handler: `held`
	 * changes midway (the player presses `R` to rotate), which redraws the hint over a different
	 * block, so the anchor cell has to be recomputed too. Reporting once on cursor movement would
	 * leave the **old** anchor behind and the item would land off the visible outline — this exact
	 * bug happened when rotating mid-drag.
	 */
	useEffect(() => {
		onHoverSlot?.(hoverSlot)
		const hint = hoverSlot === null ? null : computePreview(hoverSlot, held)
		onAnchorSlot?.(hint ? hint.anchor : hoverSlot, Boolean(hint?.blocked))
	}, [hoverSlot, held, computePreview, onHoverSlot, onAnchorSlot])

	/** Records the cell under the cursor — shared by `hoverSlot` (draws the hint) and `hoverRef`
	 * (read on drop). */
	const setHover = (slot: number | null) => {
		setHoverSlot(slot)
		hoverRef.current = slot
	}

	const preview = held && hoverSlot !== null ? computePreview(hoverSlot, held) : null

	useEffect(() => {
		if (!onDragEnd) return
		const finish = (event: PointerEvent) => {
			const moved = pressRef.current?.moved ?? false
			pressRef.current = null
			onDragEnd(
				moved,
				event.type === 'pointerup' ? { x: event.clientX, y: event.clientY } : null,
			)
		}
		document.addEventListener('pointerup', finish)
		document.addEventListener('pointercancel', finish)
		return () => {
			document.removeEventListener('pointerup', finish)
			document.removeEventListener('pointercancel', finish)
		}
	}, [onDragEnd])

	// Keep the board at intrinsic height inside a scrolling flex parent so its surface covers every row.
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
			 * ⚠️ **REQUIRED**: when the cursor leaves the board the hovered cell must be cleared.
			 *
			 * The hovered cell is only **written** while the cursor moves over the board, so
			 * without these two handlers the old value stays forever: pick an item up, then move
			 * the cursor across the board (or just past it on the way elsewhere) and the board
			 * **still shows the hint on the old cell** even though the cursor is on another panel
			 * — worse, `onAnchorSlot` reads from the same variable, so **releasing elsewhere puts
			 * the item back into the old cell**.
			 */
			onPointerLeave={() => setHover(null)}
			onMouseLeave={() => setHover(null)}
			/**
			 * ⚠️ `select-none` is **required**, not decoration.
			 *
			 * Without it, holding the mouse on an empty cell makes the browser **start a text
			 * selection** (adjacent empty blocks can still form a selection). Chrome then switches
			 * to "drag-select" and, because a board is not a drop target, the cursor turns into
			 * **🚫** — the player thinks that cell cannot hold an item, while in reality no game
			 * drag is happening at all.
			 */
			className={cn(
				'surface-board relative shrink-0 self-start rounded-panel border border-dashed border-line select-none',
				className,
			)}
			style={
				{
					'--board-cols': `${width}`,
					// Cells use a fixed pixel size; default loadout and inventory boards share `CELL_SIZE`.
					//
					// ⚠️ ❌ Do not use `1fr`/`aspect-ratio`/`calc(100% / n)`: every way of dividing by
					// panel width leaves the two boards with **different** cell sizes (measured: 35px vs
					// 97px), and `calc(100% / n)` resolves against the height, producing squashed cells.
					// A fixed px value keeps both boards the same size, as required.
					gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
					gridAutoRows: `${cellSize}px`,
					// max-content: the board always has room for `width` columns, ❌ it is not squeezed by
					// the parent column (when squeezed, the outermost cells are clipped and items spill
					// outside the frame).
					width: 'max-content',
					display: 'grid',
					gap: cellGap,
					padding: boardPadding,
				} as CSSProperties
			}
		>
			{/*
			 * Direction overlay of the **drag preview**: drawn over the preview block, so a support gem
			 * shows, before it lands, which sides already have a weapon on them.
			 */}
			{preview && preview.directionMask !== 0 ? (
				<div
					data-preview-directions
					className="pointer-events-none relative z-20"
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
				>
					<DirectionOverlay
						mask={preview.directionMask}
						sides={preview.directionSides}
						cellSize={cellSize}
					/>
				</div>
			) : null}

			{/* Background cells: positioned **explicitly** from `slot`.
			    ⚠️ Required: letting CSS Grid auto-place them would order them by **DOM order**
			    instead of `slot`, so a long item in the middle would push the following cells to
			    another row — a 20-cell board would spread over 6 rows and the hint would drift.
			    Items and hint cells are placed explicitly too, so ❌ **do not** use
			    `grid-auto-flow: dense` (useless once everything is explicit). */}
			{Array.from({ length: totalSlots }, (_, slot) => {
				const { row, col } = toCell(slot, width)
				return (
					<div
						key={`cell-${slot}`}
						data-cell={slot}
						className={cn('rounded-md border border-white/5 bg-white/2', slot >= usable && 'opacity-25')}
						// `aspect-ratio` keeps the cell **square**: row height follows from column width.
						style={{ gridColumn: `${col + 1}`, gridRow: `${row + 1}`, aspectRatio: '1' }}
					/>
				)
			})}

			{/*
			 * Hint cells: also **real grid cells**, so they line up exactly with the background cells.
			 *
			 * ⚠️ They must sit **above the item layer** (`z-10`): an item is a grid cell with
			 * `relative`, so it is painted after the hint cells in the DOM and would **cover** the
			 * hint when the block overlaps an item — the player could not see where the item is
			 * about to land. `z-index` applies to grid cells even without `position`.
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
					// The item is a **real grid cell** → it always matches the columns/rows of the
					// background cells.
					grid: {
						column: `${col + 1} / span ${size.w}`,
						row: `${row + 1} / span ${size.h}`,
					},
					boxProps: {
						'data-item-box': item.uid,
						className: 'relative',
						style: {
							opacity: held?.uid === item.uid ? 0.45 : 1,
						},
					},
					buttonProps: {
						// `pressRef` is only **written** in the handler below (never read while
						// rendering), so oxlint's `react(refs)` warning here is a false positive.
						onPointerDown: (event: React.PointerEvent) => {
							if (event.button !== 0) return
							pressRef.current = { x: event.clientX, y: event.clientY, moved: false, uid: item.uid }
							// ⚠️ The "just dragged" flag is cleared on the **next press**, ❌ not with a
							// timer: the browser fires `click` right after `pointerup`, so a 0ms timer
							// depends on task ordering — sometimes the flag was already cleared when
							// `click` arrived and the press wrongly opened the detail dialog.
							draggingRef.current = false
						},
						onClick: () => {
							// A `click` that comes with a drag does not count as a press → no detail dialog.
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
