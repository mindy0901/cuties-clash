import { useMemo } from 'react'
import { templateFootprint } from '../game/bag'
import { getTemplate } from '../game/items'
import { khoShape, repairKhoSlots } from '../game/kho'
import type { ItemInstance } from '../game/types'
import { GridBoard, type ItemBoxProps } from './GridBoard'
import { ItemIcon } from './ItemIcon'
import { ITEM_BORDER_BY_CLASS, cn } from './ui'

export interface InventoryGridProps {
	items: ItemInstance[]
	held: { uid: string; rotated: boolean; templateId: string } | null
	/** Bấm một món → mở hộp thoại chi tiết. */
	onItemClick?: (item: ItemInstance) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean) => void
	/** Ô neo đang vẽ gợi ý — chỗ đặt khi thả chuột dùng đúng ô này. */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	onRotate?: (uid: string) => void
	onSell?: (uid: string) => void
	className?: string
}

/**
 * Lưới **Kho đồ** — một **lưới tự do** giống hệt lưới Trang bị, dùng **chung `GridBoard`** nên
 * ô và gợi ý chỗ đặt giống nhau.
 *
 * ⚠️ Kho ❌ **không xếp hộ**: mỗi món nằm ở đúng `slot`/`rotated` người chơi đặt, nên thả ở
 * đâu thì món ở đó, và xoay hướng nào cũng được. Bản trước tự dồn món nối tiếp nhau rồi ghi đè
 * vị trí vừa thả, khiến thao tác kéo trong kho trông như "không kéo được".
 *
 * Khác biệt duy nhất so với trang bị: **không giới hạn** — lưới tự cao thêm khi có món nằm thấp
 * hơn (xem `khoRows`), và **không có ô khoá**.
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
	// Món thiếu ô (bản lưu cũ dùng `slot: -1`) vẫn phải **hiện**: xếp tạm để không có món vô
	// hình. Món có vị trí hợp lệ được giữ nguyên, nên bình thường danh sách này y hệt store.
	const shown = useMemo(() => repairKhoSlots(items), [items])
	const { width, rows, usable } = khoShape(shown)
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
						ITEM_BORDER_BY_CLASS[template.cls],
						item.star === 4 && 'shadow-[0_0_12px_rgb(217_162_39/55%)]',
					)}
					title={`${template.name} ${size.w}×${size.h}`}
				>
					<span className="absolute top-0.5 right-1 text-[9px] tracking-[-1px] text-gold-soft">
						{'★'.repeat(item.star)}
					</span>
					<span className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
						<ItemIcon templateId={item.templateId} star={item.star} />
					</span>
					<span className="max-w-full truncate text-[10px] leading-[1.1] text-muted">{template.name}</span>
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
		<div className={cn('overflow-y-auto scroll-hidden', className)}>
			<GridBoard
				width={width}
				rows={rows}
				usableCells={usable}
				items={placed}
				held={held}
				renderItem={renderItem}
				onItemClick={onItemClick}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onAnchorSlot={onAnchorSlot}
			/>
		</div>
	)
}
