import { templateFootprint } from '../game/bag'
import { getTemplate } from '../game/items'
import type { ItemInstance } from '../game/types'
import { GridBoard, type ItemBoxProps } from './GridBoard'
import { ItemIcon } from './ItemIcon'
import { ITEM_BORDER_BY_CLASS, cn } from './ui'

/** Số cột của bảng trang bị ở phòng chuẩn bị. */
export const LOADOUT_WIDTH = 4

export interface LoadoutGridProps {
	width?: number
	rows: number
	usableCells?: number
	items: ItemInstance[]
	/** Cho phép bấm/kéo món trong lưới (chỉ ở trang bị). */
	interactive?: boolean
	held?: { uid: string; rotated: boolean; templateId: string } | null
	/** Bấm một món → mở hộp thoại chi tiết. */
	onItemClick?: (item: ItemInstance) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean) => void
	onHoverSlot?: (slot: number | null) => void
	/** Ô neo đang vẽ gợi ý — chỗ đặt dùng đúng ô này. */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	onRotate?: (uid: string) => void
	onSell?: (uid: string) => void
	className?: string
}

/**
 * Lưới **Trang bị** — chỉ là lớp mỏng trên `GridBoard`, thêm nút ⟳ / ✕ cho mỗi món.
 * Nhờ vậy nó dùng **chung công thức và giao diện gợi ý** với lưới Kho đồ.
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
					className={cn(
						'surface-item relative flex size-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-line p-1 text-center select-none',
						interactive && 'cursor-pointer',
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
					{interactive && (onRotate || onSell) ? (
						<span className="absolute right-0.5 bottom-0.5 flex gap-1 opacity-0 transition-opacity duration-100 group-hover/slot:opacity-100">
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
