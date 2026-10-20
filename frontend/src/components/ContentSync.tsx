import { useEffect } from 'react'
import { useContent } from '../api/queries'
import { applyContentOverrides, markContentResolved } from '../game/content'
import { writeCachedContent } from '../store/contentCache'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'

/**
 * Loads the content overlay from the server and applies it to the templates in code.
 *
 * ⚠️ This is an **additive** path, not a required source: no server, no rows, or a failed fetch
 * all leave the game fully playable using `game/items.ts` + `game/cuties.ts`.
 *
 * ⚠️ Applying is not enough on its own — React has no idea the module variable inside
 * `game/content.ts` changed, so `contentVersion` has to move for the tree below to re-render
 * with the new names and prices.
 */
export function ContentSync() {
	const { data } = useContent()
	const bump = useUiStore((state) => state.bumpContent)
	const pruneUnknownItems = useGameStore((state) => state.pruneUnknownItems)

	useEffect(() => {
		if (!data) return
		applyContentOverrides(data)
		writeCachedContent(data)
		// The overlay is authoritative from here on: an id that is still unknown really was deleted
		// (or never existed), so the bag can be cleaned. ⚠️ Before this point the store keeps such
		// items — the run rehydrates during module import, long before this fetch can answer.
		markContentResolved()
		pruneUnknownItems()
		bump()
	}, [data, bump, pruneUnknownItems])

	return null
}
