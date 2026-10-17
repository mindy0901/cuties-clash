/**
 * Save synchronization with the server — pure logic, **kept out of React** so it can be tested
 * directly.
 *
 * ⚠️ Three bugs happened here before, all three causing repeated 400s (see AGENTS.md §4.4). Read
 * carefully before changing:
 *
 * 1. On `revision_conflict`, **loading the server save on top** loses the change just made and
 *    conflicts again next time. Correct: fetch the new revision → PUT **your own data** again →
 *    retry **exactly once**.
 * 2. Loading the server save and recording the revision **after** writing localStorage makes the
 *    push right after use a stale revision → conflict. The revision must be recorded **first**.
 * 3. Pushing on every render → an endless PUT loop. The `pushedRef` guard lives in `AuthSync`.
 */
import { ApiError, api } from './client'

/** Holds the known revision of the save. */
export interface RevisionHolder {
	get(): number
	set(revision: number): void
}

/**
 * Pushes progress to the server.
 *
 * Returns the new revision. Throws when it fails (including when the retry after a conflict also
 * fails) — ❌ it never retries forever.
 */
export async function pushRun(run: unknown, revision: RevisionHolder): Promise<number> {
	try {
		const saved = await api.putSave(run as Record<string, unknown>, revision.get())
		revision.set(saved.revision)
		return saved.revision
	} catch (error) {
		if (!(error instanceof ApiError) || error.code !== 'revision_conflict') throw error

		// Another device just wrote. Fetch the new revision and retry **once** with our own progress.
		const remote = await api.getSave()
		const saved = await api.putSave(run as Record<string, unknown>, remote.revision)
		revision.set(saved.revision)
		return saved.revision
	}
}

export interface PullTargets {
	revision: RevisionHolder
	/** Writes the server's progress into localStorage. */
	writeRun(run: unknown): void
	/** Rehydrates the store from localStorage. */
	rehydrate(): Promise<void>
}

/**
 * Loads the save from the server. Returns `false` when the server has no save yet.
 *
 * ⚠️ The order `revision.set()` → `writeRun()` → `rehydrate()` is **fixed**: writing localStorage
 * triggers the push effect, and by then it must use the revision just fetched.
 */
export async function pullRun(targets: PullTargets): Promise<boolean> {
	const remote = await api.getSave()
	targets.revision.set(remote.revision)
	if (!remote.run) return false
	targets.writeRun(remote.run)
	await targets.rehydrate()
	return true
}
