import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/**
 * shadcn/ui Input, themed with this game's tokens.
 *
 * Every admin control goes through this instead of repeating the border/background classes at the call
 * site, so a field, a search box and a per-star box always look like the same control.
 */
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				'w-full min-w-0 rounded-lg border border-border bg-black/40 px-2 py-1.5 text-[13px] text-foreground',
				'placeholder:text-muted focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring/60',
				'disabled:pointer-events-none disabled:opacity-45',
				className,
			)}
			{...props}
		/>
	)
}
