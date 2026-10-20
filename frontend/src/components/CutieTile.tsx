import { getCutie } from '../game/cuties'
import { CutieIcon } from './ItemIcon'
import { cn } from './ui'

/**
 * The **cutie cell** used in the cutie panel — one picture, on the cutie background.
 *
 * Two shapes: the square cell (`size-[52px]`, default) and the **round avatar** (`round`, used where
 * the picture represents the Cutie itself). A round avatar drops the padding and crops the picture
 * with `object-cover`, so the art reaches the rim instead of floating inside a small box.
 *
 * Kept in one place so the admin page can preview a cutie image in the very same cell instead of a
 * look-alike box that could drift from the real one.
 */
export function CutieTile({
	cutieId,
	artSrc,
	className,
	iconClass = 'text-[30px]',
	round = false,
}: {
	cutieId: string
	/** Explicit picture to draw instead of the cutie's own art (preview before saving). */
	artSrc?: string | null
	className?: string
	iconClass?: string
	/** Round avatar instead of the square cell: picture cropped to the rim. */
	round?: boolean
}) {
	// Touch `getCutie` so a wrong id fails loudly instead of rendering an empty cell.
	getCutie(cutieId)
	return (
		<div
			data-cutie-tile={cutieId}
			data-cutie-tile-shape={round ? 'round' : 'square'}
			className={cn(
				'surface-cutie grid shrink-0 place-items-center border border-line',
				round ? 'overflow-hidden rounded-full' : 'rounded-[14px] p-1',
				className ?? 'size-[52px]',
			)}
		>
			<CutieIcon cutieId={cutieId} artSrc={artSrc} emojiClass={iconClass} fit={round ? 'cover' : 'contain'} />
		</div>
	)
}
