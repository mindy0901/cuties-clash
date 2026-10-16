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
	/** Bấm một **ô** trong kho → đặt món đang cầm xuống đúng ô đó. */
	onPickCell?: (slot: number) => void
	/** Bắt đầu giữ một món (đầu thao tác kéo). */
	onDragStart?: (item: ItemInstance) => void
	/** Nhả chuột: `moved` cho biết vừa kéo đi hay chỉ bấm. */
	onDragEnd?: (moved: boolean) => void
	/** Ô neo đang vẽ gợi ý trong kho (chỗ đặt khi thả chuột). */
	onAnchorSlot?: (slot: number | null) => void
	onRotate?: (uid: string) => void
	onSell?: (uid: string) => void
}

/**
 * **Kho đồ** — dự trữ, **không giới hạn**.
 *
 * Là **lưới tự do** giống hệt lưới Trang bị: món nằm ở đúng ô và đúng hướng người chơi đặt,
 * kho không xếp hộ. Lưới tự cao thêm khi có món nằm thấp hơn, nên chứa được bao nhiêu cũng
 * vừa; nhiều thì cuộn dọc.
 */
export function InventoryPanel({
	onRef,
	held,
	onPickItem,
	onPickCell,
	onDragStart,
	onDragEnd,
	onAnchorSlot,
	onRotate,
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
				onAnchorSlot={onAnchorSlot}
				onRotate={onRotate}
				onSell={onSell ?? sell}
				className="max-h-[520px]"
			/>
		</section>
	)
}
