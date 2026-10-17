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
	 * `contain` (default) keeps the picture's aspect ratio, `fill` stretches it to the box, and
	 * `cover` fills the box and cuts the overflow.
	 *
	 * A tile is exactly the item's footprint, so a picture cropped to that shape needs `contain`
	 * (any mismatch becomes a pixel of margin, never a squeeze), while the bundled **square** art
	 * needs `fill` — with `contain` it would sit in one cell in the middle of a long tile. An avatar
	 * circle needs `cover`, otherwise the corners of a square picture show inside the ring.
	 */
	fit?: 'contain' | 'fill' | 'cover'
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
				'size-full',
				fit === 'fill' ? 'object-fill' : fit === 'cover' ? 'object-cover' : 'object-contain',
				className,
			)}
			onError={() => setFailed(true)}
		/>
	)
}
