import { useEffect, useRef } from 'react'
import { api } from '../api/client'
import { usePullRemoteSave, usePushRun, useSessionState } from '../api/queries'
import { useGameStore } from '../store/gameStore'
import { accountKey, hasLocalRun, localRunOwner, setLocalRunOwner } from '../store/persistedSave'

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

	// `push` is kept in a ref instead of becoming a dependency of the effect below: otherwise every
	// mutation state change would reset the debounce timer and the push might never run.
	const pushRef = useRef(push)
	useEffect(() => {
		pushRef.current = push
	}, [push])

	/**
	 * ⚠️ The `pushedRef` guard: compares the pushed progress content with the current content.
	 *
	 * Without this guard every successful push changes the store → the effect runs again →
	 * **an endless PUT loop**. That loop really happened once, with logs alternating 200/400.
	 */
	const pushedRef = useRef<string | null>(null)

	/**
	 * Resolves **which run this browser plays with**, once per login session.
	 *
	 * `localStorage` belongs to the browser, not to the account, so the run it holds may belong to
	 * someone else. The owner tag decides:
	 * - the same account (or **anonymous** progress, which follows the player into the account):
	 *   the local run wins, exactly like before — it is the primary source;
	 * - **another account's run**: it is never pushed into this account. The account's own save is
	 *   loaded, and a brand-new account starts a fresh run instead of inheriting it.
	 *
	 * ⚠️ The owner tag is written only once the run really belongs to the account — writing it
	 * before a pull that then fails would make the next page load treat a foreign run as ours.
	 */
	const syncedRef = useRef(false)
	/** False until the run on screen really belongs to the signed-in account (see below). */
	const readyRef = useRef(false)

	// Marks the run as this account's. `seed` = it came from the server (or was created fresh), so it
	// must not be echoed straight back as a PUT.
	const adoptRun = (owner: string, seed: boolean) => {
		if (seed) pushedRef.current = JSON.stringify(useGameStore.getState().run)
		readyRef.current = true
		setLocalRunOwner(owner)
	}

	useEffect(() => {
		if (loading || !user || syncedRef.current) return
		syncedRef.current = true
		const owner = accountKey(user.id)

		// No progress on this device: take the account's copy (continuing on a new device).
		if (!hasLocalRun()) {
			void pullRemoteSave()
				.then(() => adoptRun(owner, true))
				.catch((error) => console.warn('[Martial Cutie] could not load the save:', error))
			return
		}

		const localOwner = localRunOwner()
		if (localOwner !== null && localOwner !== owner) {
			// The run in this browser belongs to another account: never push it here.
			void pullRemoteSave()
				.then((applied) => {
					if (!applied) useGameStore.getState().newRun()
					adoptRun(owner, true)
				})
				.catch((error) => console.warn('[Martial Cutie] could not load the save:', error))
			return
		}

		// Anonymous progress, or the same account coming back: localStorage stays the source.
		adoptRun(owner, false)
	}, [loading, user, pullRemoteSave])

	/**
	 * Signing out must re-open the decision above: the next account may be a different one.
	 * (Today a sign-in always reloads the page, but the code must not depend on that.)
	 */
	useEffect(() => {
		if (user) return
		syncedRef.current = false
		pushedRef.current = null
		readyRef.current = false
	}, [user])

	// Read the login outcome the backend redirected back with, then clean the query string.
	// It must run before the auto-login effect below so it does not redirect again.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const outcome = params.get('login')
		if (!outcome) return
		if (outcome !== 'ok') console.warn('[Martial Cutie] sign-in failed:', params.get('message') ?? outcome)
		params.delete('login')
		params.delete('message')
		const query = params.toString()
		window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
	}, [])

	useEffect(() => {
		if (loading || user || !autoLogin) return
		const provider = availableProviders[0]
		if (!provider) return
		if (window.sessionStorage.getItem(AUTO_LOGIN_GUARD)) return
		window.sessionStorage.setItem(AUTO_LOGIN_GUARD, '1')
		window.location.assign(api.loginUrl(provider))
	}, [loading, user, autoLogin, availableProviders])

	useEffect(() => {
		if (!user || !readyRef.current) return
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
