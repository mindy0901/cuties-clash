import type { ReactNode } from 'react'
import { sellValue } from '../game/bag'
import { CLASS_LABELS, getTemplate, starPrice } from '../game/items'
import { getCutie, cutieOwnerStats } from '../game/cuties'
import { kitDef, kitValue } from '../game/kits'
import { STAT_LABELS, formatStat } from '../game/stats'
import { useGameStore } from '../store/gameStore'
import { ItemGridPreview } from './ArtPreview'
import { Cost } from './icons'
import { cn, dialogClass, overlayClass, rowBetweenClass, statClass, statGridClass, tagClass } from './ui'
import { Button } from './ui/button'
import {
	AURA_TARGET_LABELS,
	itemFacts,
	kitParamText,
	onHitText,
} from './itemFacts'
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
	// Every number the dialog prints comes from `itemFacts`, shared with the shop's hover card.
	const owner = cutieOwnerStats(getCutie(run.cutieId), run.cuties[run.cutieId] ?? 1)
	const { passive, mods, attackKits, baseAttack, hitOf, intervalOf, aura, auraMods, parry, extraOptionKits } =
		itemFacts(template, item.star, owner)

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
				{attackKits.map((kit) => {
					const def = kitDef(kit.id)
					const hit = hitOf(kit)
					const interval = intervalOf(kit)
					const seconds = Number((interval / 1000).toFixed(1))
					const charge = kit.charge
					const chargedMultiplier = charge
						? Number(kitValue(charge, 'multiplier', item.star).toFixed(2))
						: 0
					return (
						<div key={kit.id} className="flex flex-col gap-2.5">
							<h3 className="text-[15px]">{translate(def.label)}</h3>
							<div className={statGridClass}>
								{hit > 0 ? <Row label={translate('Sát thương mỗi đòn')} value={String(hit)} /> : null}
								{interval > 0 ? (
									<Row
										label={translate('Hồi chiêu')}
										value={translate('{seconds}s', { seconds })}
									/>
								) : null}
								{hit > 0 && interval > 0 ? (
									<Row
										label={translate('Sát thương mỗi giây')}
										value={(hit / (interval / 1000)).toFixed(1)}
									/>
								) : null}
								{/* The charged attack rides on this swing: enough Sword Energy turns the **next**
								    basic attack into it, and its damage **replaces** — never adds to — this one. */}
								{charge ? (
									<>
										<Row
											label={translate('Kiếm Thế cần')}
											value={String(Math.round(kitValue(charge, 'seNeed', item.star)))}
										/>
										<Row label={translate('Hệ số đòn nạp')} value={`×${chargedMultiplier}`} />
										<Row
											label={translate('Sát thương đòn nạp')}
											value={String(Math.round(baseAttack * chargedMultiplier))}
										/>
									</>
								) : null}
								{/* The on-hit effects belong to the kit they were attached to. */}
								{(kit.onHit ?? []).map((effect) => (
									<Row
										key={effect.id}
										label={`${translate(kitDef(effect.id).label)} · ${Math.round(kitValue(effect, 'chance', item.star))}%`}
										value={onHitText(effect, item.star)}
										tone="good"
									/>
								))}
							</div>
						</div>
					)
				})}

				{parry ? (
					<div className="flex flex-col gap-2.5">
						<h3 className="text-[15px]">{translate('Chấn Đao')}</h3>
						<div className={statGridClass}>
							<Row
								label={translate('Tỉ lệ Chấn Đao')}
								value={`${Number(kitValue(parry, 'chance', item.star).toFixed(1))}%`}
								tone="good"
							/>
							<Row
								label={translate('Kiếm Thế tiêu hao')}
								value={String(Math.round(kitValue(parry, 'cost', item.star)))}
							/>
							<Row
								label={translate('Sát thương phản kích')}
								value={`${Math.round(kitValue(parry, 'power', item.star))}%`}
								tone="good"
							/>
						</div>
					</div>
				) : null}

				{extraOptionKits.map((kit) => {
					const def = kitDef(kit.id)
					return (
						<div key={kit.id} className="flex flex-col gap-2.5">
							<h3 className="text-[15px]">{translate(def.label)}</h3>
							<div className={statGridClass}>
								{def.params.map((param) => (
									<Row
										key={param.key}
										label={translate(param.label)}
										value={kitParamText(kit, param.key, item.star)}
										tone="good"
									/>
								))}
							</div>
						</div>
					)
				})}

				{aura && auraMods.length > 0 ? (
					<div className="flex flex-col gap-2.5">
						<h3 className="text-[15px]">{translate('Hào khí liền kề')}</h3>
						<div className={statGridClass}>
							<Row
								label={translate(AURA_TARGET_LABELS[aura.target])}
								value={auraMods
									.map((key) => `${translate(STAT_LABELS[key])} ${formatStat(key, aura.mods[key] ?? 0)}`)
									.join(' · ')}
								tone="good"
							/>
						</div>
					</div>
				) : null}

				{mods.length > 0 ? (
					<div className="flex flex-col gap-2.5">
						<h3 className="text-[15px]">{translate('Chỉ số cộng thêm')}</h3>
						<div className={statGridClass}>
							{mods.map((key) => (
								<Row
									key={key}
									label={translate(STAT_LABELS[key])}
									value={formatStat(key, passive?.[key] ?? 0)}
									tone="good"
								/>
							))}
						</div>
					</div>
				) : null}
			</div>
		</div>
	)
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' }) {
	return (
		<div className={statClass}>
			<span className="text-muted">{label}</span>
			<span className={cn('inline-flex items-center gap-1 font-semibold', tone === 'good' && 'text-jade')}>{value}</span>
		</div>
	)
}
