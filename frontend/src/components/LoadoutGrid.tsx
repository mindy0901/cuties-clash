import { directionSidesFor, templateFootprint } from '../game/bag'
import { combatItemUid } from '../game/build'
import { getTemplate } from '../game/items'
import { buffDirectionMask } from '../game/kits'
import { DirectionOverlay } from './DirectionOverlay'
import { HasteStreaks } from './HasteStreaks'
import type { WeaponCharge } from './battleCharge'
import type { ItemInstance } from '../game/types'
import { CELL_SIZE, GridBoard, type ItemBoxProps, type PointerPosition } from './GridBoard'
import { ItemTile } from './ItemTile'
import type { HeldItem } from './useHeldItem'
import { cn } from './ui'
import { translate } from '../i18n'

/** Number of columns of the loadout board in the preparation room. */
export const LOADOUT_WIDTH = 4

export interface LoadoutGridProps {
	width?: number
	rows: number
	cellSize?: number
	usableCells?: number
	items: ItemInstance[]
	/** Allows clicking/dragging items on the board (loadout only). */
	interactive?: boolean
	/** Per-item attack charge for battle display. */
	weaponCharges?: Record<string, WeaponCharge>
	/** Per-weapon battle states: a frozen charge is paused, a `slow` raises the cooldown, a `boost`
	 * (cooldown reduction) lowers it. */
	weaponStatuses?: Record<string, { frozen?: number; slow?: number; boost?: number }>
	/**
	 * `uid → flash key` for a **jade** item whose kit just fired (a freeze, a parry, a shield, a heal…).
	 * The tile lights up for a moment; the value only has to **change** so the overlay remounts and the
	 * CSS animation restarts.
	 */
	jadeTriggers?: Record<string, number>
	held?: HeldItem | null
	/** Clicking an item → opens the detail dialog. */
	onItemClick?: (item: ItemInstance) => void
	/**
	 * The pointer entering / leaving a tile → the hover card (`useItemHoverCard`).
	 *
	 * `node` is the tile element itself, which the card is anchored to; `null` means "left the tile".
	 * ❌ Not fired while an item is being dragged: the cursor passes over the neighbours on the way.
	 */
	onItemHover?: (item: ItemInstance, node: HTMLElement | null) => void
	onDragStart?: (item: ItemInstance) => void
	onDragEnd?: (moved: boolean, releasePosition: PointerPosition | null) => void
	onHoverSlot?: (slot: number | null) => void
	/** Anchor cell the hint is drawn from — placement uses exactly this cell. */
	onAnchorSlot?: (slot: number | null, blocked: boolean) => void
	className?: string
	/**
	 * Draw this picture on every tile instead of the item's own art.
	 *
	 * Only the admin page uses it, to preview an image that has **not been saved yet** in a real
	 * tile. ❌ Not a second way to draw tiles: the markup stays here.
	 */
	artSrc?: string | null
}

/**
 * The **Loadout** grid — a thin layer on top of `GridBoard` that shares the inventory's formulas
 * and hint UI.
 */
export function LoadoutGrid({
	width = LOADOUT_WIDTH,
	rows,
	cellSize = CELL_SIZE,
	usableCells,
	items,
	interactive = false,
	weaponCharges,
	weaponStatuses,
	jadeTriggers,
	held = null,
	onItemClick,
	onItemHover,
	onDragStart,
	onDragEnd,
	onHoverSlot,
	onAnchorSlot,
	className,
	artSrc,
}: LoadoutGridProps) {
	const placed = items.filter((item) => item.slot >= 0 && item.slot < width * rows)
	const itemScale = cellSize / CELL_SIZE

	const renderItem = (item: ItemInstance, box: ItemBoxProps) => {
		const size = templateFootprint(item.templateId, item.rotated)
		const template = getTemplate(item.templateId)
		const uid = combatItemUid(item.templateId, item.slot)
		const status = weaponStatuses?.[uid]
		// A support gem shows which sides its buff covers; a weapon on a side turns that arrow gold.
		const directionMask = buffDirectionMask(template.kits, item.star)
		return (
			<div
				key={item.uid}
				{...box.boxProps}
				data-battle-weapon-source={combatItemUid(item.templateId, item.slot)}
				data-battle-weapon-charge={(() => {
					const charge = weaponCharges?.[combatItemUid(item.templateId, item.slot)]
					return charge === undefined ? undefined : String(charge.percent)
				})()}
				style={{ ...box.boxProps.style, gridColumn: box.grid.column, gridRow: box.grid.row }}
			>
				<button
					type="button"
					draggable={false}
					{...box.buttonProps}
					// The hand is a promise: only a board the player can actually touch gets it. A
					// preview (admin art picker, shop card) draws the same tile and stays `default`.
					className={cn('relative block size-full', interactive ? 'cursor-pointer' : 'cursor-default')}
					// 🔴 The hover card is the item's description; a `title` as well drew a **second** popup
					// ("Beginer's Sword 1×3") next to the card. `aria-label` keeps the name for a screen reader.
					aria-label={`${translate(template.name)} ${size.w}×${size.h}`}
					title={onItemHover ? undefined : `${translate(template.name)} ${size.w}×${size.h}`}
					onPointerEnter={
						onItemHover && held === null ? (event) => onItemHover(item, event.currentTarget) : undefined
					}
					onPointerLeave={onItemHover && held === null ? () => onItemHover(item, null) : undefined}
					onFocus={onItemHover ? (event) => onItemHover(item, event.currentTarget) : undefined}
					onBlur={onItemHover ? () => onItemHover(item, null) : undefined}
				>
					<ItemTile
						templateId={item.templateId}
						star={item.star}
						artSrc={artSrc}
						rotated={item.rotated}
						sizeScale={itemScale}
						weaponCharge={weaponCharges?.[uid]?.percent}
						weaponChargeCycle={weaponCharges?.[uid]?.cycle}
					/>
					{/* A jade item that just fired: a green flash out of the tile, over the picture and under
					    the freeze sheet / badges. `key` is the flash counter, so a second trigger in a row
					    restarts the animation instead of being swallowed by the first. */}
					{jadeTriggers?.[uid] !== undefined ? (
						<span
							key={jadeTriggers[uid]}
							aria-hidden="true"
							data-jade-trigger={uid}
							className="animate-jade-trigger pointer-events-none absolute inset-0 z-[5] rounded-md"
						/>
					) : null}
					{/* Freeze: a frost sheet over the whole tile, so a frozen weapon reads as frozen even
					    when the player is not looking at the small ❄ badge. It sits **above** the picture but
					    below the badge, and never takes pointer events (the tile stays clickable). */}
					{status?.frozen ? (
						<span
							aria-hidden="true"
							data-weapon-freeze-overlay={uid}
							className="pointer-events-none absolute inset-0 z-[6] overflow-hidden rounded-md"
							style={{
								background:
									'linear-gradient(180deg, rgb(178 231 255 / 42%) 0%, rgb(120 196 255 / 26%) 45%, rgb(206 240 255 / 46%) 100%)',
								boxShadow: 'inset 0 0 22px rgb(143 214 255 / 55%)',
								backdropFilter: 'saturate(0.55) brightness(0.92)',
							}}
						>
							{/* Frost crystals in the corners: three chevrons + a soft diagonal sheen. */}
							<span
								className="absolute inset-0 opacity-70"
								style={{
									background:
										'repeating-linear-gradient(135deg, rgb(255 255 255 / 0%) 0 6px, rgb(255 255 255 / 22%) 6px 7px)',
								}}
							/>
							<span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[26px] leading-none text-[#dff4ff]/85 drop-shadow-[0_0_6px_rgb(120_196_255/80%)]">
								❄
							</span>
						</span>
					) : null}
					{status?.frozen ? (
						<span
							data-battle-weapon-frozen={uid}
							title={`${translate('Đóng Băng')} ${Math.ceil(status.frozen / 1000)}s`}
							className="pointer-events-none absolute right-1 top-1 rounded-full border border-[#8fd6ff]/70 bg-[#0d2233]/85 px-1.5 py-0.5 text-[11px] font-bold text-[#bfe8ff]"
						>
							❄ {Math.ceil(status.frozen / 1000)}s
						</span>
					) : status?.slow ? (
						<span
							data-battle-weapon-slow={uid}
							title={`${translate('Chậm')} −${Math.round(status.slow)}%`}
							className="pointer-events-none absolute right-1 top-1 rounded-full border border-[#c9a86a]/70 bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-[#e6c98a]"
						>
							🐌 {Math.round(status.slow)}%
						</span>
					) : null}
					{/* Cooldown reduction: a stream of meteor streaks climbing the tile while the buff is on,
					    so a faster weapon reads as "faster" at a glance (see `HasteStreaks`). */}
					{status?.boost ? (
						<>
							{/* Green rim + inner wash: the buff is visible even when no streak is in flight, and
							    it matches the streaks (the same heal-green family). */}
							<span
								aria-hidden="true"
								data-weapon-boost-border={uid}
								className="pointer-events-none absolute inset-0 z-[7] rounded-md"
								style={{
									border: '2px solid rgb(126 255 168 / 82%)',
									boxShadow:
										'inset 0 0 16px rgb(70 210 140 / 55%), inset 0 0 3px rgb(214 255 226 / 85%), 0 0 12px rgb(70 210 140 / 45%)',
									background: 'linear-gradient(180deg, rgb(64 200 130 / 20%) 0%, transparent 46%)',
								}}
							/>
							<span
								aria-hidden="true"
								data-weapon-boost-fx={uid}
								className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-md"
							>
								<HasteStreaks cellSize={cellSize} tileHeight={size.h * cellSize} />
							</span>
						</>
					) : null}
					{directionMask !== 0 ? (
						<DirectionOverlay
							mask={directionMask}
							sides={directionSidesFor(item, placed, width, width * rows)}
							cellSize={cellSize}
						/>
					) : null}
				</button>
			</div>
		)
	}

	return (
		<GridBoard
			width={width}
			rows={rows}
			cellSize={cellSize}
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
