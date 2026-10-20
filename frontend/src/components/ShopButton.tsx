import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, ShoppingCart } from './icons'
import { cn } from './ui'
import { Button } from './ui/button'
import { translate } from '../i18n'

/**
 * The **Shop** button — it opens the shop page, and it is the surface an item is dragged onto to
 * **sell it for 50 %** (`data-shop-drop-target`, read by the release handler in `PrepScreen`).
 *
 * ⚠️ It lives at the bottom of the **Equipment** panel, under the board: the items being sold are
 * right above it, so "drag the item down onto Shop" is one short movement. ❌ Do not put it back in
 * the action bar — the bar is for what happens next (map, fight, training), not for the bag.
 */
export function ShopButton({
	dropActive = false,
	isDraggingItem = false,
	onHover,
	onClick,
	className,
}: {
	/** An item is being dragged **over** the button: it switches to "Thả để bán". */
	dropActive?: boolean
	isDraggingItem?: boolean
	onHover?: (over: boolean) => void
	/** Returns `true` when the click must be swallowed (a drag-release already sold the item). */
	onClick?: () => boolean
	className?: string
}) {
	const navigate = useNavigate()
	return (
		<Button
			type="button"
			data-shop-drop-target="equipment"
			variant="destructive"
			className={cn(
				'w-full justify-center whitespace-nowrap',
				dropActive && 'scale-[1.02] animate-pulse ring-2 ring-destructive/80 shadow-lg shadow-destructive/40',
				className,
			)}
			onPointerEnter={() => {
				if (isDraggingItem) onHover?.(true)
			}}
			onPointerLeave={() => onHover?.(false)}
			title={translate('Thả vật phẩm vào đây để bán (hoàn 50%)')}
			onClick={() => {
				if (!onClick?.()) void navigate({ to: '/shop' })
			}}
		>
			<ShoppingCart /> {translate(dropActive ? 'Thả để bán' : 'Mua Vật Phẩm')}{' '}
			{!dropActive ? <ChevronRight /> : null}
		</Button>
	)
}
