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

export function useSession() {
	return useQuery({ queryKey: sessionKey, queryFn: () => api.session() })
}

export interface SessionState {
	loading: boolean
	user: ApiUser | null
	/** Nhà cung cấp đã cấu hình đủ key ở backend. */
	availableProviders: string[]
	/** Backend yêu cầu tự chuyển hướng sang nhà cung cấp khi chưa đăng nhập. */
	autoLogin: boolean
}

/** Phiên đăng nhập đã chuẩn hoá cho UI. Máy chủ lỗi ⇒ coi như chơi ẩn danh. */
export function useSessionState(): SessionState {
	const { data, isPending } = useSession()
	return {
		loading: isPending,
		user: data?.authenticated ? data.user : null,
		availableProviders: data?.available_providers ?? [],
		autoLogin: data?.auto_login ?? false,
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
