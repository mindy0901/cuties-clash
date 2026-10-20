import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

/** shadcn/ui Badge, themed with the game's line/muted colours. */
const badgeVariants = cva(
	'inline-flex items-center rounded-md border px-1.5 py-px text-[11px] whitespace-nowrap',
	{
		variants: {
			variant: {
				default: 'border-border text-muted-foreground',
				gold: 'border-primary/45 text-primary',
				danger: 'border-destructive/50 text-destructive',
			},
		},
		defaultVariants: { variant: 'default' },
	},
)

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
	return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
