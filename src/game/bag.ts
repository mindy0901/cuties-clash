import { MAX_STAR, getTemplate, starPrice } from './items'
import type { ItemInstance, Star } from './types'

export function rowOf(slot: number, width: number): number {
	return Math.floor(slot / width)
}

export function colOf(slot: number, width: number): number {
	return slot % width
}

/** Orthogonal neighbours inside a grid of `width × rows`. */
export function neighbors(slot: number, width: number, size: number): number[] {
	const row = rowOf(slot, width)
	const col = colOf(slot, width)
	const rows = Math.ceil(size / width)
	const result: number[] = []
	if (row > 0) result.push(slot - width)
	if (row < rows - 1) result.push(slot + width)
	if (col > 0) result.push(slot - 1)
	if (col < width - 1) result.push(slot + 1)
	return result.filter((index) => index >= 0 && index < size)
}

export function findFreeSlot(items: ItemInstance[], size: number): number {
	const taken = new Set(items.filter((item) => item.slot >= 0).map((item) => item.slot))
	for (let slot = 0; slot < size; slot += 1) {
		if (!taken.has(slot)) return slot
	}
	return -1
}

export function itemAt(items: ItemInstance[], slot: number): ItemInstance | undefined {
	return items.find((item) => item.slot === slot)
}

export function isMergeable(a: ItemInstance, b: ItemInstance): boolean {
	return a.templateId === b.templateId && a.star === b.star && a.star < MAX_STAR
}

export interface MoveResult {
	items: ItemInstance[]
	merged: boolean
	swapped: boolean
	reason?: 'blocked' | 'same-slot' | 'out-of-bounds'
}

/**
 * Drag-and-drop resolution: drop an item on an empty slot, on a matching copy
 * (merge → +1★) or on an unrelated item (swap).
 */
export function resolveDrop(items: ItemInstance[], movingUid: string, targetSlot: number, size: number): MoveResult {
	const moving = items.find((item) => item.uid === movingUid)
	if (!moving) return { items, merged: false, swapped: false, reason: 'blocked' }
	if (targetSlot < 0 || targetSlot >= size) return { items, merged: false, swapped: false, reason: 'out-of-bounds' }
	if (moving.slot === targetSlot) return { items, merged: false, swapped: false, reason: 'same-slot' }

	const target = itemAt(items, targetSlot)
	if (!target) {
		return {
			items: items.map((item) => (item.uid === moving.uid ? { ...item, slot: targetSlot } : item)),
			merged: false,
			swapped: false,
		}
	}

	if (isMergeable(moving, target)) {
		const nextStar = (target.star + 1) as Star
		return {
			items: items
				.filter((item) => item.uid !== moving.uid)
				.map((item) =>
					item.uid === target.uid
						? { ...item, star: nextStar, paid: item.paid + moving.paid, slot: targetSlot }
						: item,
				),
			merged: true,
			swapped: false,
		}
	}

	const movingFrom = moving.slot
	return {
		items: items.map((item) => {
			if (item.uid === moving.uid) return { ...item, slot: targetSlot }
			if (item.uid === target.uid) return { ...item, slot: movingFrom }
			return item
		}),
		merged: false,
		swapped: true,
	}
}

/** Selling refunds 50% of the Paw Tally that was actually spent. */
export function sellValue(item: ItemInstance): number {
	return Math.max(1, Math.floor(item.paid / 2))
}

export function createItemInstance(templateId: string, star: Star, uid: string, slot = -1): ItemInstance {
	const template = getTemplate(templateId)
	return { uid, templateId, star, slot, paid: starPrice(template.cost, star) }
}
