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
	/** The item currently being dragged, if any. */
	held: HeldItem | null
	/** Clicking an item → opens the detail dialog. */
	onItemClick: (item: ItemInstance) => void
	/** Starts holding an item (beginning of the drag). */
	onDragStart?: (item: ItemInstance) => void
	/** Pointer release: `moved` tells whether it was dragged or merely clicked. */
	onDragEnd?: (moved: boolean) => void
	onHoverSlot?: (slot: number | null) => void
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
}

/**
 * **Loadout** — the items the pet is carrying. Only items here take part in the fight
 * (passives, auras, weapons) and only they occupy cells of the 4-column grid.
 *
 * Interactions: **drag and drop** to move/swap (see `useHeldItem`), **click** to view details.
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

			{/* The grid always shows the full 4×5; cells past the pet's level are dimmed as locked. */}
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
					onClick={() => void navigate({ to: '/shop' })}
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
