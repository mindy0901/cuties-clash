import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names the shadcn way: `clsx` for conditionals, `tailwind-merge` so a later utility
 * (`px-6`) actually beats an earlier one (`px-2.5`) instead of both landing in the class list.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}
