import { ChargeOverlay } from './ChargeOverlay'
import { getTemplate } from '../game/items'
import type { Star } from '../game/types'
import { ItemIcon } from './ItemIcon'
import { Star as StarIcon } from './icons'
import { ITEM_STAR_TEXT, cn, itemTileClass } from './ui'

/**
 * One item drawn **exactly as the bag draws it**: quality background, class border, picture, and
 * star markers (the name lives in the caller's `title`).
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
	rotated = false,
	sizeScale = 1,
	weaponCharge,
	weaponChargeCycle = 0,
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
	/** Rotate the item's picture with its grid footprint. */
	rotated?: boolean
	/** Scale the tile's small details with its grid cell. */
	sizeScale?: number
	/** Battle-only attack charge, from 0 to 100. */
	weaponCharge?: number
	/**
	 * Which charge cycle the bar belongs to — used as its `key`, so a finished charge is followed by a
	 * **new** bar rising from the bottom instead of the same bar sliding back down.
	 */
	weaponChargeCycle?: number
}) {
	const template = getTemplate(templateId)
	return (
		<div
			data-item-quality={template.quality}
			className={cn(
				'surface-item relative size-full overflow-hidden rounded-md border border-line text-center select-none',
				itemTileClass(template.cls),
				className,
			)}
			style={{
				borderWidth: `${Math.max(1, 1.5 * sizeScale)}px`,
				borderRadius: `${6 * sizeScale}px`,
				padding: `${4 * sizeScale}px`,
			}}
		>
			<span
				data-item-icon-layer
				className="absolute inset-1 flex items-center justify-center overflow-hidden [container-type:size]"
				style={{ inset: `${4 * sizeScale}px` }}
			>
				<ItemIcon templateId={templateId} artSrc={artSrc} emojiClass={iconClass} rotated={rotated} />
			</span>
			{weaponCharge !== undefined ? (
				<ChargeOverlay percent={weaponCharge} cycle={weaponChargeCycle} sizeScale={sizeScale} />
			) : null}
			{/*
			 * The rank, drawn with the **lucide star** instead of the `★` character: a text glyph is set
			 * in the body font, so its size, weight and baseline shifted with the font stack and it read
			 * as a tiny smudge at 10 px. Filled (`fill`) so it still reads as a rank marker, not an
			 * outline button, and one icon per rank at a fixed size.
			 */}
			<span
				data-item-stars={star}
				className={cn(
					'absolute left-1/2 z-10 flex -translate-x-1/2 items-center drop-shadow-[0_1px_2px_rgb(0_0_0/85%)]',
					ITEM_STAR_TEXT[star],
				)}
				style={{
					// Nudged up from the old 4 px: the icons are taller than a 10 px glyph, so sitting on
					// the same bottom edge clipped them against the tile border.
					bottom: `${7 * sizeScale}px`,
					gap: `${1 * sizeScale}px`,
				}}
			>
				{Array.from({ length: star }, (_unused, index) => (
					<StarIcon
						key={index}
						aria-hidden
						className="shrink-0"
						style={{ width: `${12 * sizeScale}px`, height: `${12 * sizeScale}px` }}
						fill="currentColor"
						strokeWidth={1.5}
					/>
				))}
			</span>
		</div>
	)
}
