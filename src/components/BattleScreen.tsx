import { useEffect, useMemo, useRef, useState } from 'react'
import { COUNTER_COST } from '../game/battle'
import { combatItemUid } from '../game/build'
import { getTemplate, starLabel } from '../game/items'
import { STATUS_ICON, STATUS_TEXT } from '../game/labels'
import { getPet } from '../game/pets'
import { useGameStore } from '../store/gameStore'
import type { SideState, StatusKey } from '../game/types'

const DEBUFFS: StatusKey[] = ['slow', 'freeze', 'poison', 'burn', 'brittle']
const DAMAGE_KINDS = new Set(['attack', 'charged', 'counter', 'active'])
const SPEEDS = [1, 2, 4, 8]
/** Playback cadence: one tick of simulated time every 60 ms of wall clock at ×1 speed. */
const TICK_MS = 60

interface GearPiece {
	uid: string
	icon: string
	name: string
	label: string
}

function gearFromBlueprints(items: { templateId: string; star: number; slot: number }[]): GearPiece[] {
	return items.map((entry) => {
		const template = getTemplate(entry.templateId)
		return {
			uid: combatItemUid(entry.templateId, entry.slot),
			icon: template.icon,
			name: template.name,
			label: starLabel(entry.star as 1 | 2 | 3 | 4),
		}
	})
}

function DuelistView({
	name,
	icon,
	subtitle,
	state,
	gear,
	floater,
	hit,
}: {
	name: string
	icon: string
	subtitle: string
	state: SideState
	gear: GearPiece[]
	floater?: { key: number; value: number } | null
	hit: boolean
}) {
	const hpPercent = Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100))
	const sePercent = Math.max(0, Math.min(100, (state.se / state.maxSe) * 100))
	return (
		<div className="duelist">
			{floater ? (
				<span className="floater" key={floater.key}>
					−{floater.value}
				</span>
			) : null}
			<div className="duelist-header">
				<div className={`avatar${hit ? ' hit' : ''}`} key={hit ? `hit-${floater?.key}` : 'idle'}>
					{icon}
				</div>
				<div>
					<div className="duelist-name">{name}</div>
					<div className="duelist-sub">{subtitle}</div>
				</div>
			</div>

			<div className="bar">
				<div className={`bar-fill hp${hpPercent < 35 ? ' low' : ''}`} style={{ width: `${hpPercent}%` }} />
				<span className="bar-text">
					{Math.max(0, Math.round(state.hp))} / {Math.round(state.maxHp)}
					{state.shield > 0 ? ` · 🔷 ${Math.round(state.shield)}` : ''}
				</span>
			</div>
			<div className="bar bar-sm" title={`Kiếm Thế — Chấn Đao cần ${COUNTER_COST}`}>
				<div className="bar-fill se" style={{ width: `${sePercent}%` }} />
				<span className="bar-text">
					Kiếm Thế {Math.round(state.se)} / {state.maxSe}
				</span>
			</div>

			<div className="gear-row">
				{gear.map((piece) => {
					const cooldown = state.cooldowns.find((entry) => entry.uid === piece.uid)
					const ready = !cooldown || cooldown.remaining <= 0
					const progress = cooldown && cooldown.total > 0 ? 100 - (cooldown.remaining / cooldown.total) * 100 : 100
					return (
						<div className={`gear${ready ? ' ready' : ''}`} key={piece.uid} title={piece.name}>
							<span className="gear-icon">{piece.icon}</span>
							<span>{piece.label}</span>
							<span className="gear-cd" style={{ width: `${progress}%` }} />
						</div>
					)
				})}
			</div>

			<div className="chip-row">
				{state.statuses.map((status) => (
					<span
						className={`status-chip ${DEBUFFS.includes(status.key) ? 'debuff' : 'buff'}`}
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

/** Replays the pre-simulated fight, then commits the result. */
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

	const playerItems = run.items.filter((item) => item.slot >= 0)
	const playerGear: GearPiece[] = [
		{ uid: 'skill', icon: '✨', name: pet.skill.name, label: 'Kỹ năng' },
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
		<section className="screen">
			<section className="panel">
				<div className="panel-head">
					<div>
						<h2 className="panel-title">
							{battle.mode === 'stage' ? `Màn ${battle.stageIndex}` : 'Giao hữu PvP'} · vs{' '}
							{battle.opponentName}
						</h2>
						<p className="hint">
							Trận đấu tự động — bạn chỉ cần chuẩn bị túi đồ. Chấn Đao tốn {COUNTER_COST} Kiếm Thế, trọng kích tốn
							24–40.
						</p>
					</div>
					<div className="speed-row">
						{SPEEDS.map((value) => (
							<button
								type="button"
								key={value}
								className={`btn btn-sm${value === speed ? ' btn-gold' : ''}`}
								onClick={() => setSpeed(value)}
							>
								×{value}
							</button>
						))}
						<button type="button" className="btn btn-sm" onClick={() => setPaused((value) => !value)}>
							{paused ? '▶ Tiếp tục' : '⏸ Tạm dừng'}
						</button>
						<button
							type="button"
							className="btn btn-sm btn-primary"
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

				<div className="arena">
					<DuelistView
						name={pet.name}
						icon={pet.icon}
						subtitle={`Cấp ${run.pets[run.petId] ?? 1} · ${pet.skill.name}`}
						state={current.player}
						gear={playerGear}
						floater={playerFloater}
						hit={Boolean(playerFloater)}
					/>
					<div className="vs">
						<span>VS</span>
						<span className="muted" style={{ fontSize: 12, letterSpacing: 0 }}>
							{(current.t / 1000).toFixed(1)}s
						</span>
						{winner && index >= events.length - 1 ? (
							<span className={winner === 'player' ? 'gold' : 'muted'}>
								{winner === 'player' ? 'THẮNG' : winner === 'enemy' ? 'THUA' : 'HOÀ'}
							</span>
						) : null}
					</div>
					<DuelistView
						name={battle.opponentName}
						icon={battle.mode === 'pvp' ? '🀄' : '👹'}
						subtitle={battle.mode === 'pvp' ? 'Đối thủ giao hữu' : `Màn ${battle.stageIndex} · ${battle.opponentItems.length} món đồ`}
						state={current.enemy}
						gear={enemyGear}
						floater={enemyFloater}
						hit={Boolean(enemyFloater)}
					/>
				</div>

				{previous.kind !== current.kind || previous.text !== current.text ? (
					<p className="gold" style={{ margin: 0, fontWeight: 600 }}>
						{current.icon} {current.text}
					</p>
				) : null}

				<div className="log" ref={logRef}>
					{visibleLog.map((event, logIndex) => (
						<div
							className={`log-line ${event.side}${event.kind === 'end' ? ' win' : ''}`}
							key={`${event.t}-${index - logIndex}`}
						>
							<span className="t">{(event.t / 1000).toFixed(1)}s</span>
							<span>
								{event.icon} {event.text}
							</span>
						</div>
					))}
				</div>
			</section>
		</section>
	)
}
