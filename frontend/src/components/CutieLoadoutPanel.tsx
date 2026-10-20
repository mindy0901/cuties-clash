import { GRID_MAX_ROWS, getCutie, cutieLevelStats } from '../game/cuties'
import { useGameStore } from '../store/gameStore'
import { LoadoutGrid } from './LoadoutGrid'
import type { PointerPosition } from './GridBoard'
import { ArrowDown } from './icons'
import { cn, panelClass, panelHeadClass, panelTitleClass, type ShopDropTarget } from './ui'
import { Button } from './ui/button'
import { ShopButton } from './ShopButton'
import type { HeldItem } from './useHeldItem'
import type { ItemInstance } from '../game/types'
import { translate } from '../i18n'

interface CutieLoadoutPanelProps {
	/** The item currently being dragged, if any. */
	held: HeldItem | null
	/** Clicking an item → opens the detail dialog. */
	onItemClick: (item: ItemInstance) => void
	/** Starts holding an item (beginning of the drag). */
	onDragStart?: (item: ItemInstance) => void
	/** Pointer release: `moved` tells whether it was dragged or merely clicked. */
	onDragEnd?: (moved: boolean, releasePosition: PointerPosition | null) => void
	onHoverSlot?: (slot: number | null) => void
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	/** Page layout only — the preparation room passes `flex-1` so the panel matches the storage height. */
	className?: string
	/** The **Shop** button on the panel floor is also the sell drop target. */
	onShopClick?: () => boolean
	shopDropActive?: boolean
	isDraggingItem?: boolean
	onShopHover?: (target: ShopDropTarget | null) => void
}

/**
 * **Loadout** — the items the cutie is carrying. Only items here take part in the fight
 * (passives, auras, weapons) and only they occupy cells of the 4-column grid.
 *
 * Interactions: **drag and drop** to move/swap (see `useHeldItem`), **click** to view details.
 */
export function CutieLoadoutPanel({
	held,
	onItemClick,
	onDragStart,
	onDragEnd,
	onHoverSlot,
	onAnchorSlot,
	className,
	onShopClick,
	shopDropActive = false,
	isDraggingItem = false,
	onShopHover,
}: CutieLoadoutPanelProps) {
	const run = useGameStore((state) => state.run)
	const unequip = useGameStore((state) => state.unequip)

	const cutie = getCutie(run.cutieId)
	const level = run.cuties[run.cutieId] ?? 1
	const { bag, bagSize } = cutieLevelStats(cutie, level)
	const equipped = run.equipped.filter((item) => item.slot >= 0 && item.slot < bagSize)

	return (
		<section className={cn(panelClass, 'gap-2.5', className)}>
			<div className={panelHeadClass}>
				<div aria-hidden />
				<h2 className={panelTitleClass}>{translate('Trang bị')}</h2>
			</div>

			{/* The grid always shows the full 4×5; cells past the cutie's level are dimmed as locked. */}
			<LoadoutGrid
				width={bag.width}
				rows={GRID_MAX_ROWS}
				usableCells={bagSize}
				items={run.equipped}
				interactive
				held={held}
				onItemClick={onItemClick}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onHoverSlot={onHoverSlot}
				onAnchorSlot={onAnchorSlot}
				// Centred in the (fluid) column: the cells keep their fixed size, only the panel stretches.
				className="mx-auto"
			/>

			{/*
			 * The panel's floor: **Shop**, then **Tháo hết** under it — full width and **tall enough to
			 * fill the space the 4×5 board leaves** (`flex-1` on the stack and on both buttons): the
			 * panel is as tall as the storage, so small buttons left a dead band of empty panel under
			 * the items ("phóng to nút shop và unequip để thừa spacing trống").
			 *
			 * ⚠️ The other modes (Đấu Trường · Phiêu Lưu · Phòng tập · Bảng Xếp Hạng) are **not** here:
			 * they belong to the shared footer under the three panels (`ActionBar`).
			 */}
			<div className="mt-auto flex min-h-0 flex-1 flex-col gap-2.5">
				<ShopButton
					className="min-h-11 flex-1 font-semibold"
					dropActive={shopDropActive}
					isDraggingItem={isDraggingItem}
					onHover={(over) => onShopHover?.(over ? 'equipment' : null)}
					onClick={onShopClick}
				/>
				<Button
					type="button"
					className="min-h-11 w-full flex-1 justify-center"
					disabled={equipped.length === 0}
					onClick={() => {
						for (const item of [...equipped]) unequip(item.uid)
					}}
					title={translate('Bỏ toàn bộ đồ về kho')}
				>
					<ArrowDown /> {translate('Tháo hết')}
				</Button>
			</div>
		</section>
	)
}
