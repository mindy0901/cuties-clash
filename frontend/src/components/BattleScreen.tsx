import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { COUNTER_COST } from '../game/battle'
import { combatItemUid } from '../game/build'
import { getTemplate } from '../game/items'
import { STATUS_ICON, STATUS_TEXT } from '../game/labels'
import { GRID_MAX_ROWS, GRID_WIDTH, getPet } from '../game/pets'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import type { ItemBlueprint, ItemInstance, SideState, StatusKey } from '../game/types'
import { AvatarCard, type AvatarSkill } from './AvatarCard'
import { ItemIcon, PetIcon, SkillIcon } from './ItemIcon'
import { LoadoutGrid } from './LoadoutGrid'
import {
	btnClass,
	btnGoldClass,
	btnPrimaryClass,
	btnSmClass,
	cn,
	hintClass,
	panelClass,
	panelTitleClass,
} from './ui'

const DEBUFFS: StatusKey[] = ['slow', 'freeze', 'poison', 'burn', 'brittle']
const DAMAGE_KINDS = new Set(['attack', 'charged', 'counter', 'active'])
const SPEEDS = [1, 2, 4, 8]
/** Replay tick: every 60 ms of real time advances 60 ms of simulated time at ×1 speed. */
const TICK_MS = 60

/** A skill shown at the bottom of the avatar frame — with `uid` to look up charge in `SideState.cooldowns`. */
interface SkillChip {
	uid: string
	icon: ReactNode
	label: string
}

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
 * Skill slot for an **item**: only items with an **active effect** show up, since only they have
 * a cycle of their own.
 *
 * `uid` must match how `buildCombatant` sets an item's uid (`combatItemUid`) for the cooldown
 * progress from `SideState.cooldowns` to be found.
 */
function activeItemChips(items: ItemInstance[]): SkillChip[] {
	return items
		.filter((item) => getTemplate(item.templateId).active)
		.map((item) => ({
			uid: combatItemUid(item.templateId, item.slot),
			icon: <ItemIcon templateId={item.templateId} emojiClass="text-base" />,
			label: `${getTemplate(item.templateId).name} — hiệu lực chủ động`,
		}))
}

/** Attaches each skill slot's cooldown progress (0–100) from that side's current state. */
function withCharge(state: SideState, chips: SkillChip[]): AvatarSkill[] {
	return chips.map((chip) => {
		const cooldown = state.cooldowns.find((entry) => entry.uid === chip.uid)
		const charge =
			cooldown && cooldown.total > 0 ? 100 - (cooldown.remaining / cooldown.total) * 100 : 100
		return { ...chip, charge }
	})
}

/**
 * Health + Sword Energy bars for **one side**, placed at the two ends of the top bar.
 *
 * The enemy side is mirrored (`items-end` + `ml-auto`) so both bars drain towards the badge in
 * the middle — like the reference art, and it is obvious which side is losing health.
 */
function HpPanel({ side, state }: { side: 'player' | 'enemy'; state: SideState }) {
	const enemy = side === 'enemy'
	const hpPercent = Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100))
	const sePercent = Math.max(0, Math.min(100, (state.se / state.maxSe) * 100))

	return (
		<div className={cn('flex w-full min-w-0 flex-col gap-1.5', enemy && 'items-end')}>
			<div className="relative h-4 w-full overflow-hidden rounded-md border border-line bg-black/60">
				<div
					className={cn(
						'h-full transition-[width] duration-300',
						enemy && 'ml-auto',
						hpPercent < 35 ? 'bar-hp-low' : 'bar-hp',
					)}
					style={{ width: `${hpPercent}%` }}
				/>
				<span className="absolute inset-0 grid place-items-center text-[11.5px] font-semibold tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/80%)]">
					{Math.max(0, Math.round(state.hp))} / {Math.round(state.maxHp)}
				</span>
			</div>

			<div
				className="relative h-2 w-full overflow-hidden rounded-md border border-line bg-black/60"
				title={`Kiếm Thế — Chấn Đao cần ${COUNTER_COST}`}
			>
				<div
					className={cn('bar-se h-full transition-[width] duration-300', enemy && 'ml-auto')}
					style={{ width: `${sePercent}%` }}
				/>
			</div>

			<div className={cn('flex flex-wrap items-center gap-1.5', enemy && 'justify-end')}>
				<span
					className="flex items-center gap-1 rounded-full border border-line bg-black/35 px-2 py-0.5 text-[11.5px] tabular-nums"
					title="Giáp"
				>
					🛡 {Math.round(state.shield)}
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
						title={STATUS_TEXT[status.key]}
					>
						{STATUS_ICON[status.key]} {STATUS_TEXT[status.key]}
						{status.stacks > 1 ? ` ×${status.stacks}` : ''}
					</span>
				))}
			</div>
		</div>
	)
}

/** Badge between the two health bars: the two small avatars, both names, and the battle clock. */
function VersusBadge({
	petId,
	opponentEmoji,
	playerName,
	opponentName,
	title,
	time,
	outcome,
}: {
	petId: string
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
					<PetIcon petId={petId} emojiClass="text-[24px]" />
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
			<div className="flex w-full items-start justify-between gap-3 text-[11.5px] text-muted">
				<span className="max-w-[128px] truncate">{playerName}</span>
				<span className="max-w-[128px] truncate text-right">{opponentName}</span>
			</div>
			<span className="text-[11px] tabular-nums text-muted">
				{(time / 1000).toFixed(1)}s
				{outcome ? ` · ${outcome}` : ''}
			</span>
		</div>
	)
}

/**
 * Divider between the two loadout grids — purely decorative, standing in for the stone pillar in
 * the reference art.
 */
function ArenaDivider() {
	return (
		<div className="relative flex w-9 shrink-0 flex-col items-center justify-center rounded-lg border border-line bg-linear-to-b from-[#22302c] via-[#16211f] to-[#22302c]">
			<span className="absolute inset-y-2 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-jade/25" />
			<span className="relative grid size-7 place-items-center rounded-full border border-gold/50 bg-ink-800 text-[12px] text-gold-soft">
				⚔
			</span>
		</div>
	)
}

/** Replays the pre-simulated battle, then commits the result. */
export function BattleScreen() {
	const battle = useGameStore((state) => state.battle)
	const run = useGameStore((state) => state.run)
	const commitBattle = useGameStore((state) => state.commitBattle)
	const openItem = useUiStore((state) => state.openItem)

	const events = useMemo(() => battle?.result.events ?? [], [battle])
	const lastEventTime = events.length > 0 ? events[events.length - 1].t : 0

	const [index, setIndex] = useState(0)
	const [speed, setSpeed] = useState(2)
	const [paused, setPaused] = useState(false)
	const [done, setDone] = useState(false)
	const idxRef = useRef(0)
	const elapsedRef = useRef(0)
	const pausedRef = useRef(false)
	const logRef = useRef<HTMLDivElement | null>(null)

	useEffect(() => {
		pausedRef.current = paused
	}, [paused])

	useEffect(() => {
		if (done || events.length === 0) return
		const timer = window.setInterval(() => {
			if (pausedRef.current) return
			elapsedRef.current += TICK_MS * speed
			let next = idxRef.current
			while (next < events.length && events[next].t <= elapsedRef.current) next += 1
			if (next !== idxRef.current) {
				idxRef.current = next
				setIndex(next)
			}
			if (elapsedRef.current >= lastEventTime) {
				window.clearInterval(timer)
				setDone(true)
			}
		}, TICK_MS)
		return () => window.clearInterval(timer)
	}, [done, events, speed, lastEventTime])

	useEffect(() => {
		if (done) commitBattle()
	}, [done, commitBattle])

	useEffect(() => {
		if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
	}, [index])

	if (!battle) return null

	const current = events[Math.min(index, Math.max(0, events.length - 1))] ?? events[0]
	const previous = events[Math.max(0, Math.min(index, events.length - 1) - 1)] ?? current
	const pet = getPet(run.petId)
	const level = run.pets[run.petId] ?? 1

	const playerItems = run.equipped.filter((item) => item.slot >= 0)
	const enemyItems = toGridItems(battle.opponentItems)
	const playerSkills = withCharge(current.player, [
		{
			uid: 'skill',
			icon: <SkillIcon petId={pet.id} emojiClass="text-base" />,
			label: `${pet.skill.name} — mỗi ${(pet.skill.interval / 1000).toFixed(1)}s`,
		},
		...activeItemChips(playerItems),
	])
	const enemySkills = withCharge(current.enemy, activeItemChips(enemyItems))

	const damageEvent = DAMAGE_KINDS.has(current.kind) && current.amount ? current : null
	const floaterSide = damageEvent ? (damageEvent.side === 'player' ? 'enemy' : 'player') : null
	const playerFloater =
		damageEvent && floaterSide === 'player' ? { key: index, value: damageEvent.amount ?? 0 } : null
	const enemyFloater =
		damageEvent && floaterSide === 'enemy' ? { key: index, value: damageEvent.amount ?? 0 } : null

	const visibleLog = events.slice(Math.max(0, index - 59), index + 1).reverse()
	const winner = battle.result.winner
	const finished = Boolean(winner) && index >= events.length - 1
	const outcome = finished
		? winner === 'player'
			? 'THẮNG'
			: winner === 'enemy'
			  ? 'THUA'
			  : 'HOÀ'
		: null
	const opponentEmoji = battle.mode === 'pvp' ? '🀄' : '👹'
	const opponentLabel = battle.mode === 'pvp' ? 'Giao hữu' : `Màn ${battle.stageIndex}`

	return (
		<div className="flex flex-col gap-3.5">
			<section className={cn(panelClass, 'gap-3.5')}>
				<div className="flex flex-wrap items-start justify-between gap-2.5">
					<div>
						<h2 className={panelTitleClass}>
							{battle.mode === 'stage' ? `Màn ${battle.stageIndex}` : 'Giao hữu PvP'} · vs{' '}
							{battle.opponentName}
						</h2>
						<p className={hintClass}>
							Trận đấu tự động — bạn chỉ cần chuẩn bị túi đồ. Chấn Đao tốn {COUNTER_COST} Kiếm
							Thế, trọng kích tốn 24–40.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{SPEEDS.map((value) => (
							<button
								type="button"
								key={value}
								className={cn(btnClass, btnSmClass, value === speed && btnGoldClass)}
								onClick={() => setSpeed(value)}
							>
								×{value}
							</button>
						))}
						<button
							type="button"
							className={cn(btnClass, btnSmClass)}
							onClick={() => setPaused((v) => !v)}
						>
							{paused ? '▶ Tiếp tục' : '⏸ Tạm dừng'}
						</button>
						<button
							type="button"
							className={cn(btnClass, btnSmClass, btnPrimaryClass)}
							onClick={() => {
								elapsedRef.current = lastEventTime
								idxRef.current = events.length
								setIndex(events.length)
								setDone(true)
							}}
						>
							⏭ Bỏ qua
						</button>
					</div>
				</div>

				{/* ── Top bar: both sides' health + the versus badge ──────────────── */}
				<div className="grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
					<HpPanel side="player" state={current.player} />
					<VersusBadge
						petId={pet.id}
						opponentEmoji={opponentEmoji}
						playerName={pet.name}
						opponentName={battle.opponentName}
						title={battle.mode === 'stage' ? 'ĐẤU TRƯỜNG' : 'GIAO HỮU'}
						time={current.t}
						outcome={outcome}
					/>
					<HpPanel side="enemy" state={current.enemy} />
				</div>

				{/* ── Arena: both avatars + the loadout grids (reusing `LoadoutGrid`) ── */}
				<div className="flex flex-wrap items-stretch justify-center gap-3">
					<AvatarCard
						side="player"
						name={pet.name}
						label={`Lv${level}`}
						petId={pet.id}
						skills={playerSkills}
						hit={Boolean(playerFloater)}
						floater={playerFloater}
					/>

					<div className="flex items-stretch gap-3 overflow-x-auto rounded-panel border border-line bg-black/30 p-3">
						<div className="flex flex-col items-center gap-1.5">
							<span className="text-[11.5px] text-muted">
								{pet.name} · {playerItems.length} món
							</span>
							<LoadoutGrid
								width={GRID_WIDTH}
								rows={GRID_MAX_ROWS}
								items={playerItems}
								interactive
								onItemClick={(item) => openItem(item.uid)}
							/>
						</div>

						<ArenaDivider />

						<div className="flex flex-col items-center gap-1.5">
							<span className="text-[11.5px] text-muted">
								{battle.opponentName} · {enemyItems.length} món
							</span>
							<LoadoutGrid width={GRID_WIDTH} rows={GRID_MAX_ROWS} items={enemyItems} />
						</div>
					</div>

					<AvatarCard
						side="enemy"
						name={battle.opponentName}
						label={opponentLabel}
						emoji={opponentEmoji}
						skills={enemySkills}
						hit={Boolean(enemyFloater)}
						floater={enemyFloater}
					/>
				</div>

				{previous.kind !== current.kind || previous.text !== current.text ? (
					<p className="m-0 font-semibold text-gold-soft">
						{current.icon} {current.text}
					</p>
				) : null}

				<div className="flex max-h-60 flex-col gap-1 overflow-y-auto pr-1 text-[13px]" ref={logRef}>
					{visibleLog.map((event, logIndex) => (
						<div
							className={cn(
								'flex gap-2 rounded-lg border-l-[3px] bg-black/20 px-2 py-1',
								event.side === 'player' && 'border-l-steel',
								event.side === 'enemy' && 'border-l-danger-soft',
								event.side !== 'player' && event.side !== 'enemy' && 'border-l-line',
								event.kind === 'end' && 'border-l-gold bg-gold/10 font-semibold',
							)}
							key={`${event.t}-${index - logIndex}`}
						>
							<span className="min-w-11 text-muted tabular-nums">{(event.t / 1000).toFixed(1)}s</span>
							<span>
								{event.icon} {event.text}
							</span>
						</div>
					))}
				</div>
			</section>
		</div>
	)
}
