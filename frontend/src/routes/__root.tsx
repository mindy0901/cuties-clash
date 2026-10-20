import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AuthSync } from '../components/AuthSync'
import { BattleScreen } from '../components/BattleScreen'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ContentSync } from '../components/ContentSync'
import { ItemDetailDialog } from '../components/ItemDetailDialog'
import { LoginDialog } from '../components/LoginDialog'
import { PrepScreen } from '../components/PrepScreen'
import { StageMapDialog } from '../components/StageMapDialog'
import { TopBar } from '../components/TopBar'
import { VictoryScreen } from '../components/VictoryScreen'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { cn } from '../lib/utils'
import { translate, useLanguageStore } from '../i18n'

/**
 * Shared frame for every screen: the top bar and the dialogs.
 *
 * ⚠️ During a battle (`battle` / `result`) the **battle screen** replaces `Outlet`, whichever URL
 * is open — a battle is not tied to a route.
 */
function RootLayout() {
	const language = useLanguageStore((state) => state.language)
	const phase = useGameStore((state) => state.phase)
	const pathname = useRouterState({ select: (state) => state.location.pathname })
	const mapOpen = useUiStore((state) => state.mapOpen)
	const loginOpen = useUiStore((state) => state.loginOpen)
	const itemUid = useUiStore((state) => state.itemUid)
	const itemPreview = useUiStore((state) => state.itemPreview)
	const restartOpen = useUiStore((state) => state.restartOpen)
	const closeMap = useUiStore((state) => state.closeMap)
	const closeLogin = useUiStore((state) => state.closeLogin)
	const closeItem = useUiStore((state) => state.closeItem)
	const closeRestart = useUiStore((state) => state.closeRestart)
	const contentVersion = useUiStore((state) => state.contentVersion)
	const newRun = useGameStore((state) => state.newRun)

	useEffect(() => {
		document.documentElement.lang = language
		document.title = translate('Cuties Clash')
	}, [language])

	// During a battle the battle screen is always shown, whichever URL is open.
	const inBattle = phase === 'battle' || phase === 'result'
	// The shop is a **full-screen board** (it carries its own title bar and gold), so the global
	// header is not drawn there — one chrome per screen, not two. It keeps the whole viewport height,
	// but the vertical gap is the **same as every other screen** (`pt-3.5 pb-3.5`): a wider one made the
	// shop look like a different app the moment you left the prep room.
	const bare = pathname.startsWith('/shop')

	return (
		<div
			className={cn(
				'mx-auto flex w-full max-w-[1640px] flex-col gap-3.5 px-[18px]',
				bare ? 'h-[100svh] gap-0 pt-3.5 pb-3.5' : 'min-h-screen pt-3.5 pb-3.5',
			)}
		>
			<AuthSync />
			<ContentSync />
			{bare ? null : <TopBar />}
			{/*
			 * `key` follows `contentVersion`: when the content overlay changes (first load, or an
			 * admin just saved) this subtree remounts so new names and prices appear right away. It
			 * only changes when content really changed, so normal play is unaffected.
			 */}
			<div className={inBattle ? 'flex min-h-0 flex-1 flex-col' : 'contents'} key={contentVersion}>
				{inBattle ? <BattleScreen /> : <Outlet />}
			</div>
			{phase === 'victory' ? <VictoryScreen /> : null}
			{mapOpen ? <StageMapDialog onClose={closeMap} /> : null}
			{loginOpen ? <LoginDialog onClose={closeLogin} /> : null}
			{itemUid ? <ItemDetailDialog uid={itemUid} preview={itemPreview} onClose={closeItem} /> : null}
			{/*
			 * One instance for both restart buttons (top bar and victory screen) — see `uiStore`.
			 * The message spells out what disappears: a vague "are you sure?" is what makes players
			 * click through without reading.
			 */}
			{restartOpen ? (
				<ConfirmDialog
					title={translate('Chơi lại từ đầu?')}
					message={translate(
						'Toàn bộ tiến trình hiện tại sẽ bị xoá: đồ đang mang, kho dự trữ, Vàng, số màn đã qua và thú đã mở khoá.',
					)}
					confirmLabel={translate('Xoá và chơi lại')}
					onConfirm={() => {
						closeRestart()
						newRun()
					}}
					onCancel={closeRestart}
				/>
			) : null}
		</div>
	)
}

/** Unknown paths still open the preparation room instead of a blank page. */
function NotFound() {
	return <PrepScreen />
}

export const Route = createRootRoute({
	component: RootLayout,
	notFoundComponent: NotFound,
})
