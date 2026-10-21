import { useEffect, useRef, useState } from 'react'
import type { Star } from '../game/types'

/**
 * Width of the card, in px — wide enough for a name next to `label … value` on one line.
 *
 * ⚠️ `ItemHoverCard` sets the same number as its own `width`; this constant only positions it, so the
 * two must stay in step.
 */
export const HOVER_CARD_WIDTH = 320

/**
 * Hover intent: the card waits before it opens.
 *
 * The pointer crosses a tile on its way anywhere else on the board, and a card that appears on the
 * first pixel of contact flickers over the neighbouring items on every pass. A short wait makes the
 * panel answer a **deliberate** stop instead.
 */
export const HOVER_DELAY_MS = 350

/** What the card shows and where it stands. */
export interface HoveredItem {
	templateId: string
	star: Star
	left: number
	top: number
	/** Room between the card's top and the bottom of the window — the body scrolls inside it. */
	maxHeight: number
}

/**
 * The **hover card** state shared by every board that shows items: the shop's offers, the bag in the
 * preparation room and both grids in the arena.
 *
 * ⚠️ WHY ONE HOOK: the pointer behaviour has three traps already paid for (see `docs/TESTING.md`
 * Trap 10) — the delay, cancelling a pending open, and dropping the card when the anchor disappears
 * (a bought offer is replaced, so no `pointerleave` ever fires). A second copy of that logic in
 * another screen drifts from this one.
 *
 * ⚠️ `position: fixed` with a rect measured on enter: the boards are `overflow-hidden`/scrolling, so
 * a card laid out inside them would be clipped at the board edge.
 */
export function useItemHoverCard() {
	const [hovered, setHovered] = useState<HoveredItem | null>(null)
	const timerRef = useRef<number | null>(null)

	const clearTimer = () => {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current)
			timerRef.current = null
		}
	}

	// A pending card must not survive the screen that asked for it.
	useEffect(() => clearTimer, [])

	/** Opens the card at once, anchored to `node` (the tile itself, ❌ not the cell around it). */
	const show = (templateId: string, star: Star, node: HTMLElement) => {
		clearTimer()
		const rect = node.getBoundingClientRect()
		const gap = 10
		// **Right side first**, like the shop's reference — the card must never cover the tile it
		// describes, and covering a neighbouring item is accepted. It only flips to the left of the
		// tile when the right side would run off the window.
		const right = rect.right + gap
		const left =
			right + HOVER_CARD_WIDTH <= window.innerWidth - 8
				? right
				: Math.max(8, rect.left - gap - HOVER_CARD_WIDTH)
		const top = Math.max(8, Math.min(rect.top, window.innerHeight - 120))
		setHovered({ templateId, star, left, top, maxHeight: Math.max(140, window.innerHeight - top - 16) })
	}

	/** Drops the card and any pending open — used on leave, blur, scroll and after a purchase. */
	const hide = () => {
		clearTimer()
		setHovered(null)
	}

	/** Arms the card for `templateId`, cancelled by `hide` if the pointer moves on first. */
	const queue = (templateId: string, star: Star, node: HTMLElement) => {
		hide()
		timerRef.current = window.setTimeout(() => {
			timerRef.current = null
			// The tile may have been replaced while the timer ran (a bought offer becomes the sold
			// placeholder).
			if (!node.isConnected) return
			show(templateId, star, node)
		}, HOVER_DELAY_MS)
	}

	return { hovered, show, queue, hide }
}
