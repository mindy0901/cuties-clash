import { getTemplate } from '../game/items'
import type { Star } from '../game/types'
import { ItemIcon } from './ItemIcon'
import { ITEM_STAR_TEXT, cn, itemTileClass } from './ui'

/**
 * One item drawn **exactly as the bag draws it**: quality background, class border, picture, and the
 * star row under the picture (the name lives in the caller's `title`).
 *
 * ⚠️ WHY THIS IS A COMPONENT: the loadout board, the inventory board, the shop card, the item detail
 * dialog and the admin art preview all show the same item — a second copy of these classes is how
 * they drift apart (the shop was still a square box while the bag was a footprint tile).
 *
 * ⚠️ It fills its parent (`size-full`), so the **caller** owns the size: a grid cell (`GridBoard`),
 * or `w × h` cells for a standalone preview.
 */
export function ItemTile({
	templateId,
	star,
	artSrc,
	iconClass,
	className,
}: {
	templateId: string
	star: Star
	/** Picture to draw instead of the saved one (a crop that is not uploaded yet). */
	artSrc?: string | null
	/**
	 * Emoji size when the item has **no picture**.
	 *
	 * ⚠️ A literal class, so Tailwind emits it: a scaled-down preview needs a smaller emoji, and a
	 * `text-[${px}]` built at runtime would silently produce no style at all.
	 */
	iconClass?: string
	className?: string
}) {
	const template = getTemplate(templateId)
	return (
		<div
			data-item-quality={template.quality}
			className={cn(
				'surface-item relative flex size-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border border-line p-1 text-center select-none',
				itemTileClass(template.cls, template.quality),
				className,
			)}
		>
			<span className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
				<ItemIcon templateId={templateId} artSrc={artSrc} emojiClass={iconClass} />
			</span>
			<span
				data-item-stars={star}
				className={cn(
					'shrink-0 text-[10px] leading-none tracking-[-1px] whitespace-nowrap drop-shadow-[0_1px_1px_rgb(0_0_0/70%)]',
					ITEM_STAR_TEXT[star],
				)}
			>
				{'★'.repeat(star)}
			</span>
		</div>
	)
}
