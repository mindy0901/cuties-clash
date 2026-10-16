/**
 * Truy cập localStorage của bản lưu game.
 *
 * Tách ra đây vì có hai nơi cần biết: `api/queries` (nạp bản máy chủ vào) và `AuthSync`
 * (kiểm tra máy này đã có tiến trình chưa). Khoá phải khớp `name` trong `gameStore`.
 */

/** Khoá localStorage do zustand persist dùng cho tiến trình chơi. */
export const GAME_SAVE_KEY = 'martial-cutie-save'

/** Máy này đã có tiến trình chơi chưa (đọc thẳng localStorage). */
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

/** Ghi tiến trình của máy chủ vào localStorage để zustand persist nạp lại. */
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
