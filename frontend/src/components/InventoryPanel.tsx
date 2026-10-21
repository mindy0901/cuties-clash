import { useGameStore } from '../store/gameStore'
import { InventoryGrid } from './InventoryGrid'
import { boardHeight } from './GridBoard'
import { STORAGE_MIN_ROWS } from '../game/storage'
import type { PointerPosition } from './GridBoard'
import { cn, panelClass, panelHeadClass, panelTitleClass } from './ui'
import { Button } from './ui/button'
import { ArrowUpDown } from './icons'
import type { HeldItem } from './useHeldItem'
import type { ItemInstance } from '../game/types'
import { translate } from '../i18n'

interface InventoryPanelProps {
	/** Receives the root element so the parent knows the "store into the inventory" drop area. */
	onRef?: (node: HTMLElement | null) => void
	/** The item currently being **dragged**, if any. */
	held: HeldItem | null
	/** Clicking an inventory item → opens the detail dialog. */
	onItemClick: (item: ItemInstance) => void
	/** Pointer over a tile → the hover card (`useItemHoverCard`). */
	onItemHover?: (item: ItemInstance, node: HTMLElement | null) => void
	/** Starts holding an item (beginning of the drag). */
	onDragStart?: (item: ItemInstance) => void
	/** Pointer release: `moved` tells whether it was dragged or merely clicked. */
	onDragEnd?: (moved: boolean, releasePosition: PointerPosition | null) => void
	/** Anchor cell the hint is drawn from inside the inventory (placement on release). */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
}

/**
 * **Inventory** — reserves, **unlimited**.
 *
 * A **free grid** exactly like the loadout grid: items keep the exact cell and orientation the
 * player chose, the inventory never packs them. The grid grows taller when an item sits lower, so
 * it holds any amount and simply scrolls vertically when there is more.
 */
export function InventoryPanel({
	onRef,
	held,
	onItemClick,
	onItemHover,
	onDragStart,
	onDragEnd,
	onAnchorSlot,
}: InventoryPanelProps) {
	const run = useGameStore((state) => state.run)
	const sortStorage = useGameStore((state) => state.sortStorage)

	return (
		<section ref={onRef} className={cn(panelClass, 'gap-2.5')}>
			<div className={panelHeadClass}>
				<div aria-hidden />
				<h2 className={panelTitleClass}>{translate('Kho đồ')}</h2>
				<div className="flex items-center justify-end gap-2 justify-self-end">
					<Button
						type="button"
						data-storage-sort
						size="sm"
						title={translate('Xếp lại kho: món mạnh trước, không còn ô trống')}
						disabled={run.inventory.length < 2}
						onClick={() => sortStorage()}
					>
						<ArrowUpDown /> {translate('Sắp xếp')}
					</Button>
				</div>
			</div>

			<InventoryGrid
				items={run.inventory}
				held={held}
				onItemClick={onItemClick}
				onItemHover={onItemHover}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onAnchorSlot={onAnchorSlot}
				// The viewport is **exactly `STORAGE_MIN_ROWS` rows tall** (8×8 by default), so the whole
				// default board is visible; a deeper stack scrolls instead of growing the panel.
				style={{ maxHeight: boardHeight(STORAGE_MIN_ROWS) }}
			/>
		</section>
	)
}
