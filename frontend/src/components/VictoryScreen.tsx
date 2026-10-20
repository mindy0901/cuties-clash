import type { ReactNode } from 'react'
import { getCutie, cutieLevelStats, cutieList } from '../game/cuties'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { CutieIcon } from './ItemIcon'
import { Gold, Trophy } from './icons'
import { dialogClass, overlayClass, statClass, statGridClass } from './ui'
import { Button } from './ui/button'
import { translate } from '../i18n'

function Stat({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className={statClass}>
			<span className="text-muted">{label}</span>
			<span className="inline-flex items-center gap-1 font-semibold">{value}</span>
		</div>
	)
}

/** Screen shown after clearing stage 60 for the first time. */
export function VictoryScreen() {
	const run = useGameStore((state) => state.run)
	// Clearing the campaign is **not** the end of the run: the player can keep this save (replay any
	// cleared stage, farm gold, try other Cuties) or deliberately start a new journey. Restarting wipes
	// the finished run too, so it asks first (dialog lives in the root layout).
	const continueRun = useGameStore((state) => state.continueRun)
	const openRestart = useUiStore((state) => state.openRestart)
	const cutie = getCutie(run.cutieId)
	const level = run.cuties[run.cutieId] ?? 1
	const levelStats = cutieLevelStats(cutie, level)

	return (
		<div className={overlayClass}>
			<div className={dialogClass} role="dialog" aria-label={translate('Phá đảo')}>
				<div className="flex items-center gap-3 text-[26px]">
					<Trophy className="text-gold-soft" />
					<h2 className="text-[22px] text-gold-soft">{translate('Phá đảo 60 màn!')}</h2>
				</div>
				<p className="m-0 text-sm text-muted">
					{translate('{cutie} cấp {level} đã chinh phục Tụ Khốt Châu, Hỏa La Quốc và Stormchant.', {
						cutie: translate(cutie.name),
						level,
					})}
				</p>
				<div className={statGridClass}>
					<Stat
						label={translate('Vàng còn lại')}
						value={
							<>
								{run.gold} <Gold />
							</>
						}
					/>
					<Stat label={translate('Đồ đang mang')} value={`${run.equipped.filter((item) => item.slot >= 0).length} ${translate('món')}`} />
					<Stat label={translate('Kho dự trữ')} value={`${run.inventory.length} ${translate('món')}`} />
					<Stat label={translate('Ô trang bị')} value={`${levelStats.bag.width}×${levelStats.bag.rows}`} />
					<Stat
						label={translate('Cuties đã mở khoá')}
						value={
							<span className="inline-flex items-center gap-1">
								{cutieList()
									.filter((entry) => run.unlockedCuties.includes(entry.id))
									.map((entry) => (
										<span
											className="grid size-5 place-items-center"
											key={entry.id}
											title={translate(entry.name)}
										>
											<CutieIcon cutieId={entry.id} emojiClass="text-base" />
										</span>
									))}
							</span>
						}
					/>
				</div>
				<p className="m-0 text-[13px] text-muted">
					{translate('Mọi thứ vẫn còn nguyên: đấu lại màn đã qua, cày thêm Vàng, hoặc bắt đầu hành trình mới.')}
				</p>
				<div className="flex flex-wrap items-center justify-end gap-2.5">
					{/* The primary action: keep the save and keep playing. */}
					<Button
						type="button"
						data-victory-continue
						variant="primary"
						onClick={continueRun}
					>
						{translate('Tiếp tục chơi')}
					</Button>
					<Button type="button" variant="destructive" onClick={openRestart}>
						{translate('Chơi lại từ đầu')}
					</Button>
				</div>
			</div>
		</div>
	)
}
