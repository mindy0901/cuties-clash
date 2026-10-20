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
	/** How long the number floats, in seconds of real time. Defaults to `0.9`. */
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
 * Where a floating number sits: a **pure function of its key and side**, so a number ❌ never moves.
 *
 * Two rules:
 * - the band is the **upper half of the portrait** (around head and chest, where the hit visually lands);
 * - the columns are pushed to the **back half** of the card — away from the opponent. A number that pops
 *   on the incoming side reads as "in front of" the fighter, which is exactly what the player rejected.
 */
function feedbackPosition(key: number, side: 'player' | 'enemy'): { left: string; top: string } {
	// The enemy sits right of the player, so "back" is the right half for one card and the left half for the
	// other. Nothing lands within ±10 % of the centre, so no number sits directly over the fighter's face.
	const columns = side === 'player' ? [16, 30, 44] : [56, 70, 84]
	// Every row is above the portrait's centre (50 %), even before the float lifts it.
	const rows = [16, 22, 28, 34, 40, 46]
	const slot = (key * 7) % (columns.length * rows.length)
	return {
		left: `${columns[slot % columns.length]}%`,
		top: `${rows[Math.floor(slot / columns.length)]}%`,
	}
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
	// The number is knocked **backwards behind the fighter who took the hit**: the blow arrives from the
	// opposite card, so a hit on the player card (attacker on the right) drifts left and the enemy card
	// drifts right.
	const drift = side === 'player' ? '-18px' : '18px'
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
							'flex w-[176px] shrink-0 flex-col gap-2 rounded-panel border-2 bg-linear-to-b p-2',
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
				{feedback.map((entry) => {
					const seconds = entry.seconds ?? 0.9
					const delay = entry.delay ?? 0
					const spot = feedbackPosition(entry.key, side)
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
							style={spot}
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
									'block animate-combat-floater font-extrabold',
									isBattleSize ? 'text-[27px]' : 'text-lg',
									critical
										? // Critical: one step bigger, blazing yellow → red, with the word under it.
											cn(
												'text-[34px] leading-none text-[#ffd45c]',
												'[text-shadow:0_0_12px_rgb(255_96_32/85%),0_3px_10px_rgb(0_0_0/85%)]',
											)
										: cn(
												'[text-shadow:0_3px_9px_rgb(0_0_0/80%)]',
												isBattleSize ? 'text-[27px]' : 'text-lg',
												style.tone,
											),
								)}
								style={
									{
										'--floater-life': `${seconds}s`,
										'--floater-delay': `${delay}s`,
										'--floater-drift': drift,
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
