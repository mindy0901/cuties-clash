import type { StatusKey } from './types'

export const STATUS_TEXT: Record<StatusKey, string> = {
	slow: 'Chậm',
	freeze: 'Đóng Băng',
	poison: 'Độc',
	burn: 'Cháy',
	regen: 'Hồi phục',
	cdr: 'Giảm hồi chiêu',
	brittle: 'Giòn',
	weaken: 'Yếu ớt',
	wound: 'Vết thương',
}

export const STATUS_ICON: Record<StatusKey, string> = {
	slow: '🐌',
	freeze: '🧊',
	poison: '☠️',
	burn: '🔥',
	regen: '💚',
	cdr: '⏱️',
	brittle: '💔',
	weaken: '💧',
	wound: '🩸',
}

/**
 * The statuses a **cleanse** removes. `regen` and `cdr` are buffs, so they survive — a kit that heals
 * must never strip the owner's own good effects.
 */
export const DEBUFF_STATUSES: StatusKey[] = ['slow', 'freeze', 'poison', 'burn', 'brittle', 'weaken', 'wound']
