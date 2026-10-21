// @vitest-environment jsdom
/**
 * Navigation between the preparation room (`/`) and the dedicated shop page (`/shop`).
 *
 * Three things to remember when writing tests here:
 * - Use @testing-library's `render`, **not** `renderToString` (zustand v5 returns the initial
 *   state for `getServerSnapshot`).
 * - Since the move to TanStack Router, **the URL is the source of truth** for the open screen; the
 *   store no longer holds `route`. So check the open screen via `window.location.pathname` plus the
 *   rendered content, ❌ never by reading `route` from the store.
 * - `renderApp` is `async` (RouterProvider matches the route after `router.load()` resolves), so
 *   the `it` callback must be `async` and must `await renderApp(...)`.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { installRetiredItems } from '../../test/retiredItems'

installRetiredItems()
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { renderApp } from '../../test/router'

/** Back to the preparation room with clean gold and shop (the shop is kept by `persist` between tests). */
function resetAt() {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: { ...state.run, gold: 99 },
	}))
}

beforeEach(async () => {
	resetAt()
	// Let any `popstate` still queued by a previous test's `history.back()` drain **before** the next
	// router is created, then put the document back on `/`. Without this the new router can be
	// navigated to the old entry mid-test and the screen under test silently changes.
	await new Promise((resolve) => setTimeout(resolve, 5))
	window.history.replaceState({}, '', '/')
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
})

describe('navigation between the preparation room and the shop', () => {
	it('the preparation room shows the loadout board and the buy button', async () => {
		await renderApp('/')
		// "Trang bị" also appears in the hint sentence, so ask by panel heading.
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(screen.getAllByText(/Mua Vật Phẩm/).length).toBeGreaterThan(0)
		// The fight button and the progress bar live in the Adventure dialog, not in the footer.
		expect(screen.queryByText(/Đấu Cutie/)).toBeNull()
		expect(screen.queryByText(/Tiến trình màn/)).toBeNull()
		// The two not-yet-functional buttons are still shown to keep the layout.
		expect(screen.getByText(/Nhiệm Vụ/)).toBeTruthy()
		expect(screen.getByText(/Bộ Sưu Tập/)).toBeTruthy()
	})

	it('clicking Mua Vật Phẩm opens the shop page and changes the URL', async () => {
		await renderApp('/')
		fireEvent.click(screen.getAllByText(/Mua Vật Phẩm/)[0])

		// Wait for the new screen to render before checking the URL: router navigation is an async
		// transition, so `window.location` may change a tick later.
		expect(await screen.findByText('Cửa hàng')).toBeTruthy()
		expect(window.location.pathname).toBe('/shop')
		// The shop page no longer shows the inventory.
		expect(screen.queryByText('Kho đồ')).toBeNull()
	})

	it('the back button returns to the preparation room', async () => {
		await renderApp('/shop')
		expect(screen.getByText('Cửa hàng')).toBeTruthy()

		fireEvent.click(screen.getByText(/Quay về/))

		expect(await screen.findByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
		expect(window.location.pathname).toBe('/')
	})

	it('items can be bought right on the shop page', async () => {
		await renderApp('/shop')

		const before = useGameStore.getState().run
		const offer = before.shop[0]
		expect(offer.sold).toBe(false)
		// No buy button any more: the **cell itself** is the button.
		fireEvent.click(document.querySelectorAll('[data-shop-offer]')[0]!)

		const after = useGameStore.getState().run
		// The loadout has room, so the item is carried right away.
		expect(after.equipped).toHaveLength(1)
		expect(after.gold).toBe(before.gold - offer.cost)
		expect(after.shop[0].sold).toBe(true)
	})

	it('a bought offer leaves an empty cell instead of a dimmed ghost', async () => {
		await renderApp('/shop')

		fireEvent.click(document.querySelectorAll('[data-shop-offer]')[0]!)

		// The item is gone from the board: no tile, no price, no `data-shop-offer` button.
		expect(document.querySelectorAll('[data-shop-offer]')).toHaveLength(5)
		expect(document.querySelectorAll('[data-shop-sold]')).toHaveLength(1)
		// The bought one is no longer drawn dimmed anywhere.
		expect(
			[...document.querySelectorAll('[data-shop-offer]')].filter((cell) => cell.className.includes('opacity-50')),
		).toHaveLength(0)
	})

	it('the info icon explains the current shop drop rates on hover', async () => {
		await renderApp('/shop')

		const toggle = document.querySelector('[data-shop-odds-toggle]')!
		const tip = document.querySelector('[data-shop-odds]')!

		// Hover-only, ❌ not a click toggle: the panel is always mounted (`invisible` until the
		// pointer or the keyboard focus reaches the icon), so it needs no expanded state.
		expect(toggle.hasAttribute('aria-expanded')).toBe(false)
		expect(toggle.getAttribute('aria-describedby')).toBe(tip.id)
		expect(tip.getAttribute('role')).toBe('tooltip')

		const stars = [...tip.querySelectorAll('[data-shop-odds-star]')].map((el) => [
			el.getAttribute('data-shop-odds-star'),
			el.textContent,
		])
		// A fresh run has cleared nothing, so every offer is plain: 1★ 100%, no upgrades.
		expect(stars).toEqual([
			['1', '100%'],
			['2', '0%'],
			['3', '0%'],
		])

		// Quality is the other half of the roll: every band is listed with its derived chance.
		const qualities = [...tip.querySelectorAll('[data-shop-odds-quality]')]
		expect(qualities).toHaveLength(5)
		const total = qualities.reduce((sum, el) => sum + Number((el.textContent ?? '0').replace('%', '')), 0)
		expect(Math.round(total)).toBe(100)
	})

	it('suggests an offer that would merge up a star', async () => {
		// A 1★ twin is already equipped; a 2★ offer is **not** a twin of it.
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				equipped: [{ uid: 'twin', templateId: 'jade-fury', star: 1, slot: 0, rotated: false, paid: 3 }],
				shop: [
					{ templateId: 'jade-fury', star: 1, cost: 5, sold: false },
					{ templateId: 'heal-dew', star: 1, cost: 5, sold: false },
					{ templateId: 'jade-fury', star: 2, cost: 10, sold: false },
				],
			},
		}))
		await renderApp('/shop')

		const mergeable = [...document.querySelectorAll('[data-shop-offer]')].filter((cell) =>
			cell.hasAttribute('data-shop-merge'),
		)
		expect(mergeable).toHaveLength(1)
		expect(mergeable[0].getAttribute('data-shop-merge')).toBe('2')
		// The badge reads `↑ 2★`, and both glyphs are **lucide icons** (arrow + star), ❌ not the
		// `↑` / `★` characters: a text glyph sits on another font's baseline and never lined up.
		const badge = mergeable[0].querySelector('[data-shop-merge-badge]')
		expect(badge?.textContent).toContain('2')
		expect(badge?.querySelectorAll('svg')).toHaveLength(2)
		// The ring marks the suggestion even before hovering.
		expect(mergeable[0].querySelector('[data-shop-merge-ring]')).toBeTruthy()

		// Every tile keeps the plain dashed "buyable" frame; only the suggested one turns gold.
		const plain = [...document.querySelectorAll('[data-shop-offer]')].filter(
			(cell) => !cell.hasAttribute('data-shop-merge'),
		)
		expect(plain.length).toBeGreaterThan(0)
		for (const cell of plain) {
			expect(cell.querySelector('[data-shop-tile-frame]')).toBeTruthy()
			expect(cell.querySelector('[data-shop-merge-ring]')).toBeNull()
		}
	})

	it('hovering an offer shows its details card beside the tile', async () => {
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				shop: [{ templateId: 'wooden-blade', star: 1, cost: 3, sold: false }],
			},
		}))
		await renderApp('/shop')

		expect(document.querySelector('[data-item-hover-card]'), 'nothing hovered yet').toBeNull()

		const cell = document.querySelector<HTMLElement>('[data-shop-offer]')!
		// React derives `onPointerEnter` from `pointerover`, so that is the event to fire in jsdom.
		fireEvent.pointerOver(cell)

		// Hover intent: the card waits a beat, so a pointer crossing the board does not flash it.
		expect(document.querySelector('[data-item-hover-card]'), 'not on the first pixel of contact').toBeNull()
		await waitFor(() => expect(document.querySelector('[data-item-hover-card]')).toBeTruthy())

		const card = document.querySelector<HTMLElement>('[data-item-hover-card]')!
		expect(card.getAttribute('role')).toBe('tooltip')
		// The numbers come from the same `itemFacts()` the click-to-open dialog reads.
		expect(card.textContent).toContain('Hồi chiêu')
		expect(card.textContent).toContain('Hệ số sát thương')
		// Each kit is its own framed box under the header — never merged into one table.
		expect(card.querySelector('[data-card-kit]')?.className).toContain('border')
		// Text only: the tile is right there on the board, the card must not repeat its picture.
		expect(card.querySelector('img')).toBeNull()
		// The price and the merge hint live on the cell (price row + `↑N★` badge), not in the card.
		expect(card.textContent).not.toContain('Giá')
		expect(card.textContent).not.toContain('Mua để gộp lên')

		fireEvent.pointerOut(cell)
		expect(document.querySelector('[data-item-hover-card]'), 'leaving the cell closes it').toBeNull()
	})

	it('a purchase drops the hover card of the offer it just bought', async () => {
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				shop: [{ templateId: 'wooden-blade', star: 1, cost: 3, sold: false }],
			},
		}))
		await renderApp('/shop')

		const cell = document.querySelector<HTMLElement>('[data-shop-offer]')!
		fireEvent.pointerOver(cell)
		await waitFor(() => expect(document.querySelector('[data-item-hover-card]')).toBeTruthy())

		fireEvent.click(cell)

		// ⚠️ The bought cell is **replaced** by the sold placeholder, so no pointer-leave ever reaches
		// the old button: without an explicit hide the card stayed on screen over a gone offer.
		expect(useGameStore.getState().run.shop[0]?.sold, 'the offer is bought').toBe(true)
		expect(document.querySelector('[data-item-hover-card]'), 'the card must not outlive the offer').toBeNull()
	})

	it('keeps every shop cell at one fixed height, whatever the offers are', async () => {
		// A 1×1 gem and a 1×3 blade side by side: the shells must **not** size themselves after the item.
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				shop: [
					{ templateId: 'jade-fury', star: 1, cost: 3, sold: false },
					{ templateId: 'wooden-blade', star: 1, cost: 3, sold: false },
				],
			},
		}))
		await renderApp('/shop')

		const heights = [...document.querySelectorAll<HTMLElement>('[data-shop-offer], [data-shop-sold]')].map(
			(cell) => cell.style.height,
		)
		expect(heights.length).toBeGreaterThan(1)
		expect(heights.every((height) => height !== ''), 'set inline, not by the tile').toBe(true)
		expect(new Set(heights).size, 'one height for every cell').toBe(1)
		// Tall enough for the biggest footprint in the catalogue (3 rows × 90 px + the cell chrome).
		expect(Number.parseInt(heights[0], 10)).toBeGreaterThanOrEqual(3 * 90)
	})

	it('opening /shop directly lands on the shop page', async () => {
		await renderApp('/shop')
		expect(screen.getByText('Cửa hàng')).toBeTruthy()	})

	it('an unknown path still lands on the preparation room', async () => {
		await renderApp('/mot-duong-dan-la')
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
	})

	it('the old Vietnamese /cua-hang URL redirects to /shop', async () => {
		await renderApp('/cua-hang')
		expect(await screen.findByText('Cửa hàng')).toBeTruthy()
		expect(window.location.pathname).toBe('/shop')
	})

	it('the old Vietnamese /quan-tri URL redirects to /admin', async () => {
		await renderApp('/quan-tri')
		// The session is unknown in tests, so the admin page shows its "checking" or locked state;
		// the URL is what the redirect contract is about.
		expect(await screen.findByRole('heading', { name: 'Content admin' })).toBeTruthy()
		expect(window.location.pathname).toBe('/admin')
	})

	it('a legacy redirect does not fill the history with the old URL', async () => {
		await renderApp('/cua-hang')
		await screen.findByText('Cửa hàng')

		// Back from a redirect must leave the app rather than bounce to `/cua-hang` again.
		window.history.back()
		await new Promise((resolve) => setTimeout(resolve, 0))
		expect(window.location.pathname).not.toBe('/cua-hang')
	})

	it('a not-yet-functional button is disabled instead of looking broken', async () => {
		await renderApp('/')
		// "Nhiệm Vụ" and "Bộ Sưu Tập" have no content yet: they stay in the bar for the layout, but
		// they are disabled, so a click cannot do nothing silently.
		const quests = screen.getByText(/Nhiệm Vụ/).closest('button')!
		expect(quests.disabled).toBe(true)
		expect(quests.title, 'the tooltip says why it cannot be clicked').toMatch(/bản sau|coming soon/)
	})

	it('during a battle the battle screen is shown even on the shop URL', async () => {
		useGameStore.getState().buyOffer(0)
		useGameStore.getState().startBattle('stage')
		await renderApp('/shop')
		expect(useGameStore.getState().phase).toBe('battle')
		// The battle screen has the arena and the speed buttons.
		expect(document.querySelector('[data-battle-screen]')).toBeTruthy()
		expect(screen.getByText(/Bỏ qua/)).toBeTruthy()
	})

	it('abandons an active PvP battle and opens admin when the admin link is clicked', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input)
				const body =
					url === '/api/auth/session'
						? {
								authenticated: true,
								user: {
									id: 1,
									display_name: 'Admin',
									email: 'admin@example.com',
									avatar_url: null,
									providers: ['google'],
									is_admin: true,
								},
								available_providers: ['google'],
								auto_login: false,
							}
						: url === '/api/content'
							? { items: {}, cuties: {}, art: {} }
							: url === '/api/admin/content'
								? { overrides: [], art: [] }
								: { run: null, revision: 0, updated_at: null }
				return new Response(JSON.stringify(body), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				})
			}),
		)

		useGameStore.getState().startBattle('pvp')
		await renderApp('/')
		fireEvent.click(await screen.findByRole('button', { name: 'Quản trị' }))

		expect(await screen.findByRole('heading', { name: 'Content admin' })).toBeTruthy()
		expect(window.location.pathname).toBe('/admin')
		expect(useGameStore.getState().phase).toBe('prep')
		expect(useGameStore.getState().battle).toBeNull()
	})
})
