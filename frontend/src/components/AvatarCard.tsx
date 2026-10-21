import { avatarArtSrc, cutieArtSrc } from '../game/art'
import { CUTIE_SKILL_SLOTS, getCutie } from '../game/cuties'
import { ArtIcon } from './ArtIcon'
import { ChargeOverlay } from './ChargeOverlay'
import type { WeaponCharge } from './battleCharge'
import { cn } from './ui'
import { translate } from '../i18n'

export interface AvatarFeedback {
	key: number
	value: number
	/**
	 * `block` is the popup for a charged attack that was negated with Sword Energy; `shield` is armour
	 * gained. All of them pop on the **same frame** as the bars they describe.
	 *
	 * ⚠️ Adding a flavour (burn / poison are planned) = one value here **and** one row in
	 * `FEEDBACK_STYLE` below; the renderer is a plain lookup, so nothing else has to change.
	 */
	type: 'damage' | 'heal' | 'block' | 'shield'
	/**
	 * A **critical** hit: the number is bigger, yellow-to-red with a fire glow, and carries a `CRITICAL`
	 * label. Only meaningful for `type: 'damage'`.
	 */
	critical?: boolean
	/** How long the number floats, in seconds of real time. Defaults to `0.6`. */
	seconds?: number
	/**
	 * Wait before it starts floating, in seconds. Defaults to `0` — every number of one replay tick
	 * starts together with the bar change it describes (see `BattleScreen`: no stagger).
	 */
	delay?: number
}

/**
 * How each flavour of feedback is drawn. One row per `type`, so a new one (burn, poison…) is a data
 * change, not a second branch in the markup.
 */
const FEEDBACK_STYLE: Record<
	AvatarFeedback['type'],
	{ tone: string; sign: string; label: string | null; shake: boolean }
> = {
	damage: { tone: 'text-danger-soft', sign: '−', label: null, shake: true },
	heal: { tone: 'text-jade', sign: '+', label: null, shake: false },
	shield: { tone: 'text-se', sign: '+', label: null, shake: false },
	block: { tone: 'text-se', sign: '', label: 'ĐỠ ĐÒN', shake: false },
}

export interface AvatarCardProps {
	side: 'player' | 'enemy'
	name: string
	/** Small label next to the name (cutie level, stage name…). */
	label?: string
	/** With `cutieId` → uses the cutie's **avatar art** (see `avatarArtSrc`). */
	cutieId?: string
	/** Without `cutieId` (stage opponents) → uses an emoji. */
	emoji?: string
	/**
	 * Draw this picture instead of the cutie's own art.
	 *
	 * ⚠️ Only the admin page uses it, to preview a crop that is not uploaded yet in the very frame the
	 * battle draws. ❌ Not a second way to pick art.
	 */
	artSrc?: string | null
	/** Recent combat feedback to animate inside the frame. */
	feedback?: AvatarFeedback[]
	/** Enlarged presentation for the battle arena. */
	size?: 'default' | 'battle'
	/**
	 * The Cutie's **own** swing charge (battle only), drawn exactly like a weapon tile's charge line.
	 *
	 * A Cutie attacks through its attack kits, so it has a cadence just like a weapon — without this bar
	 * the portrait looked untouched while it was the thing dealing the damage. `null`/absent = no bar
	 * (the Cutie has no attack kit, so it never swings).
	 */
	charge?: WeaponCharge | null
}

/**
 * Where a floating number is **born**: a band **well above the impact** — the portrait centre, where the
 * impact flash is drawn — spread sideways and upward by its key so a burst scatters instead of printing on
 * one spot (asked for: "vị trí dmg bay lên random phía trên vị trí get hit" … "tối thiểu phải cao hơn vị trí
 * hit hơn nữa").
 *
 * ⚠️ It stays in the **upper middle** of the card (38–62 % across, 24–34 % down): the highest row is what
 * decides how far a number may still travel before it reaches the nameplate.
 */
const BIRTH_LEFT = ['38%', '44%', '50%', '56%', '62%']
const BIRTH_TOP = ['24%', '28%', '32%', '36%']

/** Where one number starts, chosen from its key so it **never moves** while others come and go. */
function birthOf(key: number): { left: string; top: string } {
	return {
		left: BIRTH_LEFT[(key * 3) % BIRTH_LEFT.length]!,
		top: BIRTH_TOP[(key * 2) % BIRTH_TOP.length]!,
	}
}

/**
 * The direction every number travels: **straight up (12 o'clock)**, with only the distance cycled by the
 * key so a burst stacks in a column. ❌ No sideways fan: a number that left at an angle read as travelling
 * somewhere (asked for: "vẫn bay thẳng theo hướng 12h").
 *
 * ⚠️ The motion is fast from the first frame (`combatFloater` gives the launch ~55 % of the distance in the
 * first 20 % of the life) — a distance spread evenly over the whole life moved ≤ 0.1 px per frame, which
 * reads as a slow crawl instead of a shot ("như bị đẩy lên từ từ … không mượt như 10fps").
 * 🔴 `dy` stops at −95 px: the highest birth row is 24 % of a 492 px card (~118 px) and the nameplate
 * occupies the top of it, and `dx` stays `0` — the layer is `absolute`, so anything outside the card
 * would add a horizontal scrollbar to the arena.
 */
const FLIGHT: { dx: number; dy: number }[] = [
	{ dx: 0, dy: -70 },
	{ dx: 0, dy: -80 },
	{ dx: 0, dy: -86 },
	{ dx: 0, dy: -92 },
	{ dx: 0, dy: -95 },
]

/** The straight-up vector of one number, for `combatFloater`. */
function flightOf(key: number): { dx: string; dy: string } {
	const vector = FLIGHT[(key * 3) % FLIGHT.length]!
	return { dx: `${vector.dx}px`, dy: `${vector.dy}px` }
}

/**
 * The **avatar** frame for one fighter, placed on both sides of the arena (see `BattleScreen`).
 *
 * This is the **holder ready for avatar art**: right now it shows the cutie art, falling back to
 * an emoji when no art exists. Once dedicated avatars exist, **this component needs no change** —
 * just drop a file at `/public/icons/cuties/<id>-avatar.png` and enable `avatar: true` in
 * `game/cuties.ts`; `avatarArtSrc` will take priority automatically (see `docs/ASSETS.md`).
 */
export function AvatarCard({
	side,
	name,
	label,
	cutieId,
	emoji,
	artSrc,
	feedback = [],
	size = 'default',
	charge = null,
}: AvatarCardProps) {
	const cutie = cutieId ? getCutie(cutieId) : null
	const isBattleSize = size === 'battle'
	// `artSrc` is the preview override; otherwise the cutie's avatar art, falling back to its own.
	const picture = artSrc === undefined ? (cutieId ? (avatarArtSrc(cutieId) ?? cutieArtSrc(cutieId)) : null) : artSrc
	const hitKey = feedback.filter((entry) => entry.type === 'damage').at(-1)?.key
	return (
		<aside
			data-avatar-card={side}
			className={cn(
				isBattleSize
					? cn('battle-cutie-card', side === 'enemy' && 'battle-cutie-card-enemy')
					: cn(
							'relative flex w-[176px] shrink-0 flex-col gap-2 rounded-panel border-2 bg-linear-to-b p-2',
							side === 'player'
								? 'border-[#8a6316] from-[#241d12] to-ink-800'
								: 'border-[#7d2318] from-[#241412] to-ink-800',
						),
			)}
		>
			{isBattleSize ? <span className="battle-cutie-inlay" aria-hidden="true" /> : null}
			{!isBattleSize ? (
				<div className="rounded-md border border-gold/35 bg-black/45 px-2 py-1 text-center text-[12.5px] font-semibold">
					{translate(name)}
					{label ? <span className="ml-1 text-[11px] font-normal text-muted">{label}</span> : null}
				</div>
			) : null}

			{/*
			 * Avatar frame.
			 *
			 * `flex-1` + `min-h` so the picture **fills the whole card**: the card stretches to the height
			 * of the item grids beside it, and a square frame in the middle left the bottom half empty
			 * (`min-h` is what keeps the frame from collapsing when the card is not stretched, e.g. in the
			 * admin preview).
			 *
			 * ⚠️ The holder itself must **not** be keyed: `<div key={hitKey}>` remounted every floating
			 * number with it, so each new hit replayed the animation of every number already on screen
			 * (they all "jumped" again). The key lives on an inner wrapper that holds only the picture.
			 */}
			<div
				data-avatar-holder
				className={cn(
					'relative grid flex-1 place-items-center overflow-hidden',
					isBattleSize
						? 'battle-cutie-portrait'
						: 'min-h-[132px] rounded-xl border border-dashed border-gold/30 bg-black/45',
				)}
			>
				<div
					data-avatar-picture
					className={cn(
						'grid h-full w-full place-items-center',
						hitKey !== undefined && 'animate-shake',
					)}
					key={hitKey !== undefined ? `hit-${hitKey}` : 'idle'}
				>
					<ArtIcon
						src={picture}
						emoji={emoji ?? cutie?.icon ?? '🀄'}
						emojiClass={isBattleSize ? 'text-[87px]' : 'text-[58px]'}
						alt={translate(name)}
						fit="cover"
					/>
					{hitKey !== undefined ? (
						<span
							aria-hidden="true"
							data-combat-impact
							className={cn(
								'pointer-events-none absolute inset-0 animate-impact-flash',
								isBattleSize ? 'rounded-[inherit]' : 'rounded-full',
							)}
							style={{
								background:
									'radial-gradient(ellipse at center, rgb(255 246 205 / 90%) 0%, rgb(255 100 66 / 50%) 28%, transparent 72%)',
							}}
						/>
					) : null}
				</div>
				{/*
				 * The Cutie's own swing charge, drawn with the **same component** a weapon tile uses: the bar
				 * rises across the portrait and reaches the top exactly when the Cutie's blade leaves.
				 */}
				{isBattleSize && charge ? (
					<span data-battle-cutie-charge className="pointer-events-none absolute inset-0 z-[6]">
						<ChargeOverlay percent={charge.percent} cycle={charge.cycle} sizeScale={3} />
					</span>
				) : null}
			</div>
			{/*
			 * 🔴 The floating numbers live **outside** the portrait, in their own layer over the card: the
			 * portrait clips to its rounded frame (`overflow-hidden`), so a number near the edge was cut in
			 * half by that frame ("dmg popup đang bị frame che mất"). Percentages stay relative to the card,
			 * which is the portrait plus its border — close enough for a number that floats away anyway.
			 */}
			<div className="pointer-events-none absolute inset-0 z-[7]">
				{feedback.map((entry) => {
					const seconds = entry.seconds ?? 0.6
					const delay = entry.delay ?? 0
					const flight = flightOf(entry.key)
					const birth = birthOf(entry.key)
					const style = FEEDBACK_STYLE[entry.type]
					const critical = entry.critical === true && entry.type === 'damage'
					return (
						// Plain CSS animation: `motion` restarted the keyframes on every re-render, so each
						// new hit made every number already on screen jump once more.
						<span
							key={entry.key}
							className="pointer-events-none absolute -translate-x-1/2"
							data-combat-feedback={entry.type}
							data-combat-feedback-key={entry.key}
							{...(critical ? { 'data-combat-critical-hit': true } : {})}
							style={birth}
						>
							<span
								aria-label={
									entry.type === 'block'
										? translate('Đỡ đòn')
										: entry.type === 'shield'
											? translate('Giáp {amount}', { amount: entry.value })
											: translate(
													entry.type === 'damage' ? 'Sát thương {amount}' : 'Hồi máu {amount}',
													{ amount: entry.value },
												)
								}
								className={cn(
									// 🔴 `will-change: transform` promotes the number to its **own composited
									// layer**: without it the browser re-rasterises the glyphs and the
									// `text-shadow` on every frame of the scale, which is what made the pop
									// stutter instead of glide. The layer is scaled by the GPU instead.
									'block animate-combat-floater font-extrabold [will-change:transform] [backface-visibility:hidden]',
									critical
										? // Critical: one step bigger, blazing gold, but still small enough to sit
											// inside the card (asked for: "thu nhỏ popup bắn ra").
											cn(
												'text-[26px] leading-none text-[#ffd45c]',
												'[text-shadow:0_0_12px_rgb(255_96_32/85%),0_3px_10px_rgb(0_0_0/85%)]',
											)
										: cn(
												'[text-shadow:0_3px_9px_rgb(0_0_0/80%)]',
												isBattleSize ? 'text-[20px]' : 'text-base',
												style.tone,
											),
								)}
								style={
									{
										'--floater-life': `${seconds}s`,
										'--floater-delay': `${delay}s`,
										'--floater-dx': flight.dx,
										'--floater-dy': flight.dy,
									} as React.CSSProperties
								}
							>
								{style.label ? translate(style.label) : (
									<span
										className={cn('inline-block', critical && 'animate-critical-pop')}
										data-combat-damage-value={critical ? 'critical' : undefined}
									>
										{style.sign}
										{entry.value}
									</span>
								)}
							</span>
						</span>
					)
				})}
			</div>
			{isBattleSize ? (
				<>
					<div className="battle-cutie-nameplate">
						<span className="battle-cutie-character-name">{translate(name)}</span>
						{label ? <span className="battle-cutie-level">{label}</span> : null}
					</div>
					{/* Two skill slots, always empty: the skill system is not built, so nothing fires. */}
					<div className="battle-cutie-seals" data-skill-slots>
						{Array.from({ length: CUTIE_SKILL_SLOTS }, (_unused, index) => (
							<span
								key={index}
								data-skill-slot={index + 1}
								className="battle-cutie-seal battle-cutie-seal-empty"
								title={translate('Ô kỹ năng — để trống')}
							/>
						))}
					</div>
				</>
			) : null}
		</aside>
	)
}
