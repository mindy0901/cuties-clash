import { MAPS, STAGES } from '../game/stages'
import { useGameStore } from '../store/gameStore'

/** 60 stages across the 3 event maps (20 per map). */
export function StageMapDialog({ onClose }: { onClose: () => void }) {
	const run = useGameStore((state) => state.run)

	return (
		<div className="overlay" onClick={onClose}>
			<div className="dialog wide" onClick={(event) => event.stopPropagation()}>
				<div className="row-between">
					<h2>Hành trình 60 màn</h2>
					<button type="button" className="btn btn-sm" onClick={onClose}>
						Đóng
					</button>
				</div>
				<p className="hint">
					Đã qua {run.clearedStage}/60 màn · đang ở màn {run.stage}. Qua mỗi màn sẽ nhận Paw Tally và mở khoá shop
					bậc cao hơn; màn 20 và 40 mở khoá thú cưng mới.
				</p>

				{MAPS.map((map, mapIndex) => {
					const stages = STAGES.slice(mapIndex * 20, mapIndex * 20 + 20)
					return (
						<div className="map-group" key={map.name}>
							<div className="map-head">
								<h3>
									Bản đồ {mapIndex + 1}: {map.name}
								</h3>
								<span className="sub">{map.subtitle}</span>
							</div>
							<div className="stage-grid">
								{stages.map((stage) => {
									const classes = ['stage-node']
									if (stage.index <= run.clearedStage) classes.push('cleared')
									if (stage.index === run.stage) classes.push('current')
									if (stage.index > run.stage) classes.push('locked')
									if (stage.index % 10 === 0) classes.push('boss')
									return (
										<div key={stage.index} className={classes.join(' ')} title={`${stage.name} · ${stage.reward} 🐾`}>
											<span className="num">{stage.index}</span>
											<span>{stage.enemy.icon}</span>
											<span>{stage.name.replace('Thủ Lĩnh · ', '')}</span>
										</div>
									)
								})}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}
