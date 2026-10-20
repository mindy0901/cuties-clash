import { DIRECTION_BITS, DIRECTIONS, type Direction } from '../game/bag'
import { cn } from './ui'

/**
 * Small arrows on the four sides of a **support gem**, at the sides its `directions` mask selects.
 *
 * Why it exists: a gem's buff only reaches the weapons it points at, and that parameter is a bitmask
 * buried in the admin page. Seeing the sides on the tile itself is what makes placement readable —
 * and, while dragging, a side that has a **weapon** on it turns **gold** instead of silver.
 *
 * ⚠️ Presentation only: it never changes what the kit does (that is `build.ts`).
 */
const ARROW: Record<Direction, string> = { up: '▲', down: '▼', left: '◀', right: '▶' }

/**
 * Where each arrow sits. The glyph is pushed **fully outside** the tile, so its base sits on the
 * tile's border: an arrow drawn inside covered the star rank (it is drawn 8 px above the bottom
 * edge), and a gem's arrows are supposed to point at its neighbours, not at its own artwork.
 */
const POSITION: Record<Direction, string> = {
	up: 'left-1/2 top-0 -translate-x-1/2 -translate-y-full',
	down: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-full',
	left: 'left-0 top-1/2 -translate-y-1/2 -translate-x-full',
	right: 'right-0 top-1/2 -translate-y-1/2 translate-x-full',
}

export function DirectionOverlay({
	mask,
	sides,
	cellSize,
	className,
}: {
	/** Bitmask of the sides to draw (`0` draws nothing). */
	mask: number
	/** Per side: does a **weapon** sit there? Gold when true, silver when false. */
	sides: Record<Direction, boolean>
	/** Tile size in px, used to scale the glyphs. */
	cellSize: number
	className?: string
}) {
	if (mask === 0) return null
	const size = Math.max(9, Math.round(cellSize * 0.2))
	return (
		<span
			aria-hidden="true"
			data-direction-overlay
			className={cn('pointer-events-none absolute inset-0 z-20', className)}
		>
			{DIRECTIONS.filter((side) => (mask & DIRECTION_BITS[side]) !== 0).map((side) => (
				<span
					key={side}
					data-direction={side}
					data-direction-live={sides[side] ? 'weapon' : 'empty'}
					className={cn(
						'absolute leading-none drop-shadow-[0_1px_2px_rgb(0_0_0/85%)]',
						POSITION[side],
						sides[side] ? 'text-gold-soft' : 'text-[#b9bec7]',
					)}
					style={{ fontSize: `${size}px` }}
				>
					{ARROW[side]}
				</span>
			))}
		</span>
	)
}
