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
import { useUiStore } from '../../store/uiStore'
import { applyContentOverrides } from '../../game/content'
import { itemCatalogue, itemTemplateById } from '../../game/items'

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
	/** Uploaded pictures reported by `/api/admin/content`. */
	art?: unknown[]
}

/**
 * Open the single "+" menu and pick one entry.
 *
 * Radix opens the menu on a keyboard press as well as on a pointer, and renders it in a **portal**,
 * so the item is looked up on `document` rather than inside the form.
 */
async function addOptional(key: string) {
	const trigger = document.querySelector('[data-admin-add-open]')
	if (!trigger) throw new Error('the add button is missing')
	fireEvent.keyDown(trigger, { key: 'ArrowDown' })
	const item = await waitFor(() => {
		const found = document.querySelector<HTMLElement>(`[data-admin-add-option="${key}"]`)
		if (!found) throw new Error(`option "${key}" is not in the menu`)
		return found
	})
	fireEvent.click(item)
}

/** Stub `fetch` for the endpoints the page uses and record PUT/DELETE calls. */
function stubApi(options: Stub = {}) {
	const puts: { url: string; body: unknown }[] = []
	const deletes: string[] = []
	const uploads: string[] = []
	/** Kept in sync with PUT/DELETE so a created or deleted item shows up again on the next read. */
	const overrides = [...(options.overrides ?? [])] as {
		kind: string
		entityId: string
		payload: Record<string, unknown>
		updatedAt: string
		updatedBy: string | null
	}[]
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input)
		if (url.includes('/api/auth/session')) {
			return json(options.session ?? ADMIN_SESSION)
		}
		if (url.includes('/art') && init?.method === 'PUT') {
			uploads.push(url)
			return json({ art: { version: 1 } }, 201)
		}
		if (url.includes('/art') && init?.method === 'DELETE') {
			deletes.push(url)
			return json({ ok: true })
		}
		if (url.includes('/api/admin/content/')) {
			const [, kind, rawId] = url.match(/\/api\/admin\/content\/(item|pet)\/(.+)$/) ?? []
			const entityId = decodeURIComponent(rawId ?? '')
			if (init?.method === 'PUT') {
				const payload = JSON.parse(String(init.body)) as Record<string, unknown>
				puts.push({ url, body: payload })
				const existing = overrides.find((entry) => entry.kind === kind && entry.entityId === entityId)
				if (existing) existing.payload = payload
				else
					overrides.push({
						kind: kind ?? 'item',
						entityId,
						payload,
						updatedAt: '2026-01-01T00:00:00.000Z',
						updatedBy: 'quantri@example.com',
					})
				return json({ override: null })
			}
			if (init?.method === 'DELETE') {
				deletes.push(url)
				const index = overrides.findIndex((entry) => entry.kind === kind && entry.entityId === entityId)
				if (index >= 0) overrides.splice(index, 1)
				return json({ ok: true })
			}
		}
		if (url.includes('/api/admin/content')) {
			return json({ overrides, art: options.art ?? [] })
		}
		if (url.includes('/api/content')) return json({ items: {}, pets: {}, art: {} })
		return json({}, 404)
	})
	vi.stubGlobal('fetch', fetchMock)
	return { puts, deletes, uploads, overrides }
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
	// The admin selection lives in `uiStore` (it has to survive the page remount after a save), so a
	// test that switches to pets would otherwise leak into the next one — the store is module state.
	useUiStore.setState({ adminKind: 'item', adminId: '' })
	// The item catalogue (list + editor) reads the overlay, which is module state as well.
	applyContentOverrides(null)
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

		for (const key of ['damage', 'speed']) {
			const controls = document.querySelectorAll(`[data-admin-field="${key}"]`)
			expect(controls, `${key} must have one control per star`).toHaveLength(5)
		}
		// The star rank is written above each control, so a value can never be attributed wrongly.
		for (const star of [1, 2, 3, 4, 5]) {
			expect(document.querySelector(`[data-admin-star="${star}"]`)).toBeTruthy()
		}
		expect(document.querySelector('[data-admin-field="damage"][data-admin-star="5"]')).toBeTruthy()
	})

	it('shows a per-star field only when the item has it, with one "+" menu to add one', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// A weapon swings but has nothing that self-triggers: no interval boxes, only the add menu.
		expect(document.querySelectorAll('[data-admin-field="interval"]')).toHaveLength(0)
		// ⚠️ ONE add button for every optional field — not one chip per field.
		expect(document.querySelectorAll('[data-admin-add-open]')).toHaveLength(1)

		// Armour does not attack at all: no damage and no speed boxes either.
		fireEvent.click(document.querySelector('[data-admin-entry="hide-vest"]')!)
		await waitFor(() => expect(document.querySelectorAll('[data-admin-field="damage"]')).toHaveLength(0))
		expect(document.querySelectorAll('[data-admin-field="speed"]')).toHaveLength(0)

		// The menu lists what is missing; picking the attack seeds damage and the standard rate.
		await addOptional('attack')
		const valuesOf = (key: string) =>
			[...document.querySelectorAll<HTMLInputElement>(`[data-admin-field="${key}"]`)].map(
				(input) => input.value,
			)
		expect(valuesOf('damage')).toEqual(['10', '10', '10', '10', '10'])
		expect(valuesOf('speed')).toEqual(['0.625', '0.625', '0.625', '0.625', '0.625'])
		// With damage and speed both filled in, the block also shows the DPM line.
		expect(document.querySelector('[data-admin-dpm]')).toBeTruthy()

		fireEvent.click(document.querySelector('[data-admin-remove-group="attack"]')!)
		expect(document.querySelectorAll('[data-admin-field="damage"]')).toHaveLength(0)
		expect(document.querySelectorAll('[data-admin-field="speed"]')).toHaveLength(0)
	})

	it('shows DPM above the damage boxes and follows every edit', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// Đao Gỗ 1★: 12 damage at 0.6667 attacks per second → 480 damage per minute.
		const line = () =>
			[...document.querySelectorAll('[data-admin-dpm] > span')].map((node) => node.textContent)
		expect(line()).toEqual(['DPM', '1★ 480', '2★ 851', '3★ 1.455', '4★ 2.439', '5★ 4.105'])

		// Each rank is printed in its own star colour, so a number's rank reads at a glance.
		expect(
			[...document.querySelectorAll('[data-admin-dpm] > span')].map(
				(node) => node.className.match(/text-rank-\d/)?.[0] ?? null,
			),
		).toEqual([null, 'text-rank-1', 'text-rank-2', 'text-rank-3', 'text-rank-4', 'text-rank-5'])

		fireEvent.change(document.querySelectorAll<HTMLInputElement>('[data-admin-field="damage"]')[0]!, {
			target: { value: '24' },
		})
		expect(line()[1]).toBe('1★ 960')

		// Doubling the speed doubles the rate: 24 × 1/s × 60.
		fireEvent.change(document.querySelectorAll<HTMLInputElement>('[data-admin-field="speed"]')[0]!, {
			target: { value: '1' },
		})
		expect(line()[1]).toBe('1★ 1.440')
	})

	it('disables Save and Reset until something changed or an override exists', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const save = screen.getByText(/Lưu/).closest('button')!
		const reset = screen.getByText('↺ Đặt lại như cũ').closest('button')!
		// Nothing edited and nothing stored → nothing to save, nothing to reset.
		expect(save.disabled).toBe(true)
		expect(reset.disabled).toBe(true)
		expect(screen.queryByText('Trạng thái')).toBeNull()
		expect(screen.queryByText('Hoàn tác ô nhập')).toBeNull()

		fireEvent.change(document.querySelectorAll<HTMLInputElement>('[data-admin-field="damage"]')[0]!, {
			target: { value: '13' },
		})
		expect(save.disabled).toBe(false)
		// An edit is also something "Đặt lại như cũ" can throw away.
		expect(reset.disabled).toBe(false)
	})

	it('keeps Reset available when the entity already has an override', async () => {
		stubApi({
			overrides: [
				{
					kind: 'item',
					entityId: 'wooden-blade',
					payload: { cost: 9 },
					updatedAt: '2026-01-01T00:00:00.000Z',
					updatedBy: 'quantri@example.com',
				},
			],
		})
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// The form is untouched, but the row holds an override only this button can delete.
		await waitFor(() =>
			expect(screen.getByText('↺ Đặt lại như cũ').closest('button')!.disabled).toBe(false),
		)
	})

	it('lets any item lose its basic attack, even a weapon that declares one', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-remove-group="attack"]')!)
		// The block collapses, so the item reads as "no attack".
		expect(document.querySelectorAll('[data-admin-field="damage"]')).toHaveLength(0)

		// The menu offers it again, and adding it back restores the numbers from code.
		await addOptional('attack')
		expect(
			[...document.querySelectorAll<HTMLInputElement>('[data-admin-field="damage"]')].map((input) => input.value),
		).toEqual(['12', '20', '32', '50', '78'])

		// Removing it a second time is what gets saved.
		fireEvent.click(document.querySelector('[data-admin-remove-group="attack"]')!)
		const save = screen.getByText(/Lưu/).closest('button')!
		expect(save.disabled).toBe(false)
		fireEvent.click(save)

		await waitFor(() => expect(puts).toHaveLength(1))
		// 0 damage at every rank = the weapon stops swinging; speed keeps its code value (inert).
		expect(puts[0]!.body).toEqual({ damage: [0, 0, 0, 0, 0] })
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

	it('leaves the emoji fallback and the art flags out of the form', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// The picture comes from the upload dialog; `icon` / `art` only describe a file on disk.
		for (const key of ['icon', 'art']) {
			expect(document.querySelector(`[data-admin-field="${key}"]`), key).toBeNull()
		}
		expect(document.querySelector('[data-admin-import-art]')).toBeTruthy()
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
		expect(document.querySelector('[data-admin-quality-swatch]')!.className).toContain('bg-rank-1')

		fireEvent.change(select, { target: { value: '5' } })
		expect(document.querySelector('[data-admin-quality-swatch]')!.className).toContain('bg-rank-5')

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

describe('creating and deleting items', () => {
	it('creates an item from a code and selects it', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-create-open]')!)
		fireEvent.change(document.querySelector('[data-admin-create-id]')!, { target: { value: 'kiem-sat' } })
		fireEvent.click(document.querySelector('[data-admin-create-submit]')!)

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/item/kiem-sat')
		// Only the fields an item cannot work without; everything else stays an optional field.
		expect(puts[0]!.body).toEqual({
			name: 'kiem-sat',
			cls: 'focus',
			tier: 1,
			quality: 1,
			cost: 1,
			space: { w: 1, h: 1 },
		})
		// The new item is selected and listed, so the editor can start filling it in.
		await waitFor(() => expect(document.querySelector('[data-admin-entry="kiem-sat"]')).toBeTruthy())
		expect(useUiStore.getState().adminId).toBe('kiem-sat')
	})

	it('refuses a code that already exists', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-create-open]')!)
		fireEvent.change(document.querySelector('[data-admin-create-id]')!, { target: { value: 'wooden-blade' } })
		fireEvent.click(document.querySelector('[data-admin-create-submit]')!)

		expect((await screen.findByText(/đã tồn tại/)).textContent).toContain('wooden-blade')
		expect(puts).toHaveLength(0)
	})

	it('hides a code item with `removed` instead of deleting the row', async () => {
		const { puts, deletes } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-entry="wooden-blade"]')!)
		fireEvent.click(document.querySelector('[data-admin-delete]')!)
		const dialog = await screen.findByRole('dialog', { name: /Xoá "Đao Gỗ"/ })
		fireEvent.click(dialog.querySelector('[data-confirm-accept]')!)

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/item/wooden-blade')
		// The code template cannot be deleted, so it is flagged — and stays restorable.
		expect(puts[0]!.body).toEqual({ removed: true })
		expect(deletes).toHaveLength(0)
		// Out of the catalogue (so the shop stops rolling it) but still listed as deleted.
		expect(document.querySelector('[data-admin-removed]')).toBeTruthy()

		// Bringing it back has nothing stored besides the flag, so the row itself is dropped.
		fireEvent.click(document.querySelector('[data-admin-restore]')!)
		await waitFor(() => expect(deletes).toHaveLength(1))
		expect(deletes[0]).toContain('/api/admin/content/item/wooden-blade')
		expect(document.querySelector('[data-admin-removed]')).toBeNull()
	})

	it('deletes a created item outright', async () => {
		const { deletes } = stubApi()
		// A created item exists only as an overlay row — that is what the shop and the editor read.
		applyContentOverrides({ items: { 'kiem-sat': { name: 'Kiếm Sắt', cls: 'melee', cost: 4 } } })
		renderInRouter(<AdminContentScreen />)

		fireEvent.click(await screen.findByText(/Kiếm Sắt/))
		expect(itemTemplateById('kiem-sat')?.cost).toBe(4)

		fireEvent.click(await screen.findByRole('button', { name: '🗑 Xoá món' }))
		const dialog = await screen.findByRole('dialog', { name: /Xoá "Kiếm Sắt"/ })
		fireEvent.click(dialog.querySelector('[data-confirm-accept]')!)

		await waitFor(() => expect(deletes).toHaveLength(1))
		expect(deletes[0]).toContain('/api/admin/content/item/kiem-sat')
		// Gone from the catalogue and the list, and the selection moved to a surviving item.
		await waitFor(() => expect(itemTemplateById('kiem-sat')).toBeUndefined())
		expect(document.querySelector('[data-admin-entry="kiem-sat"]')).toBeNull()
		expect(useUiStore.getState().adminId).toBe(itemCatalogue()[0]!.id)
	})
})

describe('importing a picture', () => {
	/** An already uploaded picture for `wooden-blade`, as `/api/admin/content` reports it. */
	const UPLOADED = {
		kind: 'item',
		entityId: 'wooden-blade',
		version: 3,
		width: 256,
		height: 256,
		updatedAt: '2026-01-01T00:00:00.000Z',
		updatedBy: 'quantri@example.com',
	}

	it('offers the import button, and no "remove" until something was uploaded', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		expect(document.querySelector('[data-admin-import-art]')).toBeTruthy()
		expect(document.querySelector('[data-admin-remove-art]')).toBeNull()
	})

	it('opens the cropper dialog with a crop frame shaped like the item', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-import-art]')!)

		const dialog = await screen.findByRole('dialog', { name: /Tải ảnh cho/ })
		// Đao Gỗ covers 1×3 cells → the frame follows that shape and the file comes out 171×512.
		expect(dialog.textContent).toContain('1×3 ô')
		expect(dialog.textContent).toContain('171×512')
		expect(dialog.querySelector('[data-art-file]')).toBeTruthy()
		// Nothing to save yet: a picture has to be chosen first.
		expect(
			[...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('Lưu ảnh'))
				?.disabled,
		).toBe(true)
	})

	it('offers the delete button once a picture exists, and removes it on request', async () => {
		const { deletes } = stubApi({ art: [UPLOADED] })
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const remove = await screen.findByText('🗑️ Xoá ảnh đã tải')
		fireEvent.click(remove)

		// Deleting loses the crop, so it asks first — and says what happens.
		const dialog = await screen.findByRole('dialog', { name: /Xoá ảnh đã tải của/ })
		expect(dialog.textContent).toContain('Không thể hoàn tác')

		fireEvent.click(dialog.querySelector('[data-confirm-accept]')!)

		await waitFor(() => expect(deletes).toHaveLength(1))
		expect(deletes[0]).toContain('/api/admin/content/item/wooden-blade/art')
	})

	it('keeps the picture when the confirmation is cancelled', async () => {
		const { deletes } = stubApi({ art: [UPLOADED] })
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(await screen.findByText('🗑️ Xoá ảnh đã tải'))

		const dialog = await screen.findByRole('dialog', { name: /Xoá ảnh đã tải của/ })
		fireEvent.click(dialog.querySelector('[data-confirm-cancel]')!)

		await waitFor(() => expect(screen.queryByRole('dialog', { name: /Xoá ảnh đã tải của/ })).toBeNull())
		expect(deletes).toHaveLength(0)
		// The button is still there, so nothing was removed.
		expect(document.querySelector('[data-admin-remove-art]')).toBeTruthy()
	})

	it('previews the picture inside the real grid tile, not a bare box', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const preview = document.querySelector('[data-admin-art-preview]')!
		// The preview is the game's own board: a real item box with the tile classes.
		const box = preview.querySelector('[data-item-box]')
		expect(box, 'the preview must be a real grid tile').toBeTruthy()
		const tile = box!.querySelector('button')
		expect(tile?.className).toContain('surface-item')
		expect(tile?.className).toContain('bg-rank-1') // Đao Gỗ is quality 1 → silver tile
		expect(tile?.querySelector('img')?.getAttribute('src')).toBe('/icons/items/wooden-blade.png')
		// The board is exactly the item's footprint (Đao Gỗ is 1×3) — no empty cells around it.
		expect(preview.querySelectorAll('[data-cell]')).toHaveLength(3)
		expect(preview.querySelectorAll('[data-cell]').length).toBe(1 * 3)
	})

	it('lets the editor preview every star colour', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const stars = () => document.querySelector('[data-admin-art-preview] [data-item-stars]')
		expect(stars()?.textContent, '1★ by default').toBe('★')
		expect(stars()?.className).toContain('text-rank-1')

		fireEvent.click(document.querySelector('[data-admin-preview-star="5"]')!)
		expect(stars()?.textContent).toBe('★★★★★')
		expect(stars()?.className).toContain('text-rank-5')
	})

	it('previews a pet in the pet cell used by the pet panel', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(screen.getByRole('button', { name: 'Thú cưng' }))
		await waitFor(() => {
			expect(document.querySelector('[data-admin-art-preview] [data-pet-tile]')).toBeTruthy()
		})
	})
})
