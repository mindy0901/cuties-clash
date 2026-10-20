// @vitest-environment jsdom
/**
 * The **Kits** tab of `/admin`: the catalogue of the game, and everything an admin can do to it —
 * create a kit, rename it, **move it to another catalogue**, delete it, and manage the catalogues.
 *
 * The page talks to `/api/content` + `/api/admin/content/kit…`, so the fetch layer is stubbed — the
 * backend has the matching route tests in `backend/tests/content.spec.ts`.
 */
import { cleanup, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminContentScreen } from '../AdminContentScreen'
import { renderInRouter } from '../../test/router'
import { installRetiredItems } from '../../test/retiredItems'
import { applyContentOverrides } from '../../game/content'
import { useUiStore } from '../../store/uiStore'

const ADMIN_SESSION = {
	authenticated: true,
	user: {
		id: 1,
		display_name: 'Quản trị',
		email: 'quantri@example.com',
		avatar_url: null,
		providers: ['google'],
		is_admin: true,
	},
	available_providers: ['google'],
	auto_login: false,
}

const CODE_CATEGORIES = [
	{ id: 'attack', label: 'Attack', position: 0 },
	{ id: 'control', label: 'Control', position: 1 },
	{ id: 'support', label: 'Support', position: 2 },
	{ id: 'defense', label: 'Defense', position: 3 },
	{ id: 'stats', label: 'Stats & resources', position: 4 },
]

function json(body: unknown, status = 200) {
	return { ok: status < 400, status, json: async () => body } as unknown as Response
}

/** Stub `fetch` and record every write the page sends. */
function stubApi() {
	const puts: { url: string; body: unknown }[] = []
	const posts: { url: string; body: unknown }[] = []
	const deletes: string[] = []
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input)
			if (url.includes('/api/auth/session')) return json(ADMIN_SESSION)
			if (/\/api\/admin\/content\/kit(-category)?(\/|$)/.test(url)) {
				const body = init?.body === undefined ? null : JSON.parse(String(init.body))
				if (init?.method === 'PUT') {
					puts.push({ url, body })
					return json({ entry: null, category: null })
				}
				if (init?.method === 'POST') {
					posts.push({ url, body })
					return json({ entry: null, category: null }, 201)
				}
				deletes.push(url)
				return json({ ok: true })
			}
			if (url.includes('/api/admin/content')) return json({ overrides: [], art: [] })
			if (url.includes('/api/content')) {
				return json({ items: {}, cuties: {}, kits: { categories: [], entries: {} }, art: {} })
			}
			return json({}, 404)
		}),
	)
	return { puts, posts, deletes }
}

/** Open the Kits tab and wait for the catalogue to be drawn. */
async function openKitsTab() {
	renderInRouter(<AdminContentScreen />)
	const tab = await waitFor(() => {
		// ⚠️ Not `getByText('Kits')`: the item editor also has a "Kits" heading.
		const found = document.querySelector('[data-admin-tab="kit"]')
		if (!found) throw new Error('the Kits tab is missing')
		return found
	})
	fireEvent.click(tab)
	await waitFor(() => {
		if (!document.querySelector('[data-admin-kit="basic-attack"]')) {
			throw new Error('the kit catalogue did not render')
		}
	})
}

/** Pick `value` from the shadcn menu behind `selector` (a trigger with that data attribute). */
async function pick(selector: string, value: string) {
	const trigger = await waitFor(() => {
		const found = document.querySelector(selector)
		if (!found) throw new Error(`${selector} is missing`)
		return found
	})
	fireEvent.keyDown(trigger, { key: 'ArrowDown' })
	const option = await waitFor(() => {
		const found = document.querySelector<HTMLElement>(`[data-admin-option="${value}"]`)
		if (!found) throw new Error(`option "${value}" is not in the menu`)
		return found
	})
	fireEvent.click(option)
}

beforeEach(() => {
	vi.unstubAllGlobals()
	useUiStore.setState({ adminKind: 'item', adminId: '' })
	installRetiredItems()
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	applyContentOverrides(null)
})

describe('kit catalogue', () => {
	it('lists every kit filed by what it is for, not by the entity carrying it', async () => {
		stubApi()
		await openKitsTab()

		const headings = [...document.querySelectorAll('h4')].map((node) => node.textContent ?? '')
		expect(headings.some((text) => text.startsWith('Attack'))).toBe(true)
		expect(headings.some((text) => text.startsWith('Control'))).toBe(true)
		expect(headings.some((text) => text.startsWith('Support'))).toBe(true)
		expect(headings.some((text) => text.startsWith('Defense'))).toBe(true)

		// One row per kit, with its id and what it is attached to.
		const burn = document.querySelector('[data-admin-kit="burn-on-hit"]')!
		expect(burn.textContent).toContain('burn-on-hit')
		expect(burn.querySelector('[data-admin-kit-usage]')!.textContent).toContain('Used by')
		// A kit nothing carries says so instead of showing an empty list.
		expect(
			document.querySelector('[data-admin-kit="debuff-heal"] [data-admin-kit-usage]')!.textContent,
		).toBe('Used by nobody')
		// An item-only kit is marked as such.
		expect(document.querySelector('[data-admin-kit="stats"]')!.textContent).toContain('item only')
	})

	it('files a kit under a catalogue the admin added, and follows a rename', async () => {
		stubApi()
		applyContentOverrides({
			kits: {
				categories: [
					...CODE_CATEGORIES.map((category) =>
						category.id === 'control' ? { ...category, label: 'Debuffs' } : category,
					),
					{ id: 'extra', label: 'My catalogue', position: 5 },
				],
				entries: { 'burn-on-hit': { categoryId: 'extra' } },
			},
		})
		await openKitsTab()

		const headings = [...document.querySelectorAll('h4')].map((node) => node.textContent ?? '')
		expect(headings.some((text) => text.startsWith('Debuffs'))).toBe(true)
		expect(headings.some((text) => text.startsWith('My catalogue'))).toBe(true)
		// The moved kit is drawn under its new heading, not the old one.
		expect(document.querySelector('[data-admin-category="extra"]')!.textContent).toContain('burn-on-hit')
		expect(document.querySelector('[data-admin-category="control"]')!.textContent).not.toContain(
			'burn-on-hit',
		)
	})

	it('asks before deleting, then sends the removal', async () => {
		const { posts } = stubApi()
		await openKitsTab()

		fireEvent.click(document.querySelector('[data-admin-kit-delete="burn-on-hit"]')!)
		expect(posts).toHaveLength(0)
		const dialog = await waitFor(() => {
			const found = document.querySelector('[data-confirm-dialog]')
			if (!found) throw new Error('the confirmation did not open')
			return found
		})
		expect(dialog.textContent).toContain('will not exist anywhere in the game')

		fireEvent.click(document.querySelector('[data-confirm-accept]')!)
		await waitFor(() => expect(posts).toHaveLength(1))
		expect(posts[0]!.url).toContain('/api/admin/content/kit/burn-on-hit/remove')
		expect(posts[0]!.body).toEqual({ removed: true })
	})

	it('moves a kit to another catalogue from its edit form', async () => {
		const { puts } = stubApi()
		await openKitsTab()

		fireEvent.click(document.querySelector('[data-admin-kit-edit="burn-on-hit"]')!)
		await waitFor(() => {
			if (!document.querySelector('[data-admin-kit-form="burn-on-hit"]')) {
				throw new Error('the edit form did not open')
			}
		})
		await pick('[data-admin-kit-form="burn-on-hit"] [data-admin-kit-form-category]', 'support')
		fireEvent.click(document.querySelector('[data-admin-kit-form-save="burn-on-hit"]')!)

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/kit/burn-on-hit')
		// The catalogue is the "move": the same save carries the label, the audience and the seeds.
		expect(puts[0]!.body).toMatchObject({ categoryId: 'support', appliesTo: 'both' })
		// The boxes hold strings; the payload must hold **numbers** (the server rejects anything else).
		const params = (puts[0]!.body as { params: Record<string, number[]> }).params
		expect(params.chance).toEqual([30, 30, 30, 30, 30])
	})

	it('creates a kit on top of a mechanic, in a chosen catalogue', async () => {
		const { posts } = stubApi()
		await openKitsTab()

		fireEvent.click(document.querySelector('[data-admin-kit-new]')!)
		const label = await waitFor(() => {
			const found = document.querySelector<HTMLInputElement>('[data-admin-kit-label]')
			if (!found) throw new Error('the new-kit form did not open')
			return found
		})
		await pick('[data-admin-kit-mechanic]', 'burn-on-hit')
		fireEvent.change(label, { target: { value: 'Burn II' } })
		await pick('[data-admin-kit-category]', 'control')
		fireEvent.click(document.querySelector('[data-admin-kit-create]')!)

		await waitFor(() => expect(posts).toHaveLength(1))
		expect(posts[0]!.url).toMatch(/\/api\/admin\/content\/kit$/)
		expect(posts[0]!.body).toEqual({ mechanic: 'burn-on-hit', label: 'Burn II', categoryId: 'control' })
	})

	it('shows a deleted kit on the side and brings it back', async () => {
		const { deletes } = stubApi()
		applyContentOverrides({ kits: { categories: [], entries: { 'burn-on-hit': { removed: true } } } })
		await openKitsTab()

		await waitFor(() => {
			if (!document.querySelector('[data-admin-kit-removed="burn-on-hit"]')) {
				throw new Error('the deleted kit is not listed')
			}
		})
		expect(document.querySelector('[data-admin-kit="burn-on-hit"]')).toBeNull()

		// A code kit comes back by dropping its catalogue row.
		fireEvent.click(document.querySelector('[data-admin-kit-restore="burn-on-hit"]')!)
		await waitFor(() => expect(deletes).toHaveLength(1))
		expect(deletes[0]).toContain('/api/admin/content/kit/burn-on-hit')
	})

	it('creates a catalogue, and refuses to delete one that still holds kits', async () => {
		const { posts } = stubApi()
		applyContentOverrides({
			kits: {
				categories: [...CODE_CATEGORIES, { id: 'extra', label: 'My catalogue', position: 5 }],
				entries: {},
			},
		})
		await openKitsTab()

		// A catalogue holding kits cannot be deleted: the button says why instead of doing nothing.
		const used = document.querySelector<HTMLButtonElement>('[data-admin-category-delete="attack"]')!
		expect(used.disabled).toBe(true)
		expect(used.title).toContain('Move the')
		// An empty one can.
		expect(document.querySelector<HTMLButtonElement>('[data-admin-category-delete="extra"]')!.disabled).toBe(
			false,
		)

		fireEvent.click(document.querySelector('[data-admin-category-new]')!)
		const name = await waitFor(() => {
			const found = document.querySelector<HTMLInputElement>('[data-admin-category-name]')
			if (!found) throw new Error('the new-catalogue form did not open')
			return found
		})
		fireEvent.change(name, { target: { value: 'Bleed' } })
		fireEvent.click(document.querySelector('[data-admin-category-create]')!)
		await waitFor(() => expect(posts).toHaveLength(1))
		expect(posts[0]!.url).toContain('/api/admin/content/kit-category')
		expect(posts[0]!.body).toEqual({ label: 'Bleed' })
	})

	it('renames a catalogue', async () => {
		const { puts } = stubApi()
		await openKitsTab()

		fireEvent.click(document.querySelector('[data-admin-category-rename="control"]')!)
		const input = await waitFor(() => {
			const found = document.querySelector<HTMLInputElement>('[data-admin-category-rename-input]')
			if (!found) throw new Error('the rename form did not open')
			return found
		})
		fireEvent.change(input, { target: { value: 'Debuffs' } })
		fireEvent.click(document.querySelector('[data-admin-category-save]')!)

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/kit-category/control')
		expect(puts[0]!.body).toEqual({ label: 'Debuffs' })
	})

	it('does not offer a deleted kit when adding a kit to an item', async () => {
		stubApi()
		applyContentOverrides({ kits: { categories: [], entries: { 'damage-boost': { removed: true } } } })
		renderInRouter(<AdminContentScreen />)
		// The item tab (default) — open its add-kit menu.
		const trigger = await waitFor(() => {
			const found = document.querySelector('[data-admin-add-kit-open]')
			if (!found) throw new Error('the add-kit button is missing')
			return found
		})
		fireEvent.keyDown(trigger, { key: 'ArrowDown' })
		await waitFor(() => {
			if (!document.querySelector('[data-admin-add-kit="basic-attack"]')) {
				throw new Error('the kit menu did not open')
			}
		})
		expect(document.querySelector('[data-admin-add-kit="damage-boost"]')).toBeNull()
	})
})
