import { templateFootprint } from '../game/bag'
import { getTemplate } from '../game/items'
import type { ItemInstance } from '../game/types'
import { GridBoard, type ItemBoxProps } from './GridBoard'
import { ItemIcon } from './ItemIcon'
import { ITEM_BORDER_BY_CLASS, cn } from './ui'

/** Số cột của kho. */
const WIDTH = 8
/** Số hàng hiện mặc định (kho trống vẫn hiện đủ 8×8 ô). */
const MIN_ROWS = 8
/** Số hàng trống hiện thêm khi kho đã đầy, để thấy vẫn còn chỗ. */
const SPARE_ROWS = 1

export interface InventoryGridProps {
	items: ItemInstance[]
	held: { uid: string; rotated: boolean; templateId: string } | null
	onPickItem?: (item: ItemInstance) => void
	/** Bấm một ô trong kho (đặt món đang cầm xuống). */
	onPickCell?: (slot: number) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean) => void
	onSell?: (uid: string) => void
	className?: string
}

/**
 * Lưới **Kho đồ** — dùng **chung `GridBoard`** với lưới Trang bị, nên ô và gợi ý chỗ đặt
 * giống hệt nhau.
 *
 * Khác biệt duy nhất: **không giới hạn số ô** và **không kiểm tra va chạm** — món xếp lần
 * lượt từ trái sang phải, hết hàng thì xuống hàng mới, chứa nhiều thì cuộn dọc.
 */
export function InventoryGrid({
	items,
	held,
	onPickItem,
	onPickCell,
	onDragStart,
	onDragEnd,
	onSell,
	className,
}: InventoryGridProps) {
	const width = WIDTH

	/**
	 * Xếp tuần tự: mỗi món chiếm `w×h` ô liền nhau. Không đủ chỗ ở hàng hiện tại thì **đẩy
	 * xuống hàng mới** — món nằm trọn trong một hàng, không bị cắt ngang.
	 */
	const packed: ItemInstance[] = []
	let cursor = 0
	for (const item of items) {
		const size = templateFootprint(item.templateId, item.rotated)
		const col = cursor % width
		if (col + size.w > width) cursor += width - col
		packed.push({ ...item, slot: cursor })
		cursor += size.w
	}

	// Mặc định đủ 8×8; nhiều món hơn thì lưới cao thêm, luôn thừa một hàng trống.
	const rows = Math.max(MIN_ROWS, Math.ceil(cursor / width) + SPARE_ROWS)
	// Không giới hạn ô → mọi ô đều dùng được.
	const usable = rows * width

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
					{onSell ? (
						<span className="absolute right-0.5 bottom-0.5 flex gap-1 opacity-0 transition-opacity duration-100 group-hover/inv:opacity-100">
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
				items={packed}
				held={held}
				renderItem={renderItem}
				onPickItem={onPickItem}
				onPickCell={onPickCell}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
			/>
		</div>
	)
}
