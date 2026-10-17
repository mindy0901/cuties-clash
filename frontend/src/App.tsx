import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, type AnyRouter } from '@tanstack/react-router'
import { createQueryClient } from './api/queryClient'
import { appRouter } from './router'

const defaultQueryClient = createQueryClient()

export interface AppProps {
	/** Tests pass their own router so each case has a clean navigation history. */
	router?: AnyRouter
	queryClient?: QueryClient
}

export default function App({ router = appRouter, queryClient = defaultQueryClient }: AppProps = {}) {
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	)
}
