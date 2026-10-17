import type { ReactNode } from 'react'
import { sellValue } from '../game/bag'
import { CLASS_LABELS, DEFAULT_SPEED, getTemplate, starPrice, swingMs } from '../game/items'
import { STAT_KEYS, STAT_LABELS, formatStat } from '../game/stats'
import { useGameStore } from '../store/gameStore'
import { ItemGridPreview } from './ArtPreview'
import { Cost } from './icons'
import { btnClass, btnSmClass, cn, dialogClass, overlayClass, rowBetweenClass, statClass, statGridClass, tagClass } from './ui'

/**
 * **Item details** — opened by **clicking** an item in the inventory or the loadout.
 *
 * Why a dialog instead of a tooltip: the browser's `title` does not show on touch devices,
 * disappears when the mouse moves away, and cannot hold a stat table. Clicking an item used to
 * **pick it up**; that gesture now belongs to drag and drop, which frees the click for details.
 *
 * ⚠️ The dialog looks the item up by `uid` in `run` itself: the item may be **sold while the
 * dialog is open**, in which case `item` is `undefined` and the dialog closes itself (returns
 * `null`) instead of throwing.
 */
export function ItemDetailDialog({ uid, onClose }: { uid: string; onClose: () => void }) {
	const run = useGameStore((state) => state.run)
	const equipped = run.equipped.some((item) => item.uid === uid)
	const item = [...run.equipped, ...run.inventory].find((entry) => entry.uid === uid)
	if (!item) return null

	const template = getTemplate(item.templateId)
	// Default shape of the item, **not** the orientation it happens to have in the bag: the tile next
	// to this line is drawn upright, so the numbers have to describe the same shape.
	const size = template.space
	const passive = template.passive?.(item.star)
	const mods = passive ? STAT_KEYS.filter((key) => passive[key] !== undefined) : []
	// 0 damage means the item has **no** attack (a weapon turned passive by the admin): no rows.
	const damage = template.damage?.(item.star) || undefined
	// Every item has a speed: the template's own, or the standard 0.625 attacks per second.
	const speed = template.speed?.(item.star) ?? (damage !== undefined ? DEFAULT_SPEED : undefined)
	const swing = speed !== undefined ? swingMs(speed) : undefined

	return (
		<div className={overlayClass} onClick={onClose}>
			<div
				className={cn(dialogClass, 'max-h-[86vh] w-[min(520px,100%)] overflow-y-auto')}
				onClick={(event) => event.stopPropagation()}
			>
				<div className={rowBetweenClass}>
					<h2 className="text-[22px]">Chi tiết món</h2>
					<button type="button" className={cn(btnClass, btnSmClass)} onClick={onClose}>
						Đóng
					</button>
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
						<span className="text-[20px] font-semibold">{template.name}</span>
						<div className="mt-1 flex flex-wrap items-center gap-1.5">
							<span className={tagClass}>{CLASS_LABELS[template.cls]}</span>
							<span className={tagClass}>
								{size.w}×{size.h} ô
							</span>
							<span className={cn(tagClass, equipped && 'border-gold/45 text-gold-soft')}>
								{equipped ? 'Đang mang' : 'Trong kho'}
							</span>
						</div>
					</div>
				</div>

				<div className={statGridClass}>
					{damage !== undefined ? <Row label="Sát thương mỗi đòn" value={String(damage)} /> : null}
					{speed !== undefined ? <Row label="Tốc độ đánh" value={`${Number(speed.toFixed(2))} đòn/giây`} /> : null}
					{swing !== undefined ? <Row label="Nhịp đánh" value={`${(swing / 1000).toFixed(1)}s`} /> : null}
					{damage !== undefined && swing ? (
						<Row label="Sát thương mỗi giây" value={(damage / (swing / 1000)).toFixed(1)} />
					) : null}
					<Row label="Giá ở shop" value={<Cost amount={starPrice(template.cost, item.star)} />} />
					<Row label="Đã trả" value={<Cost amount={item.paid} />} />
					{/* The 50% rule belongs to the label, not to the number: the cell is too narrow for both. */}
					<Row label="Bán được (hoàn 50%)" value={<Cost amount={sellValue(item)} />} />
				</div>

				{mods.length > 0 ? (
					<div className="flex flex-col gap-2.5">
						<h3 className="text-[15px]">Chỉ số cộng thêm</h3>
						<div className={statGridClass}>
							{mods.map((key) => (
								<Row
									key={key}
									label={STAT_LABELS[key]}
									value={formatStat(key, passive?.[key] ?? 0)}
									tone="good"
								/>
							))}
						</div>
					</div>
				) : null}

				{template.active && template.interval ? (
					<p className="m-0 text-[13px] text-muted">
						Tự kích hoạt mỗi {(template.interval(item.star) / 1000).toFixed(1)}s khi đang mang.
					</p>
				) : null}

				<p className="m-0 text-[13px] text-muted">
					Chỉ món trong <b className="text-paper/90">Trang bị</b> mới có hiệu lực — món trong kho không tính.
				</p>
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
