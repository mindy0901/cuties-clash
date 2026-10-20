import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** shadcn/ui Textarea, themed like `Input` so a JSON field sits beside a number box cleanly. */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
	return (
		<textarea
			data-slot="textarea"
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
