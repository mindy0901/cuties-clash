import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSessionState } from '../api/queries'
import { MAPS } from '../game/stages'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { AccountChip } from './AccountChip'
import { Settings, Swords } from './icons'
import { GoldPill } from './GoldPill'
import { cn } from './ui'
import { Button } from './ui/button'
import { translate, useLanguageStore } from '../i18n'

function StatChip({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="flex items-center gap-2 rounded-full border border-line bg-ink-700 px-3.5 py-1.5 tabular-nums">
			<span className="text-xs text-muted">{label}</span>
			<span className="inline-flex items-center gap-1 font-bold text-gold-soft">{value}</span>
		</div>
	)
}

export function TopBar() {
	const run = useGameStore((state) => state.run)
	const phase = useGameStore((state) => state.phase)
	const leaveBattle = useGameStore((state) => state.leaveBattle)
	// Restarting wipes the whole run, so the button asks first — the dialog lives in the root layout.
	const openRestart = useUiStore((state) => state.openRestart)
	const { user } = useSessionState()
	const language = useLanguageStore((state) => state.language)
	const setLanguage = useLanguageStore((state) => state.setLanguage)
	const navigate = useNavigate()
	const mapIndex = Math.min(MAPS.length - 1, Math.floor((run.stage - 1) / 20))
	const map = MAPS[mapIndex]

	return (
		<header className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-linear-to-b from-gold/10 to-transparent bg-ink-800 px-3.5 py-3">
			<div className="mr-auto flex items-center gap-2.5">
				<div className="surface-brand grid size-10 place-items-center rounded-[10px] text-[22px] text-ink-900 shadow-[0_0_18px_rgb(217_162_39/35%)]">
					<Swords />
				</div>
				<div>
					<h1 className="text-lg">{translate('Cuties Clash')}</h1>
					<small className="block text-xs text-muted">
						{translate('Chọn Cutie, sắp xếp trang bị và chiến đấu với quái vật')}
					</small>
				</div>
			</div>

			<div
				className="inline-flex rounded-full border border-line bg-ink-700 p-0.5"
				aria-label={translate('Ngôn ngữ')}
			>
				{(['en', 'vi'] as const).map((value) => (
					<button
						key={value}
						type="button"
						aria-pressed={language === value}
						aria-label={value === 'en' ? 'English' : 'Tiếng Việt'}
						className={cn(
							'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
							language === value ? 'bg-gold text-ink-900' : 'text-muted hover:text-paper',
						)}
						onClick={() => setLanguage(value)}
					>
						{value.toUpperCase()}
					</button>
				))}
			</div>

			<GoldPill amount={run.gold} />
			<StatChip label={translate('Màn')} value={`${run.stage}/60 · ${translate(map.name)}`} />
			{/* Admin link only appears for accounts listed in `ADMIN_EMAILS`. */}
			{user?.is_admin ? (
				<Button
					type="button"
					variant="ghost" size="sm"
					onClick={() => {
						if (phase === 'battle' || phase === 'result') leaveBattle()
						void navigate({ to: '/admin' })
					}}
				>
					<Settings /> {translate('Quản trị')}
				</Button>
			) : null}
			<Button
				type="button"
				variant="ghost" size="sm"
				onClick={openRestart}
			>
				{translate('Chơi lại')}
			</Button>

			<AccountChip />
		</header>
	)
}
