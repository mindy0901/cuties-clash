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
	openMap: () => void
	closeMap: () => void
	openLogin: () => void
	closeLogin: () => void
	openItem: (uid: string) => void
	closeItem: () => void
}

export const useUiStore = create<UiStore>()((set) => ({
	mapOpen: false,
	loginOpen: false,
	itemUid: null,
	openMap: () => set({ mapOpen: true }),
	closeMap: () => set({ mapOpen: false }),
	openLogin: () => set({ loginOpen: true }),
	closeLogin: () => set({ loginOpen: false }),
	openItem: (uid) => set({ itemUid: uid }),
	closeItem: () => set({ itemUid: null }),
}))
