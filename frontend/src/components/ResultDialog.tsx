import { useNavigate } from '@tanstack/react-router'
import { getStage } from '../game/stages'
import { useGameStore } from '../store/gameStore'
import { btnClass, btnPrimaryClass, cn, dialogClass, overlayClass, statClass, statGridClass } from './ui'

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className={statClass}>
			<span className="text-muted">{label}</span>
			<span className="font-semibold">{value}</span>
		</div>
	)
}

/** Overlay shown once the battle replay has finished: the reward and what happens next. */
export function ResultDialog() {
	const battle = useGameStore((state) => state.battle)
	const run = useGameStore((state) => state.run)
	const leaveBattle = useGameStore((state) => state.leaveBattle)
	const navigate = useNavigate()

	if (!battle) return null
	const won = battle.result.winner === 'player'
	const drawn = battle.result.winner === 'draw'
	const nextStage = getStage(Math.min(run.stage, 60))

	return (
		<div className={overlayClass}>
			<div className={dialogClass} role="dialog" aria-label="Kết quả trận đấu">
				<div className="flex items-center gap-3 text-[26px]">
					<span>{won ? '🏆' : drawn ? '🤝' : '💀'}</span>
					<h2 className={cn('text-[22px]', won ? 'text-gold-soft' : 'text-danger-soft')}>
						{won ? 'Chiến thắng!' : drawn ? 'Hoà' : 'Thất bại'}
					</h2>
				</div>

				<p className="m-0 text-sm text-muted">
					{battle.mode === 'stage' ? `Màn ${battle.stageIndex}` : 'Giao hữu PvP'} vs {battle.opponentName} · thời
					lượng {(battle.result.duration / 1000).toFixed(1)}s
				</p>

				<div className={statGridClass}>
					<Stat label="Thưởng" value={won ? `+${battle.reward} 🐾` : '—'} />
					<Stat label="Paw Tally hiện có" value={`${run.currency} 🐾`} />
					<Stat label="Màn đã qua" value={`${run.clearedStage}/60`} />
				</div>

				{won && battle.mode === 'stage' ? (
					<p className="m-0 text-[13px] text-muted">
						Màn kế tiếp: <strong>{nextStage.name}</strong> — {nextStage.enemy.maxHp} máu,{' '}
						{nextStage.enemy.items.length} món đồ.
					</p>
				) : null}
				{!won ? (
					<p className="m-0 text-[13px] text-muted">
						Mẹo: nhập các món trùng để lên sao, xếp món có hào khí cạnh nhau, và giữ Kiếm Thế cho Chấn Đao.
					</p>
				) : null}

				<div className="flex flex-wrap items-center justify-end gap-2.5">
					<button
						type="button"
						className={cn(btnClass, btnPrimaryClass)}
						onClick={() => {
							// Leaving the battle returns to the preparation room, even when the URL is the shop.
							void navigate({ to: '/' })
							leaveBattle()
						}}
					>
						{won ? (battle.mode === 'stage' ? 'Sang màn tiếp theo' : 'Về phòng chuẩn bị') : 'Thử lại'}
					</button>
				</div>
			</div>
		</div>
	)
}
