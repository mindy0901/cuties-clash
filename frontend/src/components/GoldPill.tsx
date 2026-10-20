import { Gold } from './icons'
import { cn } from '../lib/utils'

/**
 * How much gold the player holds — the one place the amount is drawn.
 *
 * Why a component: the amount used to be a small `<span>` with a 13 px number and a paw glyph, which
 * made the most important number on a shop screen the smallest thing on it. Big tabular figures, a
 * coin in a dark disc, and a warm gold gradient make it the anchor of the panel instead.
 *
 * ⚠️ `aria-label` carries the unit ("12 gold") because the icon is `aria-hidden`.
 */
export function GoldPill({
	amount,
	size = 'md',
	className,
}: {
	amount: number
	/** `md` for a toolbar, `lg` for a screen header. */
	size?: 'md' | 'lg'
	className?: string
}) {
	const large = size === 'lg'
	return (
		<span
			data-gold-pill={size}
			aria-label={`${amount} gold`}
			className={cn(
				'inline-flex items-center rounded-full border border-gold/40 bg-linear-to-b from-gold/25 to-gold/5 font-bold tabular-nums text-gold-soft shadow-[inset_0_1px_0_rgb(255_255_255/12%)]',
				large ? 'gap-2.5 pr-5 pl-2 py-1.5 text-xl' : 'gap-2 pr-3.5 pl-1.5 py-1 text-base',
				className,
			)}
		>
			<span
				className={cn(
					'grid place-items-center rounded-full bg-ink-900/70 text-gold shadow-[0_0_10px_rgb(217_162_39/35%)]',
					large ? 'size-8 text-[18px]' : 'size-6 text-[14px]',
				)}
			>
				<Gold />
			</span>
			{amount.toLocaleString('en-US')}
		</span>
	)
}
