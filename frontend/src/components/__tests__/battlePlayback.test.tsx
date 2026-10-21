// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../../store/gameStore'
import { useBattleSettingsStore } from '../../store/battleSettingsStore'
import { renderApp } from '../../test/router'
import { installRetiredItems } from '../../test/retiredItems'
import { fightCurrentStage } from '../../test/battleEntry'
import type { ShopOffer } from '../../game/types'
import { CUTIE_SKILL_SLOTS } from '../../game/cuties'
import { playBattleImpactSound, playBattleSlashSound, unlockBattleAudio } from '../battleAudio'

/** End-to-end check of the battle screen: playback, speed controls and commit. */

vi.mock('../battleAudio', () => ({
	unlockBattleAudio: vi.fn(),
	playBattleSlashSound: vi.fn(),
	playBattleImpactSound: vi.fn(),
}))

function gearUp() {
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: {
			...state.run,
			gold: 80,
			shop: state.run.shop.map((offer, index): ShopOffer =>
				index < 3
					? {
							...offer,
							templateId: ['great-axe', 'warden-plate', 'jade-fury'][index],
							star: 4,
							cost: 8,
							sold: false,
						}
					: offer,
			),
		},
	}))
	for (let index = 0; index < 3; index += 1) useGameStore.getState().buyOffer(index)
}

function advance(ms: number) {
	act(() => {
		vi.advanceTimersByTime(ms)
	})
}

/** The percentage inside `35%` or `calc(35% - 2px)` — the charge bar expresses its height that way. */
function percentOf(value: string | undefined) {
	return Number.parseFloat(/([\d.]+)%/.exec(value ?? '')?.[1] ?? '0')
}

describe('battle screen playback', () => {
	beforeEach(() => {
		installRetiredItems()
		vi.useFakeTimers()
		vi.clearAllMocks()
		window.localStorage.removeItem('martial-cutie-battle-settings')
		useBattleSettingsStore.setState({ speed: 2 })
	})

	afterEach(() => {
		cleanup()
		vi.useRealTimers()
	})

	it('steps through the fight and commits the result on its own', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		expect(unlockBattleAudio).toHaveBeenCalledOnce()

		expect(useGameStore.getState().phase).toBe('battle')
		expect(useGameStore.getState().battle?.committed).toBe(false)
		expect(document.querySelector('[data-battle-screen]')?.className).toContain('flex-1')
		expect(document.querySelector('[data-battle-arena]')?.className).toContain('flex-1')

		const started = useGameStore.getState().battle
		if (!started) throw new Error('battle did not start')
		const duration = started.result.events.at(-1)?.t ?? 0
		// Playback runs at ×2: a quarter of the simulated duration in real time is still mid-fight.
		advance(Math.max(60, Math.floor(duration / 4)))
		expect(useGameStore.getState().battle?.committed).toBe(false)

		advance(duration)
		expect(useGameStore.getState().battle?.committed).toBe(true)
		expect(useGameStore.getState().phase).toBe('result')
		expect(screen.getByRole('button', { name: /Chiến thắng!|Thất bại|Hoà/ })).toBeTruthy()
	})

	it('does not fire the whole skipped tail at once when Bỏ qua is pressed', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		// One normal tick, so the mocks are warm, then jump to the end.
		advance(60)
		vi.mocked(playBattleSlashSound).mockClear()
		vi.mocked(playBattleImpactSound).mockClear()

		fireEvent.click(screen.getByRole('button', { name: /Bỏ qua/ }))
		expect(useGameStore.getState().battle?.committed).toBe(true)

		// The jump crosses every remaining hit: it must not launch a comet — and, above all, not a
		// sound — for each one of them (that used to be one very loud burst).
		expect(document.querySelectorAll('[data-combat-comet]').length).toBe(0)
		expect(playBattleSlashSound).not.toHaveBeenCalled()
		expect(playBattleImpactSound).not.toHaveBeenCalled()
		// No stale damage numbers from the hits that were skipped over either.
		expect(document.querySelectorAll('[data-combat-feedback="damage"]').length).toBe(0)
	})

	it('offers the supported speeds and persists the selected speed in localStorage', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		expect(screen.getByRole('button', { name: '×0.5' })).toBeTruthy()
		expect(screen.getByRole('button', { name: '×1' })).toBeTruthy()
		expect(screen.getByRole('button', { name: '×2' }).getAttribute('aria-pressed')).toBe('true')
		expect(screen.getByRole('button', { name: '×3' })).toBeTruthy()

		fireEvent.click(screen.getByRole('button', { name: '×0.5' }))
		expect(useBattleSettingsStore.getState().speed).toBe(0.5)
		expect(JSON.parse(window.localStorage.getItem('martial-cutie-battle-settings') ?? '{}')).toMatchObject({
			state: { speed: 0.5 },
		})
	})

	it('launches the comet one flight early, so the number and the impact land with it', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×0.5' }))
		expect(useBattleSettingsStore.getState().speed).toBe(0.5)

		const battle = useGameStore.getState().battle
		if (!battle) throw new Error('battle did not start')
		// Same rule the arena uses: a counter that deals no damage draws no comet.
		const hit = battle.result.events.find(
			(event, index) =>
				index > 0 &&
				['attack', 'charged', 'counter'].includes(event.kind) &&
				(event.kind !== 'counter' || event.text.includes('−')) &&
				(event.amount ?? 0) > 0,
		)
		if (!hit) throw new Error('this fight has no projectile')

		const damageFloaters = () => document.querySelectorAll('[data-combat-feedback="damage"]').length
		const before = damageFloaters()
		// ×0.5 → 30 simulated ms per 60 ms tick; the comet is launched 300 simulated ms early.
		const spawnTick = Math.ceil((hit.t - 300) / 30)
		for (let step = 0; step < spawnTick; step += 1) advance(60)

		// The animation is already in flight, but the hit it carries has not landed: no impact sound and
		// no new number — at ×0.5 the whole point is that the number waits for the streak.
		expect(document.querySelector('[data-combat-comet]'), 'the comet is flying').toBeTruthy()
		expect(playBattleImpactSound, 'not landed yet').not.toHaveBeenCalled()
		expect(damageFloaters(), 'the number has not appeared yet').toBe(before)

		// Reaching the event's own tick lands it: the impact and the number appear together.
		// 12 ticks = 720 ms of real time = the 300 simulated ms the comet still had to fly.
		for (let step = 0; step < 12; step += 1) advance(60)
		expect(playBattleImpactSound).toHaveBeenCalled()
		expect(damageFloaters()).toBeGreaterThan(before)
	})

	it('only fires a weapon streak once its charge overlay reads 100%', async () => {
		gearUp()
		// A long fight: the sample needs several weapon swings, and the starter monsters die to three
		// 4★ items before a blade sometimes even lands (this test used to flake on that).
		useGameStore.setState((state) => ({
			run: { ...state.run, stage: 29, clearedStage: 29 },
		}))
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×0.5' }))

		const tileOf = (uid: string) =>
			document.querySelector<HTMLElement>(`[data-battle-weapon-source="${uid}"]`)
		let fired = false
		for (let step = 0; step < 200 && !fired; step += 1) {
			advance(60)
			// ⚠️ Every streak on screen, not just the first one: the Cutie swings on the same tick as a
			// weapon at the same rate, and its streak (no tile) sits ahead of the weapon's in the DOM.
			for (const comet of document.querySelectorAll<HTMLElement>('[data-combat-slash]')) {
				const uid = comet.dataset.combatSourceUid?.split('#')[0]
				if (!uid) continue
				const tile = tileOf(uid)
				if (!tile) continue
				const overlay = tile.querySelector<HTMLElement>('[data-weapon-charge-overlay]')
				expect(overlay, `${uid} draws a charge bar`).toBeTruthy()
				// The bar reaches the top exactly when the streak leaves — ❌ never ~50 % or ~90 %.
				expect(percentOf(overlay?.style.bottom), 'the weapon is fully charged when it fires').toBe(100)
				fired = true
				break
			}
		}
		expect(fired, 'a weapon fired during the sample').toBe(true)
	})

	it('boosts projectile speed by 50% in every mode and scales with the selected battle speed', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×3' }))

		for (let step = 0; step < 100 && !document.querySelector('[data-combat-slash]'); step += 1) {
			advance(60)
		}

		const projectile = document.querySelector<HTMLElement>('[data-combat-slash]')
		expect(projectile).toBeTruthy()
		expect(Number(projectile?.dataset.combatAnimationDuration)).toBeCloseTo(0.5 / (3 * 1.5), 5)
		expect(playBattleImpactSound).not.toHaveBeenCalled()
		const impactAfter =
			Number(projectile?.dataset.combatAnimationDuration) * Number(projectile?.dataset.combatImpactAt) * 1000
		advance(Math.ceil(impactAfter) + 10)
		expect(playBattleImpactSound).toHaveBeenCalled()

		cleanup()
		vi.clearAllMocks()
		useBattleSettingsStore.setState({ speed: 2 })
		useGameStore.getState().startBattle('pvp')
		await renderApp('/')
		for (let step = 0; step < 100 && !document.querySelector('[data-combat-slash]'); step += 1) {
			advance(60)
		}
		const pvpProjectile = document.querySelector<HTMLElement>('[data-combat-slash]')
		expect(pvpProjectile).toBeTruthy()
		expect(Number(pvpProjectile?.dataset.combatAnimationDuration)).toBeCloseTo(0.5 / (2 * 1.5), 5)
	})

	it('keeps each avatar beside its own loadout on the outer side of the arena', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		const playerTeam = document.querySelector('[data-battle-team="player"]')
		const enemyTeam = document.querySelector('[data-battle-team="enemy"]')
		expect(playerTeam?.querySelector('[data-avatar-card="player"]')).toBeTruthy()
		expect(playerTeam?.querySelector('[data-battle-side="player"] [data-grid-board]')).toBeTruthy()
		expect(enemyTeam?.querySelector('[data-avatar-card="enemy"]')).toBeTruthy()
		expect(enemyTeam?.querySelector('[data-battle-side="enemy"] [data-grid-board]')).toBeTruthy()
		expect(playerTeam?.className).toContain('xl:gap-2')
		expect(enemyTeam?.className).toContain('xl:gap-2')
		expect(enemyTeam?.className).toContain('xl:justify-self-end')
		expect(document.querySelector('[data-battle-arena]')?.className).toContain('xl:grid-cols-[repeat(2,minmax(max-content,1fr))]')
		expect(document.querySelector('[data-battle-arena]')?.children).toHaveLength(3)
		expect(document.querySelector('[data-battle-arena]')?.className).toContain('content-center')
		expect(document.querySelector('[data-battle-arena]')?.className).not.toContain('surface-arena')
		expect(document.querySelector('[data-battle-arena]')?.className).not.toContain('border')
		expect(document.querySelector('[data-battle-arena]')?.className).not.toContain('rounded-panel')
		expect(document.querySelector('[data-battle-screen] section')?.className).not.toContain('border')
		expect(document.querySelector('[data-battle-screen] section')?.className).not.toContain('shadow-panel')
		expect(document.querySelector('[data-battle-side="player"]')?.className).toContain('w-fit')
		expect(document.querySelector('[data-battle-side="enemy"]')?.className).toContain('w-fit')
		expect(document.querySelector<HTMLElement>('[data-avatar-card="player"]')?.className).toContain('battle-cutie-card')
		expect(document.querySelector<HTMLElement>('[data-avatar-card="enemy"]')?.className).toContain('battle-cutie-card-enemy')
		expect(document.querySelector<HTMLElement>('[data-battle-side="player"] [data-grid-board]')?.style.gridTemplateColumns).toBe('repeat(4, 90px)')
		expect(document.querySelector<HTMLElement>('[data-battle-side="enemy"] [data-grid-board]')?.style.gridTemplateColumns).toBe('repeat(4, 90px)')
		// The arena uses the same 90 px cell as the prep boards now, so its gap/padding scale to 1:1.
		expect(document.querySelector<HTMLElement>('[data-battle-side="player"] [data-grid-board]')?.style.gap).toBe('4px')
		expect(document.querySelector<HTMLElement>('[data-battle-side="player"] [data-grid-board]')?.style.padding).toBe('6px')
		expect(document.querySelector('[data-battle-side="player"]')?.textContent).not.toMatch(/items?/)
		expect(document.querySelector('[data-battle-side="enemy"]')?.textContent).not.toMatch(/items?/)
	})

	it('shows the armour the simulation reports, not the starting value', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		const started = useGameStore.getState().battle
		if (!started) throw new Error('battle did not start')
		const events = started.result.events
		const startShield = events[0]?.player.shield ?? 0
		const lastShield = events.at(-1)?.player.shield ?? 0
		expect(startShield, 'the build grants armour, otherwise the test proves nothing').toBeGreaterThan(0)

		// Play the whole fight; the badge is printed straight from the event, so it must agree with it.
		advance((events.at(-1)?.t ?? 0) + 1000)
		expect(document.querySelector('[data-battle-shield-value="player"]')?.textContent).toBe(
			String(Math.max(0, Math.round(lastShield))),
		)
		// …and that value is not simply the starting one (the shield really moved during the fight).
		expect(lastShield).not.toBe(startShield)
	})

	it('prints the Sword Energy read-out on its bar, like health', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		const started = useGameStore.getState().battle
		if (!started) throw new Error('battle did not start')
		const events = started.result.events
		advance((events.at(-1)?.t ?? 0) + 1000)
		const last = events.at(-1)!
		expect(document.querySelector('[data-battle-se-value="player"]')?.textContent).toBe(
			`${Math.max(0, Math.round(last.player.se))} / ${Math.round(last.player.maxSe)}`,
		)
		expect(document.querySelector('[data-battle-se-value="enemy"]')?.textContent).toBe(
			`${Math.max(0, Math.round(last.enemy.se))} / ${Math.round(last.enemy.maxSe)}`,
		)
	})

	it('commits immediately when the player skips', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByText(/Bỏ qua/))

		expect(useGameStore.getState().battle?.committed).toBe(true)
		expect(useGameStore.getState().phase).toBe('result')
	})

	it('shows a dismissible outcome, then supports log review and replay without recommitting', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		expect(screen.queryByRole('dialog', { name: 'Nhật ký trận đấu' })).toBeNull()
		expect(screen.queryByText(/Hỏa Khuyển Trảo.*−/)).toBeNull()
		advance(120_000)

		expect(useGameStore.getState().battle?.committed).toBe(true)
		const currencyAfterBattle = useGameStore.getState().run.gold
		expect(screen.getByRole('button', { name: /Chiến thắng!|Thất bại|Hoà/ })).toBeTruthy()
		expect(screen.queryByRole('button', { name: 'Rời trận' })).toBeNull()
		expect(screen.queryByRole('button', { name: 'Nhật ký trận đấu' })).toBeNull()
		fireEvent.click(screen.getByRole('button', { name: /Chiến thắng!|Thất bại|Hoà/ }))
		expect(useGameStore.getState().phase).toBe('result')
		expect(document.querySelector('[data-battle-arena]')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /Chiến thắng!|Thất bại|Hoà/ })).toBeNull()
		expect(screen.getByRole('button', { name: 'Rời trận' })).toBeTruthy()

		fireEvent.click(screen.getByRole('button', { name: /Nhật ký trận đấu/ }))
		const log = screen.getByRole('dialog', { name: 'Nhật ký trận đấu' })
		expect(log.textContent).toContain('Trận đấu bắt đầu!')
		fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
		expect(screen.queryByRole('dialog', { name: 'Nhật ký trận đấu' })).toBeNull()

		fireEvent.click(screen.getByRole('button', { name: 'Phát lại' }))
		expect(useGameStore.getState().phase).toBe('result')
		expect(useGameStore.getState().battle?.committed).toBe(true)
		expect(screen.queryByRole('button', { name: 'Rời trận' })).toBeNull()
		advance(120_000)

		expect(screen.getByRole('button', { name: /Chiến thắng!|Thất bại|Hoà/ })).toBeTruthy()
		expect(useGameStore.getState().run.gold).toBe(currencyAfterBattle)
	})

	it('pauses and resumes playback', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		fireEvent.click(screen.getByText(/Tạm dừng/))
		advance(30_000)
		expect(useGameStore.getState().phase).toBe('battle')
		expect(useGameStore.getState().battle?.committed).toBe(false)

		fireEvent.click(screen.getByText(/Tiếp tục/))
		advance(120_000)
		expect(useGameStore.getState().battle?.committed).toBe(true)
	})

	it('does not reset an existing damage number timer when another hit arrives', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×1' }))

		const battle = useGameStore.getState().battle
		if (!battle) throw new Error('battle did not start')
		const snapshot = battle.result.events[0]
		useGameStore.setState((state) => ({
			battle: state.battle
				? {
						...state.battle,
						result: {
							...state.battle.result,
							events: [
								snapshot,
								{ ...snapshot, t: 60, kind: 'attack', side: 'player', text: 'First hit −10', amount: 10 },
								{ ...snapshot, t: 600, kind: 'attack', side: 'enemy', text: 'Second hit −11', amount: 11 },
								{ ...snapshot, t: 1500, kind: 'end', text: 'End' },
							],
						},
					}
				: null,
		}))

		advance(60)
		expect(document.querySelector('[data-combat-feedback-key="1"]')).toBeTruthy()
		advance(540)
		expect(document.querySelector('[data-combat-feedback-key="2"]')).toBeTruthy()
		advance(460)
		expect(document.querySelector('[data-combat-feedback-key="1"]')).toBeNull()
	})

	it('draws the cutie’s own swing charge on its portrait, like a weapon tile', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		// Both sides attack through their kits, so both portraits get the same rising hairline an item
		// tile has — a Cutie with no attack kit would have none.
		const cutieCharge = (side: 'player' | 'enemy') =>
			document.querySelector<HTMLElement>(
				`[data-avatar-card="${side}"] [data-battle-cutie-charge] [data-weapon-charge-overlay]`,
			)
		const playerCharge = cutieCharge('player')
		expect(playerCharge, 'the player cutie has a charge bar').toBeTruthy()
		// It is the **same component** as a weapon's: a thin line, not a filled portrait.
		expect(playerCharge?.style.height).toBe('9px')
		const start = percentOf(playerCharge?.style.bottom)
		advance(60)
		expect(percentOf(cutieCharge('player')?.style.bottom)).toBeGreaterThan(start)
		// The wash follows the line, so it reads as rising rather than a line that teleports up.
		const wash = document.querySelector<HTMLElement>(
			'[data-avatar-card="player"] [data-battle-cutie-charge] [data-weapon-charge-fill]',
		)
		expect(percentOf(wash?.style.height)).toBe(percentOf(cutieCharge('player')?.style.bottom))
	})

	it('reuses the loadout grids on the arena, with an avatar frame per side', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		// The arena uses the prep room's **own `GridBoard`**: one grid for us, one for the opponent.
		const boards = document.querySelectorAll<HTMLElement>('[data-grid-board]')
		expect(boards, 'two loadout grids on the arena').toHaveLength(2)
		const chargeOverlay = document.querySelector<HTMLElement>(
			'[data-battle-weapon-charge] [data-weapon-charge-overlay]',
		)
		expect(chargeOverlay).toBeTruthy()
		// The charge is a rising **hairline**: `bottom` is the percentage, not a filled height.
		expect(chargeOverlay?.style.height, 'a thin bar, not a full-tile fill').toBe('3px')
		const initialCharge = percentOf(chargeOverlay?.style.bottom)
		advance(60)
		expect(percentOf(chargeOverlay?.style.bottom)).toBeGreaterThan(initialCharge)

		// After a swing the bar does **not** slide back down: the next cycle is a brand-new element that
		// starts at the bottom. Same weapon, different node, higher cycle number.
		let cycled = false
		for (let step = 0; step < 60 && !cycled; step += 1) {
			advance(60)
			const fresh = document.querySelector<HTMLElement>('[data-battle-weapon-charge] [data-weapon-charge-overlay]')
			if (!fresh || fresh === chargeOverlay) continue
			expect(Number(fresh.dataset.weaponChargeCycle ?? '0'), 'a later cycle').toBeGreaterThan(
				Number(chargeOverlay?.dataset.weaponChargeCycle ?? '0'),
			)
			cycled = true
		}
		expect(cycled, 'the charge bar was replaced by a new cycle').toBe(true)

		// The wash under the line follows it, which is what makes the bar read as *rising*, and the bar's
		// top edge is pinned **inside** the wash (`calc(<pct>% - npx)`) so the two can never separate.
		expect(chargeOverlay?.style.height, 'a thin bar, not a full-tile fill').toBe('3px')
		const fill = document.querySelector<HTMLElement>('[data-battle-weapon-charge] [data-weapon-charge-fill]')
		expect(fill, 'a wash under the line').toBeTruthy()
		const liveOverlay = document.querySelector<HTMLElement>(
			'[data-battle-weapon-charge] [data-weapon-charge-overlay]',
		)
		expect(liveOverlay?.style.bottom, 'a calc() so the line can tuck into the wash').toContain('calc(')
		expect(percentOf(liveOverlay?.style.bottom), 'the line sits on the wash, never above it').toBe(
			percentOf(fill?.style.height),
		)
		// The avatar frames for both sides — a holder already prepared for avatar art (currently art/emoji).
		expect(document.querySelector('[data-avatar-card="player"]')).toBeTruthy()
		expect(document.querySelector('[data-avatar-card="enemy"]')).toBeTruthy()
		expect(document.querySelectorAll('[data-avatar-holder]')).toHaveLength(2)

		// Our grid shows **exactly** the number of carried items, not a loose list.
		const equipped = useGameStore.getState().run.equipped.filter((item) => item.slot >= 0)
		expect(boards[0].querySelectorAll('[data-item-box]')).toHaveLength(equipped.length)
	})

	it('opens the detail dialog for an item of either side while the fight runs', async () => {
		gearUp()
		// The opponent only carries gear from stage 8 on; the arena must have an enemy tile to click.
		useGameStore.setState((state) => ({ run: { ...state.run, stage: 22, clearedStage: 22 } }))
		await renderApp()
		fightCurrentStage()
		advance(60)

		// Our own gear: the dialog resolves it from the run, so the shop/sell rows are there too.
		const mine = document.querySelector<HTMLElement>('[data-battle-side="player"] [data-item-box] button')
		expect(mine, 'the equipped grid is on the arena').toBeTruthy()
		fireEvent.click(mine!)
		expect(screen.getByText('Chi tiết món')).toBeTruthy()
		expect(screen.getByText('Bán được (hoàn 50%)')).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))

		// The opponent's gear is **not in the run**, so the tile hands the item over as a preview.
		const theirs = document.querySelector<HTMLElement>('[data-battle-side="enemy"] [data-item-box] button')
		expect(theirs, 'the opponent grid is on the arena').toBeTruthy()
		fireEvent.click(theirs!)
		expect(screen.getByText('Chi tiết món')).toBeTruthy()
		// Prices and refunds only exist for what the player owns.
		expect(screen.queryByText('Bán được (hoàn 50%)')).toBeNull()
	})

	it('renders animated health and energy bars mirrored toward the center with shield counters', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		expect(document.querySelectorAll('[data-battle-hp-fill]')).toHaveLength(2)
		expect(document.querySelectorAll('[data-battle-se-fill]')).toHaveLength(2)
		expect(document.querySelector('[data-battle-hp-fill="player"]')?.parentElement?.className).toContain('h-6')
		expect(document.querySelector('[data-battle-se-fill="player"]')?.parentElement?.className).toContain('h-3')
		expect(document.querySelector('[data-battle-hp-fill="player"]')?.getAttribute('style')).toContain(
			'transform-origin: left center',
		)
		expect(document.querySelector('[data-battle-hp-fill="enemy"]')?.getAttribute('style')).toContain(
			'transform-origin: right center',
		)
		expect(document.querySelector('[data-battle-shield-value="player"]')).toBeTruthy()
		expect(document.querySelector('[data-battle-shield-value="enemy"]')).toBeTruthy()
	})

	it('throws the attacking tile at the target, like the shake a defender takes', async () => {
		// jsdom has no Web Animations API: stub it so the swing can be inspected frame by frame.
		const animate = vi.fn()
		Object.defineProperty(HTMLElement.prototype, 'animate', {
			value: animate,
			configurable: true,
			writable: true,
		})
		try {
			gearUp()
			await renderApp()
			fightCurrentStage()
			fireEvent.click(screen.getByRole('button', { name: '×1' }))

			const weapon = document.querySelector<HTMLElement>('[data-battle-weapon-source]')
			if (!weapon) throw new Error('the equipped weapon has no battle source marker')
			// Let the replay run into its first swings — the real battle, so no event list is invented
			// (the visual cursor is a ref and must not be rewound).
			for (let step = 0; step < 20 && animate.mock.calls.length === 0; step += 1) advance(60)
			expect(animate.mock.calls.length, 'something swung').toBeGreaterThan(0)

			const contexts = animate.mock.contexts as HTMLElement[]
			const swingAt = contexts.findIndex((element) => element.dataset.battleWeaponSource !== undefined)
			expect(swingAt, 'the weapon tile itself is animated').toBeGreaterThanOrEqual(0)
			const [frames, options] = animate.mock.calls[swingAt] as [
				Keyframe[],
				{ duration: number; easing: string },
			]
			// It leans **toward the enemy** (the target sits to the right) and flashes, then returns.
			expect(frames[1]?.transform).toMatch(/^translate3d\([\d.]+px, [\d.-]+px, 0\) scale\(1\.07\)$/)
			expect(
				Number.parseFloat(/translate3d\(([\d.-]+)px/.exec(frames[1]!.transform as string)![1]!),
			).toBeGreaterThan(0)
			expect(frames[1]?.filter).toBe('brightness(1.5)')
			expect(frames.at(-1)?.transform).toBe('translate3d(0, 0, 0) scale(1)')
			expect(options.duration).toBeGreaterThanOrEqual(180)
		} finally {
			delete (HTMLElement.prototype as { animate?: unknown }).animate
		}
	})

	it('plays projectiles and shows a number for both sides that take a hit', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		const battle = useGameStore.getState().battle
		if (!battle) throw new Error('battle did not start')
		const firstPositiveTime = battle.result.events.findIndex((event) => event.t > 0)
		const initialEvents = battle.result.events.slice(0, firstPositiveTime)
		const laterEvents = battle.result.events.slice(firstPositiveTime)
		const snapshot = battle.result.events[0]
		const playerWeapon = [...document.querySelectorAll<HTMLElement>('[data-battle-side="player"] [data-battle-weapon-source]')]
			.find((item) => item.dataset.battleWeaponSource?.startsWith('great-axe-'))
		expect(playerWeapon, 'the equipped great axe has a battle source marker').toBeTruthy()
		const playerWeaponUid = playerWeapon?.dataset.battleWeaponSource
		const arena = document.querySelector<HTMLElement>('[data-battle-arena]')
		const enemyAvatar = document.querySelector<HTMLElement>('[data-avatar-card="enemy"]')
		if (!arena || !enemyAvatar || !playerWeapon) throw new Error('battle visual elements not found')
		vi.spyOn(arena, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 200, 900, 400))
		vi.spyOn(playerWeapon, 'getBoundingClientRect').mockReturnValue(new DOMRect(120, 210, 60, 60))
		vi.spyOn(enemyAvatar, 'getBoundingClientRect').mockReturnValue(new DOMRect(850, 300, 170, 200))
		const crossedEvents = [
			{
				...snapshot,
				t: 0,
				kind: 'attack' as const,
				side: 'player' as const,
				text: 'Weapon −15',
				amount: 15,
				critical: true,
				icon: '⚔️',
				sourceUid: playerWeaponUid,
			},
			{
				...snapshot,
				t: 0,
				kind: 'heal' as const,
				side: 'player' as const,
				text: 'Restore +12',
				amount: 12,
				icon: '💚',
			},
			{
				...snapshot,
				t: 0,
				kind: 'attack' as const,
				side: 'enemy' as const,
				text: 'Claw −9',
				amount: 9,
				icon: '💥',
				sourceUid: 'skill',
			},
			{
				...snapshot,
				t: 0,
				kind: 'charged' as const,
				side: 'player' as const,
				text: 'Weapon −7',
				amount: 7,
				icon: '⚔️',
				sourceUid: 'jade-fury-1',
			},
			{
				...snapshot,
				t: 0,
				kind: 'attack' as const,
				side: 'enemy' as const,
				text: 'Claw −6',
				amount: 6,
				icon: '💥',
				sourceUid: 'skill',
			},
			{
				...snapshot,
				t: 0,
				kind: 'attack' as const,
				side: 'player' as const,
				text: 'Weapon −5',
				amount: 5,
				icon: '⚔️',
				sourceUid: 'wooden-blade-0',
			},
		]
		useGameStore.setState((state) => ({
			battle: state.battle
				? {
						...state.battle,
						result: {
							...state.battle.result,
							events: [...initialEvents, ...crossedEvents, ...laterEvents],
						},
					}
				: null,
		}))

		for (let step = 0; step < 3 && !document.querySelector('[data-combat-feedback]'); step++) {
			advance(60)
		}
		expect(document.querySelectorAll('[data-combat-comet]')).toHaveLength(5)
		expect(
			document.querySelector(
				`[data-combat-slash="attack"][data-combat-source="player"][data-combat-source-uid="${playerWeaponUid}"]`,
			),
		).toBeTruthy()
		expect(document.querySelector('[data-combat-slash="attack"][data-combat-source="enemy"]')).toBeTruthy()
		expect(
			document.querySelector('[data-combat-slash="attack"][data-combat-source="player"][data-combat-critical="true"]')
				?.getAttribute('class'),
		).toContain('text-red-500')
		expect(
			document.querySelector('[data-combat-slash="attack"][data-combat-source="enemy"]')?.getAttribute('class'),
		).toContain('text-white')
		expect(document.querySelector('[data-combat-slash="charged"]')?.getAttribute('class')).toContain('text-se')
		// A projectile flies in a **straight** line from the centre of the weapon to the target.
		const trajectory = document
			.querySelector<HTMLElement>('[data-combat-slash="attack"][data-combat-source="player"]')
			?.dataset.combatTrajectory
		expect(trajectory).toBe('M 50 40 L 835 200')
		// Every source here is melee (great axe, the Cutie's fist, a jade discharge, a wooden blade), so
		// all five fly as a **moon** — the straight blade is for weapons that actually shoot.
		expect(document.querySelectorAll('[data-combat-effect="moon-slash"]')).toHaveLength(5)
		// A melee swing has **no tail at all**: the moon is the whole projectile.
		expect(document.querySelectorAll('[data-combat-comet-tail]')).toHaveLength(0)
		expect(document.querySelectorAll('[data-combat-comet-head]')).toHaveLength(0)
		expect(document.querySelectorAll('[data-combat-moon-crescent]')).toHaveLength(5)
		// Speed is told by the blur it leaves, not by a streak and not by drawn air lines.
		expect(document.querySelectorAll('[data-combat-moon-blur]')).toHaveLength(10)
		expect(document.querySelector('[data-combat-moon-wind]')).toBeNull()
		// The moon is a closed band between two arcs that share their endpoints: sharp points, thick belly.
		const crescent = document.querySelector<SVGPathElement>('[data-combat-moon-crescent]')
		const shape = crescent?.getAttribute('d') ?? ''
		expect(shape.match(/ A /g)).toHaveLength(2)
		expect(shape).toMatch(/^M 0 -[\d.]+ A [\d.]+ [\d.]+ 0 0 1 0 [\d.]+ A [\d.]+ [\d.]+ 0 0 0 0 -[\d.]+ Z$/)
		// A broad half-moon, not a rim: the band is thick, with tapered ends.
		const height = Number(crescent?.getAttribute('data-moon-height'))
		const depth = Number(crescent?.getAttribute('data-moon-depth'))
		const band = depth - Number(shape.match(/A ([\d.]+) [\d.]+ 0 0 0/)?.[1])
		expect(band).toBeGreaterThan(20)
		expect(height / band).toBeGreaterThan(2)
		// It is tinted by the attack's tone, like the comet: `currentColor` along the body, white-hot at the
		// nose — so a crit slash comes out red.
		expect(crescent?.getAttribute('fill')).toMatch(/^url\(#moon-tone-\d+\)$/)
		expect(crescent?.getAttribute('stroke')).toBeNull()
		expect(document.querySelectorAll('[data-combat-moon-blur][fill="currentColor"]')).toHaveLength(10)
		// The tint itself is `currentColor`, which is what makes a crit slash red like the comet's.
		const toneId = crescent?.getAttribute('fill')?.match(/#([\w-]+)\)/)?.[1]
		const toneStops = document.querySelectorAll(`#${toneId} stop`)
		expect(toneStops.length).toBeGreaterThanOrEqual(3)
		expect(toneStops[0]?.getAttribute('stop-color')).toBe('currentColor')
		// The slash *is* the blur ghost's silhouette: same shape, stretched the same way, just crisp.
		const hitShape = document.querySelector('[data-combat-moon-hit]')
		expect(hitShape?.getAttribute('transform')).toMatch(/^scale\([\d.]+ [\d.]+\)$/)
		expect(crescent?.parentElement).toBe(hitShape)
		// The whole cut is pulled back so its **nose** lands on the target, not the tips of the crescent.
		const body = document.querySelector('[data-combat-moon-body]')
		expect(body?.getAttribute('transform')).toMatch(/^translate\(-\d+(\.\d+)? 0\)$/)
		expect(hitShape?.parentElement).toBe(body)
		expect(body?.parentElement?.hasAttribute('data-combat-moon-scale')).toBe(true)
		// It starts small and grows to full size as it reaches the target; the blur is inside that scale.
		expect(body?.querySelectorAll('[data-combat-moon-blur]')).toHaveLength(2)
		// Straight on the travel axis: the tips sit on it, so the moon is never offset from the flight.
		expect(shape).toMatch(/^M 0 -[\d.]+ A .* 0 -[\d.]+ Z$/)
		expect(document.querySelectorAll('[data-combat-comet] circle')).toHaveLength(0)
		// A flash on the weapon marks exactly where it left from.
		const muzzle = document.querySelector<SVGCircleElement>('[data-combat-muzzle]')
		expect(muzzle?.getAttribute('cx')).toBe('50')
		expect(muzzle?.getAttribute('cy')).toBe('40')
		const slash = document.querySelector<HTMLElement>('[data-combat-slash]')
		// It lands on the target near the end of the flight, and that is when the impact sound plays.
		expect(slash?.dataset.combatImpactAt).toBe('0.9')
		expect(document.querySelector('[data-avatar-card="player"] [data-combat-feedback="damage"]')).toBeTruthy()
		expect(document.querySelector('[data-avatar-card="player"] [data-combat-feedback="heal"]')).toBeTruthy()
		expect(document.querySelector('[data-avatar-card="enemy"] [data-combat-feedback="damage"]')).toBeTruthy()
		const projectileCount = crossedEvents.filter(
			(event) => ['attack', 'charged', 'counter'].includes(event.kind) && event.amount > 0,
		).length
		expect(playBattleSlashSound).toHaveBeenCalledTimes(projectileCount)
		expect(playBattleImpactSound).not.toHaveBeenCalled()
		advance(300)
		expect(playBattleImpactSound).toHaveBeenCalledTimes(projectileCount)
	})

	it('keeps the straight blade for a weapon that actually shoots', async () => {
		useGameStore.getState().newRun()
		useGameStore.setState((state) => ({
			run: {
				...state.run,
				gold: 80,
				shop: state.run.shop.map((offer, index) =>
					index === 0 ? { ...offer, templateId: 'frost-fan', star: 4, cost: 8, sold: false } : offer,
				),
			},
		}))
		useGameStore.getState().buyOffer(0)
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×1' }))

		// The fan is the only weapon, so the cutie's own swing is the only melee source in the arena.
		const shot = () =>
			[...document.querySelectorAll<HTMLElement>('[data-combat-slash][data-combat-effect="comet"]')].find(
				(node) => node.dataset.combatSourceUid?.startsWith('frost-fan-'),
			)
		for (let step = 0; step < 200 && !shot(); step += 1) advance(60)

		const projectile = shot()
		expect(projectile, 'the fan fired').toBeTruthy()
		const tail = projectile?.querySelector<SVGPathElement>('[data-combat-comet-tail]')
		expect(tail?.getAttribute('fill')).toMatch(/^url\(#comet-\d+\)$/)
		// A blade, not a lozenge: the nose sits on the origin, the tail reaches back along −X.
		expect(tail?.getAttribute('d')).toMatch(/^M 0 0 C /)
		expect(tail?.getAttribute('data-combat-tail-length')).toBe('260')
		// A ranged weapon never draws the moon — that is the melee head.
		expect(projectile?.querySelector('[data-combat-moon-crescent]')).toBeNull()
		expect(projectile?.querySelector('[data-combat-moon-glow]')).toBeNull()
		expect(projectile?.querySelector('[data-combat-moon-halo]')).toBeNull()
		expect(projectile?.querySelector('[data-combat-moon-wind]')).toBeNull()
		expect(projectile?.querySelector('[data-combat-moon-blur]')).toBeNull()
	})

	it('gives every hit its own number and shows a burst in the order the hits happened', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×1' }))

		const battle = useGameStore.getState().battle
		if (!battle) throw new Error('battle did not start')
		const snapshot = battle.result.events[0]
		// Two weapons hit the enemy 100 ms apart, a third one 600 ms later: the replay clock moves
		// 60 ms per tick, so the first two are crossed in the very same tick.
		const hit = (t: number, amount: number, kind: 'attack' | 'charged') => ({
			...snapshot,
			t,
			kind,
			side: 'player' as const,
			text: `Weapon −${amount}`,
			amount,
		})
		useGameStore.setState((state) => ({
			battle: state.battle
				? {
						...state.battle,
						result: {
							...state.battle.result,
							events: [
								snapshot,
								hit(60, 30, 'attack'),
								hit(160, 12, 'charged'),
								hit(760, 40, 'attack'),
								{ ...snapshot, t: 6000, kind: 'end', text: 'End' },
							],
						},
					}
				: null,
		}))

		const numbers = () =>
			[...document.querySelectorAll<HTMLElement>('[data-avatar-card="enemy"] [data-combat-feedback="damage"]')].map(
				(node) => node.textContent,
			)
		advance(180)
		// Three hits, three numbers — nothing is added up or dropped.
		expect(numbers()).toEqual(['−30', '−12'])
		expect(numbers()).toHaveLength(2)
		expect(document.querySelector('[data-combat-feedback-key="1"]')).toBeTruthy()
		expect(document.querySelector('[data-combat-feedback-key="2"]')).toBeTruthy()
		// ⚠️ Both start on **this** frame: the bar, the numbers and the read-outs are one moment.
		for (const node of document.querySelectorAll<HTMLElement>('[data-avatar-card="enemy"] [data-combat-feedback]')) {
			const floater = node.querySelector<HTMLElement>('span')
			expect(floater?.style.getPropertyValue('--floater-delay')).toBe('0s')
		}
		advance(600)
		expect(numbers()).toContain('−40')
	})

	it('gives each of two identical weapons its own number, even when they fire together', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×1' }))

		const battle = useGameStore.getState().battle
		if (!battle) throw new Error('battle did not start')
		const snapshot = battle.result.events[0]
		// Two copies of one weapon share a cadence, so both blades land on the same simulated ms.
		// ❌ They must NOT be added into one number: each weapon shows its own hit.
		const hit = (t: number, amount: number, uid: string) => ({
			...snapshot,
			t,
			kind: 'attack' as const,
			side: 'player' as const,
			text: `Weapon −${amount}`,
			amount,
			sourceUid: uid,
		})
		useGameStore.setState((state) => ({
			battle: state.battle
				? {
						...state.battle,
						result: {
							...state.battle.result,
							events: [
								snapshot,
								hit(60, 44, 'wooden-blade-0'),
								hit(60, 44, 'wooden-blade-3'),
								{ ...snapshot, t: 6000, kind: 'end', text: 'End' },
							],
						},
					}
				: null,
		}))

		const numbers = () =>
			[...document.querySelectorAll<HTMLElement>('[data-avatar-card="enemy"] [data-combat-feedback="damage"]')].map(
				(node) => node.textContent,
			)
		advance(180)
		expect(numbers(), 'two weapons, two numbers').toEqual(['−44', '−44'])
		// …and they fly out on two different paths, so they do not sit on top of each other.
		const paths = [
			...document.querySelectorAll<HTMLElement>('[data-avatar-card="enemy"] [data-combat-feedback="damage"]'),
		].map((node) => {
			const inner = node.firstElementChild as HTMLElement | null
			return `${inner?.style.getPropertyValue('--floater-dx')},${inner?.style.getPropertyValue('--floater-dy')}`
		})
		expect(new Set(paths).size).toBe(2)
	})

	it('keeps a number on screen for a readable moment at ×2', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		expect(useBattleSettingsStore.getState().speed).toBe(2)

		const battle = useGameStore.getState().battle
		if (!battle) throw new Error('battle did not start')
		const snapshot = battle.result.events[0]
		useGameStore.setState((state) => ({
			battle: state.battle
				? {
						...state.battle,
						result: {
							...state.battle.result,
							events: [
								snapshot,
								{ ...snapshot, t: 60, kind: 'attack', side: 'player', text: 'Weapon −30', amount: 30 },
								{ ...snapshot, t: 6000, kind: 'end', text: 'End' },
							],
						},
					}
				: null,
		}))

		advance(120)
		expect(document.querySelector('[data-combat-feedback-key="1"]')).toBeTruthy()
		// `FEEDBACK_MIN_LIFE_MS` (380 ms) is the floor however fast the replay runs — a number must stay
		// long enough to read, even at ×2 (the CSS shrink → vanish takes the same span).
		advance(120)
		expect(document.querySelector('[data-combat-feedback-key="1"]'), 'still visible at 240 ms').toBeTruthy()
		advance(400)
		expect(document.querySelector('[data-combat-feedback-key="1"]'), 'gone within a second').toBeNull()
	})

	it('keeps two empty skill slots on each battle avatar and no skill icons in the top bar', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()

		for (const side of ['player', 'enemy'] as const) {
			const slots = document.querySelectorAll<HTMLElement>(
				`[data-avatar-card="${side}"] [data-skill-slot]`,
			)
			expect(slots, `${side} keeps ${CUTIE_SKILL_SLOTS} reserved slots`).toHaveLength(CUTIE_SKILL_SLOTS)
			for (const slot of slots) {
				// Empty means empty: no icon, no label, and the "empty" skin rather than an active one.
				expect(slot.textContent).toBe('')
				expect(slot.querySelector('img')).toBeNull()
				expect(slot.className).toContain('battle-cutie-seal-empty')
			}
		}
		// Skills are paused: no skill icon or charge chip is drawn beside the health bars.
		expect(document.querySelector('[data-skill-slots]')?.closest('[data-avatar-card]')).toBeTruthy()
		expect([...document.querySelectorAll<HTMLElement>('[title]')].some((el) => el.title.includes('Hỏa Khuyển Trảo'))).toBe(false)
	})

	it('starts a fresh battle from the outcome footer without leaving the arena', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByText(/Bỏ qua/))

		fireEvent.click(screen.getByRole('button', { name: /Chiến thắng!|Thất bại|Hoà/ }))
		expect(useGameStore.getState().phase).toBe('result')
		const finished = useGameStore.getState().battle
		expect(finished?.committed).toBe(true)
		const seedBefore = useGameStore.getState().run.seed

		fireEvent.click(screen.getByRole('button', { name: /Đánh lại|Đánh màn tiếp/ }))
		const restarted = useGameStore.getState().battle
		// A **new** simulation (a fresh seed, nothing committed yet) that plays from the first frame.
		expect(useGameStore.getState().phase).toBe('battle')
		expect(restarted?.committed).toBe(false)
		expect(restarted?.mode).toBe(finished?.mode)
		expect(useGameStore.getState().run.seed).not.toBe(seedBefore)
		expect(restarted?.result.events.length).toBeGreaterThan(0)
		expect(document.querySelector('[data-battle-arena]')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /Rời trận/ })).toBeNull()
		expect(document.body.textContent).toContain('0.0s')
	})

	it('keeps the battle active after dismissing the outcome and exits only on request', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByText(/Bỏ qua/))

		fireEvent.click(screen.getByRole('button', { name: /Chiến thắng!|Thất bại|Hoà/ }))
		expect(useGameStore.getState().phase).toBe('result')
		expect(useGameStore.getState().battle).not.toBeNull()
		expect(document.querySelector('[data-battle-arena]')).toBeTruthy()

		fireEvent.click(screen.getByRole('button', { name: 'Rời trận' }))
		const state = useGameStore.getState()
		expect(state.phase).toBe('prep')
		expect(state.battle).toBeNull()
		expect(window.location.pathname).toBe('/')
		expect(screen.getByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(screen.getByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
	})

	it('holds the charge of a frozen weapon still and frosts its tile', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×1' }))

		const battle = useGameStore.getState().battle
		if (!battle) throw new Error('battle did not start')
		const snapshot = battle.result.events[0]
		// `skill*` rows are the cutie's own swings, which have no tile in the loadout grid.
		const weaponUid = snapshot.player.cooldowns.find((entry) => !entry.uid.startsWith('skill'))?.uid
		if (!weaponUid) throw new Error('no equipped weapon to freeze')
		// One freeze at 120 ms lasting five seconds, and nothing else: the log is only about the ice.
		const freeze = {
			...snapshot,
			t: 120,
			kind: 'status' as const,
			side: 'player' as const,
			text: 'Đóng băng',
			amount: 5000,
			icon: '🧊',
			sourceUid: weaponUid,
			player: {
				...snapshot.player,
				cooldowns: snapshot.player.cooldowns.map((entry) =>
					entry.uid === weaponUid ? { ...entry, frozen: 5000 } : entry,
				),
			},
		}
		// Inside `act`: the replay interval must pick up this log **before** the clock is advanced.
		act(() => {
			useGameStore.setState((state) => ({
				battle: state.battle
					? {
							...state.battle,
							result: {
								...state.battle.result,
								events: [snapshot, freeze, { ...snapshot, t: 20_000, kind: 'end' as const, text: 'End' }],
							},
						}
					: null,
			}))
		})

		const charge = () =>
			document
				.querySelector<HTMLElement>(`[data-battle-weapon-source="${weaponUid}"]`)
				?.getAttribute('data-battle-weapon-charge')
		advance(240)
		expect(document.querySelector(`[data-weapon-freeze-overlay="${weaponUid}"]`), 'frosted').toBeTruthy()
		expect(document.querySelector(`[data-battle-weapon-frozen="${weaponUid}"]`), 'badge').toBeTruthy()
		const held = charge()
		// Half a second of playback later the bar has **not** moved: the frozen clock stands still.
		advance(500)
		expect(charge()).toBe(held)

		// Past the thaw the frost must disappear **with** the pause: the weapon is frozen for 5 s, and
		// nothing refreshed the snapshot in between (a frozen weapon never swings).
		advance(5000)
		expect(document.querySelector(`[data-weapon-freeze-overlay="${weaponUid}"]`), 'thawed').toBeNull()
		expect(Number(charge())).toBeGreaterThan(Number(held))
	})

	it('marks a critical hit in the replay with the CRITICAL popup', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×1' }))

		const battle = useGameStore.getState().battle
		if (!battle) throw new Error('battle did not start')
		const snapshot = battle.result.events[0]
		act(() => {
			useGameStore.setState((state) => ({
				battle: state.battle
					? {
							...state.battle,
							result: {
								...state.battle.result,
								events: [
									snapshot,
									{
										...snapshot,
										t: 60,
										kind: 'attack' as const,
										side: 'player' as const,
										text: 'Chí mạng −120',
										amount: 120,
										critical: true,
									},
									{ ...snapshot, t: 60_000, kind: 'end' as const, text: 'End' },
								],
							},
						}
					: null,
			}))
		})

		advance(60)
		const critical = document.querySelector('[data-combat-critical-hit]')
		expect(critical, 'the arena shows the critical popup').toBeTruthy()
		expect(critical?.textContent).toBe('−120')
		expect(critical?.querySelector('[data-combat-critical-label]'), 'no extra word').toBeNull()
	})

	it('runs the clock on playback time instead of jumping with the events', async () => {
		gearUp()
		await renderApp()
		fightCurrentStage()
		fireEvent.click(screen.getByRole('button', { name: '×1' }))

		const battle = useGameStore.getState().battle
		if (!battle) throw new Error('battle did not start')
		const snapshot = battle.result.events[0]
		// Nothing happens until 5 s: an event-driven timer would sit at `0.0s` the whole time.
		act(() => {
			useGameStore.setState((state) => ({
				battle: state.battle
					? {
							...state.battle,
							result: {
								...state.battle.result,
								events: [
									snapshot,
									{ ...snapshot, t: 3000, kind: 'attack' as const, side: 'player' as const, text: 'Hit', amount: 5 },
									{ ...snapshot, t: 5000, kind: 'end' as const, text: 'End' },
								],
							},
						}
					: null,
			}))
		})

		const clock = () => document.querySelector('[data-battle-clock]')?.textContent ?? ''
		advance(240)
		expect(clock()).toBe('0.2s')
		advance(240)
		expect(clock()).toBe('0.5s')
	})

	it('keeps practice running with no clock limit and quits from the bottom', async () => {
		gearUp()
		await renderApp()
		fireEvent.click(document.querySelector('[data-training-start]')!)
		expect(useGameStore.getState().battle?.mode).toBe('training')

		// Its own way out, always on screen…
		expect(document.querySelector('[data-battle-training-bar]')).toBeTruthy()
		expect(document.querySelector('[data-battle-quit-training]')?.textContent).toContain('Rời phòng tập')
		// …and no pause / skip: there is no end to skip to, and nothing to hold.
		expect(screen.queryByText(/Tạm dừng/)).toBeNull()
		expect(screen.queryByText(/Bỏ qua/)).toBeNull()

		// Past the old 60 s session cap: the log keeps playing, nobody wins, nothing commits.
		fireEvent.click(screen.getByRole('button', { name: '×3' }))
		advance(22_000)
		expect(document.querySelector('[data-battle-outcome]')).toBeNull()
		expect(useGameStore.getState().phase).toBe('battle')
		expect(useGameStore.getState().battle?.committed).toBe(false)

		fireEvent.click(document.querySelector('[data-battle-quit-training]')!)
		expect(useGameStore.getState().phase).toBe('prep')
		expect(useGameStore.getState().battle).toBeNull()
		expect(window.location.pathname).toBe('/')
	})

	it('turns the dummy’s swings on and off from inside the practice fight', async () => {
		useBattleSettingsStore.setState({ trainingAttacks: false })
		gearUp()
		await renderApp()
		fireEvent.click(document.querySelector('[data-training-start]')!)
		expect(useGameStore.getState().battle?.trainingAttacks).toBe(false)

		// The switch sits in the practice bar, so it is reachable while the fight runs.
		const toggle = document.querySelector<HTMLInputElement>('[data-battle-training-attacks] input')!
		expect(toggle.checked).toBe(false)
		fireEvent.click(toggle)

		// A practice session is simulated up front, so the flip **starts a fresh one** with the new flag
		// (the same thing "Tập lại" does) instead of patching the running log.
		const battle = useGameStore.getState().battle
		expect(battle?.mode).toBe('training')
		expect(battle?.trainingAttacks).toBe(true)
		expect(document.querySelector<HTMLInputElement>('[data-battle-training-attacks] input')?.checked).toBe(true)
		// The choice is remembered for the next session (the footer chip reads the same store).
		expect(useBattleSettingsStore.getState().trainingAttacks).toBe(true)

		fireEvent.click(document.querySelector('[data-battle-training-attacks] input')!)
		expect(useGameStore.getState().battle?.trainingAttacks).toBe(false)
		useBattleSettingsStore.setState({ trainingAttacks: true })
	})
})
