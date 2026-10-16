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
	openMap: () => void
	closeMap: () => void
	openLogin: () => void
	closeLogin: () => void
}

export const useUiStore = create<UiStore>()((set) => ({
	mapOpen: false,
	loginOpen: false,
	openMap: () => set({ mapOpen: true }),
	closeMap: () => set({ mapOpen: false }),
	openLogin: () => set({ loginOpen: true }),
	closeLogin: () => set({ loginOpen: false }),
}))
