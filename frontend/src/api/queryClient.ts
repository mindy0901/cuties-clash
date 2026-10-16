import { QueryClient } from '@tanstack/react-query'

/**
 * Tuỳ chọn dùng chung cho mọi truy vấn API.
 *
 * Tách khỏi `App.tsx` để file đó chỉ export component (yêu cầu của Fast Refresh).
 *
 * `retry: false` là cố ý: backend chưa chạy thì phải biết ngay để còn chơi ẩn danh, không
 * bắt người chơi chờ ba lần thử lại mới thấy giao diện.
 */
export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
			mutations: { retry: false },
		},
	})
}
