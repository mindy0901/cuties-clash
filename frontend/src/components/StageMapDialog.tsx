import { useEffect, useState } from 'react'
import { buildEnemyCombatant, buildPlayerCombatant, estimatePower } from '../game/build'
import { highestAccessibleStage, MAPS, STAGES } from '../game/stages'
import { translate } from '../i18n'
import { useGameStore } from '../store/gameStore'
import { Check, Cost, Lock, Trophy, X } from './icons'
import { cn, panelClass, statClass } from './ui'
import { Button } from './ui/button'
import { translateEnemyName } from './enemyName'

const NODE_POINTS = [
	{ x: 8, y: 15 },
	{ x: 28, y: 15 },
	{ x: 50, y: 15 },
	{ x: 72, y: 15 },
	{ x: 92, y: 15 },
	{ x: 92, y: 39 },
	{ x: 72, y: 39 },
	{ x: 50, y: 39 },
	{ x: 28, y: 39 },
	{ x: 8, y: 39 },
	{ x: 8, y: 63 },
	{ x: 28, y: 63 },
	{ x: 50, y: 63 },
	{ x: 72, y: 63 },
	{ x: 92, y: 63 },
	{ x: 92, y: 87 },
	{ x: 72, y: 87 },
	{ x: 50, y: 87 },
	{ x: 28, y: 87 },
	{ x: 8, y: 87 },
] as const

function mapIndexForStage(stageIndex: number) {
	return MAPS.findIndex((map) => stageIndex >= map.from && stageIndex <= map.to)
}

function stagePoint(index: number) {
	const point = NODE_POINTS[index]
	return { x: point.x * 10, y: point.y * (680 / 100) }
}

export function StageMapDialog({ onClose }: { onClose: () => void }) {
	const run = useGameStore((state) => state.run)
	const phase = useGameStore((state) => state.phase)
	const selectStage = useGameStore((state) => state.selectStage)
	const maxUnlockedStage = highestAccessibleStage(run.clearedStage)
	const [activeMapIndex, setActiveMapIndex] = useState(() => Math.max(0, mapIndexForStage(run.stage)))
	const [selectedStageIndex, setSelectedStageIndex] = useState(run.stage)
	const map = MAPS[activeMapIndex]
	const stages = STAGES.slice(map.from - 1, map.to)
	const selectedStage = STAGES[selectedStageIndex - 1]
	const selectedEnemyPower = estimatePower(buildEnemyCombatant(selectedStage.enemy))
	const playerPower = estimatePower(
		buildPlayerCombatant(run.cutieId, run.cuties[run.cutieId] ?? 1, run.equipped),
	)
	const route = stages
		.map((_, index) => {
			const point = stagePoint(index)
			return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
		})
		.join(' ')
	const mapUnlockedStage = Math.min(map.to, maxUnlockedStage)
	const unlockedStagesInMap = Math.max(0, mapUnlockedStage - map.from + 1)
	const canConfirm = phase === 'prep' && selectedStageIndex <= maxUnlockedStage

	useEffect(() => {
		function closeOnEscape(event: KeyboardEvent) {
			if (event.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', closeOnEscape)
		return () => window.removeEventListener('keydown', closeOnEscape)
	}, [onClose])

	function chooseMap(index: number) {
		const nextMap = MAPS[index]
		const nextStage = Math.min(maxUnlockedStage, nextMap.to)
		setActiveMapIndex(index)
		setSelectedStageIndex(Math.max(nextMap.from, nextStage))
	}

	function confirmStage() {
		if (selectStage(selectedStageIndex)) onClose()
	}

	return (
		<div
			className="fixed inset-0 z-50 overflow-y-auto bg-ink-900/95 p-3 backdrop-blur-sm md:p-6"
			onClick={onClose}
		>
			<div
				aria-labelledby="stage-map-title"
				aria-modal="true"
				className="mx-auto flex min-h-[min(780px,calc(100vh-24px))] max-w-[1500px] flex-col overflow-hidden rounded-[24px] border border-line bg-ink-800 shadow-panel"
				onClick={(event) => event.stopPropagation()}
				role="dialog"
			>
				<header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-ink-800/95 px-5 py-4 md:px-7">
					<div>
						<p className="m-0 text-xs font-bold uppercase tracking-[0.2em] text-gold">
							{translate('Chế độ PvE')}
						</p>
						<h2 className="mt-1 text-2xl font-bold md:text-[30px]" id="stage-map-title">
							{translate('Bản đồ hành trình')}
						</h2>
						<p className="m-0 mt-1 text-sm text-muted">
							{translate('Đã qua {cleared}/60 màn · tiếp theo là màn {stage}', {
								cleared: run.clearedStage,
								stage: run.stage,
							})}
						</p>
					</div>
					<Button
						aria-label={translate('Đóng')}
						className={cn('size-10 justify-center p-0 text-lg')}
						onClick={onClose}
						type="button"
					>
						<X />
					</Button>
				</header>

				<div className="grid flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_330px]">
					<section aria-label={translate('Bản đồ màn chơi')} className="flex min-w-0 flex-col gap-3">
						<div aria-label={translate('Khu vực')} className="grid grid-cols-3 gap-2" role="group">
							{MAPS.map((region, index) => {
								const unlocked = region.from <= maxUnlockedStage
								const clearedInRegion = Math.max(0, Math.min(region.to, run.clearedStage) - region.from + 1)
								return (
									<button
										aria-pressed={index === activeMapIndex}
										className={cn(
											'flex min-w-0 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition',
											index === activeMapIndex
												? 'border-gold/70 bg-gold/10 text-paper shadow-lg shadow-gold/10'
												: 'border-line bg-ink-700/80 text-muted hover:border-gold/40 hover:text-paper',
											!unlocked && 'cursor-not-allowed opacity-45',
										)}
										disabled={!unlocked}
										key={region.name}
										onClick={() => chooseMap(index)}
										type="button"
									>
										<span className="truncate text-sm font-bold">
											{translate('Bản đồ {number}', { number: index + 1 })} · {translate(region.name)}
										</span>
										<span className="mt-0.5 text-xs text-muted">
											{unlocked
												? translate('Đã qua {cleared}/{total}', {
														cleared: clearedInRegion,
														total: region.to - region.from + 1,
													})
												: translate('Đã khóa')}
										</span>
									</button>
								)
							})}
						</div>

						<div className="relative min-h-[570px] flex-1 overflow-x-auto rounded-2xl border border-line bg-gradient-to-br from-jade/15 via-ink-700 to-gold/10">
							<div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
								<div className="absolute -left-20 top-8 size-64 rounded-full bg-jade/10 blur-3xl" />
								<div className="absolute -right-16 bottom-0 size-72 rounded-full bg-gold/10 blur-3xl" />
								<div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink-900/65 to-transparent" />
								<svg className="absolute inset-0 size-full opacity-40" preserveAspectRatio="none" viewBox="0 0 1000 680">
									<path
										className="text-jade/30"
										d="M0 510 C 180 445, 220 585, 390 520 S 620 455, 760 520 S 910 575, 1000 490"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									/>
									<path
										className="text-paper/15"
										d="M0 535 C 180 470, 220 610, 390 545 S 620 480, 760 545 S 910 600, 1000 515"
										fill="none"
										stroke="currentColor"
										strokeWidth="1"
									/>
								</svg>
							</div>

							<div className="relative h-[570px] min-w-[700px]">
								<svg
									aria-hidden
									className="absolute inset-0 size-full"
									preserveAspectRatio="none"
									viewBox="0 0 1000 680"
								>
									<path
										className="text-ink-900/60"
										d={route}
										fill="none"
										stroke="currentColor"
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="13"
									/>
									{stages.slice(1).map((stage, index) => {
										const start = stagePoint(index)
										const end = stagePoint(index + 1)
										const cleared = stage.index <= run.clearedStage
										const next = stage.index === maxUnlockedStage
										return (
											<line
												className={cleared ? 'text-jade' : next ? 'text-gold' : 'text-paper/25'}
												key={stage.index}
												stroke="currentColor"
												strokeDasharray={cleared ? undefined : '8 9'}
												strokeLinecap="round"
												strokeWidth={cleared || next ? 4 : 2}
												x1={start.x}
												x2={end.x}
												y1={start.y}
												y2={end.y}
											/>
										)
									})}
								</svg>

								{stages.map((stage, index) => {
									const point = NODE_POINTS[index]
									const cleared = stage.index <= run.clearedStage
									const current = stage.index === run.stage
									const selected = stage.index === selectedStageIndex
									const locked = stage.index > maxUnlockedStage
									const boss = stage.index % 10 === 0
									const accessibleName = translate('Màn {stage}: {name} · {status}', {
										stage: stage.index,
										name: translateEnemyName(stage.enemy.name),
										status: locked ? translate('Đã khóa') : cleared ? translate('Đã qua') : translate('Tiếp theo'),
									})
									return (
										<button
											aria-label={accessibleName}
											aria-pressed={selected}
											className={cn(
												'absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-xl p-1 transition duration-200 hover:z-20 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
												selected && 'z-20 scale-110',
												locked && 'cursor-not-allowed opacity-45',
											)}
											disabled={locked}
											key={stage.index}
											onClick={() => setSelectedStageIndex(stage.index)}
											style={{ left: `${point.x}%`, top: `${point.y}%` }}
											title={accessibleName}
											type="button"
										>
											<span
												className={cn(
													'relative grid size-12 place-items-center rounded-full border-2 bg-ink-800 text-[23px] shadow-lg transition md:size-[54px]',
													cleared && 'border-jade bg-jade/15',
													selected && 'border-gold shadow-lg shadow-gold/35',
													!selected && !cleared && !locked && 'border-paper/60',
													locked && 'border-line bg-ink-700',
													boss && !selected && 'border-gold/70',
												)}
											>
												{locked ? <Lock className="size-4 text-muted" /> : stage.enemy.icon}
												{cleared ? (
													<span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-jade text-ink-900">
														<Check className="size-3" />
													</span>
												) : null}
												{boss && !locked ? (
													<span className="absolute -bottom-2 grid size-5 place-items-center rounded-full border border-gold/70 bg-ink-800 text-gold">
														<Trophy className="size-3" />
													</span>
												) : null}
											</span>
											<span
												className={cn(
													'rounded-full border border-line bg-ink-900/90 px-2 py-0.5 text-[10px] font-bold leading-none text-paper',
													selected && 'border-gold text-gold-soft',
													current && !selected && 'border-jade/70 text-jade',
												)}
											>
												{translate('Màn {stage}', { stage: stage.index })}
											</span>
										</button>
									)
								})}
							</div>
						</div>
						<p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
							<span className="inline-flex items-center gap-1.5">
								<span className="size-2.5 rounded-full bg-jade" /> {translate('Đã qua')}
							</span>
							<span className="inline-flex items-center gap-1.5">
								<span className="size-2.5 rounded-full border border-gold bg-gold/30" /> {translate('Thủ lĩnh')}
							</span>
							<span className="inline-flex items-center gap-1.5">
								<Lock className="size-3" /> {translate('Đã khóa')}
							</span>
							<span className="ml-auto">{translate(map.subtitle)}</span>
						</p>
					</section>

					<aside aria-label={translate('Chi tiết màn đã chọn')} className={cn(panelClass, 'h-fit lg:sticky lg:top-0')}>
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="m-0 text-xs font-bold uppercase tracking-[0.16em] text-gold">
									{translate('Màn đã chọn')}
								</p>
								<h3 className="mt-1 text-xl font-bold">
									{translate('Màn {stage}', { stage: selectedStage.index })}
								</h3>
							</div>
							<div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-gold/40 bg-gold/10 text-3xl">
								{selectedStage.enemy.icon}
							</div>
						</div>

						<div className="rounded-xl border border-line bg-ink-900/55 p-3">
							<p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted">
								{translate(selectedStage.index % 10 === 0 ? 'Trận đấu thủ lĩnh' : 'Đối thủ')}
							</p>
							<p className="m-0 mt-1 text-lg font-semibold">{translateEnemyName(selectedStage.enemy.name)}</p>
						</div>

						<div className="flex flex-col gap-2">
							<div className={statClass}>
								<span className="text-muted">{translate('Máu đối thủ')}</span>
								<strong>{selectedStage.enemy.maxHp.toLocaleString()}</strong>
							</div>
							<div className={statClass}>
								<span className="text-muted">{translate('Sát thương tấn công')}</span>
								<strong>{selectedStage.enemy.attackDamage.toLocaleString()}</strong>
							</div>
							<div className={statClass}>
								<span className="text-muted">{translate('Thưởng màn')}</span>
								<strong className="text-gold-soft">
									<Cost amount={selectedStage.reward} />
								</strong>
							</div>
							<div className={statClass}>
								<span className="text-muted">{translate('Lực chiến gợi ý')}</span>
								<strong>{selectedEnemyPower.toLocaleString()}</strong>
							</div>
							<div className={statClass}>
								<span className="text-muted">{translate('Lực chiến của bạn')}</span>
								<strong className={playerPower >= selectedEnemyPower ? 'text-jade' : 'text-gold-soft'}>
									{playerPower.toLocaleString()}
								</strong>
							</div>
						</div>

						<Button
							className={cn('mt-1 min-h-12 justify-center border-gold/70 bg-gradient-to-b from-gold-soft to-gold font-bold text-ink-900 hover:border-paper disabled:cursor-not-allowed disabled:opacity-45')}
							disabled={!canConfirm}
							onClick={confirmStage}
							type="button"
						>
							{translate('Vào màn')}
						</Button>
					</aside>
				</div>

				<footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted md:px-7">
					<span>
						{translate('Đã mở {unlocked}/{total} màn trong khu vực này', {
							unlocked: unlockedStagesInMap,
							total: map.to - map.from + 1,
						})}
					</span>
				</footer>
			</div>
		</div>
	)
}
