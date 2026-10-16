import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/**
 * Router của ứng dụng. Cây route sinh tự động từ `src/routes/` (xem vite.config.ts).
 *
 * ⚠️ Đường dẫn URL là **nguồn sự thật** của màn hình đang mở. ❌ Không lưu màn hình
 * trong store nữa — làm vậy sẽ có hai nguồn và chúng lệch nhau.
 */
export const appRouter = createRouter({
	routeTree,
	// Không cần khôi phục vị trí cuộn: mỗi màn hình đều vừa một khung nhìn.
	scrollRestoration: false,
})

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof appRouter
	}
}
