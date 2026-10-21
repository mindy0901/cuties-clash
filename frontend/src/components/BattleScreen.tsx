import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { motion } from 'motion/react'
import { useNavigate } from '@tanstack/react-router'
import { combatItemUid, attackCooldownMs } from '../game/build'
import { getTemplate } from '../game/items'
import { kitDef } from '../game/kits'
import { STATUS_ICON, STATUS_TEXT } from '../game/labels'
import { GRID_MAX_ROWS, GRID_WIDTH, getCutie } from '../game/cuties'
import { useGameStore } from '../store/gameStore'
import { BATTLE_SPEEDS, useBattleSettingsStore } from '../store/battleSettingsStore'
import { useUiStore } from '../store/uiStore'
import type { BattleEvent, ItemBlueprint, ItemInstance, SideState, StatusKey } from '../game/types'
import { AvatarCard, type AvatarFeedback } from './AvatarCard'
import { BookOpen, Pause, Play, RotateCcw, Shield, SkipForward, Swords } from './icons'
import { CutieIcon } from './ItemIcon'
import { LoadoutGrid } from './LoadoutGrid'
import { ItemHoverCard } from './ItemHoverCard'
import { useItemHoverCard } from './useItemHover'
import { cn, dialogClass, overlayClass, panelTitleClass } from './ui'
import { Button } from './ui/button'
import { translate } from '../i18n'
import { translateEnemyName } from './enemyName'
import { playBattleImpactSound, playBattleSlashSound } from './battleAudio'
import { frozenShift, pausedAttackTimes, weaponChargeState, type FreezeWindow, type WeaponCharge } from './battleCharge'

const DEBUFFS: StatusKey[] = ['slow', 'freeze', 'poison', 'burn', 'brittle', 'weaken', 'wound']
const DAMAGE_KINDS = new Set(['attack', 'charged', 'counter', 'dot'])
const PROJECTILE_KINDS = new Set(['attack', 'charged', 'counter'])
/** Replay tick: every 60 ms of real time advances 60 ms of simulated time at ×1 speed. */
const TICK_MS = 60
const PROJECTILE_ANIMATION_DURATION = 0.5
/** Shared by every battle mode: projectiles fly 50% faster than the base animation. */
const PROJECTILE_SPEED_BOOST = 1.5
/** Fade the comet in, then let it fly: it lands on the target at this fraction of the flight. */
const COMET_IMPACT = 0.9
/** Simulated milliseconds one comet is in flight — the same at every playback speed. */
const COMET_FLIGHT_MS = (PROJECTILE_ANIMATION_DURATION / PROJECTILE_SPEED_BOOST) * 1000
/** How early a comet leaves, so that it lands exactly on the tick of its event. */
const COMET_LEAD_MS = COMET_FLIGHT_MS * COMET_IMPACT
/** How long a floating number lives, in **simulated** ms — real time shrinks as playback speeds up. */
const FEEDBACK_LIFE_MS = 560
/** Never flash a number for less than this, however fast the replay runs. */
const FEEDBACK_MIN_LIFE_MS = 360
/** Most numbers one side may show at once; a heavy burst drops its oldest rather than flooding the frame. */
const FEEDBACK_MAX_LIVE = 5
/**
 * Real milliseconds a **jade** item's tile stays lit after one of its kits fires. Real, not simulated: it is
 * a flash of light, and 620 ms matches the `jadeTrigger` animation in `styles/battle.css`.
 */
const JADE_FLASH_MS = 620
/** Length of the tapering tail behind the head, in arena pixels. */
const COMET_TAIL = 260
/** Half-height of the comet body at its widest point. */
const COMET_BODY = 10

/**
 * Silhouette of one comet, drawn with its **sharp tip on the origin** and its tail toward −X.
 *
 * ❌ No rounded cap and no dot at the front: the head is a point, so the streak reads as a blade.
 * The body swells to `halfWidth` about a third of the way back, then fades to a point at the tail.
 */
function cometShape(length: number, halfWidth: number, scale = 1): string {
	const L = length * scale
	const W = halfWidth * scale
	const shoulder = L * 0.34
	return [
		'M 0 0',
		// Sharp nose: the first control sits almost on the axis, so the tip stays a needle.
		`C ${-L * 0.03} ${-W * 0.1} ${-shoulder * 0.55} ${-W * 0.85} ${-shoulder} ${-W}`,
		`C ${-L * 0.64} ${-W * 0.92} ${-L * 0.88} ${-W * 0.38} ${-L} 0`,
		`C ${-L * 0.88} ${W * 0.38} ${-L * 0.64} ${W * 0.92} ${-shoulder} ${W}`,
		`C ${-shoulder * 0.55} ${W * 0.85} ${-L * 0.03} ${W * 0.1} 0 0`,
		'Z',
	].join(' ')
}

/** How far the attacker throws itself toward the target, in arena pixels. */
const STRIKE_LUNGE_PX = 10

/**
 * Motion-blur ghosts of the moon, smeared along the flight: `[offsetX, stretchX, heightScale, opacity]`.
 *
 * They are drawn at **110 %** of the slash's own size (`MOON_BLUR_SCALE`) — a smear slightly **wider**
 * than the cut it trails, so it reads as a halo of speed around the blade instead of a second slash.
 */
const MOON_BLUR_SCALE = 1.1
const MOON_BLUR = [
	[-44, 1.89 * MOON_BLUR_SCALE, 0.92 * MOON_BLUR_SCALE, 0.2],
	[-20, 1.53 * MOON_BLUR_SCALE, 0.97 * MOON_BLUR_SCALE, 0.34],
] as const
/** The smear keeps stretching while it flies and is **this much longer** again when it lands. */
const MOON_BLUR_GROWTH = 1.5

/**
 * The moon's overall height, how far its belly bulges forward, and how far its inner edge does.
 *
 * 🔴 `MOON_BELLY` is what makes the **hollow**: it is how far the inner edge caves in from the line
 * through the two tips. Keep it big — with a shallow inner arc the slash turns into a filled half-disc
 * instead of a crescent. `MOON_BELLY` must stay ≥ half the height, otherwise the browser silently widens
 * the arc and the hollow flattens.
 */
const MOON_HEIGHT = 120
const MOON_DEPTH = 96
const MOON_BELLY = 74
/** How big the slash is when it leaves the weapon; it grows to full size by the time it lands. */
const MOON_START_SCALE = 0.45
/**
 * 🔴 **The blur ghost *is* the slash.** Scaling the shape about the origin (the tips stay on the flight
 * axis) stretches the belly forward and flattens it a little, turning the crescent into the wide, swept
 * half-moon the smeared copies already had — that ghost, crisp, is the hit itself.
 */
const MOON_HIT_STRETCH_X = 1.6
const MOON_HIT_STRETCH_Y = 0.94
/**
 * How far the **nose** of the slash sits ahead of its group origin, in arena pixels.
 *
 * The group is translated back by exactly this much, so the *tip of the cut* — not the tips of the
 * crescent — is what reaches the target on the landing tick. Without it the projectile overshoots: the
 * belly already sticks out past the impact point when the hit number appears.
 */
const MOON_NOSE = MOON_DEPTH * MOON_HIT_STRETCH_X

/**
 * The **moon** at the tip of a melee swing: two elliptical arcs between the same two points, so the hollow
 * is a deep bite and the band comes to a **point at both tips** — a crescent, not a filled half-disc.
 *
 * In the projectile's own frame the tips sit on the travel axis (`x = 0`), the outer arc bulges
 * `MOON_DEPTH` toward the target and the inner one `MOON_BELLY`; the gap between them is the band.
 *
 * ❌ Not two **circular** arcs with a radius below half the chord: the browser silently widens them and the
 * hollow collapses into two hairlines.
 */
function moonShape(): string {
	const half = MOON_HEIGHT / 2
	return [
		`M 0 ${-half}`,
		`A ${MOON_DEPTH} ${half} 0 0 1 0 ${half}`,
		`A ${MOON_BELLY} ${half} 0 0 0 0 ${-half}`,
		'Z',
	].join(' ')
}

/** Classes that **shoot** rather than swing: those throw the straight blade; every other class throws
 * the crescent. An `artifact` counts as a shooter — it is magic, and it attacks from a distance. */
const SHOOTER_CLASSES: ReadonlySet<string> = new Set(['ranged', 'artifact'])

/**
 * The **swing**: the attacking tile (or the Cutie's portrait) throws itself at the target, flashes, and
 * snaps back — the mirror of the shake the *defender* plays when the blow lands (`animate-shake`).
 *
 * ⚠️ Why the Web Animations API instead of a class or a `motion` component: the element belongs to
 * `LoadoutGrid` / `AvatarCard`, and a React-owned `className` would fight a class toggle, while a
 * `motion` wrapper inside the grid would remount the tile. `element.animate()` touches only the
 * browser's compositor, leaves React's tree alone, and is exactly one transient per swing.
 * ❌ Not a drawn overlay: a crescent/ring on top of the tile does not read as **movement**, which is
 * what gives the hit any weight (asked for: "phải có animation giống như lúc bị hit trúng").
 */
function playStrikeAnimation(source: HTMLElement, dx: number, dy: number, durationMs: number): void {
	if (typeof source.animate !== 'function') return
	const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
	if (reduced) return
	const ux = dx === 0 && dy === 0 ? 1 : dx / Math.hypot(dx, dy)
	const uy = dx === 0 && dy === 0 ? 0 : dy / Math.hypot(dx, dy)
	const x = ux * STRIKE_LUNGE_PX
	const y = uy * STRIKE_LUNGE_PX
	source.animate(
		[
			{ transform: 'translate3d(0, 0, 0) scale(1)', filter: 'brightness(1)' },
			{
				transform: `translate3d(${x}px, ${y}px, 0) scale(1.07)`,
				filter: 'brightness(1.5)',
				offset: 0.3,
			},
			{
				transform: `translate3d(${-x * 0.3}px, ${-y * 0.3}px, 0) scale(0.99)`,
				filter: 'brightness(1.15)',
				offset: 0.65,
			},
			{ transform: 'translate3d(0, 0, 0) scale(1)', filter: 'brightness(1)' },
		],
		{ duration: Math.max(180, durationMs), easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
	)
}

/**
 * Bar easing. ⚠️ A **short tween**, not a spring: a spring kept travelling for ~300 ms after the state
 * changed, so a floating number appeared while the health bar was still on its way. The bars now move
 * with the numbers and the armour / Sword Energy read-outs — one moment, one change.
 */
const BAR_TRANSITION = { type: 'tween', duration: 0.12, ease: 'easeOut' } as const

/** Opponent loadout (`ItemBlueprint`) → items the grid can display. */
function toGridItems(entries: ItemBlueprint[]): ItemInstance[] {
	return entries.map((entry) => ({
		uid: combatItemUid(entry.templateId, entry.slot),
		templateId: entry.templateId,
		star: entry.star,
		slot: entry.slot,
		rotated: entry.rotated ?? false,
		paid: 0,
	}))
}

/**
 * Health + Sword Energy bars for **one side**, placed at the two ends of the top bar.
 *
 * The enemy side is mirrored (`items-end` + `ml-auto`) so both bars drain towards the badge in
 * the middle — like the reference art, and it is obvious which side is losing health.
 */
function HpPanel({
	side,
	state,
}: {
	side: 'player' | 'enemy'
	state: SideState
}) {
	const enemy = side === 'enemy'
	const hpPercent = Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100))
	const sePercent = Math.max(0, Math.min(100, (state.se / state.maxSe) * 100))
	// ❌ No spring here: `useSpring(number)` only *seeds* the spring, so the badge froze at the
	// starting armour while the real shield drained. Print the number directly, like health.
	const displayedShield = Math.max(0, Math.round(state.shield))



	return (

		<div className={cn('flex w-full min-w-0 flex-col gap-1.5', enemy && 'items-end')}>

			<div className="relative h-6 w-full overflow-hidden rounded-md border border-line bg-black/60">

				<motion.div

					data-battle-hp-fill={side}
					className={cn(
						'h-full w-full',
						hpPercent < 35 ? 'bar-hp-low' : 'bar-hp',
					)}
					initial={false}
					animate={{ scaleX: hpPercent / 100 }}
					transition={BAR_TRANSITION}
					style={{ transformOrigin: enemy ? 'right center' : 'left center' }}
				/>
				<span className="absolute inset-0 grid place-items-center text-[11.5px] font-semibold tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/80%)]">
					{Math.max(0, Math.round(state.hp))} / {Math.round(state.maxHp)}
				</span>
			</div>

			<div
				className="relative h-3 w-full overflow-hidden rounded-md border border-line bg-black/60"
				title={translate('Kiếm Thế — Chấn Đao là một kít của vũ khí')}
			>
				<motion.svg
					data-battle-se-fill={side}
					className="bar-se h-full w-full"
					initial={false}
					animate={{ scaleX: sePercent / 100 }}
					transition={BAR_TRANSITION}
					style={{ transformOrigin: enemy ? 'right center' : 'left center' }}
				/>
				{/* Same read-out as the health bar, one size down: the bar is 12px tall. */}
				<span
					data-battle-se-value={side}
					className="absolute inset-0 grid place-items-center text-[10px] font-semibold leading-none tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/80%)]"
				>
					{Math.max(0, Math.round(state.se))} / {Math.round(state.maxSe)}
				</span>
			</div>

			<div className={cn('flex flex-wrap items-center gap-1.5', enemy && 'justify-end')}>
				<span
					className="flex items-center gap-1 rounded-full border border-line bg-black/35 px-2 py-0.5 text-[11.5px] tabular-nums"
					title={translate('Giáp')}
				>
					<Shield /> <span data-battle-shield-value={side}>{displayedShield}</span>
					</span>
					{state.statuses.map((status) => (
					<span
						className={cn(
							'flex items-center gap-1 rounded-full border bg-black/35 px-2 py-0.5 text-[11.5px]',
							DEBUFFS.includes(status.key)
								? 'border-danger/60 text-[#f0b6ac]'
								: 'border-jade/55 text-[#a6e3d5]',
						)}
						key={status.key}
						title={translate(STATUS_TEXT[status.key])}
					>
						{STATUS_ICON[status.key]} {translate(STATUS_TEXT[status.key])}
						{status.stacks > 1 ? ` ×${status.stacks}` : ''}
					</span>
				))}
			</div>
		</div>
	)
}

/** Badge between the two health bars: the two small avatars, both names, and the battle clock. */
function VersusBadge({
	cutieId,
	opponentEmoji,
	playerName,
	opponentName,
	title,
	time,
	outcome,
}: {
	cutieId: string
	opponentEmoji: string
	playerName: string
	opponentName: string
	title: string
	time: number
	outcome: string | null
}) {
	return (
		<div className="flex flex-col items-center gap-1">
			<div className="flex items-center gap-2">
				<span
					className="grid size-11 place-items-center rounded-[12px] border border-gold/40 bg-ink-700 p-1"
					title={playerName}
				>
					<CutieIcon cutieId={cutieId} emojiClass="text-[24px]" />
				</span>
				<span className="grid h-11 min-w-[104px] place-items-center rounded-[12px] border border-gold/50 bg-linear-to-b from-[#3a2a16] to-ink-800 px-3 font-extrabold tracking-[0.12em] text-gold-soft">
					{title}
				</span>
				<span
					className="grid size-11 place-items-center rounded-[12px] border border-line bg-ink-700 text-[24px] leading-none"
					title={opponentName}
				>
					{opponentEmoji}
				</span>
			</div>
			<span
				data-battle-clock
				className="text-base font-semibold tabular-nums text-paper/85 [text-shadow:0_1px_3px_rgb(0_0_0/70%)]"
			>
				{(time / 1000).toFixed(1)}s
				{outcome ? ` · ${outcome}` : ''}
			</span>
		</div>
	)
}

interface CombatVisual {
	key: number
	event: BattleEvent
	duration: number
	/**
	 * Class of the weapon that swung (the Cutie's own swing counts as `melee`).
	 *
	 * It decides **which** effect is drawn: a melee weapon leaves a **moon slash**, everything that shoots
	 * (ranged, and the magic `artifact`) keeps the flying comet. ❌ One effect for both: a sword firing a
	 * beam was the thing this replaced.
	 */
	cls: string
}

/** Where one comet starts and where it lands, in arena pixels. */
interface CombatTrajectory {
	startX: number
	startY: number
	endX: number
	endY: number
	/** Flight direction in degrees — the tail is rotated to trail behind the head. */
	angle: number
	viewWidth: number
	viewHeight: number
}

interface CombatFeedback extends AvatarFeedback {
	side: 'player' | 'enemy'
	/** Simulated time of the hit this number describes. */
	t: number
	/** Lifetime in seconds of real time — the arena passes it to the animation too. */
	seconds: number
	/** Real-time wait before it shows up, so a burst reads in the order the hits happened. */
	delay: number
}

/** Real seconds a number stays on screen: the same **simulated** span at every playback speed. */
function floaterSeconds(speed: number): number {
	return Math.max(FEEDBACK_MIN_LIFE_MS, Math.round(FEEDBACK_LIFE_MS / speed)) / 1000
}

/** The floating number one event deserves, or `null` when it shows nothing (statuses, misses…). */
function feedbackOf(event: BattleEvent, key: number, seconds: number): CombatFeedback | null {
	if (event.kind === 'block') {
		return { key, side: event.side, type: 'block', value: 0, t: event.t, seconds, delay: 0 }
	}
	if (event.kind === 'shield' && (event.amount ?? 0) > 0) {
		return { key, side: event.side, type: 'shield', value: event.amount ?? 0, t: event.t, seconds, delay: 0 }
	}
	if (event.kind === 'heal' && (event.amount ?? 0) > 0) {
		return { key, side: event.side, type: 'heal', value: event.amount ?? 0, t: event.t, seconds, delay: 0 }
	}
	if (!DAMAGE_KINDS.has(event.kind) || (event.amount ?? 0) <= 0) return null
	// A counter that dealt no damage is only a log line.
	if (event.kind === 'counter' && !event.text.includes('−')) return null
	// `dot` already names the side that is burning/poisoning — every other kind names the attacker.
	const side = event.kind === 'dot' ? event.side : event.side === 'player' ? 'enemy' : 'player'
	return {
		key,
		side,
		type: 'damage',
		value: event.amount ?? 0,
		...(event.critical ? { critical: true } : {}),
		t: event.t,
		seconds,
		delay: 0,
	}
}

const SLASH_TONE: Record<BattleEvent['kind'], string> = {
	attack: 'text-white',
	charged: 'text-se',
	counter: 'text-jade',
	start: '',
	dot: '',
	heal: '',
	shield: '',
	status: '',
	block: '',
	death: '',
	end: '',
}

function slashTone(event: BattleEvent): string {
	if (event.critical) return 'text-red-500'
	return SLASH_TONE[event.kind]
}

/**
 * One flying **comet**: a bright head with a short fading tail that travels in a straight line from
 * the centre of the weapon to the target. ❌ Do not shape a trail along the whole path — a stretched
 * ribbon reads as a rope. Only `x`/`y`/`opacity` animate, so the movement stays smooth even at ×3.
 */
function CombatSlash({
	visual,
	arenaRef,
}: {
	visual: CombatVisual
	arenaRef: RefObject<HTMLDivElement | null>
}) {
	const { event, key } = visual
	const { duration } = visual
	const fromPlayer = event.side === 'player'
	const [trajectory, setTrajectory] = useState<CombatTrajectory | null>(null)

	useLayoutEffect(() => {
		const arena = arenaRef.current
		if (!arena) return
		const origin = [...arena.querySelectorAll<HTMLElement>('[data-battle-side]')]
			.find((side) => side.dataset.battleSide === event.side)
			?.querySelectorAll<HTMLElement>('[data-battle-weapon-source]')
		// An extra attack kit on the same item keeps the tile as its origin: its uid is the item uid
		// plus `#<kitId>`, so match on the part before the marker.
		const weapon = origin
			? [...origin].find(
					(element) => element.dataset.battleWeaponSource === (event.sourceUid ?? '').split('#')[0],
				)
			: null
		// A Cutie's own swing has no tile: it leaves from the middle of its portrait.
		const source =
			weapon ??
			arena.querySelector<HTMLElement>(`[data-avatar-card="${event.side}"] [data-avatar-holder]`) ??
			arena.querySelector<HTMLElement>(`[data-avatar-card="${event.side}"]`)
		const target = arena.querySelector<HTMLElement>(`[data-avatar-card="${fromPlayer ? 'enemy' : 'player'}"]`)
		if (!source || !target) {
			setTrajectory({
				startX: fromPlayer ? 80 : 600,
				startY: 120,
				endX: fromPlayer ? 600 : 80,
				endY: 120,
				angle: fromPlayer ? 0 : 180,
				viewWidth: 680,
				viewHeight: 240,
			})
			return
		}

		const arenaRect = arena.getBoundingClientRect()
		const sourceRect = source.getBoundingClientRect()
		const targetRect = target.getBoundingClientRect()
		const startX = sourceRect.left + sourceRect.width / 2 - arenaRect.left
		const startY = sourceRect.top + sourceRect.height / 2 - arenaRect.top
		const endX = targetRect.left + targetRect.width / 2 - arenaRect.left
		const endY = targetRect.top + targetRect.height / 2 - arenaRect.top
		// The attacker acts: it lunges toward the target and flashes, then settles. Runs here because this
		// effect fires exactly once per swing — the moment the blade leaves the tile.
		playStrikeAnimation(source, endX - startX, endY - startY, duration * 1000 * 0.7)
		setTrajectory({
			startX,
			startY,
			endX,
			endY,
			// The tail is drawn along −X, so this turns it back down the flight direction.
			angle: (Math.atan2(endY - startY, endX - startX) * 180) / Math.PI,
			viewWidth: Math.max(arena.clientWidth, arenaRect.width, Math.ceil(endX), 1),
			viewHeight: Math.max(arena.clientHeight, arenaRect.height, Math.ceil(endY), 1),
		})
	}, [arenaRef, event.side, event.sourceUid, fromPlayer, key, duration])

	if (!trajectory) return null

	const cometId = `comet-${key}`
	const moonToneId = `moon-tone-${key}`
	/**
	 * A **shooter** throws the straight blade: a ranged weapon, and the magic `artifact` (it swings, it
	 * just does it from a distance). Everything else — a sword, a jade discharge, a Cutie's own fist —
	 * throws the crescent, so the arena never turns an axe into a gun.
	 */
	const melee = !SHOOTER_CLASSES.has(visual.cls)
	/**
	 * The crescent *is* the projectile: nothing else is placed for a melee swing.
	 */
	return (
		<motion.svg
			aria-hidden="true"
			data-combat-slash={event.kind}
			data-combat-source={event.side}
			data-combat-source-uid={event.sourceUid ?? 'cutie'}
			data-combat-effect={melee ? 'moon-slash' : 'comet'}
			data-combat-trajectory={`M ${trajectory.startX} ${trajectory.startY} L ${trajectory.endX} ${trajectory.endY}`}
			data-combat-critical={event.critical ? 'true' : 'false'}
			data-combat-animation-duration={duration}
			data-combat-impact-at={COMET_IMPACT}
			className={cn('pointer-events-none absolute inset-0 z-30 size-full overflow-visible', slashTone(event))}
			viewBox={`0 0 ${trajectory.viewWidth} ${trajectory.viewHeight}`}
			preserveAspectRatio="none"
			key={key}
		>
			<defs>
				{/* Fades from nothing at the far end of the tail to a bright body behind the head. */}
				<linearGradient id={cometId} x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stopColor="currentColor" stopOpacity="0" />
					<stop offset="45%" stopColor="currentColor" stopOpacity="0.35" />
					<stop offset="100%" stopColor="currentColor" stopOpacity="1" />
				</linearGradient>
				{/* The moon's own tint: the attack's colour along its body, white-hot at the nose — the same
				    pairing the comet has (tinted blade + white sliver), so a crit slash reads red. */}
				<linearGradient id={moonToneId} x1="0" y1="0" x2="1" y2="0">
					<stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
					<stop offset="55%" stopColor="currentColor" stopOpacity="0.95" />
					<stop offset="100%" stopColor="white" stopOpacity="1" />
				</linearGradient>
			</defs>

			{/* A short flash on the weapon: the blade leaves from exactly this point. */}
			<motion.circle
				data-combat-muzzle
				cx={trajectory.startX}
				cy={trajectory.startY}
				fill="currentColor"
				initial={{ r: 4, opacity: 0.9 }}
				animate={{ r: [4, 15], opacity: [0.9, 0] }}
				transition={{ duration: duration * 0.4, ease: 'easeOut' }}
			/>

			{/*
			 * Two projectiles, one flight: the **same** straight line from the weapon to the target,
			 * launched early so it lands on the tick of its event.
			 *
			 * A shooter throws the old comet (glow + gradient blade + hot sliver). A melee swing throws
			 * **only the moon** — no tail at all — plus the air it rips on the way, so the cut reads as fast
			 * instead of as a sticker sliding across the arena.
			 * ❌ Never a separate, static effect for melee: the attack has to fire at the target.
			 */}
			<motion.g
				data-combat-comet
				initial={{ x: trajectory.startX, y: trajectory.startY, opacity: 0 }}
				animate={{
					x: [trajectory.startX, trajectory.endX, trajectory.endX],
					y: [trajectory.startY, trajectory.endY, trajectory.endY],
					opacity: [0, 1, 1, 0],
				}}
				transition={{
					x: { duration, times: [0, COMET_IMPACT, 1], ease: [0.15, 0.35, 0.35, 1] },
					y: { duration, times: [0, COMET_IMPACT, 1], ease: [0.15, 0.35, 0.35, 1] },
					opacity: { duration, times: [0, 0.1, COMET_IMPACT, 1], ease: 'linear' },
				}}
			>
				<g transform={`rotate(${trajectory.angle})`}>
					{melee ? (
						/* It grows on the way: a small cut that swells to full size as it reaches the target, with
						   the blur travelling with it. Scaling happens inside this group, so the flight itself is
						   still the same straight line. */
						<motion.g
							data-combat-moon-scale
							initial={{ scale: MOON_START_SCALE }}
							animate={{ scale: [MOON_START_SCALE, 1, 1] }}
							transition={{ duration, times: [0, COMET_IMPACT, 1], ease: 'easeOut' }}
						>
							{/* Pulled back so the **nose** of the cut, not the crescent's tips, lands on the target. */}
							<g data-combat-moon-body transform={`translate(${-MOON_NOSE} 0)`}>
								{/* Motion blur: copies of the moon smeared back along the flight, each fainter — and the
								   smear keeps stretching until it lands, so the last stretch is the longest. They take
								   the **attack's own colour**, exactly like the comet's glow. */}
								{MOON_BLUR.map(([offsetX, stretchX, heightScale, opacity]) => (
									<motion.path
										key={offsetX}
										data-combat-moon-blur
										d={moonShape()}
										fill="currentColor"
										opacity={opacity}
										filter="blur(3px)"
										initial={{ x: offsetX, scaleX: stretchX, scaleY: heightScale }}
										animate={{
											x: [offsetX, offsetX * MOON_BLUR_GROWTH, offsetX * MOON_BLUR_GROWTH],
											scaleX: [stretchX, stretchX * MOON_BLUR_GROWTH, stretchX * MOON_BLUR_GROWTH],
										}}
										transition={{ duration, times: [0, COMET_IMPACT, 1], ease: 'easeOut' }}
									/>
								))}
								{/* The slash itself — the blur ghost's own silhouette, crisp. */}
								<g
									data-combat-moon-hit
									transform={`scale(${MOON_HIT_STRETCH_X} ${MOON_HIT_STRETCH_Y})`}
								>
									<path
										data-combat-moon-halo
										d={moonShape()}
										fill="currentColor"
										opacity={0.22}
										filter="blur(10px)"
									/>
									<path
										data-combat-moon-glow
										d={moonShape()}
										fill="currentColor"
										opacity={0.6}
										filter="blur(5px)"
									/>
									<path
										data-combat-moon-crescent
										data-moon-height={MOON_HEIGHT}
										data-moon-depth={MOON_DEPTH}
										d={moonShape()}
										fill={`url(#${moonToneId})`}
										opacity={0.96}
									/>
								</g>
							</g>
						</motion.g>
					) : (
						<>
							{/* The same sharp silhouette, blurred: a glow that follows the blade instead of a dot. */}
							<path
								data-combat-comet-glow
								d={cometShape(COMET_TAIL, COMET_BODY)}
								fill="currentColor"
								opacity={0.45}
								filter="blur(4px)"
							/>
							<path
								data-combat-comet-tail
								data-combat-tail-length={COMET_TAIL}
								d={cometShape(COMET_TAIL, COMET_BODY)}
								fill={`url(#${cometId})`}
							/>
							{/* A hot sliver inside the blade — pointed at both ends, never a circle. */}
							<path
								data-combat-comet-head
								d={cometShape(COMET_TAIL * 0.62, COMET_BODY * 0.42)}
								fill="white"
								opacity={0.9}
							/>
						</>
					)}
				</g>
			</motion.g>
		</motion.svg>
	)
}

/**
 * Class of the weapon behind one event, which decides the effect that is drawn.
 *
 * The Cutie's own kits are `skill` (and `skill#<kitId>` for extra attack kits) — there is no item
 * template to ask, so they count as **melee**: a Cutie punches and swings, it does not shoot.
 */
function sourceClassOf(event: BattleEvent, classes: Map<string, string>): string {
	const base = (event.sourceUid ?? '').split('#')[0]
	if (base === 'skill') return 'melee'
	return classes.get(base) ?? 'melee'
}

/** Replays the pre-simulated battle, then commits the result. */
export function BattleScreen() {
	const battle = useGameStore((state) => state.battle)
	const run = useGameStore((state) => state.run)
	const commitBattle = useGameStore((state) => state.commitBattle)
	const leaveBattle = useGameStore((state) => state.leaveBattle)
	const startBattle = useGameStore((state) => state.startBattle)
	const speed = useBattleSettingsStore((state) => state.speed)
	const setSpeed = useBattleSettingsStore((state) => state.setSpeed)
	const setTrainingAttacks = useBattleSettingsStore((state) => state.setTrainingAttacks)
	const openItem = useUiStore((state) => state.openItem)
	const navigate = useNavigate()

	/**
	 * Hover card over either side's gear — the same card the shop and the bag draw. Read-only: the
	 * click still opens the details dialog (an enemy item opens the preview variant).
	 */
	const { hovered, queue: queueCard, hide: hideCard } = useItemHoverCard()
	const onItemHover = (item: ItemInstance, node: HTMLElement | null) => {
		if (node) queueCard(item.templateId, item.star, node)
		else hideCard()
	}
	/** A click opens the details dialog, which covers the arena — the card has nothing left to point at. */
	const openDetails = (item: ItemInstance, owned: boolean) => {
		hideCard()
		if (owned) openItem(item.uid)
		else openItem(item.uid, item)
	}

	const events = useMemo(() => battle?.result.events ?? [], [battle])
	const lastEventTime = events.length > 0 ? events[events.length - 1].t : 0
	/**
	 * uid → item class for every weapon that can swing, so a visual knows **which** effect to draw.
	 *
	 * Melee draws a moon slash, anything that shoots (ranged, and the magic `artifact`) draws the comet.
	 * The Cutie's own kits have no item behind them (`skill`, `skill#<kitId>`) and count as melee — see
	 * `sourceClassOf`.
	 */
	const usedItems = useMemo(() => {
		const byUid = new Map<string, string>()
		for (const item of [...run.equipped, ...toGridItems(battle?.opponentItems ?? [])]) {
			if (item.slot < 0) continue
			byUid.set(combatItemUid(item.templateId, item.slot), getTemplate(item.templateId).cls)
		}
		return byUid
	}, [run.equipped, battle])
	const weaponAttackTimes = useMemo(() => {
		const bySource = new Map<string, number[]>()
		for (const event of events) {
			if (
				(event.kind !== 'attack' && event.kind !== 'charged') ||
				!event.sourceUid ||
				(event.amount ?? 0) <= 0
			) {
				continue
			}
			const key = `${event.side}:${event.sourceUid}`
			const times = bySource.get(key) ?? []
			// The bar is drawn against the moment the **comet leaves**, not the moment the hit lands:
			// otherwise the streak is already flying while the weapon still reads ~90 %.
			times.push(event.t - COMET_LEAD_MS)
			bySource.set(key, times)
		}
		return bySource
	}, [events])

	/**
	 * Every freeze window per weapon (`side:uid`), taken from the 🧊 status events.
	 *
	 * The charge bar is derived from real attack times, so a frozen weapon — which does not attack —
	 * kept a slowly filling bar across the whole freeze. These windows let the bar's clock skip the
	 * frozen spans: it pauses where it stood and resumes afterwards.
	 */
	const freezeWindows = useMemo(() => {
		const byWeapon = new Map<string, FreezeWindow[]>()
		for (const event of events) {
			if (event.kind !== 'status' || event.icon !== '🧊' || !event.sourceUid) continue
			const duration = event.amount ?? 0
			if (duration <= 0) continue
			const key = `${event.side}:${event.sourceUid.split('#')[0]}`
			const list = byWeapon.get(key) ?? []
			list.push({ start: event.t, duration })
			byWeapon.set(key, list)
		}
		return byWeapon
	}, [events])

	const [index, setIndex] = useState(0)
	const [playbackTime, setPlaybackTime] = useState(0)
	const [paused, setPaused] = useState(false)
	const [done, setDone] = useState(false)
	const [outcomeDismissed, setOutcomeDismissed] = useState(false)
	const [showLog, setShowLog] = useState(false)
	const [combatVisuals, setCombatVisuals] = useState<CombatVisual[]>([])
	const [combatFeedback, setCombatFeedback] = useState<CombatFeedback[]>([])
	const arenaRef = useRef<HTMLDivElement | null>(null)
	const idxRef = useRef(0)
	const feedbackCursorRef = useRef(0)
	const feedbackRef = useRef<CombatFeedback[]>([])
	const visualCursorRef = useRef(0)
	const elapsedRef = useRef(0)
	const pausedRef = useRef(false)
	/**
	 * Set by **Bỏ qua**: the playhead jumps to the end, so the crossed events were never *played*.
	 * Without this the visual effect spawns a comet — and a sound — for every remaining hit at once,
	 * which is exactly the loud roar "skip" used to make.
	 */
	const jumpedRef = useRef(false)
	const feedbackTimersRef = useRef(new Map<number, number>())
	/**
	 * `uid → flash key` for a **jade** item whose kit has just fired. Held in state (not a ref) because the
	 * tile has to re-render to show the flash; the value is only a counter so a second trigger restarts the
	 * animation. Timers clear it after `JADE_FLASH_MS`.
	 */
	const [jadeFlashes, setJadeFlashes] = useState<Record<string, number>>({})
	const jadeFlashKeyRef = useRef(0)
	const jadeTimersRef = useRef(new Map<string, number>())
	const impactTimersRef = useRef(new Set<number>())

	useEffect(() => {
		pausedRef.current = paused
	}, [paused])

	useEffect(() => {
		if (done || events.length === 0) return
		const timer = window.setInterval(() => {
			if (pausedRef.current) return
			elapsedRef.current += TICK_MS * speed
			setPlaybackTime(elapsedRef.current)
			let next = idxRef.current
			while (next < events.length && events[next].t <= elapsedRef.current) next += 1
			if (next !== idxRef.current) {
				idxRef.current = next
				setIndex(next)
			}
			if (elapsedRef.current >= lastEventTime) {
				window.clearInterval(timer)
				// The training room has **no time limit**: running out of the pre-computed log is not an
				// outcome, so the replay simply holds its last frame until the player quits. A session
				// that ended with a death still finishes normally.
				if (!(battle?.mode === 'training' && battle.result.timedOut)) setDone(true)
			}
		}, TICK_MS)
		return () => window.clearInterval(timer)
	}, [battle, done, events, speed, lastEventTime])

	/**
	 * Floating numbers appear the moment their event is crossed — the comet has already landed by then
	 * (see the launch effect below), so a number never runs ahead of the hit it describes.
	 *
	 * ❌ **Never add two hits together**, not even two copies of one weapon firing on the same tick: the
	 * player wants to see each blade's own number. Merging by a time window hid real damage ("sometimes a
	 * number appears, mostly none"); merging only exact ties made two 4★ weapons look like one.
	 *
	 * ⚠️ **No stagger either**: the playhead can cross several events at once (60–180 ms of the fight
	 * depends on the speed), and those numbers all start on this frame, together with the health, armour
	 * and Sword Energy read-outs they describe — each in its own spot (see `feedbackPosition`). Nudging
	 * them apart by 90 ms read as "the bar dropped, then the numbers arrived".
	 */
	useEffect(() => {
		if (index <= feedbackCursorRef.current) return
		const start = feedbackCursorRef.current
		feedbackCursorRef.current = index
		// A jump is not playback: no stale numbers for the hits that were skipped over.
		if (jumpedRef.current) {
			feedbackRef.current = []
			setCombatFeedback([])
			setJadeFlashes({})
			return
		}
		// 🔴 A **jade** item that fires lights its own tile. Read from the same crossed events as the
		// numbers, so the glow lands on the frame the effect lands on — and it covers the events that draw
		// no number at all (a freeze, a parry, a cooldown buff), which are exactly the jade triggers.
		// `triggerUid` is the gem whose kit caused it; a swing's own `sourceUid` covers a jade weapon.
		const flashed: Record<string, number> = {}
		for (const event of events.slice(start, index)) {
			const source = (event.triggerUid ?? event.sourceUid)?.split('#')[0]
			if (!source || usedItems.get(source) !== 'jade') continue
			jadeFlashKeyRef.current += 1
			flashed[source] = jadeFlashKeyRef.current
			const pending = jadeTimersRef.current.get(source)
			if (pending !== undefined) window.clearTimeout(pending)
			jadeTimersRef.current.set(
				source,
				window.setTimeout(() => {
					jadeTimersRef.current.delete(source)
					setJadeFlashes((live) => {
						if (live[source] === undefined) return live
						const next = { ...live }
						delete next[source]
						return next
					})
				}, JADE_FLASH_MS),
			)
		}
		if (Object.keys(flashed).length > 0) setJadeFlashes((current) => ({ ...current, ...flashed }))
		const seconds = floaterSeconds(speed)
		const created: CombatFeedback[] = []
		events.slice(start, index).forEach((event, offset) => {
			const entry = feedbackOf(event, start + offset, seconds)
			if (!entry) return
			// ⚠️ **No stagger**: every number of this tick starts on the same frame as the bar change it
			// describes. Delaying them by 90 ms each made a burst read as "the health dropped, then the
			// numbers arrived" — the popup and the bars must be one moment.
			entry.delay = 0
			created.push(entry)
		})
		if (created.length === 0) return
		let next = [...feedbackRef.current, ...created]
		// A stacked build hits several times a second; past `FEEDBACK_MAX_LIVE` the oldest number of
		// that side makes room, so the burst stays readable instead of covering the whole frame.
		for (const side of ['player', 'enemy'] as const) {
			const mine = next.filter((entry) => entry.side === side)
			if (mine.length <= FEEDBACK_MAX_LIVE) continue
			const dropped = new Set(mine.slice(0, mine.length - FEEDBACK_MAX_LIVE).map((entry) => entry.key))
			for (const key of dropped) {
				const timer = feedbackTimersRef.current.get(key)
				if (timer !== undefined) window.clearTimeout(timer)
				feedbackTimersRef.current.delete(key)
			}
			next = next.filter((entry) => !dropped.has(entry.key))
		}
		feedbackRef.current = next
		setCombatFeedback(next)
		for (const feedback of created) {
			feedbackTimersRef.current.set(
				feedback.key,
				window.setTimeout(
					() => {
						feedbackTimersRef.current.delete(feedback.key)
						const kept = feedbackRef.current.filter((entry) => entry.key !== feedback.key)
						feedbackRef.current = kept
						setCombatFeedback(kept)
					},
					(feedback.delay + feedback.seconds) * 1000,
				),
			)
		}
	}, [events, index, speed, usedItems])

	/**
	 * Comets are launched **one flight early**, so they reach the target on the very tick their event
	 * is crossed: the damage number, the health bar and the impact then land together. ❌ Launching on
	 * the event tick made the number appear before the animation at ×0.5.
	 */
	useEffect(() => {
		if (events.length === 0) return
		// Skipped to the end: no comets and no sounds for the tail (see `jumpedRef`).
		if (jumpedRef.current) {
			jumpedRef.current = false
			visualCursorRef.current = events.length
			return
		}
		const lead = COMET_LEAD_MS
		const newVisuals: CombatVisual[] = []
		while (visualCursorRef.current < events.length) {
			const event = events[visualCursorRef.current]
			// `playbackTime` is simulated time, and the flight covers the same simulated span at any speed.
			if (event.t - lead > playbackTime) break
			const key = visualCursorRef.current
			visualCursorRef.current += 1
			const isProjectile =
				PROJECTILE_KINDS.has(event.kind) &&
				(event.kind !== 'counter' || event.text.includes('−')) &&
				(event.amount ?? 0) > 0
			if (!isProjectile) continue
			newVisuals.push({
				event,
				key,
				duration: PROJECTILE_ANIMATION_DURATION / (speed * PROJECTILE_SPEED_BOOST),
				cls: sourceClassOf(event, usedItems),
			})
		}
		if (newVisuals.length === 0) return
		setCombatVisuals((current) => [...current, ...newVisuals])
		for (const visual of newVisuals) {
			playBattleSlashSound()
			const timer = window.setTimeout(() => {
				impactTimersRef.current.delete(timer)
				playBattleImpactSound()
			}, visual.duration * COMET_IMPACT * 1000)
			impactTimersRef.current.add(timer)
		}
	}, [events, playbackTime, speed, usedItems])

	useEffect(() => {
		if (combatVisuals.length === 0) return
		const timers = combatVisuals.map(({ key, duration }) =>
			window.setTimeout(
				() => setCombatVisuals((current) => current.filter((entry) => entry.key !== key)),
				duration * 1000 + 20,
			),
		)
		return () => timers.forEach((timer) => window.clearTimeout(timer))
	}, [combatVisuals])

	useEffect(
		() => () => {
			for (const timer of feedbackTimersRef.current.values()) window.clearTimeout(timer)
			feedbackTimersRef.current.clear()
			for (const timer of impactTimersRef.current) window.clearTimeout(timer)
			impactTimersRef.current.clear()
		},
		[],
	)

	useEffect(() => {
		if (done) commitBattle()
	}, [done, commitBattle])

	/**
	 * Back to the first frame: pending timers cleared, cursors and the outcome state rewound.
	 *
	 * Used by **Phát lại** (same battle again) and by **Đánh lại** — that one also asks the store for a
	 * new simulation, and without this reset the new battle would inherit the finished playhead.
	 */
	const resetPlayback = () => {
		for (const timer of feedbackTimersRef.current.values()) window.clearTimeout(timer)
		feedbackTimersRef.current.clear()
		for (const timer of impactTimersRef.current) window.clearTimeout(timer)
		impactTimersRef.current.clear()
		elapsedRef.current = 0
		idxRef.current = 0
		jumpedRef.current = false
		feedbackCursorRef.current = 0
		visualCursorRef.current = 0
		setPlaybackTime(0)
		setIndex(0)
		setDone(false)
		setOutcomeDismissed(false)
		setPaused(false)
		setShowLog(false)
		setCombatVisuals([])
		setCombatFeedback([])
		feedbackRef.current = []
	}

	if (!battle) return null

	const current = events[Math.min(index, Math.max(0, events.length - 1))] ?? events[0]
	const cutie = getCutie(run.cutieId)
	const level = run.cuties[run.cutieId] ?? 1

	const playerItems = run.equipped.filter((item) => item.slot >= 0)
	const enemyItems = toGridItems(battle.opponentItems)
	// ⚠️ An item has no speed of its own: the interval comes from the simulation's own cooldowns
	// (`total`), which already hold `cutie speed × kit multiplier` for both sides.
	const intervalOf = (side: 'player' | 'enemy') => {
		const totals = new Map<string, number>()
		for (const cooldown of current[side].cooldowns) totals.set(cooldown.uid, cooldown.total)
		return totals
	}
	const playerIntervals = intervalOf('player')
	const enemyIntervals = intervalOf('enemy')
	const weaponChargesFor = (items: ItemInstance[], side: 'player' | 'enemy') => {
		const charges: Record<string, WeaponCharge> = {}
		const totals = side === 'player' ? playerIntervals : enemyIntervals
		for (const item of items) {
			const template = getTemplate(item.templateId)
			const attack = template.kits?.find((kit) => kitDef(kit.id).kind === 'attack')
			if (!attack) continue
			const uid = combatItemUid(item.templateId, item.slot)
			const interval = totals.get(uid) ?? attackCooldownMs(attack, item.star)
			if (interval <= 0) continue
			// Frozen time never counts: the clock of a frozen weapon stands still (see `freezeWindows`).
			const windows = freezeWindows.get(`${side}:${uid}`) ?? []
			const times = pausedAttackTimes(weaponAttackTimes.get(`${side}:${uid}`) ?? [], windows)
			const clock = playbackTime - frozenShift(windows, playbackTime)
			charges[uid] = weaponChargeState(times, clock, interval, TICK_MS * speed * 2)
		}
		return charges
	}
	const playerWeaponCharges = weaponChargesFor(playerItems, 'player')
	const enemyWeaponCharges = weaponChargesFor(enemyItems, 'enemy')

	/**
	 * The Cutie's **own** swing charge, drawn on its portrait exactly like a weapon tile's.
	 *
	 * Its swing is not an item, so it never appeared in `weaponChargesFor`: the portrait stayed still while
	 * the Cutie was clearly attacking — the one combatant the player watches most. The first attack kit's
	 * uid is `skill` (`skill#<kitId>` for extra kits) and its cadence is in the same cooldown table, so the
	 * bar needs no second rule. `null` = this Cutie has no attack kit, so it has no bar.
	 */
	const cutieChargeFor = (side: 'player' | 'enemy'): WeaponCharge | null => {
		const uid = 'skill'
		const interval = (side === 'player' ? playerIntervals : enemyIntervals).get(uid)
		if (interval === undefined || interval <= 0) return null
		const windows = freezeWindows.get(`${side}:${uid}`) ?? []
		const times = pausedAttackTimes(weaponAttackTimes.get(`${side}:${uid}`) ?? [], windows)
		const clock = playbackTime - frozenShift(windows, playbackTime)
		return weaponChargeState(times, clock, interval, TICK_MS * speed * 2)
	}
	const playerCutieCharge = cutieChargeFor('player')
	const enemyCutieCharge = cutieChargeFor('enemy')

	/**
	 * The frost a weapon is under **right now**, taken from the freeze windows instead of from the last
	 * crossed snapshot.
	 *
	 * ⚠️ Why: a frozen weapon never swings, so it cannot refresh that snapshot itself — the ❄ badge and
	 * the frost sheet used to outlive the ice by up to a second (until some *other* event refreshed the
	 * snapshot) while the charge bar had already resumed. Reading the windows makes the ice and the bar
	 * one clock.
	 */
	const liveFreezeMs = (side: 'player' | 'enemy', uid: string): number => {
		const windows = freezeWindows.get(`${side}:${uid}`) ?? []
		let remaining = 0
		for (const window of windows) {
			if (window.start > playbackTime) break
			remaining = Math.max(remaining, window.start + window.duration - playbackTime)
		}
		return Math.max(0, Math.round(remaining))
	}

	/**
	 * Per-weapon freeze / slow / cdr badges. Slow and cdr still come from the **last crossed event**
	 * so they follow the replay exactly like the health bars do; freeze is live (see `liveFreezeMs`).
	 */
	const battleWeaponStatuses = (() => {
		const empty: Record<string, { frozen?: number; slow?: number; boost?: number }> = {}
		const result = { player: empty, enemy: { ...empty } }
		if (index === 0) return result
		const last = events[index - 1]
		for (const side of ['player', 'enemy'] as const) {
			const state = side === 'player' ? last.player : last.enemy
			const uids = new Set(state.cooldowns.map((cooldown) => cooldown.uid.split('#')[0]))
			// A freeze is visible even when no event has carried it into a snapshot yet.
			for (const key of freezeWindows.keys()) {
				const separator = key.indexOf(':')
				if (key.slice(0, separator) === side) uids.add(key.slice(separator + 1))
			}
			for (const uid of uids) {
				const cooldown = state.cooldowns.find((entry) => entry.uid.split('#')[0] === uid)
				const frozen = liveFreezeMs(side, uid)
				const status = {
					...(frozen > 0 ? { frozen } : {}),
					...(cooldown?.slow ? { slow: cooldown.slow } : {}),
					...(cooldown?.cdr ? { boost: cooldown.cdr } : {}),
				}
				if (Object.keys(status).length === 0) continue
				result[side][uid] = status
			}
		}
		return result
	})()

	const toAvatarFeedback = (side: 'player' | 'enemy'): AvatarFeedback[] =>
		combatFeedback
			.filter((entry) => entry.side === side)
			.map(({ key, type, value, seconds, delay, critical }) => ({
				key,
				type,
				value,
				seconds,
				delay,
				critical,
			}))
	const playerFeedback = toAvatarFeedback('player')
	const enemyFeedback = toAvatarFeedback('enemy')
	const winner = battle.result.winner
	const won = winner === 'player'
	const training = battle.mode === 'training'
	const finished = Boolean(winner) && index >= events.length - 1
	const outcome = finished
		? // A practice session has no time limit, so running out of the log is not an outcome at all.
			training && battle.result.timedOut
			? null
			: winner === 'player'
				? 'Chiến thắng!'
				: winner === 'enemy'
					? 'Thất bại'
					: 'Hoà'
		: null
	const opponentEmoji = training ? '🎯' : battle.mode === 'pvp' ? '🀄' : '👹'
	/**
	 * A practice session pre-computes up to 20 minutes of log (thousands of events); rendering every
	 * row of that would lock the dialog up, so only the newest slice is listed.
	 */
	const LOG_ROWS = 250
	const logStart = Math.max(0, events.length - LOG_ROWS)
	const logEvents = events.slice(logStart)
	const opponentLabel = training
		? translate('Bất tử')
		: battle.mode === 'pvp'
			? translate('Giao hữu')
			: translate('Màn {stage}', { stage: battle.stageIndex })

	return (
		<div data-battle-screen className="flex min-h-0 flex-1 flex-col gap-3.5">
			<section className="flex min-h-0 flex-1 flex-col gap-3.5">
				<div className="flex flex-wrap items-start justify-between gap-2.5">
					<h2 className={panelTitleClass}>
						{training
							? translate('Phòng tập')
							: battle.mode === 'stage'
								? translate('Màn {stage}', { stage: battle.stageIndex })
								: translate('Giao hữu PvP')}{' '}
						· vs {battle.mode === 'stage' ? translateEnemyName(battle.opponentName) : translate(battle.opponentName)}
					</h2>
					<div className="flex flex-wrap gap-2">
						{BATTLE_SPEEDS.map((value) => (
							<Button
								type="button"
								key={value}
								size="sm"
								variant={value === speed ? 'primary' : 'secondary'}
								aria-pressed={value === speed}
								onClick={() => setSpeed(value)}
							>
								×{value.toFixed(1).replace(/\.0$/, '')}
							</Button>
						))}
						{/* Pause and Skip are about a fight that has an end. A practice session has none —
						    the player leaves with its own button instead. */}
						{training ? null : (
							<>
								<Button
									type="button"
									size="sm"
									onClick={() => setPaused((v) => !v)}
								>
									{paused ? (
										<>
											<Play /> {translate('Tiếp tục')}
										</>
									) : (
										<>
											<Pause /> {translate('Tạm dừng')}
										</>
									)}
								</Button>
								<Button
									type="button"
									variant="destructive" size="sm"
									disabled={done}
									onClick={() => {
										jumpedRef.current = true
										elapsedRef.current = lastEventTime
										setPlaybackTime(lastEventTime)
										idxRef.current = events.length
										setIndex(events.length)
										setDone(true)
									}}
								>
									<SkipForward /> {translate('Bỏ qua')}
								</Button>
							</>
						)}
					</div>
				</div>

				{/* ── Top bar: both sides' health + the versus badge ── */}
				<div className="grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
					<HpPanel side="player" state={current.player} />
					<VersusBadge
						cutieId={cutie.id}
						opponentEmoji={opponentEmoji}
						playerName={translate(cutie.name)}
						opponentName={battle.opponentName}
						title={translate(
							training ? 'PHÒNG TẬP' : battle.mode === 'stage' ? 'ĐẤU TRƯỜNG' : 'GIAO HỮU',
						)}
						// The **clock**, not the last event's time: an event timeline jumps in irregular
						// steps (0.3 s, then 0.9 s…), which read as a stuttering timer.
						time={playbackTime}
						outcome={outcome ? translate(outcome) : outcome}
					/>
					<HpPanel side="enemy" state={current.enemy} />
				</div>

				{/* ── Arena: both avatars + the loadout grids (reusing `LoadoutGrid`) ── */}
				<div
					ref={arenaRef}
					data-battle-arena
					className="relative grid min-h-0 flex-1 content-center grid-cols-1 items-center gap-3 overflow-auto py-5 xl:grid-cols-[repeat(2,minmax(max-content,1fr))] xl:gap-0 xl:py-0"
				>
					<div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
						{combatVisuals.map((visual) => (
							<CombatSlash visual={visual} arenaRef={arenaRef} key={visual.key} />
						))}
					</div>
					<div
						data-battle-team="player"
						className="flex w-full min-w-0 flex-wrap items-stretch justify-center gap-3 xl:w-max xl:flex-nowrap xl:gap-2"
					>
						<AvatarCard
							side="player"
							name={translate(cutie.name)}
							label={`Lv${level}`}
							cutieId={cutie.id}
							feedback={playerFeedback}
							size="battle"
							charge={playerCutieCharge}
						/>
						<div
							data-battle-side="player"
							className="flex w-fit max-w-full min-w-0 flex-col items-center"
						>
							<LoadoutGrid
								width={GRID_WIDTH}
								rows={GRID_MAX_ROWS}
								cellSize={90}
								items={playerItems}
								weaponCharges={playerWeaponCharges}
								weaponStatuses={battleWeaponStatuses.player}
								jadeTriggers={jadeFlashes}
								interactive
								onItemClick={(item) => openDetails(item, true)}
								onItemHover={onItemHover}
							/>
						</div>
					</div>

					<div
						data-battle-team="enemy"
						className="flex w-full min-w-0 flex-wrap items-stretch justify-center gap-3 xl:w-max xl:flex-nowrap xl:justify-self-end xl:gap-2"
					>
						<div
							data-battle-side="enemy"
							className="flex w-fit max-w-full min-w-0 flex-col items-center"
						>
							<LoadoutGrid
								width={GRID_WIDTH}
								rows={GRID_MAX_ROWS}
								cellSize={90}
								items={enemyItems}
								weaponCharges={enemyWeaponCharges}
								weaponStatuses={battleWeaponStatuses.enemy}
								jadeTriggers={jadeFlashes}
								interactive
								onItemClick={(item) => openDetails(item, false)}
								onItemHover={onItemHover}
							/>
						</div>
						<AvatarCard
							side="enemy"
							name={battle.mode === 'stage' ? translateEnemyName(battle.opponentName) : battle.opponentName}
							label={opponentLabel}
							emoji={opponentEmoji}
							feedback={enemyFeedback}
							size="battle"
							charge={enemyCutieCharge}
						/>
					</div>
				</div>

			</section>
			{/* Practice has no end, so it needs its own way out, always in reach at the bottom. */}
			{training && !done ? (
				<div
					data-battle-training-bar
					className="flex flex-wrap items-center justify-center gap-2 py-1"
				>
					<Button
						type="button"
						data-battle-quit-training
						variant="destructive" className={cn('min-w-36 justify-center')}
						onClick={() => {
							void navigate({ to: '/' })
							leaveBattle()
						}}
					>
						{translate('Rời phòng tập')}
					</Button>
					{/*
					 * The dummy's swing is decided when the fight is **simulated**, so flipping it here asks
					 * the store for a fresh practice session instead of editing the running one — the same
					 * thing "Tập lại" does. That keeps `simulateBattle` a pure function of its inputs.
					 */}
					<label
						data-battle-training-attacks
						className="flex items-center gap-2 rounded-md border border-line bg-ink-700/60 px-3 py-1.5 text-sm"
						title={translate('Kẻ địch chỉ có 1 vũ khí: bật để nó đánh trả, tắt để nó đứng yên')}
					>
						<input
							type="checkbox"
							aria-label={translate('Kẻ địch phản đòn')}
							className="size-3.5 accent-gold"
							checked={battle.trainingAttacks === true}
							onChange={(event) => {
								const attacks = event.target.checked
								setTrainingAttacks(attacks)
								resetPlayback()
								startBattle('training', { attacks })
							}}
						/>
						{translate('Kẻ địch phản đòn')}
					</label>
					<Button type="button" size="sm" onClick={() => setShowLog(true)}>
						<BookOpen /> {translate('Nhật ký trận đấu')}
					</Button>
				</div>
			) : null}
			{done && outcomeDismissed ? (
				<div className="relative flex flex-wrap items-center justify-center gap-2 py-1">
					<Button
						type="button"
						data-battle-again
						variant="primary" className={cn('min-w-36 justify-center')}
						title={translate('Vào trận ngay, không cần về phòng chuẩn bị')}
						onClick={() => {
							resetPlayback()
							// The training toggle is repeated exactly as this session was started.
							startBattle(battle.mode, { attacks: battle.trainingAttacks === true })
						}}
					>
						{/* A win already moved `run.stage` on, so the same button fights the next one. */}
						<Swords />{' '}
						{translate(
							training ? 'Tập lại' : won && battle.mode === 'stage' ? 'Đánh màn tiếp' : 'Đánh lại',
						)}
					</Button>
					<Button
						type="button"
						variant="destructive" className={cn('min-w-36 justify-center')}
						onClick={() => {
							void navigate({ to: '/' })
							leaveBattle()
						}}
					>
						{translate('Rời trận')}
					</Button>
					<div className="flex gap-2 sm:absolute sm:right-0">
						<Button type="button" size="sm" onClick={() => setShowLog(true)}>
							<BookOpen /> {translate('Nhật ký trận đấu')}
						</Button>
						<Button
							type="button"
							size="sm"
							onClick={() => resetPlayback()}
						>
							<RotateCcw /> {translate('Phát lại')}
						</Button>
					</div>
				</div>
			) : null}
			{done && !outcomeDismissed && outcome ? (
				<button
					type="button"
					data-battle-outcome
					aria-label={`${translate(outcome)} — ${translate('Nhấn để tiếp tục')}`}
					className="fixed inset-0 z-40 grid place-items-center bg-[rgb(7_6_8/78%)] px-5 backdrop-blur-sm"
					onClick={() => setOutcomeDismissed(true)}
				>
					<span
						className={cn(
							'flex min-h-44 w-full max-w-xl flex-col items-center justify-center gap-3 rounded-2xl border-2 bg-linear-to-b from-ink-600/95 to-ink-900/95 px-8 py-10 text-center shadow-[0_0_70px_rgb(217_162_39/24%)]',
							winner === 'player'
								? 'border-gold-soft text-gold-soft'
								: winner === 'enemy'
									? 'border-danger-soft text-danger-soft'
									: 'border-line text-paper',
						)}
					>
						<span className="text-5xl font-black uppercase tracking-[0.12em] drop-shadow-[0_0_18px_currentColor]">
							{translate(outcome)}
						</span>
						<span className="text-sm font-medium text-paper/80">{translate('Nhấn để tiếp tục')}</span>
					</span>
				</button>
			) : null}
			{showLog && (done || training) ? (
				<div
					className={overlayClass}
					onClick={(event) => {
						if (event.target === event.currentTarget) setShowLog(false)
					}}
				>
					<section
						className={cn(dialogClass, 'max-h-[85vh]')}
						role="dialog"
						aria-modal="true"
						aria-label={translate('Nhật ký trận đấu')}
					>
						<div className="flex items-center justify-between gap-3">
							<h2 className={panelTitleClass}>{translate('Nhật ký trận đấu')}</h2>
							<Button type="button" size="sm" onClick={() => setShowLog(false)}>
								{translate('Đóng')}
							</Button>
						</div>
						<div className="flex max-h-[68vh] flex-col gap-1 overflow-y-auto pr-1 text-[13px]">
							{logStart > 0 ? (
								<div data-battle-log-truncated className="px-2 py-1 text-[12px] text-muted">
									{translate('Chỉ hiện {count} sự kiện gần nhất', { count: LOG_ROWS })}
								</div>
							) : null}
							{logEvents.map((event, offset) => {
								const eventIndex = logStart + offset
								return (
									<div
										className={cn(
											'flex gap-2 rounded-lg border-l-[3px] bg-black/20 px-2 py-1',
											event.side === 'player' && 'border-l-steel',
											event.side === 'enemy' && 'border-l-danger-soft',
											event.side !== 'player' && event.side !== 'enemy' && 'border-l-line',
											event.kind === 'end' && 'border-l-gold bg-gold/10 font-semibold',
										)}
										key={`${event.t}-${eventIndex}`}
									>
										<span className="min-w-11 text-muted tabular-nums">{(event.t / 1000).toFixed(1)}s</span>
										<span>
											{event.icon} {translate(event.text)}
										</span>
									</div>
								)
							})}
						</div>
					</section>
				</div>
			) : null}
			{/* The hover card of the gear under the pointer — either side, exactly like the shop's. */}
			{hovered ? (
				<ItemHoverCard
					templateId={hovered.templateId}
					star={hovered.star}
					left={hovered.left}
					top={hovered.top}
					maxHeight={hovered.maxHeight}
				/>
			) : null}
		</div>
	)
}
