import { templateFootprint } from '../game/bag'
import { getTemplate } from '../game/items'
import type { ItemInstance } from '../game/types'
import { GridBoard, type ItemBoxProps } from './GridBoard'
import { RotateCcw, X } from './icons'
import { ItemTile } from './ItemTile'
import type { HeldItem } from './useHeldItem'
import { cn, iconButtonClass } from './ui'

/** Number of columns of the loadout board in the preparation room. */
export const LOADOUT_WIDTH = 4

export interface LoadoutGridProps {
	width?: number
	rows: number
	usableCells?: number
	items: ItemInstance[]
	/** Allows clicking/dragging items on the board (loadout only). */
	interactive?: boolean
	held?: HeldItem | null
	/** Clicking an item → opens the detail dialog. */
	onItemClick?: (item: ItemInstance) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean) => void
	onHoverSlot?: (slot: number | null) => void
	/** Anchor cell the hint is drawn from — placement uses exactly this cell. */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	onRotate?: (uid: string) => void
	onSell?: (uid: string) => void
	className?: string
	/**
	 * Draw this picture on every tile instead of the item's own art.
	 *
	 * Only the admin page uses it, to preview an image that has **not been saved yet** in a real
	 * tile. ❌ Not a second way to draw tiles: the markup stays here.
	 */
	artSrc?: string | null
}

/**
 * The **Loadout** grid — a thin layer on top of `GridBoard` that adds the ⟳ / ✕ buttons per item.
 * That way it shares **the same formulas and hint UI** as the inventory grid.
 */
export function LoadoutGrid({
	width = LOADOUT_WIDTH,
	rows,
	usableCells,
	items,
	interactive = false,
	held = null,
	onItemClick,
	onDragStart,
	onDragEnd,
	onHoverSlot,
	onAnchorSlot,
	onRotate,
	onSell,
	className,
	artSrc,
}: LoadoutGridProps) {
	const placed = items.filter((item) => item.slot >= 0 && item.slot < width * rows)

	const renderItem = (item: ItemInstance, box: ItemBoxProps) => {
		const size = templateFootprint(item.templateId, item.rotated)
		const template = getTemplate(item.templateId)
		return (
			<div {...box.boxProps} style={{ ...box.boxProps.style, gridColumn: box.grid.column, gridRow: box.grid.row }}>
				<button
					type="button"
					draggable={false}
					{...box.buttonProps}
					className={cn('relative block size-full', interactive && 'cursor-pointer')}
					title={`${template.name} ${size.w}×${size.h}`}
				>
					<ItemTile templateId={item.templateId} star={item.star} artSrc={artSrc} />
					{interactive && (onRotate || onSell) ? (
						<span className="absolute right-0.5 bottom-0.5 flex gap-1 opacity-0 transition-opacity duration-100 group-hover/slot:opacity-100">
							{onRotate ? (
								<button
									type="button"
									data-no-drop
									className={iconButtonClass}
									title="Xoay 90°"
									onClick={(event) => {
										event.stopPropagation()
										onRotate(item.uid)
									}}
								>
									<RotateCcw />
								</button>
							) : null}
							{onSell ? (
								<button
									type="button"
									data-no-drop
									className={iconButtonClass}
									title="Bán món này (hoàn 50%)"
									onClick={(event) => {
										event.stopPropagation()
										onSell(item.uid)
									}}
								>
									<X />
								</button>
							) : null}
						</span>
					) : null}
				</button>
			</div>
		)
	}

	return (
		<GridBoard
			width={width}
			rows={rows}
			usableCells={usableCells}
			items={placed}
			held={held}
			renderItem={renderItem}
			onItemClick={onItemClick}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onHoverSlot={onHoverSlot}
			onAnchorSlot={onAnchorSlot}
			className={className}
		/>
	)
}
