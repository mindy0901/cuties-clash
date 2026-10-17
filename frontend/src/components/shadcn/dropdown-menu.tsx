/**
 * shadcn/ui **DropdownMenu**, copied into the project and re-styled with this game's tokens.
 *
 * ⚠️ WHY NOT THE `ui/` FOLDER shadcn suggests: `src/components/ui.ts` already holds the shared class
 * strings, and a folder with the same name next to it would be a coin flip for every import. The
 * component lives in `shadcn/` instead — same file, same exported names, different home.
 *
 * ⚠️ No `lucide-react`, no `class-variance-authority`, no `tailwindcss-animate`: the menu shows no
 * icons and no animation here, and this project's `cn()` already joins class strings. Everything
 * else is the Radix primitive shadcn wraps.
 */
import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '../ui'

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuGroup = DropdownMenuPrimitive.Group

function DropdownMenuContent({
	className,
	sideOffset = 6,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				data-slot="dropdown-menu-content"
				sideOffset={sideOffset}
				className={cn(
					'z-50 min-w-[200px] overflow-hidden rounded-lg border border-line bg-ink-800 p-1 text-paper shadow-panel',
					className,
				)}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	)
}

function DropdownMenuItem({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
	return (
		<DropdownMenuPrimitive.Item
			data-slot="dropdown-menu-item"
			className={cn(
				'flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-[13px] outline-none select-none',
				'data-[highlighted]:bg-ink-600 data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
				className,
			)}
			{...props}
		/>
	)
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
	return (
		<DropdownMenuPrimitive.Label
			data-slot="dropdown-menu-label"
			className={cn('px-2 py-1 text-[11px] tracking-wide text-muted uppercase', className)}
			{...props}
		/>
	)
}

function DropdownMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
	return (
		<DropdownMenuPrimitive.Separator
			data-slot="dropdown-menu-separator"
			className={cn('my-1 h-px bg-line', className)}
			{...props}
		/>
	)
}

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuGroup,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
}
