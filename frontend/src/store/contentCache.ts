/**
 * Cached copy of the content overlay in `localStorage`.
 *
 * ⚠️ WHY THIS EXISTS: the overlay lives on the server, so it only arrives after a network
 * round trip. Applying it only once the fetch resolves would show the player **old names and
 * prices** first and then "jump" to the edited build. Reading the cache **before render** (see
 * `main.tsx`) makes the very first frame correct, and the fetch only refreshes it.
 *
 * ❌ Not a source of truth: the server is the only place that stores the overlay; the cache is
 * just a speed-up.
 */

import type { ContentOverrides } from '../game/content'

const STORAGE_KEY = 'martial-cutie-content'

export function readCachedContent(): Partial<ContentOverrides> | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) return null
		const parsed: unknown = JSON.parse(raw)
		return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<ContentOverrides>) : null
	} catch {
		return null
	}
}

export function writeCachedContent(content: Partial<ContentOverrides> | null): void {
	try {
		if (content) localStorage.setItem(STORAGE_KEY, JSON.stringify(content))
		else localStorage.removeItem(STORAGE_KEY)
	} catch {
		// Quota exceeded or private mode: skip it, we only lose the head start.
	}
}
