import { FINAL_STAGE, getStage } from '../game/stages'
import { useGameStore } from '../store/gameStore'
import { useBattleSettingsStore } from '../store/battleSettingsStore'
import { useUiStore } from '../store/uiStore'
import { ClipboardList, Library, Map as MapIcon, Swords, Target, Trophy } from './icons'
import { cn } from './ui'
import { Button } from './ui/button'
import { translate } from '../i18n'
import { unlockBattleAudio } from './battleAudio'

/**
 * The **shared footer** of the preparation room — one `<footer>` landmark holding **two panels**, so
 * every action lives here, under the three panels of the main content.
 *
 * Panel 1 is the four **modes**, one equal column each (`grid-cols-4`), so they fill its width at any
 * window size: `Đấu Trường · Phiêu Lưu · Phòng tập · Bảng Xếp Hạng`. Panel 2 is the journey/next
 * action: `Nhiệm Vụ · Bộ Sưu Tập · Bản đồ · Đấu Cutie` (centre) `· tiến trình`.
 *
 * ⚠️ The footer is a **sibling of the main content**, not a child of it: `PrepScreen` returns the
 * panels block and this footer as two siblings of the page column.
 *
 * ⚠️ **Shop** and **Tháo hết** are *not* here: they sit on the floor of the Equipment panel
 * (`CutieLoadoutPanel`), under the items they act on.
 *
 * "Nhiệm Vụ", "Bộ Sưu Tập" and "Bảng Xếp Hạng" have no content yet, so they are shown **disabled** —
 * the layout stays intact without pretending the feature exists.
 */
export function ActionBar() {
	const run = useGameStore((state) => state.run)
	const startBattle = useGameStore((state) => state.startBattle)
	const trainingAttacks = useBattleSettingsStore((state) => state.trainingAttacks)
	const setTrainingAttacks = useBattleSettingsStore((state) => state.setTrainingAttacks)
	const openMap = useUiStore((state) => state.openMap)
	const stage = getStage(run.stage)
	const equippedCount = run.equipped.filter((item) => item.slot >= 0).length
	const canFight = equippedCount > 0
	const needItems = translate('Hãy mang ít nhất 1 món lên trang bị trước')

	return (
		<footer data-action-bar className="flex flex-col gap-2.5">
			{/*
			 * The four modes: **their own panel**, one column each at `xl`, so they split the bar evenly
			 * whatever the window width is. Training keeps its "enemy fights back" chip in its own cell.
			 */}
			<div
				data-action-bar-panel="modes"
				className="flex flex-wrap items-stretch gap-2.5 rounded-panel border border-line bg-ink-800/80 p-2.5 xl:grid xl:grid-cols-4"
			>
				<Button
					type="button"
					className="min-w-[160px] flex-1 justify-center"
					disabled={!canFight}
					onClick={() => {
						unlockBattleAudio()
						startBattle('pvp')
					}}
					title={canFight ? translate('Đấu với một đối thủ ngang sức để nhận Vàng') : needItems}
				>
					<Swords /> {translate('Đấu Trường')}
				</Button>

				<Button
					type="button"
					className="min-w-[160px] flex-1 justify-center"
					onClick={openMap}
					title={translate('Bản đồ hành trình')}
				>
					<MapIcon /> {translate('Phiêu Lưu')}
				</Button>

				{/*
				 * Training: **both sides are immortal** — the dummy's bar stays full, and so does the
				 * player's, so nothing at stake can distract from reading the build's own numbers. The
				 * chip only decides whether the dummy's one weapon swings; its words live in the `title`,
				 * so the cell keeps the row's height instead of losing a row to a caption.
				 */}
				<div className="flex min-w-[220px] flex-1 items-stretch gap-2">
					<Button
						type="button"
						data-training-start
						className="flex-1 justify-center whitespace-nowrap"
						disabled={!canFight}
						onClick={() => {
							unlockBattleAudio()
							startBattle('training', { attacks: trainingAttacks })
						}}
						title={
							canFight
								? translate('Đánh bù nhìn bất tử để đo sát thương, không mất gì')
								: needItems
						}
					>
						<Target /> {translate('Phòng tập')}
					</Button>
					<label
						className="shrink-0 justify-center px-2.5 hover:bg-ink-600"
						title={translate('Kẻ địch chỉ có 1 vũ khí: bật để nó đánh trả, tắt để nó đứng yên')}
					>
						<input
							type="checkbox"
							data-training-attacks
							aria-label={translate('Kẻ địch phản đòn')}
							className="size-3.5 accent-gold"
							checked={trainingAttacks}
							onChange={(event) => setTrainingAttacks(event.target.checked)}
						/>
					</label>
				</div>

				<Button
					type="button"
					className="min-w-[160px] flex-1 justify-center"
					disabled
					title={translate('{name} sẽ có ở bản sau.', { name: translate('Bảng Xếp Hạng') })}
				>
					<Trophy /> {translate('Bảng Xếp Hạng')}
				</Button>
			</div>

			{/* The journey row is its **own panel** too: left group / centre / right group, a 3-column grid
			    so Đấu Cutie stays **exactly** in the middle whatever each side carries. */}
			<div
				data-action-bar-panel="journey"
				className="flex flex-wrap items-stretch gap-2.5 rounded-panel border border-line bg-ink-800/80 p-2.5 xl:grid xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
			>
				<div className="flex min-w-0 flex-1 items-stretch gap-2.5">
					<Button
						type="button"
						className={cn('flex-1 justify-center')}
						disabled
						title={translate('{name} sẽ có ở bản sau.', { name: translate('Nhiệm Vụ') })}
					>
						<ClipboardList /> {translate('Nhiệm Vụ')}
					</Button>
					<Button
						type="button"
						className={cn('flex-1 justify-center')}
						disabled
						title={translate('{name} sẽ có ở bản sau.', { name: translate('Bộ Sưu Tập') })}
					>
						<Library /> {translate('Bộ Sưu Tập')}
					</Button>
					<Button type="button" className={cn('flex-1 justify-center')} onClick={openMap}>
						<MapIcon /> {translate('Bản đồ')}
					</Button>
				</div>

				{/* The primary action sits **in the middle of the bar**, where a thumb reaches it first. */}
				<Button
					type="button"
					variant="destructive"
					className="min-w-[200px] flex-1 text-base font-bold whitespace-nowrap"
					disabled={!canFight}
					onClick={() => {
						unlockBattleAudio()
						startBattle('stage')
					}}
					title={canFight ? translate('Đánh màn {stage}', { stage: stage.index }) : needItems}
				>
					<Swords /> {translate('Đấu Cutie')} · {translate('Màn {stage}', { stage: stage.index })}
				</Button>

				<div className="flex min-w-[150px] flex-1 flex-col justify-center gap-1 rounded-[10px] border border-line bg-black/25 px-3 py-2">
					<span className="text-[11px] text-muted">
						{translate('Tiến trình màn {cleared}/{total}', {
							cleared: run.clearedStage,
							total: FINAL_STAGE,
						})}
					</span>
					<span className="h-1.5 overflow-hidden rounded-full bg-black/60">
						<span
							className="block h-full rounded-full bg-linear-to-r from-gold to-gold-soft transition-[width] duration-300"
							style={{ width: `${Math.round((run.clearedStage / FINAL_STAGE) * 100)}%` }}
						/>
					</span>
				</div>
			</div>
		</footer>
	)
}
