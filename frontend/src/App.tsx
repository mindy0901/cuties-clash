import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, type AnyRouter } from '@tanstack/react-router'
import { createQueryClient } from './api/queryClient'
import { appRouter } from './router'

const defaultQueryClient = createQueryClient()

export interface AppProps {
	/** Test truyền router riêng để mỗi ca có lịch sử điều hướng sạch. */
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
