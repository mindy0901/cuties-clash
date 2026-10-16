import { useGameStore } from '../store/gameStore'
import { cn } from './ui'

const TONE_CLASS = {
	good: 'border-l-jade',
	bad: 'border-l-danger-soft',
	info: 'border-l-gold',
} as const

export function Toasts() {
	const toasts = useGameStore((state) => state.toasts)
	const dismiss = useGameStore((state) => state.dismissToast)

	if (toasts.length === 0) return null
	return (
		<div className="fixed right-[18px] bottom-[18px] z-40 flex flex-col gap-2">
			{toasts.map((toast) => (
				<div
					className={cn(
						'max-w-[340px] animate-slide-in rounded-[10px] border border-line border-l-4 bg-ink-700 px-3.5 py-2.5 shadow-panel',
						TONE_CLASS[toast.tone],
					)}
					key={toast.id}
					onClick={() => dismiss(toast.id)}
				>
					{toast.text}
				</div>
			))}
		</div>
	)
}
