import { create } from 'zustand'

/**
 * Trạng thái giao diện dùng chung giữa thanh trên và các màn hình.
 *
 * Vì sao không để trong component: `TopBar` nằm ở layout gốc còn nút mở bản đồ
 * nằm sâu trong `ActionBar` của phòng chuẩn bị. Với router, hai chỗ đó không còn
 * chung một component cha để truyền prop, nên trạng thái mở/đóng hộp thoại đặt ở đây.
 */
interface UiStore {
	mapOpen: boolean
	loginOpen: boolean
	/** `uid` của món đang mở **hộp thoại chi tiết**, `null` là đóng. */
	itemUid: string | null
	/**
	 * Bumped every time the **content overlay** changes (loaded, or an admin just saved).
	 *
	 * ⚠️ WHY THIS EXISTS: `getTemplate`/`getPet` read a module variable in `game/content.ts`, and
	 * React has no idea that variable changed. `__root` uses this number as the `key` of the
	 * content area, so new names and prices show up immediately instead of after a reload.
	 */
	contentVersion: number
	openMap: () => void
	closeMap: () => void
	openLogin: () => void
	closeLogin: () => void
	openItem: (uid: string) => void
	closeItem: () => void
	bumpContent: () => void
}

export const useUiStore = create<UiStore>()((set) => ({
	mapOpen: false,
	loginOpen: false,
	itemUid: null,
	contentVersion: 0,
	openMap: () => set({ mapOpen: true }),
	closeMap: () => set({ mapOpen: false }),
	openLogin: () => set({ loginOpen: true }),
	closeLogin: () => set({ loginOpen: false }),
	openItem: (uid) => set({ itemUid: uid }),
	closeItem: () => set({ itemUid: null }),
	bumpContent: () => set((state) => ({ contentVersion: state.contentVersion + 1 })),
}))
