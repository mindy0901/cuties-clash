import { useNavigate } from '@tanstack/react-router'
import { FINAL_STAGE, getStage } from '../game/stages'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { btnClass, cn } from './ui'

/**
 * The bottom button bar of the preparation room, following the original layout:
 * `Mua Vật Phẩm` · `Nhiệm Vụ` · `Bộ Sưu Tập` · `Đấu Thú Cưng`.
 *
 * "Nhiệm Vụ" and "Bộ Sưu Tập" have no content yet, so they only report "coming soon" — the
 * buttons are shown to keep the layout intact, without pretending the feature exists.
 */
export function ActionBar() {
	const run = useGameStore((state) => state.run)
	const startBattle = useGameStore((state) => state.startBattle)
	const pushToast = useGameStore((state) => state.pushToast)
	const navigate = useNavigate()
	const openMap = useUiStore((state) => state.openMap)
	const stage = getStage(run.stage)
	const equippedCount = run.equipped.filter((item) => item.slot >= 0).length
	const canFight = equippedCount > 0

	const comingSoon = (name: string) => pushToast(`${name} sẽ có ở bản sau.`, 'info')

	return (
		<div className="flex flex-wrap items-stretch gap-2.5 rounded-panel border border-line bg-ink-800/80 p-2.5">
			<button
				type="button"
				className={cn(
					btnClass,
					'flex-1 justify-center border-gold/60 bg-linear-to-b from-gold/25 to-transparent font-semibold',
				)}
				onClick={() => void navigate({ to: '/shop' })}
			>
				🛒 Mua Vật Phẩm »
			</button>

			<button type="button" className={cn(btnClass, 'flex-1 justify-center')} onClick={() => comingSoon('Nhiệm Vụ')}>
				🦌 Nhiệm Vụ
			</button>
			<button
				type="button"
				className={cn(btnClass, 'flex-1 justify-center')}
				onClick={() => comingSoon('Bộ Sưu Tập')}
			>
				📜 Bộ Sưu Tập
			</button>
			<button type="button" className={cn(btnClass, 'flex-1 justify-center')} onClick={openMap}>
				🗺️ Bản đồ
			</button>

			<div className="flex min-w-[150px] flex-1 flex-col justify-center gap-1 rounded-[10px] border border-line bg-black/25 px-3 py-2">
				<span className="text-[11px] text-muted">
					Tiến trình màn {run.clearedStage}/{FINAL_STAGE}
				</span>
				<span className="h-1.5 overflow-hidden rounded-full bg-black/60">
					<span
						className="block h-full rounded-full bg-linear-to-r from-gold to-gold-soft transition-[width] duration-300"
						style={{ width: `${Math.round((run.clearedStage / FINAL_STAGE) * 100)}%` }}
					/>
				</span>
			</div>

			<button
				type="button"
				className={cn(
					btnClass,
					'min-w-[200px] flex-[1.5] justify-center border-[#7d2318] bg-linear-to-b from-danger-soft to-danger text-base font-bold text-white hover:not-disabled:border-gold',
				)}
				disabled={!canFight}
				onClick={() => startBattle('stage')}
				title={canFight ? `Đánh màn ${stage.index}` : 'Hãy mang ít nhất 1 món lên trang bị trước'}
			>
				⚔️ Đấu Thú Cưng · Màn {stage.index}
			</button>
		</div>
	)
}
