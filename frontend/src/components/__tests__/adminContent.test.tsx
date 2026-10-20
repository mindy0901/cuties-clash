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
import { installRetiredItems } from '../../test/retiredItems'
import { RETIRED_ITEM_TEMPLATES } from '../../test/retiredCatalogue'
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

/** Open the "Thêm kit" menu and pick one kit. */
async function addKit(id: string) {
	const trigger = document.querySelector('[data-admin-add-kit-open]')
	if (!trigger) throw new Error('the add-kit button is missing')
	fireEvent.keyDown(trigger, { key: 'ArrowDown' })
	const item = await waitFor(() => {
		const found = document.querySelector<HTMLElement>(`[data-admin-add-kit="${id}"]`)
		if (!found) throw new Error(`kit "${id}" is not in the menu`)
		return found
	})
	fireEvent.click(item)
}

/** Open the sub-kit menu inside a kit and pick the charged attack. */
async function addCharge() {
	const trigger = document.querySelector('[data-admin-add-onhit-open]')
	if (!trigger) throw new Error('the add sub-kit button is missing')
	fireEvent.keyDown(trigger, { key: 'ArrowDown' })
	const item = await waitFor(() => {
		const found = document.querySelector<HTMLElement>('[data-admin-add-charge="charge-attack"]')
		if (!found) throw new Error('the charged attack is not in the sub-kit menu')
		return found
	})
	fireEvent.click(item)
}

/** Open the sub-kit menu inside the basic-attack kit and pick one on-hit effect. */
async function addOnHit(id: string) {
	const trigger = document.querySelector('[data-admin-add-onhit-open]')
	if (!trigger) throw new Error('the add-on-hit button is missing')
	fireEvent.keyDown(trigger, { key: 'ArrowDown' })
	const item = await waitFor(() => {
		const found = document.querySelector<HTMLElement>(`[data-admin-add-onhit="${id}"]`)
		if (!found) throw new Error(`on-hit effect "${id}" is not in the menu`)
		return found
	})
	fireEvent.click(item)
}

/** Open a stat kit's shadcn dropdown and hand back a lookup for its items. */
async function openStatMenu(card: Element) {
	const trigger = card.querySelector('[data-admin-stat-picker]')
	if (!trigger) throw new Error('the stat dropdown is missing')
	fireEvent.keyDown(trigger, { key: 'ArrowDown' })
	await waitFor(() => {
		if (!document.querySelector('[data-admin-pick-stat]')) throw new Error('the stat menu did not open')
	})
	return (key: string) => {
		const found = document.querySelector<HTMLElement>(`[data-admin-pick-stat="${key}"]`)
		if (!found) throw new Error(`stat "${key}" is not in the menu`)
		return found
	}
}

/** Open a stat kit's shadcn dropdown and pick the stat that kit grants. */
async function pickStat(card: Element, key: string) {
	const item = (await openStatMenu(card))(key)
	fireEvent.click(item)
}

/** Stub `fetch` for the endpoints the page uses and record PUT/DELETE calls. */
const DEFAULT_ROWS = RETIRED_ITEM_TEMPLATES.map((template) => {
	const { id, ...payload } = template
	return {
		kind: 'item',
		entityId: id,
		payload: payload as Record<string, unknown>,
		updatedAt: '2026-01-01T00:00:00.000Z',
		updatedBy: null,
	}
})

function stubApi(options: Stub = {}) {
	const puts: { url: string; body: unknown }[] = []
	const deletes: string[] = []
	const uploads: string[] = []
	/** Kept in sync with PUT/DELETE so a created or deleted item shows up again on the next read. */
	// The item list now comes from the **stored rows** only, so a test without rows would show an empty
	// page. These are the retired fixtures, i.e. a realistic catalogue.
	const overrides = [...(options.overrides ?? DEFAULT_ROWS)] as {
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
			const [, kind, rawId] = url.match(/\/api\/admin\/content\/(item|cutie)\/(.+)$/) ?? []
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
		if (url.includes('/api/content')) return json({ items: {}, cuties: {}, art: {} })
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
	// test that switches to cuties would otherwise leak into the next one — the store is module state.
	useUiStore.setState({ adminKind: 'item', adminId: '' })
	// The item catalogue (list + editor) reads the overlay, which is module state as well. The retired
	// fixtures keep the list realistic (armour, gems, artefacts) now that the shipped catalogue is small.
	installRetiredItems()
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

		expect(await screen.findByText(/Sign in with an admin account/)).toBeTruthy()
		expect(screen.getByRole('link', { name: '← Back to the game' }).getAttribute('href')).toBe('/')
	})

	it('tells a regular account that it has no admin rights', async () => {
		stubApi({ session: MEMBER_SESSION })
		renderInRouter(<AdminContentScreen />)

		expect(await screen.findByText(/no admin rights/)).toBeTruthy()
	})
})

describe('editing content', () => {
	it('lists items and switches to cuties', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)

		expect(await screen.findByText(/Content admin/)).toBeTruthy()
		await waitFor(() => {
			expect(document.querySelector('[data-admin-entry="wooden-blade"]')).toBeTruthy()
		})

		fireEvent.click(screen.getByText('Cuties'))
		// Switching kind must not blow up on the id of the other kind (blank page).
		expect(await screen.findByText('fire-pup')).toBeTruthy()
	})

	it('sends the whole item row, because the row is the only source', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')
		const cost = document.querySelector<HTMLInputElement>('[data-admin-field="cost"]')!
		fireEvent.change(cost, { target: { value: '9' } })
		fireEvent.click(screen.getByText('Save'))

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/item/wooden-blade')
		// Only `cost` — sending every field would freeze the others against future code edits.
		expect(puts[0]!.body).toMatchObject({ cost: 9 })
	})

	it('lets the designer size a jade, an accessory and a potion freely', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const boxes = () => ({
			w: document.querySelector<HTMLInputElement>('[data-admin-size="w"]')!,
			h: document.querySelector<HTMLInputElement>('[data-admin-size="h"]')!,
		})
		// No class owns its footprint: switching it leaves the boxes alone, and they stay editable.
		fireEvent.keyDown(document.querySelector('[data-admin-field="cls"]')!, { key: 'ArrowDown' })
		await waitFor(() => expect(document.querySelector('[data-admin-option="potion"]')).toBeTruthy())
		fireEvent.click(document.querySelector('[data-admin-option="potion"]')!)
		await waitFor(() => expect(boxes().w.disabled).toBe(false))
		expect(boxes().h.disabled).toBe(false)
		fireEvent.change(boxes().w, { target: { value: '2' } })
		fireEvent.change(boxes().h, { target: { value: '3' } })
		expect([boxes().w.value, boxes().h.value]).toEqual(['2', '3'])

		fireEvent.click(screen.getByText('Save'))
		await waitFor(() => expect(puts).toHaveLength(1))
		const body = puts[0]!.body as { cls?: string; space?: { w: number; h: number } }
		expect(body.cls).toBe('potion')
		expect(body.space).toEqual({ w: 2, h: 3 })
	})

	it('gives every kit parameter one control per star rank', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		for (const key of ['basic-attack.multiplier', 'basic-attack.cooldown']) {
			const controls = document.querySelectorAll(`[data-admin-kit-param="${key}"]`)
			expect(controls, `${key} must have one control per star`).toHaveLength(5)
		}
		// The star rank is written above each control, so a value can never be attributed wrongly.
		for (const star of [1, 2, 3, 4, 5]) {
			expect(document.querySelector(`[data-admin-star="${star}"]`)).toBeTruthy()
		}
		expect(
			document.querySelector('[data-admin-kit-param="basic-attack.multiplier"][data-admin-star="5"]'),
		).toBeTruthy()
		// On-hit effects live inside the attack kit, so their boxes appear there too.
		fireEvent.click(document.querySelector('[data-admin-entry="fire-spear"]')!)
		await waitFor(() => expect(document.querySelector('[data-admin-onhit-kit="burn-on-hit"]')).toBeTruthy())
		for (const key of ['burn-on-hit.chance', 'burn-on-hit.duration', 'burn-on-hit.value']) {
			expect(document.querySelectorAll(`[data-admin-kit-param="${key}"]`), key).toHaveLength(5)
		}
		// Attack only exists on the cutie: a weapon carries multipliers, never its own damage.
		expect(document.querySelectorAll('[data-admin-field="damage"]')).toHaveLength(0)
		expect(document.querySelectorAll('[data-admin-field="speed"]')).toHaveLength(0)
		expect(document.querySelectorAll('[data-admin-field="attack"]')).toHaveLength(0)
	})

	it('gives a cutie the same kit block with one box per parameter and saves it', async () => {
		const { puts } = stubApi()
		useUiStore.setState({ adminKind: 'cutie', adminId: 'fire-pup' })
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('fire-pup')

		// The bag grid grows by itself and the cutie attacks through kits: neither field is editable.
		expect(document.querySelector('[data-admin-field="skill"]')).toBeNull()
		expect(document.querySelector('[data-admin-field="bags"]')).toBeNull()

		// One value per parameter — a cutie has levels, not star ranks.
		expect(document.querySelectorAll('[data-admin-kit-param="basic-attack.cooldown"]')).toHaveLength(1)
		expect(document.querySelectorAll('[data-admin-field="attack"]')).toHaveLength(1)

		const cooldown = document.querySelector<HTMLInputElement>('[data-admin-kit-param="basic-attack.cooldown"]')!
		fireEvent.change(cooldown, { target: { value: '1.25' } })
		fireEvent.click(screen.getByText('Save'))

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/cutie/fire-pup')
		// The edited value lands in every slot, so the stored table keeps its shape.
		expect(puts[0]!.body).toMatchObject({
			kits: [
				{
					id: 'basic-attack',
					params: { cooldown: [1.25, 1.25, 1.25, 1.25, 1.25], multiplier: [1, 1, 1, 1, 1] },
				},
			],
		})
	})

	it('lets a cutie keep or drop its basic attack, offering attack kits only', async () => {
		stubApi()
		useUiStore.setState({ adminKind: 'cutie', adminId: 'fire-pup' })
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('fire-pup')
		expect(document.querySelector('[data-admin-kit="basic-attack"]')).toBeTruthy()

		fireEvent.click(document.querySelector('[data-admin-remove-kit="basic-attack"]')!)
		expect(document.querySelector('[data-admin-kit="basic-attack"]')).toBeNull()
		// No explanatory sentence: the empty box with `Add kit` is the whole story.
		expect(document.querySelectorAll('[data-admin-kit]')).toHaveLength(0)

		// `stats` / `aura` / `parry` describe an item's tables and a weapon's counter — not a cutie.
		const trigger = document.querySelector('[data-admin-add-kit-open]')!
		fireEvent.keyDown(trigger, { key: 'ArrowDown' })
		await waitFor(() => expect(document.querySelector('[data-admin-add-kit="basic-attack"]')).toBeTruthy())
		for (const id of ['stats', 'aura', 'parry']) {
			expect(document.querySelector(`[data-admin-add-kit="${id}"]`), id).toBeNull()
		}
	})

	it('folds a stored top-level charge kit into the basic attack when the page opens', async () => {
		// A stored row with an old top-level `charge-attack` kit.
		const payload = {
			name: 'Đao Gỗ',
			cls: 'melee',
			space: { w: 1, h: 3 },
			attack: [12, 20, 32, 50, 78],
			kits: [
				{ id: 'basic-attack', params: { cooldown: [0.5, 0.5, 0.5, 0.5, 0.5], multiplier: [1, 1, 1, 1, 1] } },
				{
					id: 'charge-attack',
					params: {
						cooldown: [10, 10, 10, 10, 10],
						seNeed: [100, 110, 120, 130, 150],
						multiplier: [1.3, 1.5, 1.7, 2, 2.5],
					},
				},
			],
		}
		applyContentOverrides({ items: { 'wooden-blade': payload } })
		stubApi({
			overrides: [
				{
					kind: 'item',
					entityId: 'wooden-blade',
					payload,
					updatedAt: '2026-01-01T00:00:00.000Z',
					updatedBy: 'quantri@example.com',
				},
			],
		})
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// One card, with the charged variant inside it — no second swing, no cooldown box.
		expect(document.querySelectorAll('[data-admin-kit]')).toHaveLength(1)
		expect(document.querySelector('[data-admin-charge-kit="charge-attack"]')).toBeTruthy()
		expect(document.querySelectorAll('[data-admin-kit-param="charge-attack.cooldown"]')).toHaveLength(0)
		const valuesOf = (key: string) =>
			[...document.querySelectorAll<HTMLInputElement>(`[data-admin-kit-param="${key}"]`)].map(
				(input) => input.value,
			)
		// The designer's numbers survive the move.
		expect(valuesOf('charge-attack.seNeed')).toEqual(['100', '110', '120', '130', '150'])
		expect(valuesOf('charge-attack.multiplier')).toEqual(['1.3', '1.5', '1.7', '2', '2.5'])
	})

	it('shows a kit block that can be added to and removed from any item', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// A weapon starts with the basic-attack kit.
		expect(document.querySelector('[data-admin-kit="basic-attack"]')).toBeTruthy()

		// Armour has no kit: it does not attack and shows the empty box.
		fireEvent.click(document.querySelector('[data-admin-entry="ghost-lantern"]')!)
		await waitFor(() => expect(document.querySelector('[data-admin-kit="basic-attack"]')).toBeNull())
		expect(document.querySelectorAll('[data-admin-kit]')).toHaveLength(0)
		// An item has no optional field left to add (its numbers are all kits), so the field menu is
		// gone — the kit menus are the only way to give it mechanics.
		expect(document.querySelectorAll('[data-admin-add-open]')).toHaveLength(0)

		// Adding the basic-attack kit seeds the standard 1.6 s Cooldown Time and multiplier 1.
		await addKit('basic-attack')
		const valuesOf = (key: string) =>
			[...document.querySelectorAll<HTMLInputElement>(`[data-admin-kit-param="${key}"]`)].map(
				(input) => input.value,
			)
		expect(valuesOf('basic-attack.multiplier')).toEqual(['1', '1', '1', '1', '1'])
		expect(valuesOf('basic-attack.cooldown')).toEqual(['1.6', '1.6', '1.6', '1.6', '1.6'])
		expect(document.querySelector('[data-admin-dpm]')).toBeTruthy()

		// On-hit effects are added inside the attack kit, never at the item's top level.
		await addOnHit('burn-on-hit')
		expect(document.querySelector('[data-admin-onhit-kit="burn-on-hit"]')).toBeTruthy()
		expect(document.querySelectorAll('[data-admin-kit="burn-on-hit"]')).toHaveLength(0)
		expect(
			[...document.querySelectorAll<HTMLInputElement>('[data-admin-kit-param="burn-on-hit.chance"]')].map(
				(input) => input.value,
			),
		).toEqual(['30', '30', '30', '30', '30'])

		fireEvent.click(document.querySelector('[data-admin-remove-onhit="burn-on-hit"]')!)
		expect(document.querySelector('[data-admin-onhit-kit="burn-on-hit"]')).toBeNull()

		fireEvent.click(document.querySelector('[data-admin-remove-kit="basic-attack"]')!)
		expect(document.querySelector('[data-admin-kit="basic-attack"]')).toBeNull()
	})

	it('attaches the charged attack inside the basic attack instead of a second card', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const valuesOf = (key: string) =>
			[...document.querySelectorAll<HTMLInputElement>(`[data-admin-kit-param="${key}"]`)].map(
				(input) => input.value,
			)
		expect(document.querySelector('[data-admin-kit="basic-attack"]')).toBeTruthy()
		await addOnHit('burn-on-hit')
		await addCharge()

		// One card only: the charged variant lives **inside** the basic attack.
		expect(document.querySelectorAll('[data-admin-kit]')).toHaveLength(1)
		expect(document.querySelector('[data-admin-kit="charge-attack"]')).toBeNull()
		expect(document.querySelector('[data-admin-charge-kit="charge-attack"]')).toBeTruthy()
		expect(document.querySelectorAll('[data-admin-kit-param="charge-attack.multiplier"]')).toHaveLength(5)
		expect(document.querySelectorAll('[data-admin-kit-param="charge-attack.seNeed"]')).toHaveLength(5)
		// It has no rhythm of its own — ❌ there is no cooldown box any more.
		expect(document.querySelectorAll('[data-admin-kit-param="charge-attack.cooldown"]')).toHaveLength(0)
		expect(valuesOf('charge-attack.multiplier')).toEqual(['2.2', '2.2', '2.2', '2.2', '2.2'])

		// The on-hit effects and the DPM line belong to the basic attack.
		const card = document.querySelector('[data-admin-kit="basic-attack"]')!
		expect(card.querySelector('[data-admin-onhit-kit="burn-on-hit"]')).toBeTruthy()
		expect(card.querySelector('[data-admin-dpm]')).toBeTruthy()
		// The charged block always sits **above** the on-hit effects, whatever the order of adding.
		const charged = card.querySelector('[data-admin-charge-kit="charge-attack"]')!
		const onHit = card.querySelector('[data-admin-onhit]')!
		expect(charged.compareDocumentPosition(onHit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		// The charged hit's own number: 1 × 2.2 → 2 at 1★, i.e. per point of cutie attack.
		expect(card.querySelector('[data-admin-charged-damage]')?.textContent).toContain('2')

		// It is offered **only** inside the swing: the outer kit menu never lists it, and once attached
		// the sub-kit menu stops offering it too.
		const outer = document.querySelector('[data-admin-add-kit-open]')
		if (outer) {
			fireEvent.keyDown(outer, { key: 'ArrowDown' })
			await waitFor(() => expect(document.querySelector('[data-admin-add-kit]')).toBeTruthy())
			expect(document.querySelector('[data-admin-add-kit="charge-attack"]')).toBeNull()
		}
		const inner = document.querySelector('[data-admin-add-onhit-open]')
		if (inner) {
			fireEvent.keyDown(inner, { key: 'ArrowDown' })
			await waitFor(() => expect(document.querySelector('[data-admin-add-onhit]')).toBeTruthy())
			expect(document.querySelector('[data-admin-add-charge]')).toBeNull()
		}

		fireEvent.click(screen.getByText('Save'))
		await waitFor(() => expect(puts).toHaveLength(1))
		const kits = (puts[0]!.body as { kits: { id: string; charge?: { id: string; params: Record<string, number[]> } }[] }).kits
		expect(kits.map((kit) => kit.id)).toEqual(['basic-attack'])
		expect(kits[0]!.charge?.id).toBe('charge-attack')
		expect(kits[0]!.charge?.params.seNeed).toEqual([100, 100, 100, 100, 100])

		// ✕ detaches it again, leaving the plain swing.
		fireEvent.click(document.querySelector('[data-admin-remove-charge="charge-attack"]')!)
		expect(document.querySelector('[data-admin-charge-kit="charge-attack"]')).toBeNull()
	})

	it('lets a support gem pick its target and tick the buffed sides', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		await addKit('freeze-haste')
		const card = () => document.querySelector('[data-admin-kit="freeze-haste"]')!
		const target = card().querySelector<HTMLSelectElement>('[data-admin-kit-param="freeze-haste.target"]')!
		expect(target.tagName).toBe('SELECT')
		// Only two targets exist: the ticked sides, or one random weapon.
		expect([...target.options].map((option) => option.value)).toEqual(['0', '1'])

		// All four sides are ticked by default, and each one is its own toggle.
		const sides = [...card().querySelectorAll<HTMLButtonElement>('[data-admin-direction]')]
		expect(sides.map((side) => side.dataset.adminDirection)).toEqual(['up', 'down', 'left', 'right'])
		expect(sides.every((side) => side.getAttribute('aria-pressed') === 'true')).toBe(true)

		// "Random" has no sides to choose, so the picker disappears — and comes back on "sides".
		fireEvent.change(card().querySelector('[data-admin-kit-param="freeze-haste.target"]')!, {
			target: { value: '1' },
		})
		expect(document.querySelector('[data-admin-kit-directions="freeze-haste"]')).toBeNull()
		fireEvent.change(card().querySelector('[data-admin-kit-param="freeze-haste.target"]')!, {
			target: { value: '0' },
		})
		expect(document.querySelector('[data-admin-kit-directions="freeze-haste"]')).toBeTruthy()

		// Drop the right-hand side: 1|2|4|8 = 15 → 7.
		fireEvent.click(card().querySelector('[data-admin-direction="right"]')!)
		expect(card().querySelector('[data-admin-direction="right"]')!.getAttribute('aria-pressed')).toBe('false')

		fireEvent.click(screen.getByText('Save'))
		await waitFor(() => expect(puts).toHaveLength(1))
		const kits = (puts[0]!.body as { kits: { id: string; params: Record<string, number[]> }[] }).kits
		const haste = kits.find((kit) => kit.id === 'freeze-haste')
		// The mask is copied to every star rank, so `params` keeps its shape.
		expect(haste?.params.directions).toEqual([7, 7, 7, 7, 7])
		expect(haste?.params.target).toEqual([0, 0, 0, 0, 0])
	})

	it('offers the parry kit (Chấn Đao) and saves its numbers', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		await addKit('parry')
		expect(document.querySelector('[data-admin-kit="parry"]')).toBeTruthy()
		// Plain number boxes: the parry has no nested table.
		expect(document.querySelectorAll('[data-admin-kit-param="parry.chance"]')).toHaveLength(5)
		expect(document.querySelectorAll('[data-admin-kit-json="parry.parry"]')).toHaveLength(0)

		fireEvent.click(screen.getByText('Save'))
		await waitFor(() => expect(puts).toHaveLength(1))
		const kits = (puts[0]!.body as { kits: { id: string; params: Record<string, number[]> }[] }).kits
		const parry = kits.find((kit) => kit.id === 'parry')
		expect(parry?.params.cost).toEqual([65, 65, 65, 65, 65])
		expect(parry?.params.chance).toEqual([15, 15, 15, 15, 15])
	})

	it('adds a bonus-stat and an aura kit as plain numbers, one box per star', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const statsCards = () => [...document.querySelectorAll('[data-admin-kit="stats"]')]
		const amountsOf = (stat: string) =>
			[...document.querySelectorAll<HTMLInputElement>(`[data-admin-stat="${stat}"]`)].map((input) => input.value)
		const boxAt = (stat: string, star: number) =>
			document.querySelector<HTMLInputElement>(`[data-admin-stat="${stat}"][data-admin-star="${star}"]`)!

		await addKit('stats')
		expect(statsCards()).toHaveLength(1)
		// ❌ No JSON box and no "add a stat" menu: a kit **is** its one stat, picked from a dropdown.
		expect(document.querySelectorAll('[data-admin-kit-json]')).toHaveLength(0)
		expect(document.querySelector('[data-admin-add-stat]')).toBeNull()
		expect(document.querySelector('[data-admin-remove-stat]')).toBeNull()
		expect(document.querySelectorAll('[data-admin-stat="stats.atk"]')).toHaveLength(5)

		// 🔴 The 5★ box is the only one worth typing: the four below follow at 20/40/60/80 %.
		fireEvent.change(boxAt('stats.atk', 5), { target: { value: '30' } })
		expect(amountsOf('stats.atk')).toEqual(['6', '12', '18', '24', '30'])
		// Any other rank still edits on its own, so a hand-set curve survives.
		fireEvent.change(boxAt('stats.atk', 1), { target: { value: '9' } })
		expect(amountsOf('stats.atk')).toEqual(['9', '12', '18', '24', '30'])

		// 🔴 A second stat is a **second kit**, starting on a stat the item does not grant yet.
		await addKit('stats')
		expect(statsCards()).toHaveLength(2)
		expect(statsCards()[1]!.querySelector('[data-admin-stat="stats.atk"]')).toBeNull()
		// A percentage stat keeps its `%` in the name: no value sits beside it to carry the unit.
		const pickSecond = await openStatMenu(statsCards()[1]!)
		expect(pickSecond('dr').textContent).toContain('% Damage reduction')
		expect(pickSecond('atk').textContent).toBe('Attack')
		fireEvent.click(pickSecond('maxHp'))
		fireEvent.change(boxAt('stats.maxHp', 5), { target: { value: '120' } })
		expect(amountsOf('stats.maxHp')).toEqual(['24', '48', '72', '96', '120'])

		await addKit('aura')
		const auraCard = document.querySelector('[data-admin-kit="aura"]')!
		// An aura also picks **when** it applies, and edits its numbers the same way.
		const target = auraCard.querySelector<HTMLSelectElement>('[data-admin-kit-param="aura.target"]')!
		expect([...target.options].map((option) => option.value)).toEqual([
			'adjacent',
			'adjacentWeapon',
			'adjacentNonWeapon',
			'all',
		])
		await pickStat(auraCard, 'atk')
		fireEvent.change(boxAt('aura.atk', 5), { target: { value: '50' } })
		expect(amountsOf('aura.atk')).toEqual(['10', '20', '30', '40', '50'])

		fireEvent.click(screen.getByText('Save'))
		await waitFor(() => expect(puts).toHaveLength(1))
		const kits = (puts[0]!.body as { kits: { id: string; stats?: unknown[]; aura?: unknown[] }[] }).kits
		// Two `stats` kits, each with its own stat — never one table holding both.
		expect(kits.filter((kit) => kit.id === 'stats').map((kit) => kit.stats?.[0])).toEqual([
			{ atk: 9 },
			{ maxHp: 24 },
		])
		expect(kits.find((kit) => kit.id === 'aura')?.aura?.[0]).toEqual({
			target: 'adjacent',
			mods: { atk: 10 },
		})

		// Removing a stat kit is one ✕ on **that** card, leaving the other stat alone.
		const removeButtons = document.querySelectorAll('[data-admin-remove-kit="stats"]')
		expect(removeButtons).toHaveLength(2)
		fireEvent.click(removeButtons[1]!)
		expect(document.querySelector('[data-admin-stat="stats.maxHp"]')).toBeNull()
		expect(document.querySelectorAll('[data-admin-stat="stats.atk"]')).toHaveLength(5)

		// Option kits sit beside the main kit, they do not replace it.
		expect(document.querySelector('[data-admin-kit="basic-attack"]')).toBeTruthy()
		fireEvent.click(document.querySelector('[data-admin-remove-kit="aura"]')!)
		expect(document.querySelector('[data-admin-kit="aura"]')).toBeNull()
	})

	it('shows DPM above the kit boxes and follows every edit', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// An item has no attack of its own: the line reads **per point of cutie attack**, at the
		// A 1.6 s Cooldown Time at rank 1: 1 × 1 × 60 / 1.6 = 38 swings a minute, and the shipped row
		// shortens the cooldown per rank (1.6 → 1.2 s), so the line grows.
		const line = () =>
			[...document.querySelectorAll('[data-admin-dpm] > span')].map((node) => node.textContent)
		// ❌ No "DPM" word in front: the line is only the numbers.
		expect(line()).toEqual(['1★ 38', '2★ 40', '3★ 43', '4★ 46', '5★ 50'])

		// Each rank is printed in its own star colour, so a number's rank reads at a glance.
		expect(
			[...document.querySelectorAll('[data-admin-dpm] > span')].map(
				(node) => node.className.match(/text-rank-\d/)?.[0] ?? null,
			),
		).toEqual(['text-rank-1', 'text-rank-2', 'text-rank-3', 'text-rank-4', 'text-rank-5'])

		// Multiplier 2 → twice the damage per point of attack.
		fireEvent.change(
			document.querySelectorAll<HTMLInputElement>('[data-admin-kit-param="basic-attack.multiplier"]')[0]!,
			{ target: { value: '2' } },
		)
		expect(line()[0]).toBe('1★ 75')

		// A 0.375 s Cooldown Time: 2 × 60 / 0.375 = 320 swings a minute.
		fireEvent.change(
			document.querySelectorAll<HTMLInputElement>('[data-admin-kit-param="basic-attack.cooldown"]')[0]!,
			{ target: { value: '0.375' } },
		)
		expect(line()[0]).toBe('1★ 320')
	})

	it('disables Save until something changed', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const save = screen.getByText('Save').closest('button')!
		// Nothing edited → nothing to save. There is no "reset to defaults" any more: an item's values
		// live in the database, so the form is the only way to change them.
		expect(save.disabled).toBe(true)
		expect(screen.queryByText('Trạng thái')).toBeNull()
		expect(screen.queryByText('Hoàn tác ô nhập')).toBeNull()

		fireEvent.change(document.querySelectorAll<HTMLInputElement>('[data-admin-field="cost"]')[0]!, {
			target: { value: '13' },
		})
		expect(save.disabled).toBe(false)
	})

	it('lets any item lose its basic-attack kit, even a weapon that declares one', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-remove-kit="basic-attack"]')!)
		// The kit disappears, so the item reads as "no attack".
		expect(document.querySelector('[data-admin-kit="basic-attack"]')).toBeNull()
		expect(document.querySelectorAll('[data-admin-kit]')).toHaveLength(0)

		// The menu offers it again, and adding it back restores the multipliers from code.
		await addKit('basic-attack')
		expect(
			[...document.querySelectorAll<HTMLInputElement>('[data-admin-kit-param="basic-attack.multiplier"]')].map(
				(input) => input.value,
			),
		).toEqual(['1', '1', '1', '1', '1'])

		// Removing it a second time is what gets saved.
		fireEvent.click(document.querySelector('[data-admin-remove-kit="basic-attack"]')!)
		const save = screen.getByText('Save').closest('button')!
		expect(save.disabled).toBe(false)
		fireEvent.click(save)

		await waitFor(() => expect(puts).toHaveLength(1))
		// No kits at all = the weapon stops swinging.
		expect(puts[0]!.body).toMatchObject({ kits: [] })
	})

	it('sends the whole kit when a single star rank changes', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const multiplier = document.querySelectorAll<HTMLInputElement>(
			'[data-admin-kit-param="basic-attack.multiplier"]',
		)
		expect([...multiplier].map((input) => input.value)).toEqual(['1', '1', '1', '1', '1'])
		fireEvent.change(multiplier[4]!, { target: { value: '2' } })
		fireEvent.click(screen.getByText('Save'))

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.body).toMatchObject({
			kits: [
				{
					id: 'basic-attack',
					params: {
						multiplier: [1, 1, 1, 1, 2],
						cooldown: [1.6, 1.5, 1.4, 1.3, 1.2],
					},
				},
			],
		})
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
		fireEvent.click(screen.getByText('Save'))

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.body).toMatchObject({ space: { w: 1, h: 4 } })
	})

	it('shows the quality colour mapping and sends the chosen quality', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// The picker is a shadcn dropdown: open it and read the five bands off the menu itself.
		fireEvent.keyDown(document.querySelector('[data-admin-field="quality"]')!, { key: 'ArrowDown' })
		await waitFor(() => expect(document.querySelectorAll('[data-admin-option]')).toHaveLength(5))
		expect(document.querySelector('[data-admin-quality-swatch]')!.className).toContain('bg-rank-1')

		fireEvent.click(document.querySelector('[data-admin-option="5"]')!)
		await waitFor(() =>
			expect(document.querySelector('[data-admin-quality-swatch]')!.className).toContain('bg-rank-5'),
		)

		fireEvent.click(screen.getByText('Save'))
		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.body).toMatchObject({ quality: 5 })
	})

	it('reports an invalid kit value instead of sending it', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		// 999 999 is above the range a kit's multiplier allows (max 20).
		const multiplier = document.querySelectorAll<HTMLInputElement>(
			'[data-admin-kit-param="basic-attack.multiplier"]',
		)[2]!
		fireEvent.change(multiplier, { target: { value: '999999' } })
		fireEvent.click(screen.getByText('Save'))

		expect(await screen.findByText(/must be between 0.1 and 20/)).toBeTruthy()
		expect(puts, 'nothing is sent when the form is invalid').toHaveLength(0)
	})

	it('lists an item that has a stored row like any other, with no override marking', async () => {
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
			expect(entry).toBeTruthy()
			// Stored values are simply the item's values now — there is nothing to mark as "overridden".
			expect(entry?.querySelector('[title^="Sửa bởi"]')).toBeNull()
		})
	})
})

describe('creating and deleting items', () => {
	it('creates an item from a name the admin typed and selects it', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-create-open]')!)
		// The admin types a **name** — the id is generated from it, the same way a new account gets a
		// handle. "Kiếm Sắt" → `kiem-sat`.
		fireEvent.change(document.querySelector('[data-admin-create-name]')!, { target: { value: 'Kiếm Sắt' } })
		expect(document.querySelector('[data-admin-create-code]')!.textContent).toBe('kiem-sat')
		fireEvent.click(document.querySelector('[data-admin-create-submit]')!)

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/item/kiem-sat')
		// Only the fields an item cannot work without; everything else stays an optional field.
		expect(puts[0]!.body).toMatchObject({
			name: 'Kiếm Sắt',
			// A created item starts as an artifact (the third weapon type).
			cls: 'artifact',
			tier: 1,
			quality: 1,
			cost: 1,
			space: { w: 1, h: 1 },
		})
		// The new item is selected and listed, so the editor can start filling it in.
		await waitFor(() => expect(document.querySelector('[data-admin-entry="kiem-sat"]')).toBeTruthy())
		expect(useUiStore.getState().adminId).toBe('kiem-sat')
	})

	it('gives a second item with the same name its own id instead of overwriting', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-create-open]')!)
		// `wooden-blade` is a code item, so its name is taken as an id: the new one gets `-2`.
		fireEvent.change(document.querySelector('[data-admin-create-name]')!, { target: { value: 'Wooden Blade' } })
		expect(document.querySelector('[data-admin-create-code]')!.textContent).toBe('wooden-blade-2')
		fireEvent.click(document.querySelector('[data-admin-create-submit]')!)

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/item/wooden-blade-2')
	})

	it('explains a rejected name right next to the input, not in the editor panel', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-create-open]')!)
		// No name typed at all — the old page only wrote into the message line of the editor on the
		// right, which reads as "the button does nothing".
		fireEvent.click(document.querySelector('[data-admin-create-submit]')!)

		const error = await screen.findByRole('alert')
		expect(error.hasAttribute('data-admin-create-error')).toBe(true)
		expect(error.closest('form'), 'the reason sits in the create box').toBeTruthy()
		expect(document.querySelector('[data-admin-create-name]')!.getAttribute('aria-invalid')).toBe('true')
		// It clears as soon as the admin starts typing.
		fireEvent.change(document.querySelector('[data-admin-create-name]')!, { target: { value: 'Kiếm' } })
		expect(screen.queryByRole('alert')).toBeNull()
		expect(puts).toHaveLength(0)
	})

	it('creates the item when the name box is submitted with Enter', async () => {
		const { puts } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-create-open]')!)
		fireEvent.change(document.querySelector('[data-admin-create-name]')!, { target: { value: 'Kiếm Enter' } })
		// jsdom does not run implicit submission, so submit the form the way Enter does in a browser.
		fireEvent.submit(document.querySelector('[data-admin-create-submit]')!.closest('form')!)

		await waitFor(() => expect(puts).toHaveLength(1))
		expect(puts[0]!.url).toContain('/api/admin/content/item/kiem-enter')
	})

	it('deletes the row outright — there is no soft delete any more', async () => {
		const { puts, deletes } = stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(document.querySelector('[data-admin-entry="wooden-blade"]')!)
		fireEvent.click(document.querySelector('[data-admin-delete]')!)
		const dialog = await screen.findByRole('dialog', { name: /Delete "Đao Gỗ"/ })
		fireEvent.click(dialog.querySelector('[data-confirm-accept]')!)

		await waitFor(() => expect(deletes).toHaveLength(1))
		expect(deletes[0]).toContain('/api/admin/content/item/wooden-blade')
		// No `removed` flag is sent: the row is gone, so nothing can be restored.
		expect(puts).toHaveLength(0)
		await waitFor(() => expect(document.querySelector('[data-admin-entry="wooden-blade"]')).toBeNull())
	})

	it('deletes a created item outright', async () => {
		const { deletes } = stubApi()
		// A created item exists only as an overlay row — that is what the shop and the editor read.
		installRetiredItems({ items: { 'kiem-sat': { name: 'Kiếm Sắt', cls: 'melee', cost: 4 } } })
		renderInRouter(<AdminContentScreen />)

		fireEvent.click(await screen.findByRole('button', { name: /Iron Sword/ }))
		expect(itemTemplateById('kiem-sat')?.cost).toBe(4)

		fireEvent.click(await screen.findByRole('button', { name: 'Delete item' }))
		const dialog = await screen.findByRole('dialog', { name: /Delete "Kiếm Sắt"/ })
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

		const dialog = await screen.findByRole('dialog', { name: /Upload art for/ })
		// Đao Gỗ covers 1×3 cells → the frame follows that shape and the file comes out 640×1920 (Full HD).
		expect(dialog.textContent).toContain('1×3 cells')
		expect(dialog.textContent).toContain('640×1920')
		expect(dialog.querySelector('[data-art-file]')).toBeTruthy()
		// Nothing to save yet: a picture has to be chosen first.
		expect(
			[...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('Save art'))
				?.disabled,
		).toBe(true)
	})

	it('offers the delete button once a picture exists, and removes it on request', async () => {
		const { deletes } = stubApi({ art: [UPLOADED] })
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		const remove = await screen.findByText('Delete uploaded art')
		fireEvent.click(remove)

		// Deleting loses the crop, so it asks first — and says what happens.
		const dialog = await screen.findByRole('dialog', { name: /Delete the uploaded art of/ })
		expect(dialog.textContent).toContain('cannot be undone')

		fireEvent.click(dialog.querySelector('[data-confirm-accept]')!)

		await waitFor(() => expect(deletes).toHaveLength(1))
		expect(deletes[0]).toContain('/api/admin/content/item/wooden-blade/art')
	})

	it('keeps the picture when the confirmation is cancelled', async () => {
		const { deletes } = stubApi({ art: [UPLOADED] })
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(await screen.findByText('Delete uploaded art'))

		const dialog = await screen.findByRole('dialog', { name: /Delete the uploaded art of/ })
		fireEvent.click(dialog.querySelector('[data-confirm-cancel]')!)

		await waitFor(() => expect(screen.queryByRole('dialog', { name: /Delete the uploaded art of/ })).toBeNull())
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
		const tile = box!.querySelector('[data-item-quality]')
		expect(tile?.className).toContain('surface-item')
		expect(tile?.getAttribute('data-item-quality'), 'Đao Gỗ is quality 1 → silver plate').toBe('1')
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
		const icons = () => stars()?.querySelectorAll('svg') ?? []
		expect(icons(), '1★ by default').toHaveLength(1)
		expect(stars()?.className).toContain('text-rank-1')

		fireEvent.click(document.querySelector('[data-admin-preview-star="5"]')!)
		expect(icons()).toHaveLength(5)
		expect(stars()?.className).toContain('text-rank-5')
	})

	it('previews a cutie as the round portrait it appears as', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(screen.getByRole('button', { name: 'Cuties' }))
		await waitFor(() => {
			expect(document.querySelector('[data-admin-art-preview] [data-cutie-portrait]')).toBeTruthy()
		})
	})

	it('shows both cutie destinations inside the cropper, not one small square', async () => {
		stubApi()
		renderInRouter(<AdminContentScreen />)
		await screen.findByText('wooden-blade')

		fireEvent.click(screen.getByRole('button', { name: 'Cuties' }))
		fireEvent.click(await screen.findByText(/Upload art/))

		const dialog = await screen.findByRole('dialog', { name: /Upload art for/ })
		// The crop is 1:1 for a cutie, and the hint has to say so instead of talking about item cells.
		expect(dialog.textContent).toContain('1:1')
		expect(dialog.textContent).toContain('1080×1080')
	})
})
