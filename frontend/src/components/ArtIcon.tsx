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
}

/**
 * Shows the art when available, otherwise falls back to the emoji.
 *
 * A broken image also falls back to the emoji (`onError`) — so a missing art file never leaves an
 * empty cell or a broken-image icon in the grid.
 */
export function ArtIcon({ src, emoji, emojiClass, className, alt = '' }: ArtIconProps) {
	const [failed, setFailed] = useState(false)

	if (!src || failed) {
		return <span className={cn('leading-none', emojiClass, className)}>{emoji}</span>
	}

	return (
		<img
			src={src}
			alt={alt}
			draggable={false}
			className={cn('size-full object-contain [image-rendering:pixelated]', className)}
			onError={() => setFailed(true)}
		/>
	)
}
