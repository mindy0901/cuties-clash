import { sellValue, templateFootprint } from '../game/bag'
import { CLASS_LABELS, getTemplate, starLabel } from '../game/items'
import { STAT_KEYS, STAT_LABELS, formatStat } from '../game/stats'
import { useGameStore } from '../store/gameStore'
import { ArtIcon } from './ArtIcon'
import { itemArtSrc } from '../game/art'
import { btnClass, btnSmClass, cn, dialogClass, itemTileClass, overlayClass, rowBetweenClass, statClass, statGridClass, tagClass } from './ui'

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
	const size = templateFootprint(item.templateId, item.rotated)
	const passive = template.passive?.(item.star)
	const mods = passive ? STAT_KEYS.filter((key) => passive[key] !== undefined) : []
	const damage = template.damage?.(item.star)
	const swingMs = template.attackInterval?.(item.star)

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

				<div className="flex items-center gap-3.5">
					<div
						className={cn(
							'surface-item grid size-20 shrink-0 place-items-center rounded-[14px] border p-2',
							itemTileClass(template.cls, template.quality, item.star),
						)}
					>
						<ArtIcon
							src={itemArtSrc(item.templateId, item.star)}
							emoji={template.icon}
							emojiClass="text-4xl"
							alt={template.name}
						/>
					</div>
					<div className="min-w-0">
						<div className="flex items-baseline gap-2">
							<span className="text-[20px] font-semibold">{template.name}</span>
							<span className="text-gold-soft">{starLabel(item.star)}</span>
						</div>
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

				<p className="m-0 text-[14px] leading-relaxed text-paper/90">{template.desc(item.star)}</p>

				<div className={statGridClass}>
					{damage !== undefined ? <Row label="Sát thương mỗi đòn" value={String(damage)} /> : null}
					{swingMs !== undefined ? <Row label="Nhịp đánh" value={`${(swingMs / 1000).toFixed(1)}s`} /> : null}
					{damage !== undefined && swingMs ? (
						<Row label="Sát thương mỗi giây" value={(damage / (swingMs / 1000)).toFixed(1)} />
					) : null}
					<Row label="Giá ở shop" value={`${template.cost * item.star} 🐾`} />
					<Row label="Đã trả" value={`${item.paid} 🐾`} />
					<Row label="Bán được" value={`${sellValue(item)} 🐾 (hoàn 50%)`} />
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

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' }) {
	return (
		<div className={statClass}>
			<span className="text-muted">{label}</span>
			<span className={cn('font-semibold', tone === 'good' && 'text-jade')}>{value}</span>
		</div>
	)
}
