// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLanguageStore } from '../../i18n'
import { useGameStore } from '../../store/gameStore'
import { createItemInstance } from '../../game/bag'
import { applyContentOverrides } from '../../game/content'
import { MAX_CUTIE_LEVEL } from '../../game/cuties'
import { installRetiredItems } from '../../test/retiredItems'
import { CutiePanel } from '../CutiePanel'

beforeEach(() => {
	useLanguageStore.setState({ language: 'en' })
	useGameStore.getState().newRun()
	useGameStore.setState((state) => ({
		run: { ...state.run, unlockedCuties: ['fire-pup', 'white-rabbit'] },
	}))
})

afterEach(() => {
	cleanup()
	applyContentOverrides(null)
	useGameStore.getState().newRun()
	useLanguageStore.setState({ language: 'en' })
})

describe('combined cutie profile', () => {
	it('shows the cutie basic attack and combat stats in one panel', () => {
		render(<CutiePanel />)

		const profile = screen.getByRole('heading', { name: 'Cuties' }).closest('section')!
		expect(within(profile).getByText('Basic attack')).toBeTruthy()
		expect(within(profile).getByText('Damage 14 · every 1.6s')).toBeTruthy()
		expect(within(profile).getByText('Power')).toBeTruthy()
		expect(within(profile).queryByText('Battle Record')).toBeNull()
		expect(within(profile).queryByText('Progress')).toBeNull()
		// The level sits on its own centred row, right above Power.
		expect(within(profile).getByText('Level 1/10')).toBeTruthy()
		expect(within(profile).getByText('Health')).toBeTruthy()
		expect(within(profile).getByText('Attack')).toBeTruthy()
		expect(within(profile).getByText('14')).toBeTruthy()
		// ❌ No "Speed" row: the cutie has no attack rate any more. Its cadence is the Cooldown Time of
		// the basic attack above, printed as "every 1.6s".
		expect(within(profile).queryByText('Speed')).toBeNull()
		expect(within(profile).getByText('Crit')).toBeTruthy()
		expect(within(profile).getByText('Critical damage')).toBeTruthy()
		// No leading  any more: the panel reads out what the Cutie has.
		expect(within(profile).getByText('5%')).toBeTruthy()
		expect(within(profile).getByText('80%')).toBeTruthy()
		// Sword Energy stays, bag slots do not, and a flat stat still prints its 0.
		expect(within(profile).getByText('Sword Energy')).toBeTruthy()
		expect(within(profile).queryByText('Bag slots')).toBeNull()
		expect(within(profile).getAllByText('0%').length).toBeGreaterThan(0)
		// Only the item stats that actually exist are listed: the unused bonus rows are gone.
		expect(within(profile).getByText('Lifesteal')).toBeTruthy()
		expect(within(profile).getByText('Damage reduction')).toBeTruthy()
		expect(within(profile).queryByText('Bonus damage')).toBeNull()
		expect(within(profile).queryByText('Damage')).toBeNull()
		expect(within(profile).queryByText('Attack speed')).toBeNull()
	})

	it('prints every stat as one full-width row holding the cutie + Trang bị total', () => {
		// `chain-mail` is an armour fixture whose `stats` kit grants armour + damage reduction.
		installRetiredItems()
		useGameStore.setState((state) => ({
			run: { ...state.run, equipped: [createItemInstance('chain-mail', 1, 'chain-mail-1', 0)] },
		}))
		render(<CutiePanel />)

		// The row reads `total (cutie + gear)`, so the breakdown sits in brackets behind the number.
		const armour = screen.getByText('Armor').closest('div')!
		// The total and the gear part both read `240` — one is gold, the other jade.
		expect(within(armour).getAllByText('240')).toHaveLength(2)
		const armourDetail = armour.querySelector('[data-stat-detail]')!
		expect(armourDetail.textContent).toBe('(0 + 240)')
		expect(armourDetail.querySelector('.text-jade')?.textContent).toBe('240')

		const reduction = screen.getByText('Damage reduction').closest('div')!
		const reductionDetail = reduction.querySelector('[data-stat-detail]')!
		// The two sources keep two colours: the Cutie's number white, the gear part jade.
		expect(reductionDetail.textContent).toBe('(0% + 3%)')
		expect(reductionDetail.className).toContain('text-white')
		expect(reductionDetail.querySelector('.text-jade')?.textContent).toBe('3%')

		// A stat the gear does not touch is one clean number — no `(20 + 0)` noise.
		const attack = screen.getByText('Attack').closest('div')!
		expect(within(attack).getByText('14')).toBeTruthy()
		expect(within(attack).queryByText(/\+/)).toBeNull()
	})

	it('shows a small gear bonus instead of swallowing it as 0', () => {
		// The reported bug: `0.2` % damage reduction on the jade read as `0%` everywhere.
		installRetiredItems({
			items: {
				'chain-mail': {
					name: 'Giáp Xích',
					cls: 'armor',
					tier: 2,
					quality: 3,
					cost: 5,
					space: { w: 2, h: 2 },
					kits: [
						{
							id: 'stats',
							params: {},
							stats: [1, 2, 3, 4, 5].map(() => ({ dr: 0.2 })),
						},
					],
				},
			},
		})
		useGameStore.setState((state) => ({
			run: { ...state.run, equipped: [createItemInstance('chain-mail', 1, 'chain-mail-1', 0)] },
		}))
		render(<CutiePanel />)

		// The row itself must read `0.2%`, not the `0%` that rounding produced — total **and** gear part.
		const row = screen.getByText('Damage reduction').closest('div')!
		expect(within(row).getAllByText('0.2%')).toHaveLength(2)
		const detail = row.querySelector('[data-stat-detail]')!
		expect(detail.textContent).toBe('(0% + 0.2%)')
		expect(detail.querySelector('.text-jade')?.textContent).toBe('0.2%')
	})

	it('hides the upgrade button once the cutie is at max level', () => {
		useGameStore.setState((state) => ({
			run: { ...state.run, cuties: { ...state.run.cuties, 'fire-pup': MAX_CUTIE_LEVEL } },
		}))
		render(<CutiePanel />)

		// The level pill already says 10/10; a permanently dimmed "Maximum level reached" bar is noise.
		expect(screen.getByText('Level 10/10')).toBeTruthy()
		expect(screen.queryByRole('button', { name: /Upgrade|Nâng cấp/ })).toBeNull()
		expect(screen.queryByText('Maximum level reached')).toBeNull()
	})

	it('opens the cutie picker from the current avatar and switches to an unlocked cutie', () => {
		render(<CutiePanel />)

		fireEvent.pointerDown(screen.getByRole('button', { name: 'Change Cutie: Cẩu Hỏa Sài' }), {
			button: 0,
			ctrlKey: false,
		})
		fireEvent.click(screen.getByRole('menuitem', { name: 'Bạch Thố' }))

		expect(useGameStore.getState().run.cutieId).toBe('white-rabbit')
		expect(screen.getByRole('button', { name: 'Change Cutie: Bạch Thố' })).toBeTruthy()
		expect(screen.getByText('Damage 10 · every 1.1s')).toBeTruthy()
	})

	it('keeps locked cuties disabled in the avatar picker', () => {
		render(<CutiePanel />)

		fireEvent.pointerDown(screen.getByRole('button', { name: 'Change Cutie: Cẩu Hỏa Sài' }), {
			button: 0,
			ctrlKey: false,
		})
		const lockedPet = screen.getByRole('menuitem', { name: /Linh Miêu/ })

		expect(lockedPet.getAttribute('aria-disabled')).toBe('true')
		fireEvent.click(lockedPet)
		expect(useGameStore.getState().run.cutieId).toBe('fire-pup')
	})

	it('lists the names the admin page saved, not the ones in code', () => {
		// 🔴 This is the bug that made the overlay look fake: the panel header read `getCutie()` (merged)
		// while the picker iterated the raw `CUTIES` array, so a renamed Cutie showed **both** names at
		// once — the new one under the portrait and the code default further down the same menu.
		applyContentOverrides({
			cuties: {
				'fire-pup': { name: 'Carlotta', blurb: 'Balance with everything' },
				'white-rabbit': { name: 'Aemeath', unlockStage: 0 },
				'thistle-cat': { name: 'Ignored — no such cutie' },
			},
		})
		useGameStore.setState((state) => ({
			run: { ...state.run, unlockedCuties: ['fire-pup', 'white-rabbit'] },
		}))
		render(<CutiePanel />)

		expect(screen.getByRole('button', { name: 'Change Cutie: Carlotta' })).toBeTruthy()
		expect(screen.getByText('Balance with everything')).toBeTruthy()
		fireEvent.pointerDown(screen.getByRole('button', { name: 'Change Cutie: Carlotta' }), {
			button: 0,
			ctrlKey: false,
		})
		expect(screen.getByRole('menuitem', { name: 'Carlotta' })).toBeTruthy()
		expect(screen.getByRole('menuitem', { name: 'Aemeath' })).toBeTruthy()
		// The code defaults are gone from the list, not duplicated next to the saved names.
		expect(screen.queryByRole('menuitem', { name: 'Cẩu Hỏa Sài' })).toBeNull()
		expect(screen.queryByRole('menuitem', { name: 'Bạch Thố' })).toBeNull()
	})
})
