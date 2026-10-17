import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Legacy Vietnamese URL for the content admin page, kept so old links, bookmarks and open tabs
 * still work.
 *
 * ⚠️ `replace: true` so the redirect does **not** add a history entry: otherwise the back button
 * would bounce between `/quan-tri` and `/admin` forever.
 */
export const Route = createFileRoute('/quan-tri')({
	beforeLoad: () => {
		throw redirect({ to: '/admin', replace: true })
	},
})
