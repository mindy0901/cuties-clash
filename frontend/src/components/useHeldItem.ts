import { useCallback, useEffect, useRef, useState } from 'react'
import type { ItemInstance, Star } from '../game/types'

/** The item being **dragged** (mouse still held down, not released yet). */
export interface HeldItem {
	uid: string
	from: 'inventory' | 'loadout'
	/** Orientation to apply on drop. `R` or the right mouse button flips this. */
	rotated: boolean
	templateId: string
	star: Star
	/** Cursor position (px, viewport) — the ghost image follows it. */
	x: number
	y: number
}

/**
 * The "an item is being dragged" state — it **only lives while the mouse is held**: from
 * `pointerdown` (past the drag threshold) until `pointerup`.
 *
 * ⚠️ ❌ **Picking up / placing by click is gone.** Clicking an item now opens the **detail
 * dialog**, so the "held" state must not survive the pointer release. That removes the leftover
 * item ghost that used to follow the cursor after the player let go.
 *
 * Interactions:
 * - **Drag** an item (hold the mouse and move) → picks it up; **release** → places it on the
 *   hovered cell.
 * - `R` or the **right mouse button** while dragging → rotates 90°. `Esc` → cancels.
 */
export function useHeldItem(
	loadout: ItemInstance[],
	inventory: ItemInstance[],
	/**
	 * Called when the player **cancels** the drag (`Esc`).
	 *
	 * ⚠️ WHY THIS IS NEEDED: the parent still holds "the dragged item" so it can place it on
	 * **pointer release**. Clearing only the local state would let the following release drop the
	 * item on the last cell the cursor passed over — the player cancelled, yet the item moved.
	 */
	onCancel?: () => void,
) {
	const [held, setHeld] = useState<HeldItem | null>(null)

	/**
	 * The most recent cursor position.
	 *
	 * ⚠️ WHY A SEPARATE REF: when dragging an item from the loadout down into **storage**,
	 * `pointerup` fires on the storage panel so the board never sees it; the parent has to know
	 * where the cursor is to decide "drop into storage".
	 */
	const pointerRef = useRef({ x: 0, y: 0 })

	const find = useCallback(
		(uid: string) =>
			loadout.find((item) => item.uid === uid) ?? inventory.find((item) => item.uid === uid),
		[loadout, inventory],
	)

	/** Starts dragging an item. The ghost starts from the current cursor position. */
	const hold = useCallback((item: ItemInstance, from: 'inventory' | 'loadout') => {
		setHeld({
			uid: item.uid,
			from,
			// Start from the item's current orientation.
			rotated: item.rotated ?? false,
			templateId: item.templateId,
			star: item.star,
			x: pointerRef.current.x,
			y: pointerRef.current.y,
		})
	}, [])

	const clear = useCallback(() => setHeld(null), [])

	/** Rotates the dragged item. Safe when nothing is being dragged. */
	const rotateHeld = useCallback(() => {
		setHeld((current) => (current ? { ...current, rotated: !current.rotated } : current))
	}, [])

	// Keep the ghost following the cursor and listen for shortcuts. Only attached while dragging.
	useEffect(() => {
		if (!held) return

		const track = (event: PointerEvent) => {
			pointerRef.current = { x: event.clientX, y: event.clientY }
			setHeld((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current))
		}
		const keys = (event: KeyboardEvent) => {
			if (event.key === 'r' || event.key === 'R') {
				event.preventDefault()
				rotateHeld()
			} else if (event.key === 'Escape') {
				event.preventDefault()
				onCancel?.()
				clear()
			}
		}
		const menu = (event: MouseEvent) => {
			// Right mouse button = rotate (instead of the context menu).
			event.preventDefault()
			rotateHeld()
		}

		document.addEventListener('pointermove', track)
		document.addEventListener('keydown', keys)
		document.addEventListener('contextmenu', menu)
		return () => {
			document.removeEventListener('pointermove', track)
			document.removeEventListener('keydown', keys)
			document.removeEventListener('contextmenu', menu)
		}
	}, [held, rotateHeld, clear, onCancel])

	return { held, find, hold, rotateHeld, clear, pointerRef }
}
