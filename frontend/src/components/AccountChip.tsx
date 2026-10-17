import { useLogout, usePushRun, useSessionState } from '../api/queries'
import { useUiStore } from '../store/uiStore'
import { btnClass, btnGhostClass, btnSmClass, cn } from './ui'

const SYNC_TEXT = {
	idle: '',
	syncing: 'Đang đồng bộ…',
	synced: 'Đã đồng bộ',
	error: 'Lỗi đồng bộ',
} as const

const SYNC_TONE = {
	idle: 'text-muted',
	syncing: 'text-se',
	synced: 'text-jade',
	error: 'text-danger-soft',
} as const

type SyncTone = keyof typeof SYNC_TEXT

/** Top-right corner of the top bar: login state, sync state and the logout button. */
export function AccountChip() {
	const { user, loading, unavailable } = useSessionState()
	const push = usePushRun()
	const logout = useLogout()
	const openLogin = useUiStore((state) => state.openLogin)

	if (loading) {
		return <span className="text-xs text-muted">Đang kiểm tra…</span>
	}

	if (!user) {
		return (
			<button
				type="button"
				className={cn(btnClass, btnSmClass)}
				onClick={openLogin}
				title={unavailable ? 'Không kết nối được máy chủ đăng nhập' : undefined}
			>
				👤 Đăng nhập
			</button>
		)
	}

	// The sync state is **derived** from the save-push mutation — it needs no state of its own.
	const tone: SyncTone = push.isError ? 'error' : push.isPending ? 'syncing' : push.isSuccess ? 'synced' : 'idle'
	const syncError = push.error instanceof Error ? push.error.message : null

	return (
		<div className="flex items-center gap-2 rounded-full border border-line bg-ink-700 px-2 py-1">
			{user.avatar_url ? (
				<img src={user.avatar_url} alt="" className="size-7 rounded-full border border-line object-cover" />
			) : (
				<span className="grid size-7 place-items-center rounded-full bg-ink-600 text-sm" aria-hidden="true">
					{user.display_name.slice(0, 1).toUpperCase()}
				</span>
			)}
			<span className="flex flex-col leading-tight">
				<span className="max-w-[160px] truncate text-[13px] font-semibold">{user.display_name}</span>
				<span className={cn('text-[11px]', SYNC_TONE[tone])} title={syncError ?? undefined}>
					{SYNC_TEXT[tone]}
				</span>
			</span>
			<button
				type="button"
				className={cn(btnClass, btnSmClass, btnGhostClass)}
				onClick={() => logout.mutate()}
				title="Đăng xuất khỏi tài khoản này"
			>
				Thoát
			</button>
		</div>
	)
}
