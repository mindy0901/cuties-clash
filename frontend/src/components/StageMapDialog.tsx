import { MAPS, STAGES } from '../game/stages'
import { useGameStore } from '../store/gameStore'
import { btnClass, btnSmClass, cn, dialogClass, overlayClass, rowBetweenClass } from './ui'

/** The 60-stage journey across the event's 3 maps (20 stages per map). */
export function StageMapDialog({ onClose }: { onClose: () => void }) {
	const run = useGameStore((state) => state.run)

	return (
		<div className={overlayClass} onClick={onClose}>
			<div
				className={cn(dialogClass, 'max-h-[86vh] w-[min(880px,100%)] overflow-y-auto')}
				onClick={(event) => event.stopPropagation()}
			>
				<div className={rowBetweenClass}>
					<h2 className="text-[22px]">Hành trình 60 màn</h2>
					<button type="button" className={cn(btnClass, btnSmClass)} onClick={onClose}>
						Đóng
					</button>
				</div>
				<p className="m-0 text-[13px] text-muted">
					Đã qua {run.clearedStage}/60 màn · đang ở màn {run.stage}. Qua mỗi màn sẽ nhận Paw Tally và mở khoá shop
					bậc cao hơn; màn 20 và 40 mở khoá thú cưng mới.
				</p>

				{MAPS.map((map, mapIndex) => {
					const stages = STAGES.slice(mapIndex * 20, mapIndex * 20 + 20)
					return (
						<div className="flex flex-col gap-2.5" key={map.name}>
							<div className="flex items-baseline gap-2.5">
								<h3 className="text-[17px]">
									Bản đồ {mapIndex + 1}: {map.name}
								</h3>
								<span className="text-[12.5px] text-muted">{map.subtitle}</span>
							</div>
							<div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
								{stages.map((stage) => {
									const cleared = stage.index <= run.clearedStage
									const current = stage.index === run.stage
									const locked = stage.index > run.stage
									return (
										<div
											key={stage.index}
											className={cn(
												'flex flex-col items-center gap-0.5 rounded-[10px] border border-line bg-ink-700 p-1.5 text-[11px] text-muted',
												cleared && 'border-jade/55 bg-jade/10',
												current && 'border-gold bg-gold/16 shadow-[0_0_12px_rgb(217_162_39/25%)]',
												locked && 'opacity-50',
												stage.index % 10 === 0 && 'border-[3px] border-double',
											)}
											title={`${stage.name} · ${stage.reward} 🐾`}
										>
											<span className="font-bold text-paper">{stage.index}</span>
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
