import { useNavigate } from '@tanstack/react-router'
import { itemCells } from '../game/bag'
import { GRID_MAX_CELLS, GRID_MAX_ROWS, getPet, petLevelStats } from '../game/pets'
import { playerCombatantFor, useGameStore } from '../store/gameStore'
import { estimatePower } from '../game/build'
import { LoadoutGrid } from './LoadoutGrid'
import { btnClass, cn, panelClass, panelHeadClass, panelTitleClass } from './ui'
import type { HeldItem } from './useHeldItem'
import type { ItemInstance } from '../game/types'

interface PetLoadoutPanelProps {
	/** Món đang được kéo, nếu có. */
	held: HeldItem | null
	/** Bấm một món → mở hộp thoại chi tiết. */
	onItemClick: (item: ItemInstance) => void
	/** Bắt đầu giữ một món (đầu thao tác kéo). */
	onDragStart?: (item: ItemInstance) => void
	/** Nhả chuột: `moved` cho biết vừa kéo đi hay chỉ bấm. */
	onDragEnd?: (moved: boolean) => void
	onHoverSlot?: (slot: number | null) => void
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
}

/**
 * **Trang bị** — những món thú cưng đang mang. Chỉ đồ ở đây mới tham chiến
 * (passive, hào khí, vũ khí) và chỉ chúng chiếm ô của lưới 4 cột.
 *
 * Thao tác: **kéo-thả** để chuyển/đổi chỗ (xem `useHeldItem`), **bấm** để xem chi tiết.
 */
export function PetLoadoutPanel({
	held,
	onItemClick,
	onDragStart,
	onDragEnd,
	onHoverSlot,
	onAnchorSlot,
}: PetLoadoutPanelProps) {
	const run = useGameStore((state) => state.run)
	const navigate = useNavigate()
	const rotate = useGameStore((state) => state.rotate)
	const sell = useGameStore((state) => state.sell)
	const unequip = useGameStore((state) => state.unequip)

	const pet = getPet(run.petId)
	const level = run.pets[run.petId] ?? 1
	const { bag, bagSize } = petLevelStats(pet, level)
	const equipped = run.equipped.filter((item) => item.slot >= 0 && item.slot < bagSize)
	const usedCells = equipped.reduce((total, item) => total + itemCells(item, bag.width).length, 0)
	const power = estimatePower(playerCombatantFor(run))
	const lockedCells = GRID_MAX_CELLS - bagSize

	return (
		<section className={cn(panelClass, 'gap-2.5 self-start')}>
			<div className={panelHeadClass}>
				<h2 className={panelTitleClass}>Trang bị</h2>
				<span className="text-[11px] text-muted">
					{equipped.length} món · {usedCells}/{bagSize} ô
					{lockedCells > 0 ? ` · ${lockedCells} ô khoá` : ''} · Sức mạnh{' '}
					{power.toLocaleString('vi-VN')}
				</span>
			</div>

			{/* Lưới luôn hiện đủ 4×5; ô vượt cấp thú hiển thị mờ như bị khoá. */}
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
				onRotate={rotate}
				onSell={sell}
			/>

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					className={cn(
						btnClass,
						'flex-1 justify-center border-gold/60 bg-linear-to-b from-gold/25 to-transparent font-semibold',
					)}
					onClick={() => void navigate({ to: '/cua-hang' })}
				>
					🛒 Mua Vật Phẩm »
				</button>
				<button
					type="button"
					className={cn(btnClass, 'justify-center')}
					disabled={equipped.length === 0}
					onClick={() => {
						for (const item of [...equipped]) unequip(item.uid)
					}}
					title="Bỏ toàn bộ đồ về kho"
				>
					↓ Tháo hết
				</button>
			</div>

			<p className="m-0 text-[11px] text-muted">
				<strong>Giữ chuột rồi kéo</strong> món sang ô khác để đặt — <strong>bấm</strong> một món để
				xem <strong>chi tiết</strong>. Khi đang kéo,{' '}
				<kbd className="rounded border border-line bg-black/40 px-1">R</kbd> hoặc{' '}
				<strong>chuột phải</strong> để xoay,{' '}
				<kbd className="rounded border border-line bg-black/40 px-1">Esc</kbd> để bỏ.
			</p>
		</section>
	)
}
