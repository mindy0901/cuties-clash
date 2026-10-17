import { itemArtSrc } from '../game/art'
import { getTemplate } from '../game/items'
import { ArtIcon } from './ArtIcon'

/** Longest side of the held item's image, in px. */
const GHOST_SIZE = 60

/**
 * The item image **following the cursor** while an item is **being dragged**.
 *
 * An item in the grid is anchored to its own cell, so merely dimming it would leave the player
 * unable to see what they are holding. This image keeps the **cell's aspect ratio** (1×3 upright,
 * 3×1 sideways) so it matches the hint cell.
 */
export function HeldGhost({
	templateId,
	rotated,
	w,
	h,
	x,
	y,
}: {
	templateId: string
	rotated: boolean
	w: number
	h: number
	x: number
	y: number
}) {
	const template = getTemplate(templateId)
	// Portrait/landscape depending on the orientation it will be placed with.
	const size = rotated ? { w: h, h: w } : { w, h }
	const scale = GHOST_SIZE / Math.max(size.w, size.h)
	const width = Math.round(keepVisible(size.w * scale))
	const height = Math.round(keepVisible(size.h * scale))

	return (
		<div
			data-held-ghost={templateId}
			className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
			style={{ left: `${x}px`, top: `${y}px` }}
			aria-hidden
		>
			{/*
				Draw **only the item's icon**, ❌ not a cell frame/background.
				The rounded golden frame looks like an extra "small cell" and it also covers the
				hint cell underneath. A bare icon is enough to tell what is being held.
			*/}
			<div
				className="flex items-center justify-center drop-shadow-[0_2px_6px_rgb(0_0_0/70%)]"
				style={{ width: `${width}px`, height: `${height}px`, opacity: 0.95 }}
			>
				<ArtIcon
					src={itemArtSrc(templateId)}
					emoji={template.icon}
					emojiClass="text-2xl"
					alt={template.name}
					fit="fill"
				/>
			</div>
		</div>
	)
}

/** Never let a side shrink below the visible threshold. */
function keepVisible(value: number): number {
	return Math.max(20, value)
}
