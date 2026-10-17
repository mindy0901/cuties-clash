/**
 * localStorage access for the game save.
 *
 * Split out because two places need to know about it: `api/queries` (loading the server save) and
 * `AuthSync` (checking whether this device already has progress). The key must match `name` in
 * `gameStore`.
 */

/** localStorage key used by the zustand persist middleware for play progress. */
export const GAME_SAVE_KEY = 'martial-cutie-save'

/** Whether this device already has play progress (read straight from localStorage). */
export function hasLocalRun(): boolean {
	try {
		const raw = window.localStorage.getItem(GAME_SAVE_KEY)
		if (!raw) return false
		const parsed = JSON.parse(raw) as { state?: { run?: unknown } }
		return Boolean(parsed?.state?.run)
	} catch {
		return false
	}
}

/** Writes the server's progress into localStorage so zustand persist picks it up. */
export function writeLocalRun(run: unknown): void {
	const raw = window.localStorage.getItem(GAME_SAVE_KEY)
	let parsed: { state?: Record<string, unknown>; version?: number } = {}
	try {
		parsed = raw ? (JSON.parse(raw) as typeof parsed) : {}
	} catch {
		parsed = {}
	}
	window.localStorage.setItem(
		GAME_SAVE_KEY,
		JSON.stringify({ state: { ...(parsed.state ?? {}), run }, version: parsed.version ?? 1 }),
	)
}
