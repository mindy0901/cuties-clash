/**
 * localStorage access for the game save.
 *
 * Split out because two places need to know about it: `api/queries` (loading the server save) and
 * `AuthSync` (checking whether this device already has progress). The key must match `name` in
 * `gameStore`.
 */

/** localStorage key used by the zustand persist middleware for play progress. */
export const GAME_SAVE_KEY = 'martial-cutie-save'

/**
 * Persist version of the save format (`gameStore` uses the same constant).
 *
 * ⚠️ WHY: `writeLocalRun` used to fall back to `1` when the browser had no save yet — exactly the
 * "continue on a new device" case — so zustand ran the **v1 → v2 migration** over a current run and
 * emptied Trang bị + Kho đồ. Whatever `writeLocalRun` writes is already the current shape.
 */
export const GAME_SAVE_VERSION = 3

/**
 * Which account the run in this browser **belongs to** (`u:<users.id>`), or absent when it is
 * progress from an anonymous session.
 *
 * ⚠️ WHY: `localStorage` is per **browser**, not per account, and signing out deliberately keeps the
 * run so anonymous play continues. Without this tag a second account on the same browser inherits
 * the previous player's run and pushes it into their own save.
 */
export const SAVE_OWNER_KEY = 'martial-cutie-save-owner'

/** The save-owner tag of an account. */
export function accountKey(userId: number): string {
	return `u:${userId}`
}

/** Which account the local run belongs to; `null` = anonymous progress. */
export function localRunOwner(): string | null {
	try {
		return window.localStorage.getItem(SAVE_OWNER_KEY)
	} catch {
		return null
	}
}

export function setLocalRunOwner(owner: string | null): void {
	try {
		if (owner) window.localStorage.setItem(SAVE_OWNER_KEY, owner)
		else window.localStorage.removeItem(SAVE_OWNER_KEY)
	} catch {
		// Ignore: localStorage may be blocked.
	}
}

/** Removes the local progress **and** its owner tag (recovery screen). */
export function clearLocalSave(): void {
	try {
		window.localStorage.removeItem(GAME_SAVE_KEY)
	} catch {
		// Ignore: localStorage may be blocked.
	}
	setLocalRunOwner(null)
}

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
	let parsed: { state?: Record<string, unknown> } = {}
	try {
		parsed = raw ? (JSON.parse(raw) as typeof parsed) : {}
	} catch {
		parsed = {}
	}
	window.localStorage.setItem(
		GAME_SAVE_KEY,
		JSON.stringify({ state: { ...(parsed.state ?? {}), run }, version: GAME_SAVE_VERSION }),
	)
}
