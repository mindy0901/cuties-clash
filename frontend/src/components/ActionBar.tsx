import { useGameStore } from '../store/gameStore'
import { useBattleSettingsStore } from '../store/battleSettingsStore'
import { useUiStore } from '../store/uiStore'
import { ClipboardList, Library, Map as MapIcon, Swords, Target, Trophy } from './icons'
import { Button } from './ui/button'
import { translate } from '../i18n'
import { unlockBattleAudio } from './battleAudio'

/**
 * The **shared footer** of the preparation room — one `<footer>` landmark holding **two panels**, so
 * every action lives here, under the three panels of the main content.
 *
 * Panel 1 is the four **modes**, one equal column each (`grid-cols-4`), so they fill its width at any
 * window size: `Đấu Trường · Phiêu Lưu · Phòng tập · Bảng Xếp Hạng`. Panel 2 is what is left of the
 * journey actions: `Nhiệm Vụ · Bộ Sưu Tập`.
 *
 * ⚠️ **The fight button and the progress bar are not here any more** — they live inside the
 * **Adventure dialog** (`StageMapDialog`), where the stage is chosen, so the map owns "pick a stage,
 * then fight it" in one place.
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
	const openMap = useUiStore((state) => state.openMap)
	const equippedCount = run.equipped.filter((item) => item.slot >= 0).length
	const canFight = equippedCount > 0
	const needItems = translate('Hãy mang ít nhất 1 món lên trang bị trước')

	return (
		<footer data-action-bar className="flex flex-col gap-2.5">
			{/*
			 * The four modes: **their own panel**, one column each at `xl`, so they split the bar evenly
			 * whatever the window width is.
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
				 * player's, so nothing at stake can distract from reading the build's own numbers.
				 * Whether its one weapon swings is the remembered setting (`trainingAttacks`); the
				 * switch that changes it lives **inside the practice fight**, so it is not repeated
				 * here.
				 */}
				<Button
					type="button"
					data-training-start
					className="min-w-[160px] flex-1 justify-center"
					disabled={!canFight}
					onClick={() => {
						unlockBattleAudio()
						startBattle('training', { attacks: trainingAttacks })
					}}
					title={
						canFight ? translate('Đánh bù nhìn bất tử để đo sát thương, không mất gì') : needItems
					}
				>
					<Target /> {translate('Phòng tập')}
				</Button>

				<Button
					type="button"
					className="min-w-[160px] flex-1 justify-center"
					disabled
					title={translate('{name} sẽ có ở bản sau.', { name: translate('Bảng Xếp Hạng') })}
				>
					<Trophy /> {translate('Bảng Xếp Hạng')}
				</Button>
			</div>

			{/* The journey panel keeps the two entries that have no feature behind them yet. The fight
			    button and the progress bar moved into the Adventure dialog (`StageMapDialog`). */}
			<div
				data-action-bar-panel="journey"
				className="flex flex-wrap items-stretch gap-2.5 rounded-panel border border-line bg-ink-800/80 p-2.5"
			>
				<Button
					type="button"
					className="min-w-[160px] flex-1 justify-center"
					disabled
					title={translate('{name} sẽ có ở bản sau.', { name: translate('Nhiệm Vụ') })}
				>
					<ClipboardList /> {translate('Nhiệm Vụ')}
				</Button>
				<Button
					type="button"
					className="min-w-[160px] flex-1 justify-center"
					disabled
					title={translate('{name} sẽ có ở bản sau.', { name: translate('Bộ Sưu Tập') })}
				>
					<Library /> {translate('Bộ Sưu Tập')}
				</Button>
			</div>
		</footer>
	)
}
