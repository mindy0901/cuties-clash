import type { ReactNode } from 'react'
import { CLASS_LABELS, getTemplate } from '../game/items'
import { kitDef, kitValue } from '../game/kits'
import { STAT_LABELS, formatStat } from '../game/stats'
import { Clock, StarRow } from './icons'
import { itemFacts, kitParamText, onHitText, seconds } from './itemFacts'
import type { OwnerStats } from './itemFacts'
import { cn } from './ui'
import { translate } from '../i18n'
import type { Star } from '../game/types'

/**
 * The **hover card** of a shop offer: the item's numbers, laid out beside the tile like the
 * reference screenshot (name + class on a header bar, what it swings, what it lands on hit, and what
 * its support gem does).
 *
 * ⚠️ What it deliberately **does not** show: the price (the cell right below the tile already states
 * it, and repeating it invites the two to disagree), the merge hint (the tile's own `↑ N★` badge says
 * that), and the buff `target` / `directions` params — a direction mask means nothing in a card, the
 * arrows are drawn on the item itself in the bag. Those rows were reported as noise and are gone.
 *
 * ⚠️ It is **not** a second details dialog and not a second rulebook: every value comes from
 * `itemFacts()`, the same module `ItemDetailDialog` reads. The dialog stays the place with the
 * economy rows, the sell value and the kit-by-kit breakdown; this card answers "should I buy it?"
 * while the pointer is already there.
 *
 * ⚠️ Positioning is the caller's job (`position: fixed` from the hovered tile's rect): the shop
 * board is `overflow-hidden`, so a card laid out inside it would be clipped at the board edge.
 */
export function ShopOfferCard({
	templateId,
	star,
	owner,
	left,
	top,
	maxHeight,
}: {
	templateId: string
	star: Star
	/** The cutie's own attack and speed — every item number is a multiplier of them. */
	owner: OwnerStats
	left: number
	top: number
	/** Room between the card's top and the bottom of the window — the body scrolls inside it. */
	maxHeight: number
}) {
	const template = getTemplate(templateId)
	const facts = itemFacts(template, star, owner)
	const weapon = facts.attackKits[0]
	const interval = weapon ? facts.intervalOf(weapon) : 0
	const hit = weapon ? facts.hitOf(weapon) : 0
	const dps = hit > 0 && interval > 0 ? (hit / (interval / 1000)).toFixed(1) : null

	return (
		<div
			data-shop-offer-card
			role="tooltip"
			className="pointer-events-none fixed z-40 flex w-[258px] flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-panel"
			style={{ left: `${left}px`, top: `${top}px`, maxHeight: `${maxHeight}px` }}
		>
			{/* Text only: the tile is **right there** on the board, so repeating its picture would only
			    take room away from the numbers. */}
			<div className="flex items-baseline gap-2 border-b border-border bg-linear-to-r from-primary/30 to-transparent px-2.5 py-1.5">
				<span className="min-w-0 truncate text-[14px] font-semibold leading-tight">
					{translate(template.name)}
				</span>
				<span className="shrink-0 text-[11.5px] text-muted">{translate(CLASS_LABELS[template.cls])}</span>
				<StarRow count={star} className="ml-auto text-gold-soft" />
			</div>

			<div className="flex flex-col gap-1 overflow-y-auto px-2.5 py-1.5 text-[12px]">
				{/* What it swings: the reference's clock row, plus damage and dps so the rhythm reads as a number. */}
				{weapon ? (
					<div className="mt-0.5 flex flex-col gap-1 border-t border-border/70 pt-1.5">
						<Row
							label={
								<span className="flex items-center gap-1">
									<Clock className="size-3.5 opacity-70" />
									{translate('Hồi chiêu')}
								</span>
							}
							value={seconds(interval)}
						/>
						{hit > 0 ? <Row label={translate('Sát thương mỗi đòn')} value={String(hit)} tone="good" /> : null}
						{dps ? <Row label={translate('Sát thương mỗi giây')} value={dps} tone="good" /> : null}
					</div>
				) : null}

				{/* Passive stats and the aura, one compact line each. */}
				{facts.mods.length > 0 ? (
					<div className="mt-0.5 flex flex-col gap-1 border-t border-border/70 pt-1.5">
						{facts.mods.map((key) => (
							<Row
								key={key}
								label={translate(STAT_LABELS[key])}
								value={formatStat(key, facts.passive?.[key] ?? 0)}
								tone="good"
							/>
						))}
					</div>
				) : null}

				{facts.aura && facts.auraMods.length > 0 ? (
					<div className="mt-0.5 border-t border-border/70 pt-1.5">
						<Row
							label={translate('Hào khí liền kề')}
							value={facts.auraMods
								.map((key) => `${translate(STAT_LABELS[key])} ${formatStat(key, facts.aura?.mods[key] ?? 0)}`)
								.join(' · ')}
							tone="good"
						/>
					</div>
				) : null}

				{/* Effects: the charged swing first, then every on-hit the kit carries. */}
				{weapon?.charge ? (
					<div className="mt-0.5 border-t border-border/70 pt-1.5">
						<Row
							label={translate('Đòn nạp · Kiếm Thế cần')}
							value={String(Math.round(kitValue(weapon.charge, 'seNeed', star)))}
						/>
					</div>
				) : null}

				{facts.attackKits.some((kit) => (kit.onHit ?? []).length > 0) ? (
					<div className="mt-0.5 flex flex-col gap-1 border-t border-border/70 pt-1.5">
						{facts.attackKits.flatMap((kit) =>
							(kit.onHit ?? []).map((effect) => (
								<div key={`${kit.id}-${effect.id}`} className="flex flex-col">
									<span className="text-muted">
										{translate(kitDef(effect.id).label)} ·{' '}
										{Math.round(kitValue(effect, 'chance', star))}%
									</span>
									<span className="font-semibold text-jade">{onHitText(effect, star)}</span>
								</div>
							)),
						)}
					</div>
				) : null}

				{/* A support gem / armour piece: its own parameter table.
				    ⚠️ `target` and `directions` are **skipped**: which sides a gem boosts is a bitmask that
				    only means something as the arrows drawn on the item in the bag — as a text row it was
				    noise (and read as wrong). */}
				{facts.extraOptionKits.length > 0 ? (
					<div className="mt-0.5 flex flex-col gap-1 border-t border-border/70 pt-1.5">
						{facts.extraOptionKits.map((kit) => (
							<div key={kit.id} className="flex flex-col">
								<span className="text-[11.5px] font-semibold text-paper/90">{translate(kitDef(kit.id).label)}</span>
								{kitDef(kit.id).params
									.filter((param) => param.key !== 'target' && param.key !== 'directions')
									.map((param) => (
										<Row
											key={param.key}
											label={translate(param.label)}
											value={kitParamText(kit, param.key, star)}
											tone="good"
										/>
									))}
							</div>
						))}
					</div>
				) : null}
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
