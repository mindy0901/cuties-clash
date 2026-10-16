import { useCallback, useEffect, useRef, useState } from 'react'
import type { ItemInstance, Star } from '../game/types'

/** Món đang được **kéo** (đang giữ chuột, chưa nhả). */
export interface HeldItem {
	uid: string
	from: 'inventory' | 'loadout'
	/** Hướng sẽ áp dụng khi đặt. Phím `R` hoặc chuột phải đổi giá trị này. */
	rotated: boolean
	templateId: string
	star: Star
	/** Toạ độ con trỏ (px, viewport) — ảnh món bám theo đây. */
	x: number
	y: number
}

/**
 * Trạng thái "đang kéo một món" — **chỉ sống trong lúc giữ chuột**: từ `pointerdown` (đã đi
 * quá ngưỡng kéo) tới `pointerup`.
 *
 * ⚠️ ❌ **Không còn nhấc/đặt bằng bấm.** Bấm một món giờ mở **hộp thoại chi tiết**, nên trạng
 * thái "đang cầm" không được phép sống qua cú nhả chuột. Nhờ vậy không còn cảnh món "cầm lửng"
 * bám theo con trỏ khi người chơi đã nhả chuột.
 *
 * Thao tác:
 * - **Kéo** món (giữ chuột rồi di chuyển) → nhấc lên; **nhả chuột** → đặt xuống ô đang trỏ.
 * - `R` hoặc **chuột phải** khi đang kéo → xoay 90°. `Esc` → bỏ.
 */
export function useHeldItem(loadout: ItemInstance[], inventory: ItemInstance[]) {
	const [held, setHeld] = useState<HeldItem | null>(null)

	/**
	 * Vị trí con trỏ gần nhất.
	 *
	 * ⚠️ VÌ SAO CẦN REF RIÊNG: khi kéo món từ trang bị xuống **kho**, `pointerup` bắn ở kho
	 * nên lưới không nhận được; cha phải tự biết con trỏ đang ở đâu để quyết định "thả vào kho".
	 */
	const pointerRef = useRef({ x: 0, y: 0 })

	const find = useCallback(
		(uid: string) =>
			loadout.find((item) => item.uid === uid) ?? inventory.find((item) => item.uid === uid),
		[loadout, inventory],
	)

	/** Bắt đầu kéo một món. Ảnh bám con trỏ xuất phát từ vị trí con trỏ hiện tại. */
	const hold = useCallback((item: ItemInstance, from: 'inventory' | 'loadout') => {
		setHeld({
			uid: item.uid,
			from,
			// Giữ hướng đang có của món làm điểm bắt đầu.
			rotated: item.rotated ?? false,
			templateId: item.templateId,
			star: item.star,
			x: pointerRef.current.x,
			y: pointerRef.current.y,
		})
	}, [])

	const clear = useCallback(() => setHeld(null), [])

	/** Xoay món đang kéo. An toàn khi không kéo gì. */
	const rotateHeld = useCallback(() => {
		setHeld((current) => (current ? { ...current, rotated: !current.rotated } : current))
	}, [])

	// Giữ ảnh món bám theo con trỏ, và nghe phím tắt. Chỉ gắn khi thật sự đang kéo.
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
				clear()
			}
		}
		const menu = (event: MouseEvent) => {
			// Chuột phải = xoay (thay cho menu ngữ cảnh).
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
	}, [held, rotateHeld, clear])

	return { held, find, hold, rotateHeld, clear, pointerRef }
}
