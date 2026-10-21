import { Fragment, type ReactNode } from 'react'
import { CLASS_LABELS, getTemplate } from '../game/items'
import { CornerDownRight, ParamIcon, StarRow } from './icons'
import { itemKitBlocks } from './itemFacts'
import { HOVER_CARD_WIDTH } from './useItemHover'
import { cn } from './ui'
import { translate } from '../i18n'
import type { Star } from '../game/types'

/**
 * The **hover card** of one item: every kit the item carries, each in its own box under the header —
 * the basic attack, its charged hit, every on-hit effect, and the option kits (stats, aura, Chấn Đao,
 * support and armour), with **every parameter of that kit** as a row of its own.
 *
 * Used everywhere an item is drawn on a board — the shop's offers, the bag in the preparation room
 * and both grids in the arena — so the same tile answers the same way wherever the pointer stops.
 *
 * ⚠️ What it deliberately **does not** show: the price (a shop cell right below the tile already
 * states it, and repeating it invites the two to disagree) and the merge hint (the tile's own `↑ N★`
 * badge says that). Every *parameter* is shown, `target` / `directions` included — as words
 * (`Adjacent sides`, `Up · Down · Left · Right`).
 *
 * ⚠️ It is **not** a rulebook: every row comes from `itemKitBlocks()` (`itemFacts.ts`), the same list
 * `ItemDetailDialog` renders. The dialog stays the place with the economy rows and the sell value; this
 * card answers "what is this, and what does it do?" while the pointer is already there.
 *
 * ⚠️ Positioning is the caller's job (`position: fixed` from the hovered tile's rect, see
 * `useItemHoverCard`): the boards are `overflow-hidden`, so a card laid out inside one would be
 * clipped at its edge.
 */
export function ItemHoverCard({
	templateId,
	star,
	left,
	top,
	maxHeight,
}: {
	templateId: string
	star: Star
	left: number
	top: number
	/** Room between the card's top and the bottom of the window — the body scrolls inside it. */
	maxHeight: number
}) {
	const template = getTemplate(templateId)
	const blocks = itemKitBlocks(template, star)

	return (
		<div
			data-item-hover-card
			role="tooltip"
			className="pointer-events-none fixed z-40 flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-panel"
			style={{ left: `${left}px`, top: `${top}px`, maxHeight: `${maxHeight}px`, width: `${HOVER_CARD_WIDTH}px` }}
		>
			{/* Text only: the tile is **right there** on the board, so repeating its picture would only
			    take room away from the numbers. The name **wraps** instead of being cut: a card is read,
			    and `Beginer's Sw…` hides the one word that identifies the item. The star rank sits on the
			    name's own row (asked for: "icon star nằm cùng flow với tên item"). */}
			<div className="flex flex-col gap-0.5 border-b border-border bg-linear-to-r from-primary/30 to-transparent px-3 py-2">
				<div className="flex items-center gap-2">
					<span className="min-w-0 flex-1 text-[14.5px] font-semibold leading-snug break-words">
						{translate(template.name)}
					</span>
					<StarRow count={star} className="text-gold-soft" />
				</div>
				<span className="text-[11.5px] text-muted">{translate(CLASS_LABELS[template.cls])}</span>
			</div>

			<div className="flex flex-col gap-1.5 overflow-y-auto px-2.5 py-2 text-[12px]">
				{/* One **bordered box per kit** — the swing, its charged hit, each on-hit effect and every
				    option kit — with **every parameter** of that kit as a row of its own, each with the
				    glyph that says what the number is (`ParamIcon`). */}
				{blocks.map((block, index) => (
					<Fragment key={`${block.id}-${index}`}>
						{/* An attached kit (the charged hit, an on-hit effect) is drawn **under** the swing that
						    carries it, joined by an elbow so the dependency is visible: no basic attack, no
						    charged hit. */}
						{block.attached ? (
							<div className="ml-1 flex items-center gap-1 text-muted">
								<CornerDownRight className="size-3.5 opacity-60" />
								<span className="h-px flex-1 bg-border" />
							</div>
						) : null}
						<div
							data-card-kit={block.id}
							data-kit-attached={block.attached ? '' : undefined}
							className={cn(
								'flex flex-col gap-1 rounded-md border border-border bg-ink-900/45 px-2 py-1.5',
								block.attached && 'ml-2',
							)}
						>
							{block.label ? (
								<span className="text-[12px] font-semibold text-paper">{translate(block.label)}</span>
							) : null}
							{block.lines.map((line) => (
								<Row
									key={line.key}
									label={
										<span className="flex items-center gap-1.5">
											<ParamIcon paramKey={line.key} />
											{translate(line.label)}
										</span>
									}
									value={line.value}
									tone={line.good ? 'good' : undefined}
								/>
							))}
						</div>
					</Fragment>
				))}
			</div>
		</div>
	)
}
function Row({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'good' }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<span className="text-muted">{label}</span>
			<span className={cn('shrink-0 font-semibold tabular-nums', tone === 'good' && 'text-jade')}>{value}</span>
		</div>
	)
}
