import { MAX_STAR, getTemplate, starPrice } from './items'
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

/** Uids of the items with at least one cell edge-adjacent to `cells` (excluding `exceptUid`). */
export function adjacentUids(
	map: Map<number, { uid: string }>,
	cells: number[],
	width: number,
	gridSize: number,
	exceptUid: string,
): Set<string> {
	const rows = Math.ceil(gridSize / width)
	const found = new Set<string>()
	for (const cell of cells) {
		const { row, col } = toCell(cell, width)
		const candidates: Cell[] = [
			{ row: row - 1, col },
			{ row: row + 1, col },
			{ row, col: col - 1 },
			{ row, col: col + 1 },
		]
		for (const candidate of candidates) {
			if (candidate.row < 0 || candidate.col < 0 || candidate.col >= width || candidate.row >= rows) continue
			const neighbour = map.get(toSlot(candidate, width))
			if (neighbour && neighbour.uid !== exceptUid) found.add(neighbour.uid)
		}
	}
	return found
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
	 * — the pet level is not high enough yet, so they cannot be used.
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
	 * — the pet level is not high enough yet.
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

/** Selling refunds 50% of the Paw Tally actually paid. */
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
