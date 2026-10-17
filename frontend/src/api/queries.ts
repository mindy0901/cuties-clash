/**
 * Queries and mutations for the backend API (TanStack Query).
 *
 * ⚠️ The scope is deliberate: TanStack Query only handles **data coming from the server** (login
 * session, save). Play state still lives in `gameStore` (zustand + localStorage) — that is the
 * source of truth for progress, not a server cache. Mixing the two would break anonymous play.
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

/**
 * Upload a picture for one item/pet.
 *
 * The overlay is refetched right after, so the new URL (with its version) reaches every screen —
 * and every player — without a reload.
 */
export function useUploadArt() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { kind: 'item' | 'pet'; id: string; png: Blob }) =>
			api.uploadArt(input.kind, input.id, input.png),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: adminContentKey })
			await queryClient.invalidateQueries({ queryKey: contentKey })
		},
	})
}

/** Remove the uploaded picture of one entity. */
export function useDeleteArt() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: { kind: 'item' | 'pet'; id: string }) => api.deleteArt(input.kind, input.id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: adminContentKey })
			await queryClient.invalidateQueries({ queryKey: contentKey })
		},
	})
}

export interface SessionState {
	loading: boolean
	/** ❌ The server cannot be reached (backend not running / offline) — quite different from "OAuth not configured". */
	unavailable: boolean
	user: ApiUser | null
	/** Providers that have complete keys configured in the backend. */
	availableProviders: string[]
	/** Backend asks the client to redirect to the provider when signed out. */
	autoLogin: boolean
	/** Retries the session check. */
	retry: () => void
}

/**
 * The login session, normalized for the UI. A failing server ⇒ treated as anonymous play.
 *
 * ⚠️ `unavailable` must be distinguished from "not configured": both leave
 * `availableProviders` empty but the causes differ, and so does the guidance for the user.
 */
export function useSessionState(): SessionState {
	const { data, isPending, isError, refetch } = useSession()
	// Keep `retry`'s identity stable: if it changed on every render, the `AuthSync` effect
	// would re-run endlessly.
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

/** Save revision taken from the TanStack Query cache. */
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

/** Pushes the current progress to the server. */
export function usePushRun() {
	const queryClient = useQueryClient()
	return useMutation({ mutationFn: (run: unknown) => pushRun(run, revisionHolder(queryClient)) })
}

/**
 * Loads the server save into the game, **overwriting** the progress on this device.
 *
 * Only called when this device has no progress yet (continuing on a new device). ❌ Do not call it
 * in the normal sync flow — that would load an older save over newer changes.
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
			// Even if the server fails, the client still has to forget the session.
			queryClient.setQueryData<ApiSession>(sessionKey, (old) =>
				old ? { ...old, authenticated: false, user: null } : old,
			)
			queryClient.removeQueries({ queryKey: saveKey })
		},
	})
}
