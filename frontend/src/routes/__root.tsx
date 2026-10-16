import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AuthSync } from '../components/AuthSync'
import { BattleScreen } from '../components/BattleScreen'
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
 * Khung chung của mọi màn hình: thanh trên, các hộp thoại và thông báo.
 *
 * ⚠️ Trong trận (`battle` / `result`) thì hiện **màn đấu** thay cho `Outlet`, bất kể
 * đang ở đường dẫn nào — trận đấu không gắn với một route.
 */
function RootLayout() {
	const phase = useGameStore((state) => state.phase)
	const mapOpen = useUiStore((state) => state.mapOpen)
	const loginOpen = useUiStore((state) => state.loginOpen)
	const itemUid = useUiStore((state) => state.itemUid)
	const closeMap = useUiStore((state) => state.closeMap)
	const closeLogin = useUiStore((state) => state.closeLogin)
	const closeItem = useUiStore((state) => state.closeItem)

	// Trong trận thì luôn hiện màn đấu, bất kể đang ở đường dẫn nào.
	const inBattle = phase === 'battle' || phase === 'result'

	return (
		<div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col gap-3.5 px-[18px] pt-3.5 pb-10">
			<AuthSync />
			<TopBar />
			{inBattle ? <BattleScreen /> : <Outlet />}
			{phase === 'result' ? <ResultDialog /> : null}
			{phase === 'victory' ? <VictoryScreen /> : null}
			{mapOpen ? <StageMapDialog onClose={closeMap} /> : null}
			{loginOpen ? <LoginDialog onClose={closeLogin} /> : null}
			{itemUid ? <ItemDetailDialog uid={itemUid} onClose={closeItem} /> : null}
			<Toasts />
		</div>
	)
}

/** Đường dẫn lạ vẫn cho vào phòng chuẩn bị, không hiện trang trắng. */
function NotFound() {
	return <PrepScreen />
}

export const Route = createRootRoute({
	component: RootLayout,
	notFoundComponent: NotFound,
})
