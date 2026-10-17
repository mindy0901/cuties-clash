import { useMemo } from 'react'
import { templateFootprint } from '../game/bag'
import { getTemplate } from '../game/items'
import { storageShape, repairStorageSlots } from '../game/storage'
import type { ItemInstance } from '../game/types'
import { GridBoard, type ItemBoxProps } from './GridBoard'
import { ItemIcon } from './ItemIcon'
import type { HeldItem } from './useHeldItem'
import { ITEM_STAR_TEXT, cn, itemTileClass } from './ui'

export interface InventoryGridProps {
	items: ItemInstance[]
	held: HeldItem | null
	/** Clicking an item → opens the detail dialog. */
	onItemClick?: (item: ItemInstance) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean) => void
	/** Anchor cell the hint is drawn from — placement on pointer release uses exactly this cell. */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	onRotate?: (uid: string) => void
	onSell?: (uid: string) => void
	className?: string
}

/**
 * The **Inventory** grid — a **free grid** exactly like the loadout grid, sharing **`GridBoard`**
 * so cells and placement hints look the same.
 *
 * ⚠️ The inventory ❌ **does not pack items**: each item keeps the exact `slot`/`rotated` the
 * player chose, so it lands where it was dropped and can face either way. An earlier version
 * packed items one after another and overwrote the cell just dropped on, which made dragging
 * inside the inventory look like "dragging does nothing".
 *
 * Differences from the loadout:
 * - **Unlimited** — the grid grows taller when an item sits lower (see `storageRows`), with **no
 *   locked cells**.
 * - ❌ **No swapping** (`allowSwap={false}`): dropping onto an item of a **different kind** is
 *   **rejected** with a red outline instead of pushing the item already there elsewhere. The
 *   inventory is a free grid, so there is always an empty cell to use; to swap places, drag the
 *   other item away first. Dropping onto an **identical** item still **merges stars** as usual.
 */
export function InventoryGrid({
	items,
	held,
	onItemClick,
	onDragStart,
	onDragEnd,
	onAnchorSlot,
	onRotate,
	onSell,
	className,
}: InventoryGridProps) {
	// Items missing a cell (older saves used `slot: -1`) must still be **shown**: they are laid out
	// temporarily so nothing becomes invisible. Items with a valid position are kept as-is, so
	// normally this list matches the store exactly.
	const shown = useMemo(() => repairStorageSlots(items), [items])
	const { width, rows, usable } = storageShape(shown)
	const placed = shown.filter((item) => item.slot >= 0 && item.slot < usable)

	const renderItem = (item: ItemInstance, box: ItemBoxProps) => {
		const size = templateFootprint(item.templateId, item.rotated)
		const template = getTemplate(item.templateId)
		return (
			<div {...box.boxProps} className="group/inv relative" style={{ ...box.boxProps.style, gridColumn: box.grid.column, gridRow: box.grid.row }}>
				<button
					type="button"
					draggable={false}
					data-inv-tile={item.uid}
					{...box.buttonProps}
					className={cn(
						'surface-item relative flex size-full cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-line p-1 text-center select-none',
						itemTileClass(template.cls, template.quality),
					)}
					title={`${template.name} ${size.w}×${size.h}`}
					data-item-quality={template.quality}
				>
					<span className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
						<ItemIcon templateId={item.templateId} />
					</span>
					{/* Same as `LoadoutGrid`: stars under the picture, name in the tooltip. */}
					<span
						data-item-stars={item.star}
						className={cn(
							'shrink-0 text-[10px] leading-none tracking-[-1px] whitespace-nowrap drop-shadow-[0_1px_1px_rgb(0_0_0/70%)]',
							ITEM_STAR_TEXT[item.star],
						)}
					>
						{'★'.repeat(item.star)}
					</span>
					{onRotate || onSell ? (
						<span className="absolute right-0.5 bottom-0.5 flex gap-1 opacity-0 transition-opacity duration-100 group-hover/inv:opacity-100">
							{onRotate ? (
								<button
									type="button"
									data-no-drop
									className="grid size-5 place-items-center rounded-md border border-line bg-black/65 text-[11px] hover:border-gold"
									title="Xoay 90°"
									onClick={(event) => {
										event.stopPropagation()
										onRotate(item.uid)
									}}
								>
									⟳
								</button>
							) : null}
							{onSell ? (
								<button
									type="button"
									data-no-drop
									className="grid size-5 place-items-center rounded-md border border-line bg-black/65 text-[11px] hover:border-gold"
									title="Bán món này (hoàn 50%)"
									onClick={(event) => {
										event.stopPropagation()
										onSell(item.uid)
									}}
								>
									✕
								</button>
							) : null}
						</span>
					) : null}
				</button>
			</div>
		)
	}

	return (
		<div className={cn('flex justify-center overflow-y-auto scroll-hidden', className)}>
			<GridBoard
				width={width}
				rows={rows}
				usableCells={usable}
				items={placed}
				held={held}
				allowSwap={false}
				renderItem={renderItem}
				onItemClick={onItemClick}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onAnchorSlot={onAnchorSlot}
			/>
		</div>
	)
}
