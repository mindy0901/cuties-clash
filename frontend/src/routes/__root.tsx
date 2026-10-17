import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AuthSync } from '../components/AuthSync'
import { BattleScreen } from '../components/BattleScreen'
import { ContentSync } from '../components/ContentSync'
import { ItemDetailDialog } from '../components/ItemDetailDialog'
import { LoginDialog } from '../components/LoginDialog'
import { PrepScreen } from '../components/PrepScreen'
import { ResultDialog } from '../components/ResultDialog'
import { StageMapDialog } from '../components/StageMapDialog'
import { Toasts } from '../components/Toasts'
import { TopBar } from '../components/TopBar'
import { VictoryScreen } from '../components/VictoryScreen'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'

/**
 * Shared frame for every screen: the top bar, the dialogs and the toasts.
 *
 * ⚠️ During a battle (`battle` / `result`) the **battle screen** replaces `Outlet`, whichever URL
 * is open — a battle is not tied to a route.
 */
function RootLayout() {
	const phase = useGameStore((state) => state.phase)
	const mapOpen = useUiStore((state) => state.mapOpen)
	const loginOpen = useUiStore((state) => state.loginOpen)
	const itemUid = useUiStore((state) => state.itemUid)
	const closeMap = useUiStore((state) => state.closeMap)
	const closeLogin = useUiStore((state) => state.closeLogin)
	const closeItem = useUiStore((state) => state.closeItem)
	const contentVersion = useUiStore((state) => state.contentVersion)

	// During a battle the battle screen is always shown, whichever URL is open.
	const inBattle = phase === 'battle' || phase === 'result'

	return (
		<div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-3.5 px-[18px] pt-3.5 pb-10">
			<AuthSync />
			<ContentSync />
			<TopBar />
			{/*
			 * `key` follows `contentVersion`: when the content overlay changes (first load, or an
			 * admin just saved) this subtree remounts so new names and prices appear right away. It
			 * only changes when content really changed, so normal play is unaffected.
			 */}
			<div className="contents" key={contentVersion}>
				{inBattle ? <BattleScreen /> : <Outlet />}
			</div>
			{phase === 'result' ? <ResultDialog /> : null}
			{phase === 'victory' ? <VictoryScreen /> : null}
			{mapOpen ? <StageMapDialog onClose={closeMap} /> : null}
			{loginOpen ? <LoginDialog onClose={closeLogin} /> : null}
			{itemUid ? <ItemDetailDialog uid={itemUid} onClose={closeItem} /> : null}
			<Toasts />
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
