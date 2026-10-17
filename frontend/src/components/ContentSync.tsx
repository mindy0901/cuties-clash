import { useEffect } from 'react'
import { useContent } from '../api/queries'
import { applyContentOverrides } from '../game/content'
import { writeCachedContent } from '../store/contentCache'
import { useUiStore } from '../store/uiStore'

/**
 * Loads the content overlay from the server and applies it to the templates in code.
 *
 * ⚠️ This is an **additive** path, not a required source: no server, no rows, or a failed fetch
 * all leave the game fully playable using `game/items.ts` + `game/pets.ts`.
 *
 * ⚠️ Applying is not enough on its own — React has no idea the module variable inside
 * `game/content.ts` changed, so `contentVersion` has to move for the tree below to re-render
 * with the new names and prices.
 */
export function ContentSync() {
	const { data } = useContent()
	const bump = useUiStore((state) => state.bumpContent)

	useEffect(() => {
		if (!data) return
		applyContentOverrides(data)
		writeCachedContent(data)
		bump()
	}, [data, bump])

	return null
}
