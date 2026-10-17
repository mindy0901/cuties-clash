import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

/**
 * The application router. The route tree is generated from `src/routes/` (see vite.config.ts).
 *
 * ⚠️ The URL is the **source of truth** for which screen is open. ❌ The screen is no longer kept
 * in the store — that would create two sources, and they would drift apart.
 */
export const appRouter = createRouter({
	routeTree,
	// No need to restore scroll position: every screen fits in one viewport.
	scrollRestoration: false,
})

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof appRouter
	}
}
