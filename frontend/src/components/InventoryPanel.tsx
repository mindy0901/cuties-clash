import { useGameStore } from '../store/gameStore'
import { InventoryGrid } from './InventoryGrid'
import { cn, panelClass, panelHeadClass, panelTitleClass } from './ui'
import type { HeldItem } from './useHeldItem'
import type { ItemInstance } from '../game/types'

interface InventoryPanelProps {
	/** Receives the root element so the parent knows the "store into the inventory" drop area. */
	onRef?: (node: HTMLElement | null) => void
	/** The item currently being **dragged**, if any. */
	held: HeldItem | null
	/** Clicking an inventory item → opens the detail dialog. */
	onItemClick: (item: ItemInstance) => void
	/** Starts holding an item (beginning of the drag). */
	onDragStart?: (item: ItemInstance) => void
	/** Pointer release: `moved` tells whether it was dragged or merely clicked. */
	onDragEnd?: (moved: boolean) => void
	/** Anchor cell the hint is drawn from inside the inventory (placement on release). */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	onRotate?: (uid: string) => void
	onSell?: (uid: string) => void
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
	onDragStart,
	onDragEnd,
	onAnchorSlot,
	onRotate,
	onSell,
}: InventoryPanelProps) {
	const run = useGameStore((state) => state.run)
	const sell = useGameStore((state) => state.sell)

	return (
		<section ref={onRef} className={cn(panelClass, 'gap-2.5')}>
			<div className={panelHeadClass}>
				<h2 className={panelTitleClass}>Kho đồ</h2>
				<span className="text-[11px] text-muted">{run.inventory.length} món · không giới hạn</span>
			</div>

			<InventoryGrid
				items={run.inventory}
				held={held}
				onItemClick={onItemClick}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onAnchorSlot={onAnchorSlot}
				onRotate={onRotate}
				onSell={onSell ?? sell}
				className="max-h-[520px]"
			/>
		</section>
	)
}
