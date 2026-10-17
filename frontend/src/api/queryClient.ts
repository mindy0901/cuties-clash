import { QueryClient } from '@tanstack/react-query'

/**
 * Shared options for every API query.
 *
 * Kept out of `App.tsx` so that file only exports a component (a Fast Refresh requirement).
 *
 * `retry: false` is intentional: when the backend is not running the client must know right away
 * so it can fall back to anonymous play, instead of making the player wait through three retries
 * before seeing the UI.
 */
export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
			mutations: { retry: false },
		},
	})
}
