import { useEffect, useMemo, useRef, useState } from 'react'
import { COUNTER_COST } from '../game/battle'
import { combatItemUid } from '../game/build'
import { getTemplate, starLabel } from '../game/items'
import { STATUS_ICON, STATUS_TEXT } from '../game/labels'
import { getPet } from '../game/pets'
import { useGameStore } from '../store/gameStore'
import type { SideState, StatusKey } from '../game/types'
import { ItemIcon, PetIcon, SkillIcon } from './ItemIcon'
import { btnClass, btnGoldClass, btnPrimaryClass, btnSmClass, cn, gearRowClass, panelClass } from './ui'

const DEBUFFS: StatusKey[] = ['slow', 'freeze', 'poison', 'burn', 'brittle']
const DAMAGE_KINDS = new Set(['attack', 'charged', 'counter', 'active'])
const SPEEDS = [1, 2, 4, 8]
/** Nhịp diễn lại: mỗi 60 ms thực thi một nhịp thời gian mô phỏng ở tốc độ ×1. */
const TICK_MS = 60

/** Ảnh đại diện: thú cưng có art riêng, đối thủ PvP thì dùng emoji. */
type Avatar = { kind: 'pet'; petId: string } | { kind: 'emoji'; emoji: string }

interface GearPiece {
	uid: string
	/** Có `templateId` = một món đồ; không có = kỹ năng của thú cưng. */
	templateId?: string
	star?: 1 | 2 | 3 | 4
	/** Dùng cho ô kỹ năng. */
	petId?: string
	name: string
	label: string
}

function gearFromBlueprints(items: { templateId: string; star: number; slot: number }[]): GearPiece[] {
	return items.map((entry) => ({
		uid: combatItemUid(entry.templateId, entry.slot),
		templateId: entry.templateId,
		star: entry.star as 1 | 2 | 3 | 4,
		name: getTemplate(entry.templateId).name,
		label: starLabel(entry.star as 1 | 2 | 3 | 4),
	}))
}

function DuelistView({
	name,
	avatar,
	subtitle,
	state,
	gear,
	floater,
	hit,
}: {
	name: string
	avatar: Avatar
	subtitle: string
	state: SideState
	gear: GearPiece[]
	floater?: { key: number; value: number } | null
	hit: boolean
}) {
	const hpPercent = Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100))
	const sePercent = Math.max(0, Math.min(100, (state.se / state.maxSe) * 100))

	return (
		<div className="surface-panel relative flex flex-col gap-2.5 rounded-panel border border-line p-3">
			{floater ? (
				<span
					className="pointer-events-none absolute top-2 right-2.5 animate-float-up text-xl font-extrabold text-danger-soft [text-shadow:0_2px_6px_rgb(0_0_0/80%)]"
					key={floater.key}
				>
					−{floater.value}
				</span>
			) : null}

			<div className="flex items-center gap-2.5">
				<div
					className={cn(
						'grid size-[54px] place-items-center rounded-[14px] border border-line bg-ink-600 p-1',
						hit && 'animate-shake',
					)}
					key={hit ? `hit-${floater?.key}` : 'idle'}
				>
					{avatar.kind === 'pet' ? (
						<PetIcon petId={avatar.petId} emojiClass="text-[30px]" />
					) : (
						<span className="text-[30px] leading-none">{avatar.emoji}</span>
					)}
				</div>
				<div>
					<div className="font-semibold">{name}</div>
					<div className="text-xs text-muted">{subtitle}</div>
				</div>
			</div>

			<div className="relative h-4 overflow-hidden rounded-lg border border-line bg-black/55">
				<div
					className={cn('h-full transition-[width] duration-300', hpPercent < 35 ? 'bar-hp-low' : 'bar-hp')}
					style={{ width: `${hpPercent}%` }}
				/>
				<span className="absolute inset-0 grid place-items-center text-[11.5px] tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/80%)]">
					{Math.max(0, Math.round(state.hp))} / {Math.round(state.maxHp)}
					{state.shield > 0 ? ` · 🔷 ${Math.round(state.shield)}` : ''}
				</span>
			</div>

			<div
				className="relative h-2 overflow-hidden rounded-lg border border-line bg-black/55"
				title={`Kiếm Thế — Chấn Đao cần ${COUNTER_COST}`}
			>
				<div className="bar-se h-full transition-[width] duration-300" style={{ width: `${sePercent}%` }} />
				<span className="absolute inset-0 grid place-items-center text-[11.5px] tabular-nums [text-shadow:0_1px_2px_rgb(0_0_0/80%)]">
					Kiếm Thế {Math.round(state.se)} / {state.maxSe}
				</span>
			</div>

			<div className={gearRowClass}>
				{gear.map((piece) => {
					const cooldown = state.cooldowns.find((entry) => entry.uid === piece.uid)
					const ready = !cooldown || cooldown.remaining <= 0
					const progress =
						cooldown && cooldown.total > 0 ? 100 - (cooldown.remaining / cooldown.total) * 100 : 100
					return (
						<div
							className={cn(
								'relative flex flex-col items-center gap-0.5 overflow-hidden rounded-[9px] border border-line bg-ink-700 px-1 pt-1.5 pb-2.5 text-[10px] text-muted',
								ready && 'border-gold-soft shadow-[0_0_10px_rgb(217_162_39/35%)]',
							)}
							key={piece.uid}
							title={piece.name}
						>
							<span className="grid size-6 place-items-center">
								{piece.templateId && piece.star ? (
									<ItemIcon templateId={piece.templateId} star={piece.star} emojiClass="text-xl" />
								) : (
									<SkillIcon petId={piece.petId ?? ''} emojiClass="text-xl" />
								)}
							</span>
							<span>{piece.label}</span>
							<span
								className="absolute bottom-0 left-0 h-1 bg-gold transition-[width] duration-200"
								style={{ width: `${progress}%` }}
							/>
						</div>
					)
				})}
			</div>

			<div className="flex min-h-6 flex-wrap gap-1.5">
				{state.statuses.map((status) => (
					<span
						className={cn(
							'flex items-center gap-1 rounded-full border border-line bg-black/35 px-2 py-0.5 text-[11.5px]',
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

/** Diễn lại trận đã mô phỏng sẵn, rồi chốt kết quả. */
export function BattleScreen() {
	const battle = useGameStore((state) => state.battle)
	const run = useGameStore((state) => state.run)
	const commitBattle = useGameStore((state) => state.commitBattle)

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

	const playerItems = run.equipped.filter((item) => item.slot >= 0)
	const playerGear: GearPiece[] = [
		{ uid: 'skill', petId: pet.id, name: pet.skill.name, label: 'Kỹ năng' },
		...gearFromBlueprints(playerItems),
	]
	const enemyGear = gearFromBlueprints(battle.opponentItems)

	const damageEvent = DAMAGE_KINDS.has(current.kind) && current.amount ? current : null
	const floaterSide = damageEvent ? (damageEvent.side === 'player' ? 'enemy' : 'player') : null
	const playerFloater = damageEvent && floaterSide === 'player' ? { key: index, value: damageEvent.amount ?? 0 } : null
	const enemyFloater = damageEvent && floaterSide === 'enemy' ? { key: index, value: damageEvent.amount ?? 0 } : null

	const visibleLog = events.slice(Math.max(0, index - 59), index + 1).reverse()
	const winner = battle.result.winner

	return (
		<div className="flex flex-col gap-3.5">
			<section className={panelClass}>
				<div className="flex flex-wrap items-start justify-between gap-2.5">
					<div>
						<h2 className="text-base tracking-[0.02em]">
							{battle.mode === 'stage' ? `Màn ${battle.stageIndex}` : 'Giao hữu PvP'} · vs{' '}
							{battle.opponentName}
						</h2>
						<p className="m-0 text-[13px] text-muted">
							Trận đấu tự động — bạn chỉ cần chuẩn bị túi đồ. Chấn Đao tốn {COUNTER_COST} Kiếm Thế, trọng kích
							tốn 24–40.
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
						<button type="button" className={cn(btnClass, btnSmClass)} onClick={() => setPaused((v) => !v)}>
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

				<div className="grid items-start gap-3 lg:grid-cols-[1fr_78px_1fr] max-[820px]:grid-cols-1">
					<DuelistView
						name={pet.name}
						avatar={{ kind: 'pet', petId: pet.id }}
						subtitle={`Cấp ${run.pets[run.petId] ?? 1} · ${pet.skill.name}`}
						state={current.player}
						gear={playerGear}
						floater={playerFloater}
						hit={Boolean(playerFloater)}
					/>
					<div className="grid place-items-center gap-2 font-extrabold tracking-[0.1em] text-gold">
						<span>VS</span>
						<span className="text-xs tracking-normal text-muted">{(current.t / 1000).toFixed(1)}s</span>
						{winner && index >= events.length - 1 ? (
							<span className={winner === 'player' ? 'text-gold-soft' : 'text-muted'}>
								{winner === 'player' ? 'THẮNG' : winner === 'enemy' ? 'THUA' : 'HOÀ'}
							</span>
						) : null}
					</div>
					<DuelistView
						name={battle.opponentName}
						avatar={{ kind: 'emoji', emoji: battle.mode === 'pvp' ? '🀄' : '👹' }}
						subtitle={
							battle.mode === 'pvp'
								? 'Đối thủ giao hữu'
								: `Màn ${battle.stageIndex} · ${battle.opponentItems.length} món đồ`
						}
						state={current.enemy}
						gear={enemyGear}
						floater={enemyFloater}
						hit={Boolean(enemyFloater)}
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
