import type { CSSProperties } from 'react'

/**
 * Cooldown-reduction effect: **meteor streaks** climbing the weapon tile, the way Naraka draws speed.
 *
 * Not arrows and not icons: a bundle of thin vertical light trails — long and short, bright and faint —
 * sliding upward, each with a bright head and a tail that dissolves. They are the same idea as falling
 * stars seen from below. *
 * Two rules make it read as continuous motion instead of a stuttering loop:
 * 1. a streak starts **below** the tile and finishes **above** it (`bottom: -length`, travel
 *    `tileHeight + length`), so the animation's start and restart both happen outside the clipped area —
 *    nothing ever pops into view or freezes at an edge;
 * 2. the timing is `linear` with a **negative** `animation-delay` per streak, so on the first frame the
 *    stream is already spread over the whole tile.
 */
interface Streak {
	/** Horizontal offset from the centre, in fractions of a cell. */
	x: number
	/** Length as a fraction of the tile height. */
	length: number
	/** Width in pixels at a 90 px cell. */
	width: number
	/** Seconds for one full climb. */
	duration: number
	/** Negative delay in seconds — how far into its climb the streak starts. */
	delay: number
	opacity: number
}

/** Deliberately irregular: even spacing and even timing read as a comb, not as light. */
const STREAKS: Streak[] = [
	{ x: -0.31, length: 0.2, width: 1.1, duration: 0.74, delay: 0.32, opacity: 0.6 },
	{ x: 0.08, length: 0.38, width: 2.2, duration: 0.59, delay: 0.07, opacity: 1 },
	{ x: 0.3, length: 0.11, width: 1, duration: 0.84, delay: 0.52, opacity: 0.45 },
	{ x: -0.17, length: 0.29, width: 1.6, duration: 0.66, delay: 0.21, opacity: 0.8 },
	{ x: 0.21, length: 0.15, width: 1.2, duration: 0.79, delay: 0.61, opacity: 0.55 },
	{ x: -0.38, length: 0.44, width: 2.6, duration: 0.55, delay: 0.03, opacity: 0.9 },
	{ x: -0.04, length: 0.09, width: 1, duration: 0.89, delay: 0.4, opacity: 0.5 },
	{ x: 0.37, length: 0.24, width: 1.4, duration: 0.69, delay: 0.16, opacity: 0.7 },
	{ x: 0.15, length: 0.34, width: 1.8, duration: 0.62, delay: 0.45, opacity: 0.65 },
]

/** Streaks read as a green (heal-toned) light trail, matching the boosted tile's rim. */
const STREAK_TRAIL =
	'linear-gradient(to top, rgb(70 179 154 / 0%) 0%, rgb(86 205 150 / 50%) 45%, rgb(168 240 190 / 88%) 82%, rgb(234 255 240 / 96%) 100%)'

export function HasteStreaks({ cellSize, tileHeight }: { cellSize: number; tileHeight: number }) {
	const scale = cellSize / 90
	return (
		<>
			{STREAKS.map((streak, index) => {
				const height = Math.max(6, Math.round(streak.length * tileHeight))
				// 30 % wider than the first pass: at tile size the trails were too thin to read as light.
				const width = Math.max(1, Math.round(streak.width * scale * 1.3 * 10) / 10)
				return (
					<span
						key={index}
						className="absolute left-1/2 animate-boost-streak rounded-full"
						style={
							{
								bottom: `-${height}px`,
								marginLeft: `${Math.round(streak.x * cellSize)}px`,
								width: `${width}px`,
								height: `${height}px`,
								opacity: streak.opacity,
								background: STREAK_TRAIL,
								boxShadow: `0 0 ${Math.round(3 + width * 2)}px rgb(96 220 160 / 55%)`,
								'--streak-rise': `${tileHeight + height}px`,
								animationDelay: `-${streak.delay}s`,
								animationDuration: `${streak.duration}s`,
							} as CSSProperties
						}
					>
						{/* The head: a tiny bright dot so the streak reads as light moving, not as a bar. */}
						<span
							className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#eafff2]"
							style={{ width: `${Math.max(2, width)}px`, height: `${Math.max(2, width)}px` }}
						/>
					</span>
				)
			})}
		</>
	)
}
