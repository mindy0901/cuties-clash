import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/**
 * shadcn/ui Label — same API and look, without `@radix-ui/react-label`.
 *
 * ⚠️ Why no Radix here: the primitive only adds `htmlFor` wiring, which a native `<label>` already does,
 * and a new dependency would have to be reinstalled inside the dev container before the page renders.
 */
export function Label({ className, ...props }: ComponentProps<'label'>) {
	return (
		<label
			data-slot="label"
			className={cn(
				'flex items-center gap-1.5 text-[12.5px] leading-none text-muted select-none',
				'peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
				className,
			)}
			{...props}
		/>
	)
}
