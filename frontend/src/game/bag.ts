import { MAX_STAR, getTemplate, isBuffableWeapon, starPrice } from './items'
import type { GridSpace, ItemInstance, Star } from './types'

/** Cell ordering inside the grid: row first, then column. */
export interface Cell {
	row: number
	col: number
}

export function toCell(slot: number, width: number): Cell {
	return { row: Math.floor(slot / width), col: slot % width }
}

export function toSlot(cell: Cell, width: number): number {
	return cell.row * width + cell.col
}

/** An item's actual footprint, with a 90° rotation already applied. */
export function footprintOf(space: GridSpace, rotated = false): GridSpace {
	return rotated ? { w: space.h, h: space.w } : space
}

export function templateFootprint(templateId: string, rotated = false): GridSpace {
	return footprintOf(getTemplate(templateId).space, rotated)
}

/**
 * Two copies can merge when they share the same template and star rank and are below 4★.
 *
 * Accepts a minimal shape (`templateId` + `star`) so it also works with the item **being dragged** —
 * at that point only a `HeldItem` exists, not a full `ItemInstance`.
 */
export function isMergeable(
	a: { templateId: string; star: Star },
	b: { templateId: string; star: Star },
): boolean {
	return a.templateId === b.templateId && a.star === b.star && a.star < MAX_STAR
}

/**
 * The star a **shop offer** would merge up to, or `null` when the player owns no identical copy.
 *
 * Used by the shop to *suggest* a purchase: a tile whose twin is already in Trang bị or Kho đồ is
 * drawn with a golden ring and an `↑N★` badge, because buying it is worth more than the item alone.
 *
 * ⚠️ Only the player's own items count — `bag` is `[...run.equipped, ...run.inventory]`, ❌ never the
 * other shop tiles: those are not progress, and two offers of the same item could not merge anyway
 * (they never meet in a bag).
 */
export function mergeUpStar(
	bag: readonly { templateId: string; star: Star }[],
	item: { templateId: string; star: Star },
): Star | null {
	if (item.star >= MAX_STAR) return null
	const twin = bag.some((owned) => isMergeable(owned, item))
	return twin ? ((item.star + 1) as Star) : null
}

/**
 * Collapse **every** pair of identical copies in one list, repeating until nothing is left to merge —
 * so `2+2 → 3`, then `3+3 → 4`, exactly like dragging them together one by one.
 *
 * ⚠️ The first copy in list order survives (it keeps its `uid`, cell and rotation) and `paid` is
 * summed, so a merged item still sells back for half of everything that went into it. ❌ Never merges
 * across star ranks: a 1★ and a 2★ are different items to the economy.
 */
export function mergeDuplicates(items: ItemInstance[]): ItemInstance[] {
	let current = [...items]
	for (;;) {
		let mergedAt = -1
		let eatenAt = -1
		search: for (let a = 0; a < current.length && mergedAt < 0; a += 1) {
			for (let b = a + 1; b < current.length; b += 1) {
				if (!isMergeable(current[a], current[b])) continue
				mergedAt = a
				eatenAt = b
				break search
			}
		}
		if (mergedAt < 0) return current
		const eaten = current[eatenAt]
		current = current
			.map((item, index) =>
				index === mergedAt ? { ...item, star: (item.star + 1) as Star, paid: item.paid + eaten.paid } : item,
			)
			.filter((_item, index) => index !== eatenAt)
	}
}

/** Every cell an item covers, counted from the anchor cell (top-left corner). */
export function cellsOf(slot: number, size: GridSpace, width: number): number[] {
	if (slot < 0) return []
	const { row: startRow, col: startCol } = toCell(slot, width)
	const cells: number[] = []
	for (let row = startRow; row < startRow + size.h; row += 1) {
		for (let col = startCol; col < startCol + size.w; col += 1) {
			cells.push(toSlot({ row, col }, width))
		}
	}
	return cells
}

/** Cells an item covers in the bag, rotation included. Returns [] when it sits in the waiting tray. */
export function itemCells(item: ItemInstance, width: number): number[] {
	if (item.slot < 0) return []
	return cellsOf(item.slot, templateFootprint(item.templateId, item.rotated), width)
}

export function blueprintCells(entry: { templateId: string; slot: number; rotated?: boolean }, width: number): number[] {
	if (entry.slot < 0) return []
	return cellsOf(entry.slot, templateFootprint(entry.templateId, entry.rotated), width)
}

/** Cell → item map for whichever item occupies that cell. Empty cells never appear in the map. */
export function occupancy<T extends { slot: number }>(
	items: T[],
	width: number,
	spaceOf: (item: T) => GridSpace,
): Map<number, T> {
	const map = new Map<number, T>()
	for (const item of items) {
		if (item.slot < 0) continue
		for (const cell of cellsOf(item.slot, spaceOf(item), width)) map.set(cell, item)
	}
	return map
}

export function occupancyOf(items: ItemInstance[], width: number): Map<number, ItemInstance> {
	return occupancy(items, width, (item) => templateFootprint(item.templateId, item.rotated))
}

/** The item occupying cell `slot` (ignoring one uid), used by drops and collision checks. */
export function occupantAt(
	items: ItemInstance[],
	slot: number,
	width: number,
	exceptUid?: string,
): ItemInstance | undefined {
	for (const item of items) {
		if (item.uid === exceptUid) continue
		if (itemCells(item, width).includes(slot)) return item
	}
	return undefined
}

/** The four edge directions, in the order every adjacency walk uses. */
export type Direction = 'up' | 'down' | 'left' | 'right'

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/**
 * Bit of each direction inside a kit's `directions` parameter (one number, so a kit stays a table of
 * numbers). `15` = all four directions, which is what an item without the parameter reads.
 */
export const DIRECTION_BITS: Record<Direction, number> = { up: 1, down: 2, left: 4, right: 8 }

/** Every edge neighbour of `cells`, tagged with the direction it was found in. */
function neighboursByDirection(
	map: Map<number, { uid: string }>,
	cells: number[],
	width: number,
	gridSize: number,
	exceptUid: string,
): { uid: string; direction: Direction }[] {
	const rows = Math.ceil(gridSize / width)
	const found: { uid: string; direction: Direction }[] = []
	for (const cell of cells) {
		const { row, col } = toCell(cell, width)
		const candidates: { cell: Cell; direction: Direction }[] = [
			{ cell: { row: row - 1, col }, direction: 'up' },
			{ cell: { row: row + 1, col }, direction: 'down' },
			{ cell: { row, col: col - 1 }, direction: 'left' },
			{ cell: { row, col: col + 1 }, direction: 'right' },
		]
		for (const { cell: candidate, direction } of candidates) {
			if (candidate.row < 0 || candidate.col < 0 || candidate.col >= width || candidate.row >= rows) continue
			const neighbour = map.get(toSlot(candidate, width))
			if (neighbour && neighbour.uid !== exceptUid) found.push({ uid: neighbour.uid, direction })
		}
	}
	return found
}

/** Uids of the items with at least one cell edge-adjacent to `cells` (excluding `exceptUid`). */
export function adjacentUids(
	map: Map<number, { uid: string }>,
	cells: number[],
	width: number,
	gridSize: number,
	exceptUid: string,
): Set<string> {
	return new Set(
		neighboursByDirection(map, cells, width, gridSize, exceptUid).map((found) => found.uid),
	)
}

/**
 * The same neighbours, grouped by the side they sit on — this is what a support gem's `directions`
 * parameter selects (up / down / left / right, any combination).
 */
export function adjacentUidsByDirection(
	map: Map<number, { uid: string }>,
	cells: number[],
	width: number,
	gridSize: number,
	exceptUid: string,
): Record<Direction, Set<string>> {
	const grouped: Record<Direction, Set<string>> = {
		up: new Set(),
		down: new Set(),
		left: new Set(),
		right: new Set(),
	}
	for (const found of neighboursByDirection(map, cells, width, gridSize, exceptUid)) {
		grouped[found.direction].add(found.uid)
	}
	return grouped
}

/**
 * For each side of a block, is there a **matching item** edging it?
 *
 * This is what a support gem's direction overlay reads: a side turns gold when the neighbour on that
 * side is a weapon (the buff will land there) and stays silver otherwise. `exceptUid` skips the item
 * being moved — while dragging, it is still on the board at its old cell.
 */
export function occupiedSides(
	items: { uid: string; slot: number; templateId: string; rotated?: boolean }[],
	cells: number[],
	exceptUid: string | undefined,
	width: number,
	gridSize: number,
	matches: (templateId: string) => boolean,
): Record<Direction, boolean> {
	const placed = items.filter((item) => item.slot >= 0)
	const map = occupancy(placed, width, (item) => templateFootprint(item.templateId, item.rotated))
	const byUid = new Map(placed.map((item) => [item.uid, item]))
	const grouped = adjacentUidsByDirection(map, cells, width, gridSize, exceptUid ?? '')
	const sides: Record<Direction, boolean> = { up: false, down: false, left: false, right: false }
	for (const side of DIRECTIONS) {
		sides[side] = [...grouped[side]].some((uid) => {
			const neighbour = byUid.get(uid)
			return neighbour ? matches(neighbour.templateId) : false
		})
	}
	return sides
}

/**
 * Which sides of one **placed** item have a **weapon** on them — the input the direction overlay
 * colours from. A side with a weapon is where that gem's direction buff will land (`build.ts` walks
 * the same edges), so the overlay cannot promise a neighbour the engine would not take.
 */
export function directionSidesFor(
	item: ItemInstance,
	items: ItemInstance[],
	width: number,
	gridSize: number,
): Record<Direction, boolean> {
	const cells = cellsOf(item.slot, templateFootprint(item.templateId, item.rotated), width)
	return occupiedSides(items, cells, item.uid, width, gridSize, isBuffableWeapon)
}

/**
 * Clamp a cell into a **valid anchor cell** for a `size` block: keep it when the block already fits
 * inside the grid, otherwise shift the anchor to the closest position where it still fits.
 *
 * ⚠️ WHY THIS IS NEEDED: while dragging, the cursor can sit on cell 5 of a 4-column grid. A 4×1 item
 * cannot be anchored in column 1 (`col + 4 > 4`), so drawing the preview from cell 5 would make
 * `cellsOf` produce `[5, 6, 7, 8]` — spilling onto the next row, looking like two rows, while
 * `resolveDrop` also rejects cell 5 for that overflow ⇒ preview and drop target **disagree**.
 *
 * ❌ Do not use this to **move things out of the way**: clamping here only keeps the block inside the
 * grid, whereas a colliding item is **rejected** by `resolveDrop` rather than slid aside.
 */
export function anchorFor(slot: number, size: GridSpace, width: number, gridSize: number): number {
	if (slot < 0) return 0
	const rows = Math.ceil(gridSize / width)
	const { row, col } = toCell(slot, width)
	const safeRow = Math.max(0, Math.min(rows - size.h, row))
	const safeCol = Math.max(0, Math.min(width - size.w, col))
	return toSlot({ row: safeRow, col: safeCol }, width)
}

/**
 * Cell validity: the whole rectangle (anchor cell + size) has to sit inside the grid.
 *
 * This must be checked from the anchor cell and not from the cell list derived by `cellsOf`: a `3×1`
 * block anchored in column 3 of a 4-column grid produces cells `[3,4,5]`, but cells 4 and 5 actually
 * belong to the row below — checking the list would wrongly consider it valid.
 */
function cellsInBounds(slot: number, size: GridSpace, width: number, gridSize: number): boolean {
	if (slot < 0 || slot >= gridSize) return false
	const rows = Math.ceil(gridSize / width)
	const { row, col } = toCell(slot, width)
	if (row < 0 || col < 0) return false
	if (col + size.w > width) return false
	if (row + size.h > rows) return false
	return true
}

/**
 * Core predicate: does a `size` block placed at `slot` fit, given the already occupied cells
 * (`taken`)? Every action (placing an item, swapping, rotating) boils down to this.
 */
export function fitsIn(
	slot: number,
	size: GridSpace,
	width: number,
	gridSize: number,
	taken: Set<number>,
): boolean {
	if (!cellsInBounds(slot, size, width, gridSize)) return false
	const cells = cellsOf(slot, size, width)
	return cells.every((cell) => !taken.has(cell))
}

/** The set of occupied cells, ignoring the exempt uids (items currently being moved). */
export function takenCells(
	items: ItemInstance[],
	width: number,
	exceptUids: Iterable<string> = [],
): Set<number> {
	const except = new Set(exceptUids)
	const taken = new Set<number>()
	for (const item of items) {
		if (except.has(item.uid)) continue
		for (const cell of itemCells(item, width)) taken.add(cell)
	}
	return taken
}

/** Whether the placement is allowed, ignoring the items being moved themselves. */
export function canPlace(
	items: ItemInstance[],
	exceptUids: Iterable<string>,
	slot: number,
	size: GridSpace,
	width: number,
	gridSize: number,
	/**
	 * Number of **usable** cells (defaults to the whole grid). Cells past this limit are **locked**
	 * — the cutie level is not high enough yet, so they cannot be used.
	 */
	usableCells: number = gridSize,
): boolean {
	if (!cellsInBounds(slot, size, width, Math.min(gridSize, usableCells))) return false
	return fitsIn(slot, size, width, gridSize, takenCells(items, width, exceptUids))
}

export interface Placement {
	slot: number
	rotated: boolean
}

/**
 * Find the first free spot for an item. Prefers the original orientation and rotates only when
 * needed. Returns null when nothing is left (the item stays in the waiting tray).
 */
export function findFreePlacement(
	items: ItemInstance[],
	templateId: string,
	width: number,
	gridSize: number,
	/** Number of usable cells; locked cells do not count as free space. */
	usableCells: number = gridSize,
): Placement | null {
	const base = getTemplate(templateId).space
	for (const rotated of [false, true]) {
		const size = footprintOf(base, rotated)
		// Do not try the rotated orientation when rotating changes nothing.
		if (rotated && size.w === base.w && size.h === base.h) break
		for (let slot = 0; slot < gridSize; slot += 1) {
			if (canPlace(items, [], slot, size, width, gridSize, usableCells)) return { slot, rotated }
		}
	}
	return null
}

export interface MoveResult {
	items: ItemInstance[]
	merged: boolean
	swapped: boolean
	rotated: boolean
	reason?: 'blocked' | 'same-slot' | 'out-of-bounds' | 'no-space'
}/**
 * Drag-and-drop handling: dropping onto an empty spot places the item (keeping the anchor cell),
 * dropping onto an identical item merges it into +1★, dropping onto a different item swaps positions.
 *
 * `slot` is the **cursor cell** (not necessarily a valid anchor cell). The function tries the nearby
 * valid anchor cells itself, closest first — so dropping anywhere around the item works, even when
 * the cursor sits on the item itself.
 */
export function resolveDrop(
	items: ItemInstance[],
	movingUid: string,
	slot: number,
	width: number,
	gridSize: number,
	rotated?: boolean,
	/**
	 * Number of **usable** cells (defaults to the whole grid). Cells past this limit are **locked**
	 * — the cutie level is not high enough yet.
	 */
	usableCells: number = gridSize,
): MoveResult {
	const moving = items.find((item) => item.uid === movingUid)
	if (!moving) return { items, merged: false, swapped: false, rotated: false, reason: 'blocked' }
	if (slot < 0 || slot >= gridSize) {
		return { items, merged: false, swapped: false, rotated: false, reason: 'out-of-bounds' }
	}

	const orientation = rotated ?? moving.rotated ?? false
	const size = templateFootprint(moving.templateId, orientation)

	// (1) Dropped onto **another item** → merge stars (when allowed) or swap.
	const other = occupantAt(items, slot, width, moving.uid)
	if (other) {
		if (isMergeable(moving, other)) {
			const nextStar = (other.star + 1) as Star
			return {
				items: items
					.filter((item) => item.uid !== moving.uid)
					.map((item) =>
						item.uid === other.uid
							? { ...item, star: nextStar, paid: item.paid + moving.paid, slot: other.slot }
							: item,
					),
				merged: true,
				swapped: false,
				rotated: false,
			}
		}

		// Swap: the dragged item takes the other item's anchor cell and vice versa. Both leave
		// their old cells, so occupancy has to be computed from both future positions.
		const targetSize = templateFootprint(other.templateId, other.rotated ?? false)
		const movingFrom = moving.slot
		const taken = takenCells(items, width, [moving.uid, other.uid])
		if (
		!fitsIn(slot, size, width, usableCells, taken) ||
		!fitsIn(movingFrom, targetSize, width, usableCells, taken)
	) {
			return { items, merged: false, swapped: false, rotated: false, reason: 'no-space' }
		}
		return {
			items: items.map((item) => {
				if (item.uid === moving.uid) return { ...item, slot, rotated: orientation }
				if (item.uid === other.uid) return { ...item, slot: movingFrom }
				return item
			}),
			merged: false,
			swapped: true,
			rotated: orientation !== (moving.rotated ?? false),
		}
	}

	// (2) Empty spot: use **exactly the anchor cell the preview is drawing**, only clamped to the grid
	// edge.
	//
	// ⚠️ ❌ **Never slide to another cell when the block collides with an item**: the item has to land
	// in the cell the preview drew. Sliding makes it fall outside the outline the player sees — and
	// worse, the drop then "works" in a spot occupied by another item, which cannot be predicted.
	// When it collides, **reject**; the preview already showed red beforehand (see the hover
	// preview helper in `GridBoard`).
	//
	// The dragged item itself is skipped during the collision check — it is about to leave its old cell.
	const taken = takenCells(items, width, [moving.uid])
	const anchor = anchorFor(slot, size, width, usableCells)
	if (!fitsIn(anchor, size, width, usableCells, taken)) {
		return { items, merged: false, swapped: false, rotated: false, reason: 'no-space' }
	}
	if (anchor === moving.slot && (moving.rotated ?? false) === orientation) {
		return { items, merged: false, swapped: false, rotated: false, reason: 'same-slot' }
	}
	return {
		items: items.map((item) => (item.uid === moving.uid ? { ...item, slot: anchor, rotated: orientation } : item)),
		merged: false,
		swapped: false,
		rotated: orientation !== (moving.rotated ?? false),
	}
}

/** Rotate an item in place. Returns `null` when the new orientation does not fit. */
export function rotateItem(
	items: ItemInstance[],
	uid: string,
	width: number,
	gridSize: number,
	/** Number of usable cells; the new orientation must not spill into a locked cell. */
	usableCells: number = gridSize,
): ItemInstance[] | null {
	const item = items.find((entry) => entry.uid === uid)
	if (!item || item.slot < 0) return null
	const next = !(item.rotated ?? false)
	const size = templateFootprint(item.templateId, next)
	if (!canPlace(items, [uid], item.slot, size, width, gridSize, usableCells)) return null
	return items.map((entry) => (entry.uid === uid ? { ...entry, rotated: next } : entry))
}

/**
 * Lay every item sitting in the waiting tray into the storage: one at a time, preferring the
 * original orientation and rotating only when needed. An item with no room left stays in the tray.
 *
 * Returns the list of items that got a new position; the store applies them through `resolveDrop`
 * one by one so a single code path is preserved.
 */
export function planAutoArrange(
	items: ItemInstance[],
	width: number,
	gridSize: number,
): { uid: string; slot: number; rotated: boolean }[] {
	// Cells already taken by items sitting in the storage; tray items occupy nothing yet.
	const taken = takenCells(
		items.filter((item) => item.slot >= 0),
		width,
	)
	const moves: { uid: string; slot: number; rotated: boolean }[] = []

	for (const item of items) {
		if (item.slot >= 0) continue
		const base = getTemplate(item.templateId).space
		let chosen: Placement | null = null
		for (const rotated of [false, true]) {
			const size = footprintOf(base, rotated)
			if (rotated && size.w === base.w && size.h === base.h) break
			for (let slot = 0; slot < gridSize; slot += 1) {
				if (fitsIn(slot, size, width, gridSize, taken)) {
					chosen = { slot, rotated }
					break
				}
			}
			if (chosen) break
		}
		if (!chosen) continue
		// Reserve the spot right away so a later item cannot land on it.
		for (const cell of cellsOf(chosen.slot, footprintOf(base, chosen.rotated), width)) taken.add(cell)
		moves.push({ uid: item.uid, slot: chosen.slot, rotated: chosen.rotated })
	}
	return moves
}

/** Selling refunds 50% of the Vàng actually paid. */
export function sellValue(item: ItemInstance): number {
	return Math.max(1, Math.floor(item.paid / 2))
}

export function createItemInstance(
	templateId: string,
	star: Star,
	uid: string,
	slot = -1,
	rotated = false,
): ItemInstance {
	const template = getTemplate(templateId)
	return { uid, templateId, star, slot, rotated, paid: starPrice(template.cost, star) }
}
