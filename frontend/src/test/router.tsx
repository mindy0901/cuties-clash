/**
 * Router-aware rendering for tests.
 *
 * Why it is needed: since moving to TanStack Router, components call `useNavigate()` so they
 * **must** live inside a router — rendering one on its own throws.
 *
 * Two functions, two purposes:
 * - `renderInRouter` — **synchronous**. Only needs `useNavigate` to work, so it uses
 *   `RouterContextProvider` directly (not `RouterProvider`) and renders `ui` as a child.
 *   That way the grid/drag-and-drop tests do not have to become `async`.
 * - `renderApp` — **`async`**. Builds the whole real route tree to test navigation.
 *   ⚠️ `await` is required: `RouterProvider` renders **empty on the first pass** and only matches
 *   the route after `router.load()` resolves — without `await` the test only sees a blank page.
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
import type { Language } from '../i18n'
import { useLanguageStore } from '../i18n'

// jsdom does not install `window.scrollTo`, while TanStack Router calls it on every route change →
// jsdom prints a "Not implemented" warning for each navigation. Stubbed here because this module is
// always loaded before rendering in tests that use a router; page scrolling is meaningless in jsdom.
window.scrollTo = () => {}

/**
 * Renders the whole `App` at `path`. Must be `await`ed.
 *
 * Uses `createBrowserHistory` (not memory history) because the navigation tests read
 * `window.location.pathname` directly. The router reads the URL **when it is created**, so the
 * path must be set first — this function does that itself.
 *
 * Each call creates a fresh router and query client so state does not leak into the next test.
 */
export async function renderApp(path = '/', language: Language = 'vi'): Promise<RenderResult> {
	useLanguageStore.setState({ language })
	window.history.replaceState({}, '', path)
	const router = createRouter({ routeTree, history: createBrowserHistory(), scrollRestoration: false })
	await router.load()
	return render(<App router={router} queryClient={createQueryClient()} />)
}

/** Renders one component inside a router context — synchronous, only so it has `useNavigate`. */
export function renderInRouter(ui: ReactNode): RenderResult {
	useLanguageStore.setState({ language: 'vi' })
	const rootRoute = createRootRoute()
	const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null })
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		// jsdom has no `window.scrollTo` — disabled so test logs stay free of warnings.
		scrollRestoration: false,
	})
	return render(
		<QueryClientProvider client={createQueryClient()}>
			<RouterContextProvider router={router}>{ui}</RouterContextProvider>
		</QueryClientProvider>,
	)
}
