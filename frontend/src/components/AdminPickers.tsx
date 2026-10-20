import { Check, ChevronDown } from './icons'
import { cn } from './ui'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from './shadcn/dropdown-menu'

/**
 * Look of a dropdown trigger — the same box as `Input`, so a picker and a text box line up in a row.
 *
 * ⚠️ Kept as a class string (not a component) because the picker is a `<button>` with a chevron, and a
 * native `<option>` list is still used where a menu would hide the current value.
 */
export const selectTriggerClass =
	'flex w-full min-w-0 items-center rounded-lg border border-line bg-black/40 px-2 py-1.5 text-[13px] text-paper'

/**
 * One dropdown option list, drawn with the shadcn **DropdownMenu** rather than a native `<select>`.
 *
 * ⚠️ Why the menu and not shadcn `Select`: a Radix `Select` needs pointer-event captures that jsdom
 * does not implement, so the admin tests could no longer drive it (and this repo has no global test
 * setup file to polyfill them). The menu is the same shadcn component set, and the tests already
 * click through it successfully.
 */
export function OptionPicker({
	fieldKey,
	value,
	options,
	onChange,
	...props
}: {
	fieldKey: string
	value: string
	options: { value: string | number; label: string }[]
	onChange: (value: string) => void
} & Record<`data-${string}`, string | undefined>) {
	const current = options.find((option) => String(option.value) === value)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					data-admin-field={fieldKey}
					className={cn(selectTriggerClass, 'flex-1 justify-between gap-2 text-left')}
					{...props}
				>
					<span className="min-w-0 truncate">{current?.label ?? '—'}</span>
					<ChevronDown className="size-3.5 shrink-0 opacity-70" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-[220px]">
				{options.map((option) => (
					<DropdownMenuItem
						key={option.value}
						data-admin-option={String(option.value)}
						className="flex-row items-center gap-2 py-2"
						onSelect={() => onChange(String(option.value))}
					>
						<span className="font-semibold">{option.label}</span>
						{String(option.value) === value ? (
							<Check className="ml-auto size-4 shrink-0 text-gold-soft" />
						) : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
