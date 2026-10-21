import { useCallback, useRef, useState } from 'react'
import { ActionBar } from './ActionBar'
import { HeldGhost } from './HeldGhost'
import { InventoryPanel } from './InventoryPanel'
import { CutieLoadoutPanel } from './CutieLoadoutPanel'
import { CutiePanel } from './CutiePanel'
import { ItemHoverCard } from './ItemHoverCard'
import { useItemHoverCard } from './useItemHover'
import { useHeldItem } from './useHeldItem'
import { templateFootprint } from '../game/bag'
import { loadoutCellLocked } from '../game/loadout'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import type { ItemInstance } from '../game/types'
import type { ShopDropTarget } from './ui'
import { useLanguageStore } from '../i18n'
import type { PointerPosition } from './GridBoard'

/**
 * Preparation room — three columns (cutie + stats · storage · loadout) with the action bar as the
 * page footer.
 */
export function PrepScreen() {
	useLanguageStore((state) => state.language)
	const [activeShopTarget, setActiveShopTarget] = useState<ShopDropTarget | null>(null)
	const run = useGameStore((state) => state.run)

	// Dragging items between inventory and loadout — the state has to live here because the two
	// panels are siblings.
	/**
	 * The item **being dragged**, so `onDragEnd` knows what to place.
	 *
	 * ⚠️ A separate ref is needed for drags **from the inventory**: `held` inside `onDragEnd`'s
	 * closure may not have the fresh value yet, while `pointerup` needs it immediately.
	 *
	 * ⚠️ The rotation must be **read from `held`** on release, not the value captured when the
	 * drag started — the player may have pressed `R` midway and a captured value would be stale.
	 */
	const dragRef = useRef<{ uid: string; from: 'inventory' | 'loadout' } | null>(null)

	/**
	 * Cancels the drag (`Esc`).
	 *
	 * ⚠️ It must **forget `dragRef` too**, ❌ not merely let `useHeldItem` clear `held`: the
	 * pointer release that follows still runs `onDragEnd` and would drop the item on the last
	 * cell the cursor passed over, even though the player cancelled.
	 */
	const cancelDrag = useCallback(() => {
		dragRef.current = null
		setActiveShopTarget(null)
	}, [])

	const { held, hold, clear, pointerRef } = useHeldItem(run.equipped, run.inventory, cancelDrag)
	const equipAt = useGameStore((state) => state.equipAt)
	const unequipAt = useGameStore((state) => state.unequipAt)
	const dropItem = useGameStore((state) => state.dropItem)
	const dropInStorage = useGameStore((state) => state.dropInStorage)
	const sell = useGameStore((state) => state.sell)
	const openItem = useUiStore((state) => state.openItem)

	/**
	 * Hover card (the same one the shop draws): the pointer stopping on a tile describes the item
	 * without stealing the click, which still opens the details dialog.
	 */
	const { hovered, queue: queueCard, hide: hideCard } = useItemHoverCard()
	const onItemHover = (item: ItemInstance, node: HTMLElement | null) => {
		if (node) queueCard(item.templateId, item.star, node)
		else hideCard()
	}
	/** A click opens the details dialog, which covers the board — the card has nothing left to point at. */
	const openDetails = (item: ItemInstance) => {
		hideCard()
		openItem(item.uid)
	}

	const hoverSlotRef = useRef<number | null>(null)
	/** Anchor cell the hint is drawn from **inside the inventory** (it is a grid, so a drop lands
	 * on a cell rather than just "into the inventory"). */
	const inventorySlotRef = useRef<number | null>(null)
	/**
	 * Whether each board's hint is currently reporting **blocked** (clashing with another item /
	 * a locked cell) → dropping there places nothing.
	 *
	 * ⚠️ There must be **one flag per board**, ❌ never a shared one: both boards report on every
	 * render, so a shared flag would be overwritten by whichever reported last — the other board
	 * would say "blocked" while the flag ended up `false` and the drop would still place the item
	 * (this exact bug happened when dropping inside the inventory).
	 */
	const gridBlockedRef = useRef(false)
	const inventoryBlockedRef = useRef(false)
	const inventoryRef = useRef<HTMLElement | null>(null)
	const suppressShopClickRef = useRef(false)
	const suppressShopClickTimerRef = useRef<number | null>(null)

	const suppressShopClick = useCallback(() => {
		if (!suppressShopClickRef.current) return false
		suppressShopClickRef.current = false
		if (suppressShopClickTimerRef.current !== null) {
			window.clearTimeout(suppressShopClickTimerRef.current)
			suppressShopClickTimerRef.current = null
		}
		return true
	}, [])

	/** Whether the cursor is inside the inventory area. */
	const isOverInventory = () => {
		const box = inventoryRef.current?.getBoundingClientRect()
		if (!box) return false
		const { x, y } = pointerRef.current
		return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
	}

	/**
	 * Starts dragging an item (shared by the grid and the inventory).
	 */
	const startDrag = (item: ItemInstance, from: 'inventory' | 'loadout') => {
		dragRef.current = { uid: item.uid, from }
		// A card left over from the tile the drag started on would follow the cursor round the board.
		hideCard()
		hold(item, from)
	}

	/**
	 * Pointer release.
	 *
	 * `moved = true` (the drag actually moved) → drop onto the hovered cell, or store into the
	 * inventory when released over it.
	 * `moved = false` (a plain press without movement) → places **nothing**: the `click` that
	 * follows opens the detail dialog, and the "dragging" state was never created.
	 */
	const onDragEnd = (moved: boolean, releasePosition: PointerPosition | null) => {
		setActiveShopTarget(null)
		if (!moved) return
		const dragging = dragRef.current
		dragRef.current = null
		if (!dragging) return

		// The rotation is read from `held` **on release** — the player may have pressed `R` midway.
		const rotated = held?.rotated ?? false
		const droppedOnShop =
			releasePosition !== null &&
			Array.from(document.querySelectorAll<HTMLElement>('[data-shop-drop-target]')).some((target) => {
				const rect = target.getBoundingClientRect()
				if (rect.width === 0 || rect.height === 0) return false
				return (
					releasePosition.x >= rect.left &&
					releasePosition.x <= rect.right &&
					releasePosition.y >= rect.top &&
					releasePosition.y <= rect.bottom
				)
			})
		if (droppedOnShop) {
			suppressShopClickRef.current = true
			if (suppressShopClickTimerRef.current !== null) {
				window.clearTimeout(suppressShopClickTimerRef.current)
			}
			suppressShopClickTimerRef.current = window.setTimeout(() => {
				suppressShopClickRef.current = false
				suppressShopClickTimerRef.current = null
			}, 0)
			sell(dragging.uid)
			clear()
			return
		}

		// Released **inside the inventory**: it is a free grid, so the item lands on the hovered cell.
		// - An item from the loadout → stored in the inventory (on the hovered cell; with no hovered
		//   cell a free spot is found automatically).
		// - An item already in the inventory → **moved within the inventory** (this used to be
		//   skipped, so dragging inside the inventory did nothing).
		if (isOverInventory()) {
			// The inventory hint reports **blocked** (clashing with another item) → place nothing,
			// the item returns to where it was.
			if (inventoryBlockedRef.current) {
				clear()
				return
			}
			if (dragging.from === 'loadout') unequipAt(dragging.uid, inventorySlotRef.current, rotated)
			else dropInStorage(dragging.uid, inventorySlotRef.current, rotated)
			clear()
			return
		}

		const slot = hoverSlotRef.current
		if (slot === null) {
			// Released outside **every** drop target (not on the inventory, not on any grid cell) →
			// cancel: the item returns to where it was. Dragging an item is a UI state only; the item
			// was never removed from `run`, so
			//
			// ⚠️ ❌ do not fall back to a remembered cell: since the board clears the hovered cell when
			// the cursor leaves it, `slot` is `null` exactly when the cursor is **not** over a board —
			// placing there would drop the item on a cell the player never pointed at. And ❌ do not
			// leave the item "hanging" either: the player released the mouse, so a ghost still stuck to
			// the cursor would look like a frozen action.
			clear()
			return
		}

		// The hint reports **blocked** → dropping **places nothing**, the item returns to where it
		// was. That is exactly what the red outline promised; ❌ it must not silently go elsewhere.
		//
		// ⚠️ A long item (1×4) that does not fit the open loadout (low cutie level) also falls here —
		// by design: rotate with `R` and drop again, instead of letting the game auto-rotate and place
		// it on a cell the player never pointed at.
		if (gridBlockedRef.current) {
			clear()
			return
		}

		if (dragging.from === 'loadout') {
			dropItem(dragging.uid, slot, rotated)
			clear()
			return
		}

		// Inventory → loadout. A **locked** cell cannot take the item, and it must not fall back to
		// searching for a spot either — that would defeat the very purpose of locked cells.
		if (loadoutCellLocked(run, slot)) {
			clear()
			return
		}
		// The hint and the placement share **one anchor cell**, so getting here means it fits; if it
		// still does not, place nothing, ❌ do not look elsewhere (the item would land off the outline
		// the player is looking at).
		equipAt(dragging.uid, slot, rotated)
		clear()
	}

	/**
	 * The **anchor cell the hint is drawn from**, reported by `LoadoutGrid`.
	 *
	 * ⚠️ This cell is used for placement, ❌ it is not recomputed from the raw cell: the hint is
	 * centered on the cursor so the anchor differs from the raw cell — recomputing would make the
	 * item land off the outline the player is looking at.
	 */
	const onAnchorSlotFromGrid = (slot: number | null, blocked: boolean) => {
		hoverSlotRef.current = slot
		gridBlockedRef.current = blocked
	}

	/**
	 * Anchor cell the hint is drawn from **inside the inventory**. It is a free grid too, so on
	 * release the item lands on exactly this cell (no more "stored into the inventory" as an end
	 * state; the inventory no longer arranges positions by itself).
	 */
	const onAnchorSlotFromInventory = (slot: number | null, blocked: boolean) => {
		inventorySlotRef.current = slot
		inventoryBlockedRef.current = blocked
	}

	const heldItem = held
		? ([...run.equipped, ...run.inventory].find((item) => item.uid === held.uid) ?? null)
		: null
	/**
	 * The item being dragged, in its full `HeldItem` form.
	 *
	 * ⚠️ ❌ **Do not trim fields**: both grids need `star` to know whether the item can **merge
	 * stars** into the item right under the cursor (the inventory allows merging only, never
	 * swapping). An earlier version passed only `uid`/`rotated`/`templateId`, so that check was
	 * always wrong.
	 */
	const heldInfo = held

	return (
		<>
			{/*
			 * ── Main content: the three panels ──
			 * `flex-1` makes this block take the remaining height of the page column, so the two footer
			 * sections below it ride the bottom edge of the viewport.
			 */}
			<div className="flex flex-1 flex-col gap-3.5">
			{/*
			 * Three columns in a **1 : 2.25 : 1.2 flex ratio** — cutie stats · storage · loadout.
			 * The columns take the full width and split it, and every panel inside a column stretches
			 * to that column's width (`items-stretch`), so the three panels line up edge to edge.
			 *
			 * ⚠️ Cell size stays the **fixed `CELL_SIZE` px** on both boards: a wider column does not
			 * stretch the cells, it only gives the board room. ❌ Do not switch the columns back to
			 * fixed px either — that overflowed horizontally on narrow screens.
			 */}
			<div className="flex flex-col gap-3.5 lg:flex-row lg:items-stretch">
				{/* ── Left: combined cutie profile, stats, and skill ────────────── */}
				<div className="flex min-w-0 flex-col gap-2.5 lg:flex-1">
					<CutiePanel className="flex-1" />
				</div>

				{/*
				 * ── Middle: inventory ──
				 *
				 * The widest column on purpose: the storage board is **8 cells** of `CELL_SIZE` (90 px) and
				 * has to fit without a horizontal scrollbar, while the loadout column only holds 4.
				 */}
				<div className="flex min-w-0 flex-col gap-2.5 lg:flex-[2.25]">
					<InventoryPanel
						onRef={(node) => {
							inventoryRef.current = node
						}}
						held={heldInfo}
						onItemClick={openDetails}
						onItemHover={onItemHover}
						onDragStart={(item) => startDrag(item, 'inventory')}
						onDragEnd={onDragEnd}
						onAnchorSlot={onAnchorSlotFromInventory}
					/>
				</div>

				{/* ── Right: loadout ─────────────────────────────────────────────── */}
				<div className="flex min-w-0 flex-col gap-2.5 lg:flex-[1.2]">
					<CutieLoadoutPanel
						className="flex-1"
						onShopClick={suppressShopClick}
						shopDropActive={activeShopTarget === 'equipment'}
						isDraggingItem={held !== null}
						onShopHover={setActiveShopTarget}
						held={heldInfo}
						onItemClick={openDetails}
						onItemHover={onItemHover}
						onDragStart={(item) => startDrag(item, 'loadout')}
						onDragEnd={onDragEnd}
						onAnchorSlot={onAnchorSlotFromGrid}
					/>
				</div>
			</div>
			</div>

			{/*
			 * ⚠️ The footer is **not inside the main content block**: `PrepScreen` renders the panels block
			 * and this footer as two siblings of the page column, so "main content" means the three panels
			 * and nothing else. ❌ Do not wrap it back inside — the page column's `flex-1` on the panels
			 * already pushes the footer down.
			 */}
			<ActionBar />

			{/* The hover card of the bag item under the pointer — the same card the shop draws. */}
			{hovered ? (
				<ItemHoverCard
					templateId={hovered.templateId}
					star={hovered.star}
					left={hovered.left}
					top={hovered.top}
					maxHeight={hovered.maxHeight}
				/>
			) : null}

			{/* The item image following the cursor while an item is held. */}
			{held && heldItem ? (
				<HeldGhost
					templateId={held.templateId}
					rotated={held.rotated}
					w={templateFootprint(heldItem.templateId, false).w}
					h={templateFootprint(heldItem.templateId, false).h}
					x={held.x}
					y={held.y}
				/>
			) : null}
		</>
	)
}
