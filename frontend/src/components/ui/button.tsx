import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/**
 * shadcn/ui `Button`, themed with this game's tokens instead of the stock palette.
 *
 * The shape is the **stock shadcn one** — `rounded-md`, a fixed height per size, `shadow-xs`, a flat
 * background and a `ring` on focus — so a screen reads like the rest of the shadcn ecosystem instead of
 * carrying a bespoke button of its own. Only the colours come from `styles/app.css` (`gold` is
 * `primary`, `ink-700` is `secondary`, `danger` is `destructive`).
 *
 * ⚠️ ❌ No gradient, no `active:translate-y-px`, no `rounded-[10px]`: those belonged to the removed
 * `btnClass` helpers, and they were exactly why the pages looked different from any shadcn example.
 */
const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
	{
		variants: {
			variant: {
				/** The main action — gold in this game. */
				primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
				/** Same look as shadcn's `default`, which this theme paints gold. */
				default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
				secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
				outline:
					'border border-border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				/** Filled red — the action destroys something. */
				destructive:
					'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/25',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
				md: 'h-9 px-4 py-2 has-[>svg]:px-3',
				lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
				icon: 'size-9',
				'sm-icon': 'size-8',
			},
		},
		defaultVariants: { variant: 'secondary', size: 'md' },
	},
)

export type ButtonProps = ComponentProps<'button'> &
	VariantProps<typeof buttonVariants> & {
		/** Render the single child instead of a `<button>` (e.g. a router `<Link>`). */
		asChild?: boolean
	}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
	const Component = asChild ? Slot : 'button'
	return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }
