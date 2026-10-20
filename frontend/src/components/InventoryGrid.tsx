import { useMemo, type CSSProperties } from 'react'
import { directionSidesFor, templateFootprint } from '../game/bag'
import { getTemplate } from '../game/items'
import { buffDirectionMask } from '../game/kits'
import { DirectionOverlay } from './DirectionOverlay'
import { storageShape, repairStorageSlots } from '../game/storage'
import type { ItemInstance } from '../game/types'
import { CELL_SIZE, GridBoard, type ItemBoxProps, type PointerPosition } from './GridBoard'
import { ItemTile } from './ItemTile'
import type { HeldItem } from './useHeldItem'
import { cn } from './ui'
import { translate } from '../i18n'

export interface InventoryGridProps {
	items: ItemInstance[]
	held: HeldItem | null
	/** Clicking an item → opens the detail dialog. */
	onItemClick?: (item: ItemInstance) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean, releasePosition: PointerPosition | null) => void
	/** Anchor cell the hint is drawn from — placement on pointer release uses exactly this cell. */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	className?: string
	/** Measured size for the scroll viewport (e.g. `maxHeight: boardHeight(8)`). */
	style?: CSSProperties
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
	className,
	style,
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
		// Same overlay as the loadout: a gem in storage still shows which sides its buff covers.
		const directionMask = buffDirectionMask(template.kits, item.star)
		return (
			<div key={item.uid} {...box.boxProps} className="relative" style={{ ...box.boxProps.style, gridColumn: box.grid.column, gridRow: box.grid.row }}>
				<button
					type="button"
					draggable={false}
					data-inv-tile={item.uid}
					{...box.buttonProps}
					className="relative block size-full"
					title={`${translate(template.name)} ${size.w}×${size.h}`}
				>
					<ItemTile templateId={item.templateId} star={item.star} rotated={item.rotated} />
					{directionMask !== 0 ? (
						<DirectionOverlay
							mask={directionMask}
							sides={directionSidesFor(item, placed, width, width * rows)}
							cellSize={CELL_SIZE}
						/>
					) : null}
				</button>
			</div>
		)
	}

	return (
		// `overflow-auto`, not `-y`: at CELL_SIZE = 90 the 8 columns are wider than the middle column on
		// a normal screen, and the board must scroll instead of being clipped.
		<div className={cn('flex justify-center overflow-auto scroll-hidden', className)} style={style}>
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
