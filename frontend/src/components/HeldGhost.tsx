import { itemArtSrc } from '../game/art'
import { getTemplate } from '../game/items'
import type { Star } from '../game/types'
import { ArtIcon } from './ArtIcon'

/** Cạnh dài nhất của ảnh món đang nhấc, tính bằng px. */
const GHOST_SIZE = 60

/**
 * Ảnh món **bám theo con trỏ** trong lúc đang nhấc món.
 *
 * Món trong lưới neo ở ô của nó, nên nếu chỉ làm mờ tại chỗ thì người chơi không thấy mình
 * đang cầm gì. Ảnh này giữ **đúng tỉ lệ ô** (1×3 nằm dọc, 3×1 nằm ngang) để khớp ô gợi ý.
 */
export function HeldGhost({
	templateId,
	star,
	rotated,
	w,
	h,
	x,
	y,
}: {
	templateId: string
	star: Star
	rotated: boolean
	w: number
	h: number
	x: number
	y: number
}) {
	const template = getTemplate(templateId)
	// Ảnh dọc/ngang theo hướng sẽ đặt.
	const size = rotated ? { w: h, h: w } : { w, h }
	const scale = GHOST_SIZE / Math.max(size.w, size.h)
	const width = Math.round(keepVisible(size.w * scale))
	const height = Math.round(keepVisible(size.h * scale))

	return (
		<div
			data-held-ghost={templateId}
			className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
			style={{ left: `${x}px`, top: `${y}px` }}
			aria-hidden
		>
			{/*
				Chỉ vẽ **icon** món, ❌ không vẽ khung/nền của ô.
				Khung bo góc màu vàng nhìn như một "ô nhỏ" thừa, và nó còn che mất ô gợi ý
				bên dưới. Icon trần vẫn đủ cho biết đang cầm món gì.
			*/}
			<div
				className="flex items-center justify-center drop-shadow-[0_2px_6px_rgb(0_0_0/70%)]"
				style={{ width: `${width}px`, height: `${height}px`, opacity: 0.95 }}
			>
				<ArtIcon
					src={itemArtSrc(templateId, star)}
					emoji={template.icon}
					emojiClass="text-2xl"
					alt={template.name}
				/>
			</div>
		</div>
	)
}

/** Không để cạnh nào nhỏ hơn ngưỡng nhìn thấy được. */
function keepVisible(value: number): number {
	return Math.max(20, value)
}
