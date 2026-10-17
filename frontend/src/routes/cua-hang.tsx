import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Legacy Vietnamese URL for the shop, kept so old links, bookmarks and open tabs still work.
 *
 * ⚠️ `replace: true` so the redirect does **not** add a history entry: otherwise the back button
 * would bounce between `/cua-hang` and `/shop` forever.
 */
export const Route = createFileRoute('/cua-hang')({
	beforeLoad: () => {
		throw redirect({ to: '/shop', replace: true })
	},
})
