import { useGameStore } from '../store/gameStore'
import { InventoryGrid } from './InventoryGrid'
import { cn, panelClass, panelHeadClass, panelTitleClass } from './ui'
import type { ItemInstance } from '../game/types'

interface InventoryPanelProps {
	/** Nhận phần tử gốc, để cha biết vùng thả "cất vào kho". */
	onRef?: (node: HTMLElement | null) => void
	/** Món đang được nhấc lên, nếu có. */
	held: { uid: string; rotated: boolean; templateId: string } | null
	/** Bấm một món trong kho → nhấc lên (hoặc cất món đang cầm của trang bị). */
	onPickItem: (item: ItemInstance) => void
	/** Bắt đầu giữ một món (đầu thao tác kéo). */
	onPickCell?: (slot: number) => void
	/** Bắt đầu giữ một món (đầu thao tác kéo). */
	onDragStart?: (item: ItemInstance) => void
	/** Nhả chuột: `moved` cho biết vừa kéo đi hay chỉ bấm. */
	onDragEnd?: (moved: boolean) => void
	onSell?: (uid: string) => void
}

/**
 * **Kho đồ** — dự trữ **không giới hạn**.
 *
 * Dùng chung công thức và giao diện với lưới **Trang bị**, chỉ khác: không giới hạn số ô
 * và không kiểm tra va chạm. Món xếp lần lượt, chứa nhiều thì cuộn dọc.
 */
export function InventoryPanel({
	onRef,
	held,
	onPickItem,
	onPickCell,
	onDragStart,
	onDragEnd,
	onSell,
}: InventoryPanelProps) {
	const run = useGameStore((state) => state.run)
	const sell = useGameStore((state) => state.sell)

	return (
		<section ref={onRef} className={cn(panelClass, 'w-fit gap-2.5 self-start')}>
			<div className={panelHeadClass}>
				<h2 className={panelTitleClass}>Kho đồ</h2>
				<span className="text-[11px] text-muted">{run.inventory.length} món · không giới hạn</span>
			</div>

			<InventoryGrid
				items={run.inventory}
				held={held}
				onPickItem={onPickItem}
				onPickCell={onPickCell}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onSell={onSell ?? sell}
				className="max-h-[520px]"
			/>
		</section>
	)
}
