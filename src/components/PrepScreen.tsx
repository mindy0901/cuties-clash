import { BagPanel } from './BagPanel'
import { PetPanel } from './PetPanel'
import { ShopPanel } from './ShopPanel'
import { getStage } from '../game/stages'
import { useGameStore } from '../store/gameStore'

/** Preparation phase: shop, bag, pet and the two battle entries. */
export function PrepScreen() {
	const run = useGameStore((state) => state.run)
	const startBattle = useGameStore((state) => state.startBattle)
	const stage = getStage(run.stage)
	const placedCount = run.items.filter((item) => item.slot >= 0).length

	return (
		<div className="screen">
			<div className="columns">
				<div className="stack">
					<BagPanel />
					<ShopPanel />
				</div>
				<div className="stack">
					<PetPanel />
					<section className="panel">
						<div className="panel-head">
							<h2 className="panel-title">Xuất chiến</h2>
							<span className="tag nowrap">{placedCount} món trong túi</span>
						</div>
						<div className="stat-grid">
							<div className="stat">
								<span className="label">Màn {stage.index}</span>
								<span className="value">{stage.enemy.icon} {stage.enemy.name}</span>
							</div>
							<div className="stat">
								<span className="label">Máu đối thủ</span>
								<span className="value">{stage.enemy.maxHp}</span>
							</div>
							<div className="stat">
								<span className="label">Thưởng</span>
								<span className="value">{stage.reward} 🐾</span>
							</div>
						</div>
						<button
							type="button"
							className="btn btn-block btn-primary"
							disabled={placedCount === 0}
							onClick={() => startBattle('stage')}
							title={placedCount === 0 ? 'Hãy mua ít nhất 1 món đồ trước' : 'Bắt đầu đánh màn hiện tại'}
						>
							⚔️ Đánh màn {stage.index}
						</button>
						<button type="button" className="btn btn-block" onClick={() => startBattle('pvp')}>
							🀄 Giao hữu PvP (đối thủ cùng sức mạnh)
						</button>
						<p className="hint">
							PvP không ảnh hưởng tiến trình màn — thắng vẫn nhận Paw Tally để thử nghiệm đội hình.
						</p>
					</section>
				</div>
			</div>
		</div>
	)
}
