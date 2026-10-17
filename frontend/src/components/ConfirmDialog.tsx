import { useEffect, useRef } from 'react'
import { btnClass, btnGhostClass, btnGoldClass, btnPrimaryClass, cn, dialogClass, overlayClass } from './ui'

export interface ConfirmDialogProps {
	title: string
	message: string
	/** Label of the button that goes ahead with the action. */
	confirmLabel?: string
	cancelLabel?: string
	/** `danger` paints the confirm button red — use it when the action destroys progress. */
	tone?: 'danger' | 'gold'
	onConfirm: () => void
	onCancel: () => void
}

/**
 * Modal confirmation for an action that cannot be undone.
 *
 * ⚠️ WHY NOT `window.confirm`: the native box is drawn by the browser (not styled by the app,
 * not translatable), it **blocks** the page and it cannot be driven by a test without stubbing
 * `window` — Playwright has to accept a browser dialog instead of clicking a button.
 *
 * ⚠️ The **cancel** button takes focus when the dialog opens, so a stray Enter (or a click that
 * lands while the dialog appears) can never confirm a destructive action.
 */
export function ConfirmDialog({
	title,
	message,
	confirmLabel = 'Xác nhận',
	cancelLabel = 'Huỷ',
	tone = 'danger',
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	const cancelRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		cancelRef.current?.focus()
	}, [])

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onCancel()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onCancel])

	return (
		<div className={overlayClass} onClick={onCancel}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={title}
				data-confirm-dialog
				className={cn(dialogClass, 'w-[min(440px,100%)]')}
				onClick={(event) => event.stopPropagation()}
			>
				<h2 className="text-[20px]">{title}</h2>
				<p className="m-0 text-[13.5px] text-muted">{message}</p>
				<div className="flex flex-wrap items-center justify-end gap-2.5">
					<button
						ref={cancelRef}
						type="button"
						data-confirm-cancel
						className={cn(btnClass, btnGhostClass)}
						onClick={onCancel}
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						data-confirm-accept
						className={cn(btnClass, tone === 'danger' ? btnPrimaryClass : btnGoldClass)}
						onClick={onConfirm}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	)
}
