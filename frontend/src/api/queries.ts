/**
 * Truy vấn & mutation cho API backend (TanStack Query).
 *
 * ⚠️ Phạm vi có chủ ý: TanStack Query chỉ lo **dữ liệu đến từ máy chủ** (phiên đăng nhập,
 * bản lưu). Trạng thái chơi vẫn nằm ở `gameStore` (zustand + localStorage) — đó là nguồn
 * sự thật của tiến trình, không phải cache của máy chủ. Trộn hai thứ vào nhau sẽ làm mất
 * khả năng chơi ẩn danh.
 */
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, type ApiSave, type ApiSession, type ApiUser } from './client'
import { pullRun, pushRun, type RevisionHolder } from './saveSync'
import { useGameStore } from '../store/gameStore'
import { writeLocalRun } from '../store/persistedSave'

export const sessionKey = ['session'] as const
export const saveKey = ['save'] as const
export const contentKey = ['content'] as const
export const adminContentKey = ['admin-content'] as const

export function useSession() {
	return useQuery({ queryKey: sessionKey, queryFn: () => api.session() })
}

/**
 * Game content overlay.
 *
 * ⚠️ A network failure is **not** an incident: the game runs on the templates in code, so this
 * query does not retry and never surfaces an error to the player — it just means no admin edits.
 */
export function useContent() {
	return useQuery({ queryKey: contentKey, queryFn: () => api.content(), retry: false })
}

/** Overridden rows (with author) — only called for admin accounts. */
export function useAdminContent(enabled: boolean) {
	return useQuery({
		queryKey: adminContentKey,
		queryFn: () => api.adminContent(),
		enabled,
		retry: false,
	})
}

/** Save one entity and reload the overlay for the whole game. */
export function useSaveContent() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { kind: 'item' | 'pet'; id: string; payload: Record<string, unknown> }) =>
			api.putContent(input.kind, input.id, input.payload),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: adminContentKey })
			await queryClient.invalidateQueries({ queryKey: contentKey })
		},
	})
}

/** Deleting the override of one entity returns it to the default. */
export function useResetContent() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { kind: 'item' | 'pet'; id: string }) => api.deleteContent(input.kind, input.id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: adminContentKey })
			await queryClient.invalidateQueries({ queryKey: contentKey })
		},
	})
}

export interface SessionState {
	loading: boolean
	/** ❌ Không gọi được máy chủ (backend chưa chạy / mất mạng) — khác hẳn "chưa cấu hình OAuth". */
	unavailable: boolean
	user: ApiUser | null
	/** Nhà cung cấp đã cấu hình đủ key ở backend. */
	availableProviders: string[]
	/** Backend yêu cầu tự chuyển hướng sang nhà cung cấp khi chưa đăng nhập. */
	autoLogin: boolean
	/** Gọi lại lời kiểm tra phiên. */
	retry: () => void
}

/**
 * Phiên đăng nhập đã chuẩn hoá cho UI. Máy chủ lỗi ⇒ coi như chơi ẩn danh.
 *
 * ⚠️ Phân biệt `unavailable` với "chưa cấu hình": cùng cho ra `availableProviders` rỗng nhưng
 * nguyên nhân khác nhau, và hướng dẫn cho người dùng cũng khác nhau.
 */
export function useSessionState(): SessionState {
	const { data, isPending, isError, refetch } = useSession()
	// Giữ danh tính của `retry` ổn định: nếu đổi mỗi lần render thì effect của `AuthSync`
	// sẽ chạy lại liên tục.
	const retry = useCallback(() => {
		void refetch()
	}, [refetch])
	return {
		loading: isPending,
		unavailable: isError,
		user: data?.authenticated ? data.user : null,
		availableProviders: data?.available_providers ?? [],
		autoLogin: data?.auto_login ?? false,
		retry,
	}
}

/** Revision của bản lưu lấy từ cache của TanStack Query. */
function revisionHolder(queryClient: QueryClient): RevisionHolder {
	return {
		get: () => queryClient.getQueryData<ApiSave>(saveKey)?.revision ?? 0,
		set: (revision) =>
			queryClient.setQueryData<ApiSave>(saveKey, (old) => ({
				run: old?.run ?? null,
				revision,
				updated_at: old?.updated_at ?? null,
			})),
	}
}

/** Đẩy tiến trình hiện tại lên máy chủ. */
export function usePushRun() {
	const queryClient = useQueryClient()
	return useMutation({ mutationFn: (run: unknown) => pushRun(run, revisionHolder(queryClient)) })
}

/**
 * Nạp bản lưu từ máy chủ vào game, **ghi đè** tiến trình đang có.
 *
 * Chỉ gọi khi máy này chưa có tiến trình nào (chơi tiếp trên máy mới). ❌ Không gọi trong
 * luồng đồng bộ thường — làm vậy sẽ nạp bản cũ đè lên thay đổi mới.
 */
export function usePullRemoteSave() {
	const queryClient = useQueryClient()
	return useCallback(
		() =>
			pullRun({
				revision: revisionHolder(queryClient),
				writeRun: writeLocalRun,
				rehydrate: async () => {
					await useGameStore.persist.rehydrate()
				},
			}),
		[queryClient],
	)
}

export function useLogout() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: () => api.logout(),
		onSettled: () => {
			// Máy chủ lỗi thì phía client vẫn phải quên phiên.
			queryClient.setQueryData<ApiSession>(sessionKey, (old) =>
				old ? { ...old, authenticated: false, user: null } : old,
			)
			queryClient.removeQueries({ queryKey: saveKey })
		},
	})
}
