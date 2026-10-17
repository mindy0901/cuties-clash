// @vitest-environment jsdom
/**
 * Content admin page: access gate and the "only send what changed" contract.
 *
 * The page talks to `/api/admin/content`, so the fetch layer is stubbed here — the backend has
 * its own route tests in `backend/tests/content.spec.ts`.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminContentScreen } from '../AdminContentScreen'
import { renderInRouter } from '../../test/router'

/** Session of an admin account. */
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

const MEMBER_SESSION = {
	...ADMIN_SESSION,
	user: { ...ADMIN_SESSION.user, is_admin: false },
}

interface Stub {
	session?: typeof ADMIN_SESSION
	overrides?: unknown[]
}

/** Stub `fetch` for the endpoints the page uses and record PUT bodies. */
function stubApi(options: Stub = {}) {
	const puts: { url: string; body: unknown }[] = []
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url.includes('/api/auth/session')) {
			return json(options.session ?? ADMIN_SESSION)
		}
		if (url.includes('/api/admin/content') && init?.method === 'PUT') {
			puts.push({ url, body: JSON.parse(String(init.body)) })
			return json({ override: null })
		}
		if (url.includes('/api/admin/content')) {
			return json({ overrides: options.overrides ?? [] })
		}
		if (url.includes('/api/content')) return json({ items: {}, pets: {} })
		return json({}, 404)
	})
	vi.stubGlobal('fetch', fetchMock)
	return { puts }
}

function json(body: unknown, status = 200) {
	return {
		ok: status < 400,
		status,
		json: async () => body,
	} as unknown as Response
}

beforeEach(() => {
	vi.unstubAllGlobals()
})

afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe('access gate', () => {
	it('asks an anonymous visitor to sign in', async () => {
		stubApi({
			session: { ...ADMIN_SESSION, authenticated: false, user: null as never },
		})
		renderInRouter(<AdminContentScreen />)

		expect(await screen.findByText(/Hãy đăng nhập bằng tài khoản quản trị/)).toBeTruthy()
	})

	it('tells a regular account that it has no admin rights', async () => {
		stubApi({ session: MEMBER_SESSION })
		renderInRouter(<AdminContentScreen />)

		expect(await screen.findByText(/không có quyền quản trị/)).toBeTruthy()
	})
})

describe('editing content', () => {
	it('lists items and switches to pets', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)

		expect(await screen.findByText(/Quản trị nội dung/)).toBeTruthy()
		await waitFor(() => {
			expect(document.querySelector('[data-admin-entry="wooden-blade"]')).toBeTruthy()
		})

		fireEvent.click(screen.getByText('Thú cưng'))
		// Switching kind must not blow up on the id of the other kind (blank page).
		expect(await screen.findByText('fire-pup')).toBeTruthy()
	})

	it('sends only the fields that differ from the code default', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')
		const cost = document.querySelector<HTMLInputElement>('[data-admin-field="cost"]')!
		fireEvent.change(cost, { target: { value: '9' } })
		fireEvent.click(screen.getByText(/Lưu/))

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/item/wooden-blade')
		// Only `cost` — sending every field would freeze the others against future code edits.
		expect(puts[0]!.body).toEqual({ cost: 9 })
	})

	it('reports an invalid per-star value instead of sending it', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const damage = document.querySelector<HTMLInputElement>('[data-admin-field="damage"]')!
		fireEvent.change(damage, { target: { value: '1, 2' } })
		fireEvent.click(screen.getByText(/Lưu/))

		expect(await screen.findByText(/cần đúng 4 giá trị/)).toBeTruthy()
		expect(puts, 'nothing is sent when the form is invalid').toHaveLength(0)
	})

	it('marks entities that already have an override', async () => {
		stubApi({
			overrides: [
				{
					kind: 'item',
					entityId: 'fire-spear',
					payload: { cost: 9 },
					updatedAt: '2026-01-01T00:00:00.000Z',
					updatedBy: 'quantri@example.com',
				},
			],
		})
		renderInRouter(<AdminContentScreen />)

		await screen.findByText('wooden-blade')
		await waitFor(() => {
			const entry = document.querySelector<HTMLElement>('[data-admin-entry="fire-spear"]')
			expect(entry?.textContent, 'an overridden entry must be marked').toContain('●')
		})
	})
})
