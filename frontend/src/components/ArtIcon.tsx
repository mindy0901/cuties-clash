import { useState } from 'react'
import { cn } from './ui'

interface ArtIconProps {
	/** Art path inside `public/`. `null` = no art yet, show the emoji. */
	src: string | null
	/** Shown when there is no art yet, or when the image fails to load. */
	emoji: string
	/** Class for the emoji (controls the font size). */
	emojiClass?: string
	className?: string
	alt?: string
	/**
	 * How the picture fills its box.
	 *
	 * `contain` (default) keeps the picture's own aspect ratio — right for square boxes such as a
	 * pet cell. `fill` **stretches** it to the box, which is what an item tile needs: the tile is
	 * exactly the item's footprint (1×3, 2×3…), so a square picture drawn with `contain` would sit
	 * in a single cell in the middle of the tile instead of covering it.
	 */
	fit?: 'contain' | 'fill'
}

/**
 * Shows the art when available, otherwise falls back to the emoji.
 *
 * A broken image also falls back to the emoji (`onError`) — so a missing art file never leaves an
 * empty cell or a broken-image icon in the grid.
 */
export function ArtIcon({ src, emoji, emojiClass, className, alt = '', fit = 'contain' }: ArtIconProps) {
	const [failed, setFailed] = useState(false)

	if (!src || failed) {
		return <span className={cn('leading-none', emojiClass, className)}>{emoji}</span>
	}

	return (
		<img
			src={src}
			alt={alt}
			draggable={false}
			className={cn(
				'size-full [image-rendering:pixelated]',
				fit === 'fill' ? 'object-fill' : 'object-contain',
				className,
			)}
			onError={() => setFailed(true)}
		/>
	)
}
