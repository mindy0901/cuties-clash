import { getStage } from '../game/stages'
import { useGameStore } from '../store/gameStore'

/** Overlay shown after the playback finishes: rewards + next actions. */
export function ResultDialog() {
	const battle = useGameStore((state) => state.battle)
	const run = useGameStore((state) => state.run)
	const leaveBattle = useGameStore((state) => state.leaveBattle)
	const newRun = useGameStore((state) => state.newRun)

	if (!battle) return null
	const won = battle.result.winner === 'player'
	const drawn = battle.result.winner === 'draw'
	const nextStage = getStage(Math.min(run.stage, 60))

	return (
		<div className="overlay">
			<div className="dialog">
				<div className="result-banner">
					<span>{won ? '🏆' : drawn ? '🤝' : '💀'}</span>
					<h2 className={won ? 'result-win' : 'result-lose'}>
						{won ? 'Chiến thắng!' : drawn ? 'Hoà' : 'Thất bại'}
					</h2>
				</div>

				<p className="hint" style={{ fontSize: 14 }}>
					{battle.mode === 'stage' ? `Màn ${battle.stageIndex}` : 'Giao hữu PvP'} vs {battle.opponentName} · thời lượng{' '}
					{(battle.result.duration / 1000).toFixed(1)}s
				</p>

				<div className="stat-grid">
					<div className="stat">
						<span className="label">Thưởng</span>
						<span className="value">{won ? `+${battle.reward} 🐾` : '—'}</span>
					</div>
					<div className="stat">
						<span className="label">Paw Tally hiện có</span>
						<span className="value">{run.currency} 🐾</span>
					</div>
					<div className="stat">
						<span className="label">Màn đã qua</span>
						<span className="value">
							{run.clearedStage}/60
						</span>
					</div>
				</div>

				{won && battle.mode === 'stage' ? (
					<p className="hint">
						Màn kế tiếp: <strong>{nextStage.name}</strong> — {nextStage.enemy.maxHp} máu,{' '}
						{nextStage.enemy.items.length} món đồ.
					</p>
				) : null}
				{!won ? (
					<p className="hint">
						Mẹo: nhập các món trùng để lên sao, xếp món có hào khí cạnh nhau, và giữ Kiếm Thế cho Chấn Đao.
					</p>
				) : null}

				<div className="row" style={{ justifyContent: 'flex-end' }}>
					<button type="button" className="btn btn-ghost" onClick={newRun}>
						Chơi lại từ đầu
					</button>
					<button type="button" className="btn btn-primary" onClick={leaveBattle}>
						{won ? (battle.mode === 'stage' ? 'Sang màn tiếp theo' : 'Về phòng chuẩn bị') : 'Thử lại'}
					</button>
				</div>
			</div>
		</div>
	)
}
