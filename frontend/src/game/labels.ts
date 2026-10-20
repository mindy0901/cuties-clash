import type { StatusKey } from './types'

export const STATUS_TEXT: Record<StatusKey, string> = {
	slow: 'Chậm',
	freeze: 'Đóng Băng',
	poison: 'Độc',
	burn: 'Cháy',
	regen: 'Hồi phục',
	cdr: 'Giảm hồi chiêu',
	brittle: 'Giòn',
}

export const STATUS_ICON: Record<StatusKey, string> = {
	slow: '🐌',
	freeze: '🧊',
	poison: '☠️',
	burn: '🔥',
	regen: '💚',
	cdr: '⏱️',
	brittle: '💔',
}
