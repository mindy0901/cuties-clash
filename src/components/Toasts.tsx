import { useGameStore } from '../store/gameStore'

export function Toasts() {
	const toasts = useGameStore((state) => state.toasts)
	const dismiss = useGameStore((state) => state.dismissToast)

	if (toasts.length === 0) return null
	return (
		<div className="toasts">
			{toasts.map((toast) => (
				<div className={`toast ${toast.tone}`} key={toast.id} onClick={() => dismiss(toast.id)}>
					{toast.text}
				</div>
			))}
		</div>
	)
}
