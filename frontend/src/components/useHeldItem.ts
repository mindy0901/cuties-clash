import { useCallback, useEffect, useRef, useState } from 'react'
import type { ItemInstance, Star } from '../game/types'

/** Món đang được "nhấc lên" chờ đặt xuống. */
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
 * Nhấc một món lên bằng **một cú bấm**, rồi đặt xuống bằng **một cú bấm** khác.
 *
 * ⚠️ VÌ SAO KHÔNG KÉO-THẢ: cách kéo cần theo dõi con trỏ giữa chừng và phải giữ khớp
 * giữa "ô đang trỏ" với "ô sẽ đặt" — chỗ đó đã sinh nhiều lỗi (thả không ăn, món nằm
 * nguyên chỗ, xoay giữa lúc kéo không tới được). Bấm–bấm thì mỗi thao tác là một sự kiện
 * `click` trọn vẹn, không có trạng thái lửng lơ, và bấm sai thì bấm lại là xong.
 *
 * Thao tác:
 * - Bấm món (ở Trang bị **hoặc** Kho) → nhấc lên.
 * - Bấm một ô trong lưới Trang bị → đặt xuống đó.
 * - Bấm vào Kho khi đang cầm món của Trang bị → cất vào kho.
 * - `R` hoặc chuột phải → xoay 90°. `Esc` → bỏ nhấc.
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

	/** Nhấc món lên (hoặc bỏ nhấc nếu bấm lại chính nó). */
	const pickUp = useCallback(
		(item: ItemInstance, from: 'inventory' | 'loadout') => {
			setHeld((current) =>
				current?.uid === item.uid
					? null
					: {
							uid: item.uid,
							from,
							// Giữ hướng đang có của món làm điểm bắt đầu.
							rotated: item.rotated ?? false,
							templateId: item.templateId,
							star: item.star,
							x: current?.x ?? 0,
							y: current?.y ?? 0,
						},
			)
		},
		[],
	)

	const clear = useCallback(() => setHeld(null), [])

	/** Xoay món đang cầm. An toàn khi không cầm gì. */
	const rotateHeld = useCallback(() => {
		setHeld((current) => (current ? { ...current, rotated: !current.rotated } : current))
	}, [])

	// Giữ ảnh món bám theo con trỏ, và nghe phím tắt. Chỉ gắn khi thật sự đang cầm món.
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
		/** Bấm ra ngoài lưới lẫn kho thì bỏ nhấc. */
		const cancelOnBlank = (event: MouseEvent) => {
			const target = event.target as HTMLElement | null
			if (target?.closest('[data-cell], [data-item-box], [data-inv-tile], button')) return
			clear()
		}

		document.addEventListener('pointermove', track)
		document.addEventListener('keydown', keys)
		document.addEventListener('contextmenu', menu)
		document.addEventListener('click', cancelOnBlank)
		return () => {
			document.removeEventListener('pointermove', track)
			document.removeEventListener('keydown', keys)
			document.removeEventListener('contextmenu', menu)
			document.removeEventListener('click', cancelOnBlank)
		}
	}, [held, rotateHeld, clear])

	return { held, find, pickUp, rotateHeld, clear, pointerRef }
}
