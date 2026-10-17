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

	it('gives every per-star field one control per star rank', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		for (const key of ['damage', 'attackInterval', 'desc']) {
			const controls = document.querySelectorAll(`[data-admin-field="${key}"]`)
			expect(controls, `${key} must have one control per star`).toHaveLength(5)
		}
		// The star rank is written above each control, so a value can never be attributed wrongly.
		for (const star of [1, 2, 3, 4, 5]) {
			expect(document.querySelector(`[data-admin-star="${star}"]`)).toBeTruthy()
		}
		expect(document.querySelector('[data-admin-field="damage"][data-admin-star="5"]')).toBeTruthy()
	})

	it('sends the whole per-star array when a single star rank changes', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const damage = document.querySelectorAll<HTMLInputElement>('[data-admin-field="damage"]')
		expect([...damage].map((input) => input.value)).toEqual(['12', '20', '32', '50', '78'])
		fireEvent.change(damage[4]!, { target: { value: '99' } })
		fireEvent.click(screen.getByText(/Lưu/))

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.body).toEqual({ damage: [12, 20, 32, 50, 99] })
	})

	it('edits which star ranks have art with checkboxes', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const boxes = document.querySelectorAll<HTMLInputElement>('[data-admin-field="stars"]')
		expect(boxes).toHaveLength(5)
		expect([...boxes].map((box) => box.checked)).toEqual([true, true, true, true, false])

		fireEvent.click(boxes[4]!)
		fireEvent.click(screen.getByText(/Lưu/))

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.body).toEqual({ stars: [1, 2, 3, 4, 5] })
	})

	it('refuses to save an empty art list instead of sending a no-op override', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const boxes = document.querySelectorAll<HTMLInputElement>('[data-admin-field="stars"]')
		boxes.forEach((box) => {
			if (box.checked) fireEvent.click(box)
		})
		fireEvent.click(screen.getByText(/Lưu/))

		expect(await screen.findByText(/chọn ít nhất một sao/)).toBeTruthy()
		expect(puts, 'nothing is sent when the form is invalid').toHaveLength(0)
	})

	it('edits the footprint with two number inputs instead of raw JSON', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const width = document.querySelector<HTMLInputElement>('[data-admin-size="w"]')!
		const height = document.querySelector<HTMLInputElement>('[data-admin-size="h"]')!
		expect([width.value, height.value]).toEqual(['1', '3'])

		fireEvent.change(height, { target: { value: '4' } })
		fireEvent.click(screen.getByText(/Lưu/))

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.body).toEqual({ space: { w: 1, h: 4 } })
	})

	it('shows the quality colour mapping and sends the chosen quality', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const select = document.querySelector<HTMLSelectElement>('[data-admin-field="quality"]')!
		expect(select.options).toHaveLength(5)
		expect(select.value).toBe('1')
		expect(document.querySelector('[data-admin-quality-swatch]')!.className).toContain('bg-quality-1')

		fireEvent.change(select, { target: { value: '5' } })
		expect(document.querySelector('[data-admin-quality-swatch]')!.className).toContain('bg-quality-5')

		fireEvent.click(screen.getByText(/Lưu/))
		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.body).toEqual({ quality: 5 })
	})

	it('reports an invalid per-star value instead of sending it', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// 999 999 is above the range the server accepts for damage.
		const damage = document.querySelector<HTMLInputElement>('[data-admin-field="damage"][data-admin-star="3"]')!
		fireEvent.change(damage, { target: { value: '999999' } })
		fireEvent.click(screen.getByText(/Lưu/))

		expect(await screen.findByText(/3★ phải ≤ 100000/)).toBeTruthy()
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
