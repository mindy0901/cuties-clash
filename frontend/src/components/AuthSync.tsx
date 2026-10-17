import { useEffect, useRef } from 'react'
import { api } from '../api/client'
import { usePullRemoteSave, usePushRun, useSessionState } from '../api/queries'
import { useGameStore } from '../store/gameStore'
import { hasLocalRun } from '../store/persistedSave'

/** How long to wait after the last change before pushing to the server, to avoid hammering the API. */
const PUSH_DEBOUNCE_MS = 1500

/**
 * Loop guard for auto-login mode. It lives in `sessionStorage` (not localStorage) so a new tab
 * still gets taken to the login page, while a tab that already tried never tries again —
 * avoiding an endless loop when login fails.
 */
const AUTO_LOGIN_GUARD = 'martial-cutie-auto-login-attempted'

/**
 * The bridge between the game and the backend:
 * 1. pull the server save when signing in on a device with no progress,
 * 2. read the login outcome from the query string,
 * 3. push progress to the server once signed in (localStorage stays the source of truth),
 * 4. redirect to Google by itself when the backend enables AUTO_LOGIN and the guest is signed out.
 */
export function AuthSync() {
	const { user, loading, autoLogin, availableProviders } = useSessionState()
	const pullRemoteSave = usePullRemoteSave()
	const { mutate: push } = usePushRun()
	const run = useGameStore((state) => state.run)
	const pushToast = useGameStore((state) => state.pushToast)

	// `push` is kept in a ref instead of becoming a dependency of the effect below: otherwise every
	// mutation state change would reset the debounce timer and the push might never run.
	const pushRef = useRef(push)
	useEffect(() => {
		pushRef.current = push
	}, [push])

	// Playing on a new device: when this device has no progress yet, take the server save.
	// Runs once per login session, and ❌ does not run when the device already has progress.
	const pulledRef = useRef(false)
	useEffect(() => {
		if (loading || !user || pulledRef.current) return
		pulledRef.current = true
		if (hasLocalRun()) return
		void pullRemoteSave()
	}, [loading, user, pullRemoteSave])

	// Read the login outcome the backend redirected back with, then clean the query string.
	// It must run before the auto-login effect below so it does not redirect again.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const outcome = params.get('login')
		if (!outcome) return
		if (outcome === 'ok') {
			pushToast('Đăng nhập thành công — tiến trình sẽ được đồng bộ.', 'good')
		} else {
			pushToast(params.get('message') ?? 'Đăng nhập thất bại.', 'bad')
		}
		params.delete('login')
		params.delete('message')
		const query = params.toString()
		window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
	}, [pushToast])

	useEffect(() => {
		if (loading || user || !autoLogin) return
		const provider = availableProviders[0]
		if (!provider) return
		if (window.sessionStorage.getItem(AUTO_LOGIN_GUARD)) return
		window.sessionStorage.setItem(AUTO_LOGIN_GUARD, '1')
		window.location.assign(api.loginUrl(provider))
	}, [loading, user, autoLogin, availableProviders])

	/**
	 * ⚠️ The `pushedRef` guard: compares the pushed progress content with the current content.
	 *
	 * Without this guard every successful push changes the store → the effect runs again →
	 * **an endless PUT loop**. That loop really happened once, with logs alternating 200/400.
	 */
	const pushedRef = useRef<string | null>(null)
	useEffect(() => {
		if (!user) return
		const snapshot = JSON.stringify(run)
		if (pushedRef.current === snapshot) return
		const timer = window.setTimeout(() => {
			pushedRef.current = snapshot
			pushRef.current(run)
		}, PUSH_DEBOUNCE_MS)
		return () => window.clearTimeout(timer)
	}, [user, run])

	return null
}
