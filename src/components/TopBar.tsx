import { MAPS } from '../game/stages'
import { useGameStore } from '../store/gameStore'

export function TopBar({ onOpenMap }: { onOpenMap: () => void }) {
	const run = useGameStore((state) => state.run)
	const newRun = useGameStore((state) => state.newRun)
	const mapIndex = Math.min(MAPS.length - 1, Math.floor((run.stage - 1) / 20))
	const map = MAPS[mapIndex]

	return (
		<header className="topbar">
			<div className="brand">
				<div className="brand-mark">🐾</div>
				<div>
					<h1>Martial Cutie — Đấu Trường Thú Cưng</h1>
					<small>Auto-battler nuôi thú cưng · lấy cảm hứng từ event 武林萌主 của Naraka: Bladepoint</small>
				</div>
			</div>

			<div className="chip-stat">
				<span className="label">Paw Tally</span>
				<span className="value">{run.currency} 🐾</span>
			</div>
			<div className="chip-stat">
				<span className="label">Màn</span>
				<span className="value">
					{run.stage}/60 · {map.name}
				</span>
			</div>
			<div className="chip-stat">
				<span className="label">Đã qua</span>
				<span className="value">{run.clearedStage}/60</span>
			</div>

			<button type="button" className="btn btn-sm" onClick={onOpenMap}>
				🗺️ Bản đồ
			</button>
			<button
				type="button"
				className="btn btn-sm btn-ghost"
				onClick={() => {
					if (window.confirm('Chơi lại từ đầu? Toàn bộ tiến trình hiện tại sẽ bị xoá.')) newRun()
				}}
			>
				Chơi lại
			</button>
		</header>
	)
}
