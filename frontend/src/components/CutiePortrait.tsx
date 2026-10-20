import { cutieArtSrc } from '../game/art'
import { getCutie } from '../game/cuties'
import { ArtIcon } from './ArtIcon'
import { cn } from './ui'

/**
 * The **round portrait** of a cutie — the big avatar in the middle of the preparation room.
 *
 * ⚠️ The picture **fills** the circle: `object-cover` plus `overflow-hidden` clip the square crop to
 * the ring. With `contain` (and inner padding) the corners of the square stayed visible inside the
 * gold ring, which read as "the picture did not fit".
 *
 * Kept in one place so the admin page can preview the imported crop in the very same ring
 * (`ArtImportDialog`) instead of a look-alike circle.
 */
export function CutiePortrait({
	cutieId,
	artSrc,
	className,
	iconClass = 'text-[104px]',
}: {
	cutieId: string
	/** Explicit picture to draw instead of the cutie's own art (preview before saving). */
	artSrc?: string | null
	className?: string
	iconClass?: string
}) {
	const cutie = getCutie(cutieId)
	const src = artSrc === undefined ? cutieArtSrc(cutieId) : artSrc
	return (
		<div
			data-cutie-portrait={cutieId}
			className={cn(
				'surface-cutie relative grid place-items-center overflow-hidden rounded-full border-2 border-gold/40 leading-none shadow-[0_0_48px_rgb(217_162_39/25%)]',
				className ?? 'size-40',
			)}
		>
			<ArtIcon src={src} emoji={cutie.icon} emojiClass={iconClass} fit="cover" />
		</div>
	)
}
