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
		if (typeof parsed !== 'object' || parsed === null) return null
		const cache = parsed as Partial<ContentOverrides> & { pets?: ContentOverrides['cuties'] }
		// ⚠️ The key was `pets` before the domain word became **cutie**. A browser that cached the old
		// shape would lose every Cutie override for the first frame (the fetch fixes it a moment later,
		// which still means the player sees the old name flash), so the old key is read as well.
		if (!cache.cuties && cache.pets) cache.cuties = cache.pets
		return cache
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
