/**
 * Render có ngữ cảnh router cho test.
 *
 * Vì sao cần: từ khi dùng TanStack Router, các component gọi `useNavigate()` nên **phải**
 * nằm trong một router — render lẻ sẽ ném lỗi.
 *
 * Hai hàm, hai mục đích:
 * - `renderInRouter` — **đồng bộ**. Chỉ cần `useNavigate` chạy được, nên dùng thẳng
 *   `RouterContextProvider` (không qua `RouterProvider`) và render `ui` làm con.
 *   Nhờ vậy test lưới/kéo-thả không phải đổi sang `async`.
 * - `renderApp` — **`async`**. Dựng cả cây route thật để kiểm tra điều hướng.
 *   ⚠️ Phải `await`: `RouterProvider` render **rỗng ở lần render đầu** rồi mới khớp route
 *   sau khi `router.load()` xong — không `await` thì test chỉ thấy trang trắng.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import {
	RouterContextProvider,
	createBrowserHistory,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from '@tanstack/react-router'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import App from '../App'
import { createQueryClient } from '../api/queryClient'
import { routeTree } from '../routeTree.gen'

// jsdom không cài `window.scrollTo`, còn TanStack Router gọi nó mỗi lần đổi route → jsdom in
// cảnh báo "Not implemented" cho từng lần điều hướng. Stub ở đây vì module này luôn được nạp
// trước khi render trong test có router; cuộn trang trong jsdom vốn không có ý nghĩa.
window.scrollTo = () => {}

/**
 * Render cả `App` tại `path`. Phải `await`.
 *
 * Dùng `createBrowserHistory` (không phải memory history) vì test điều hướng kiểm tra
 * thẳng `window.location.pathname`. Router đọc URL **lúc tạo**, nên đường dẫn phải được
 * đặt trước — hàm này tự làm việc đó.
 *
 * Mỗi lần gọi tạo router + query client mới để không rò trạng thái sang test sau.
 */
export async function renderApp(path = '/'): Promise<RenderResult> {
	window.history.replaceState({}, '', path)
	const router = createRouter({ routeTree, history: createBrowserHistory(), scrollRestoration: false })
	await router.load()
	return render(<App router={router} queryClient={createQueryClient()} />)
}

/** Render một component trong ngữ cảnh router — đồng bộ, chỉ để component có `useNavigate`. */
export function renderInRouter(ui: ReactNode): RenderResult {
	const rootRoute = createRootRoute()
	const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null })
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		// jsdom không có `window.scrollTo` — tắt để log test không đầy cảnh báo.
		scrollRestoration: false,
	})
	return render(
		<QueryClientProvider client={createQueryClient()}>
			<RouterContextProvider router={router}>{ui}</RouterContextProvider>
		</QueryClientProvider>,
	)
}
