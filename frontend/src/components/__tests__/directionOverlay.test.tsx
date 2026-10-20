// @vitest-environment jsdom
/**
 * The **direction overlay** on a support gem and the **haste arrows** on a buffed weapon.
 *
 * Both are presentation only, but they carry information the player cannot get anywhere else: which
 * sides a gem's buff covers, whether a weapon already sits on one of them, and whether a weapon is
 * currently sped up.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoadoutGrid } from '../LoadoutGrid'
import { applyContentOverrides } from '../../game/content'
import { installRetiredItems } from '../../test/retiredItems'
import { createItemInstance } from '../../game/bag'
import { combatItemUid } from '../../game/build'
import { useLanguageStore } from '../../i18n'
import type { ItemInstance } from '../../game/types'

function item(templateId: string, slot: number, star: ItemInstance['star'] = 1): ItemInstance {
	return createItemInstance(templateId, star, `${templateId}-${slot}`, slot)
}

/** A 1×1 gem carrying the freeze-haste kit, all four sides selected. */
const HASTE_GEM = {
	kits: [
		{
			id: 'freeze-haste',
			params: {
				target: [0, 0, 0, 0, 0],
				directions: [15, 15, 15, 15, 15],
				boost: [50, 50, 50, 50, 50],
				duration: [4000, 4000, 4000, 4000, 4000],
			},
		},
	],
}

beforeEach(() => {
	useLanguageStore.setState({ language: 'vi' })
	// ⚠️ `installRetiredItems`, not `applyContentOverrides`: the overlay **replaces** the catalogue, so a
	// plain call would blank every fixture item (they are not in this test's payload) and no neighbour
	// would be a weapon any more.
	installRetiredItems({ items: { 'jade-fury': HASTE_GEM } })
})

afterEach(() => {
	cleanup()
	applyContentOverrides(null)
})

describe('direction overlay', () => {
	it('draws one arrow per selected side and turns gold only where a weapon sits', () => {
		// Gem at cell 1, a 1×1 weapon on its right (cell 2); nothing above, below or to the left.
		const { container } = render(
			<LoadoutGrid width={4} rows={3} items={[item('jade-fury', 1), item('poison-dagger', 2)]} />,
		)

		const overlay = container.querySelector('[data-direction-overlay]')
		expect(overlay).toBeTruthy()
		expect(overlay!.querySelectorAll('[data-direction]')).toHaveLength(4)
		expect(overlay!.querySelector('[data-direction="right"]')?.getAttribute('data-direction-live')).toBe('weapon')
		for (const side of ['up', 'down', 'left']) {
			expect(overlay!.querySelector(`[data-direction="${side}"]`)?.getAttribute('data-direction-live'), side).toBe(
				'empty',
			)
		}
	})

	it('pushes every arrow outside the tile, so its base sits on the border and no star is covered', () => {
		const { container } = render(<LoadoutGrid width={4} rows={3} items={[item('jade-fury', 1)]} />)
		const overlay = container.querySelector('[data-direction-overlay]')!

		const classes = (side: string) =>
			overlay.querySelector(`[data-direction="${side}"]`)!.className.split(/\s+/)
		// A full translate: the glyph starts exactly at the edge, never inside the artwork.
		expect(classes('up')).toContain('-translate-y-full')
		expect(classes('down')).toContain('translate-y-full')
		expect(classes('left')).toContain('-translate-x-full')
		expect(classes('right')).toContain('translate-x-full')
		// ❌ The old 1/3 offset put the arrow inside the tile, over the star rank at the bottom edge.
		for (const side of ['up', 'down', 'left', 'right']) {
			expect(classes(side).some((name) => name.endsWith('-translate-1/3')), side).toBe(false)
		}
	})

	it('keeps a side silver when the neighbour never swings (artifact without an attack kit)', () => {
		// The exact shape reported from play: `the-icy-vow` is an `artifact` that only reflects freeze —
		// it has no attack kit, so the engine never hands it a charge buff and the arrow must stay silver.
		installRetiredItems({
			items: {
				'jade-fury': HASTE_GEM,
				'test-trinket': {
					name: 'Bùa Thử',
					cls: 'artifact',
					tier: 1,
					quality: 1,
					cost: 1,
					space: { w: 1, h: 1 },
					kits: [
						{
							id: 'freeze-reflect',
							params: { chance: [50, 50, 50, 50, 50], duration: [1000, 1000, 1000, 1000, 1000] },
						},
					],
				},
			},
		})
		const gem = item('jade-fury', 1)
		const { container } = render(
			<LoadoutGrid width={4} rows={3} items={[gem, item('test-trinket', 2)]} />,
		)

		const overlay = container.querySelector('[data-direction-overlay]')
		expect(overlay).toBeTruthy()
		for (const side of ['up', 'down', 'left', 'right']) {
			expect(
				overlay!.querySelector(`[data-direction="${side}"]`)?.getAttribute('data-direction-live'),
				side,
			).toBe('empty')
		}
	})

	it('only draws the sides the kit selects', () => {
		applyContentOverrides({
			items: {
				'jade-fury': {
					kits: [
						{
							id: 'freeze-haste',
							params: {
								target: [0, 0, 0, 0, 0],
								// up (1) + right (8)
								directions: [9, 9, 9, 9, 9],
								boost: [50, 50, 50, 50, 50],
								duration: [4000, 4000, 4000, 4000, 4000],
							},
						},
					],
				},
			},
		})
		const { container } = render(<LoadoutGrid width={4} rows={3} items={[item('jade-fury', 1)]} />)
		const sides = [...container.querySelectorAll('[data-direction]')].map((node) =>
			node.getAttribute('data-direction'),
		)
		expect(sides).toEqual(['up', 'right'])
	})

	it('draws nothing when the gem buffs a random weapon, not the sides', () => {
		applyContentOverrides({
			items: {
				'jade-fury': {
					kits: [
						{
							id: 'freeze-haste',
							params: {
								target: [1, 1, 1, 1, 1],
								directions: [15, 15, 15, 15, 15],
								boost: [50, 50, 50, 50, 50],
								duration: [4000, 4000, 4000, 4000, 4000],
							},
						},
					],
				},
			},
		})
		const { container } = render(<LoadoutGrid width={4} rows={3} items={[item('jade-fury', 1)]} />)
		expect(container.querySelector('[data-direction-overlay]')).toBeNull()
	})
})

describe('haste effect', () => {
	it('sends meteor streaks up a weapon only while its boost is active', () => {
		const blade = item('wooden-blade', 0)
		const uid = combatItemUid(blade.templateId, blade.slot)

		const idle = render(<LoadoutGrid width={4} rows={3} items={[blade]} />)
		expect(idle.container.querySelector('[data-weapon-boost-fx]')).toBeNull()
		idle.unmount()

		const boosted = render(
			<LoadoutGrid width={4} rows={3} items={[blade]} weaponStatuses={{ [uid]: { boost: 80 } }} />,
		)
		const fx = boosted.container.querySelector(`[data-weapon-boost-fx="${uid}"]`)
		expect(fx).toBeTruthy()
		// A bundle of thin light streaks, each mounted already mid-flight (negative delays) and
		// deliberately un-even: even lengths and even timing read as a comb, not as light.
		const streaks = [...fx!.children] as HTMLElement[]
		expect(streaks.length).toBeGreaterThanOrEqual(8)
		const styles = streaks.map((streak) => streak.style)
		expect(styles.every((style) => Number.parseFloat(style.animationDelay) < 0)).toBe(true)
		expect(new Set(styles.map((style) => style.animationDelay)).size, 'delays differ').toBe(streaks.length)
		expect(new Set(styles.map((style) => style.animationDuration)).size, 'speeds differ').toBeGreaterThan(4)
		expect(new Set(styles.map((style) => style.height)).size, 'lengths differ').toBeGreaterThan(4)
		expect(new Set(styles.map((style) => style.marginLeft)).size, 'x offsets differ').toBe(streaks.length)
		// 30 % wider than the first pass and quick enough to read as speed, not as drifting.
		const widths = styles.map((style) => Number.parseFloat(style.width))
		expect(Math.max(...widths), 'widest trail').toBeGreaterThan(3)
		expect(Math.min(...widths)).toBeGreaterThanOrEqual(1)
		expect(
			styles.every((style) => Number.parseFloat(style.animationDuration) < 0.9),
			'every streak climbs in under 0.9 s',
		).toBe(true)
		// The boosted tile also wears a green rim, so the buff is visible even between streaks.
		const rim = boosted.container.querySelector<HTMLElement>(`[data-weapon-boost-border="${uid}"]`)
		expect(rim, 'green border effect').toBeTruthy()
		expect(rim?.style.border).toContain('solid')
		expect(rim?.style.boxShadow).toContain('inset')
		// Each streak starts **below** the tile and climbs past its top, so the loop restart is off-screen:
		// that is what stops the effect from stuttering at the edges.
		expect(styles.every((style) => style.bottom.startsWith('-'))).toBe(true)
		const heights = styles.map((style) => Number.parseFloat(style.height))
		const rises = styles.map((style) => Number.parseFloat(style.getPropertyValue('--streak-rise')))
		// Every streak starts below the tile and climbs by `tile height + its own length`, so it leaves
		// the tile completely: the loop restart always happens off-screen.
		const tileHeights = rises.map((rise, index) => rise - heights[index]!)
		expect(new Set(tileHeights).size, 'one tile height for every streak').toBe(1)
		expect(tileHeights[0], 'a real tile is taller than nothing').toBeGreaterThan(0)
		// No `⚡ +N%` badge: the streaks carry the whole effect (it read as clutter over the art).
		expect(boosted.container.querySelector('[data-battle-weapon-boost]')).toBeNull()
	})
})

describe('freeze effect', () => {
	it('covers a frozen weapon with frost and removes it once the ice melts', () => {
		const blade = item('wooden-blade', 0)
		const uid = combatItemUid(blade.templateId, blade.slot)

		const thawed = render(<LoadoutGrid width={4} rows={3} items={[blade]} />)
		expect(thawed.container.querySelector('[data-weapon-freeze-overlay]')).toBeNull()
		thawed.unmount()

		const frozen = render(
			<LoadoutGrid width={4} rows={3} items={[blade]} weaponStatuses={{ [uid]: { frozen: 2400 } }} />,
		)
		const sheet = frozen.container.querySelector(`[data-weapon-freeze-overlay="${uid}"]`)
		expect(sheet, 'the frost sheet sits over the tile').toBeTruthy()
		// It never eats the click: the tile below is still what the player interacts with.
		expect(sheet!.className).toContain('pointer-events-none')
		// The badge states how long is left.
		expect(frozen.container.querySelector(`[data-battle-weapon-frozen="${uid}"]`)?.textContent).toContain('3s')
	})
})
