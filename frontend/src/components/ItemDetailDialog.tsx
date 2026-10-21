import { Fragment, type ReactNode } from 'react'
import { sellValue } from '../game/bag'
import { CLASS_LABELS, getTemplate, starPrice } from '../game/items'
import { useGameStore } from '../store/gameStore'
import { ItemGridPreview } from './ArtPreview'
import { CornerDownRight, Cost, ParamIcon } from './icons'
import { cn, dialogClass, overlayClass, rowBetweenClass, statClass, statGridClass, tagClass } from './ui'
import { Button } from './ui/button'
import { itemKitBlocks } from './itemFacts'
import { translate } from '../i18n'
import type { ItemInstance } from '../game/types'

/**
 * **Item details** — opened by **clicking** an item in the inventory, the loadout, or either grid in
 * the arena (the opponent's gear included, so its kit can be read while the fight runs).
 *
 * Why a dialog instead of a tooltip: the browser's `title` does not show on touch devices,
 * disappears when the mouse moves away, and cannot hold a stat table. Clicking an item used to
 * **pick it up**; that gesture now belongs to drag and drop, which frees the click for details.
 *
 * ⚠️ The dialog looks the item up by `uid` in `run` itself: the item may be **sold while the
 * dialog is open**, in which case `item` is `undefined` and the dialog closes itself (returns
 * `null`) instead of throwing. `preview` covers the one tile that is not in `run` — the enemy's —
 * and never overrides a bag item.
 */
export function ItemDetailDialog({
	uid,
	preview,
	onClose,
}: {
	uid: string
	/** The item to show when it is **not in the player's bag** (the opponent's gear on the arena). */
	preview?: ItemInstance | null
	onClose: () => void
}) {
	const run = useGameStore((state) => state.run)
	const carried = [...run.equipped, ...run.inventory].find((entry) => entry.uid === uid)
	// A bag item always wins, so selling it while this dialog is open still closes the dialog; the
	// preview is only the fallback for a tile that was never ours.
	const item = carried ?? preview ?? undefined
	if (!item) return null
	/** Only our own items have a shop price, a paid amount and a resale value. */
	const owned = carried !== undefined

	const template = getTemplate(item.templateId)
	// Default shape of the item, **not** the orientation it happens to have in the bag: the tile next
	// to this line is drawn upright, so the numbers have to describe the same shape.
	const size = template.space
	// Every row below comes from `itemKitBlocks`, shared with the hover card: one item, one set of
	// numbers, in both places — damage multiplier and Cooldown Time included.
	const blocks = itemKitBlocks(template, item.star)

	return (
		<div className={overlayClass} onClick={onClose}>
			<div
				className={cn(dialogClass, 'max-h-[86vh] w-[min(520px,100%)] overflow-y-auto')}
				onClick={(event) => event.stopPropagation()}
			>
				<div className={rowBetweenClass}>
					<h2 className="text-[22px]">{translate('Chi tiết món')}</h2>
					<Button type="button" size="sm" onClick={onClose}>
						{translate('Đóng')}
					</Button>
				</div>

				<div className="flex items-start gap-3.5">
					{/*
						The bag's own tile — a square thumbnail squeezed a 1×3 sword into a box.
						⚠️ Default orientation on purpose: an item turned in the bag still shows upright
						here, because the picture is cropped to this shape.
					*/}
					<ItemGridPreview templateId={item.templateId} star={item.star} cellSize={44} bare />
					<div className="min-w-0">
						{/* The tile beside it already shows the rank as stars — ❌ no second "2★" label. */}
						<span className="text-[20px] font-semibold">{translate(template.name)}</span>
						<div className="mt-1 flex flex-wrap items-center gap-1.5">
							<span className={tagClass}>{translate(CLASS_LABELS[template.cls])}</span>
							<span className={tagClass}>
								{size.w}×{size.h} {translate('ô')}
							</span>
						</div>
					</div>
				</div>

				{/* Economy of an item that is **ours**; the opponent's gear has no price and no refund. */}
				{owned ? (
					<div className={statGridClass}>
						<Row
							label={translate('Giá ở shop')}
							value={<Cost amount={starPrice(template.cost, item.star)} />}
						/>
						<Row label={translate('Đã trả')} value={<Cost amount={item.paid} />} />
						{/* The 50% rule belongs to the label, not to the number: the cell is too narrow for both. */}
						<Row label={translate('Bán được (hoàn 50%)')} value={<Cost amount={sellValue(item)} />} />
					</div>
				) : null}
				{/* Every kit the item carries — the same list the hover card draws (`itemKitBlocks`), so
				    the two can never disagree. Each kit sits in its **own framed box** under the item's
				    basic rows: the damage multiplier and Cooldown Time of a swing, its charged hit, its
				    on-hit effects, and every option kit (stats, aura, Chấn Đao, support and armour). */}
				{blocks.map((block, index) => (
					<Fragment key={`${block.id}-${index}`}>
						{/* The charged hit / an on-hit effect belongs to the attack above it — the elbow draws
						    that dependency (an attached kit is dead without a basic attack). */}
						{block.attached ? (
							<div className="ml-1 flex items-center gap-1 text-muted">
								<CornerDownRight className="size-4 opacity-60" />
								<span className="h-px flex-1 bg-line" />
							</div>
						) : null}
						<div
							data-detail-kit={block.id}
							data-kit-attached={block.attached ? '' : undefined}
							className={cn(
								'flex flex-col gap-2 rounded-panel border border-line bg-ink-900/40 p-2.5',
								block.attached && 'ml-3',
							)}
						>
							{block.label ? <h3 className="text-[15px]">{translate(block.label)}</h3> : null}
							{/* One row per parameter, full width — `statGridClass` put three cells side by side and
							    a long label ("Choose the buff target") wrapped into a column of two words. */}
							<div className="flex flex-col gap-2">
								{block.lines.map((line) => (
									<Row
										key={line.key}
										label={translate(line.label)}
										paramKey={line.key}
										value={line.value}
										tone={line.good ? 'good' : undefined}
									/>
								))}
							</div>
						</div>
					</Fragment>
				))}
			</div>
		</div>
	)
}

function Row({
	label,
	value,
	tone,
	paramKey,
}: {
	label: string
	value: ReactNode
	tone?: 'good'
	/** Draws the glyph of that kit parameter (`ParamIcon`); the economy rows have none. */
	paramKey?: string
}) {
	return (
		<div className={statClass}>
			<span className="flex min-w-0 items-center gap-1.5 text-muted">
				{paramKey ? <ParamIcon paramKey={paramKey} /> : null}
				{label}
			</span>
			<span
				className={cn(
					'shrink-0 inline-flex items-center gap-1 font-semibold tabular-nums',
					tone === 'good' && 'text-jade',
				)}
			>
				{value}
			</span>
		</div>
	)
}
