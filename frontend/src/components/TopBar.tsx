import { useNavigate } from '@tanstack/react-router'
import { useSessionState } from '../api/queries'
import { MAPS } from '../game/stages'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { AccountChip } from './AccountChip'
import { btnClass, btnGhostClass, btnSmClass, cn } from './ui'

function StatChip({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center gap-2 rounded-full border border-line bg-ink-700 px-3.5 py-1.5 tabular-nums">
			<span className="text-xs text-muted">{label}</span>
			<span className="font-bold text-gold-soft">{value}</span>
		</div>
	)
}

export function TopBar() {
	const run = useGameStore((state) => state.run)
	const newRun = useGameStore((state) => state.newRun)
	const openMap = useUiStore((state) => state.openMap)
	const { user } = useSessionState()
	const navigate = useNavigate()
	const mapIndex = Math.min(MAPS.length - 1, Math.floor((run.stage - 1) / 20))
	const map = MAPS[mapIndex]

	return (
		<header className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-linear-to-b from-gold/10 to-transparent bg-ink-800 px-3.5 py-3">
			<div className="mr-auto flex items-center gap-2.5">
				<div className="surface-brand grid size-10 place-items-center rounded-[10px] text-[22px] text-ink-900 shadow-[0_0_18px_rgb(217_162_39/35%)]">
					🐾
				</div>
				<div>
					<h1 className="text-lg">Martial Cutie — Đấu Trường Thú Cưng</h1>
					<small className="block text-xs text-muted">
						Auto-battler nuôi thú cưng · lấy cảm hứng từ event 武林萌主 của Naraka: Bladepoint
					</small>
				</div>
			</div>

			<StatChip label="Paw Tally" value={`${run.currency} 🐾`} />
			<StatChip label="Màn" value={`${run.stage}/60 · ${map.name}`} />
			<StatChip label="Đã qua" value={`${run.clearedStage}/60`} />

			<button type="button" className={cn(btnClass, btnSmClass)} onClick={openMap}>
				🗺️ Bản đồ
			</button>
			{/* Admin link only appears for accounts listed in `ADMIN_EMAILS`. */}
			{user?.is_admin ? (
				<button
					type="button"
					className={cn(btnClass, btnSmClass, btnGhostClass)}
					onClick={() => void navigate({ to: '/admin' })}
				>
					⚙ Quản trị
				</button>
			) : null}
			<button
				type="button"
				className={cn(btnClass, btnSmClass, btnGhostClass)}
				onClick={() => {
					if (window.confirm('Chơi lại từ đầu? Toàn bộ tiến trình hiện tại sẽ bị xoá.')) newRun()
				}}
			>
				Chơi lại
			</button>

			<AccountChip />
		</header>
	)
}
