// @vitest-environment jsdom
/**
 * The arena's **avatar** frame — where avatar art will go later.
 *
 * Locks down the priority order of the image sources, because that is the contract that lets art
 * be added later **without touching the component**: dedicated avatar (`avatar: true`) → cutie art
 * → emoji.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AvatarCard } from '../AvatarCard'
import { CUTIE_SKILL_SLOTS } from '../../game/cuties'

afterEach(cleanup)

function holder(): HTMLElement {
	const found = document.querySelector<HTMLElement>('[data-avatar-holder]')
	if (!found) throw new Error('avatar holder not found')
	return found
}

/**
 * The floating numbers live in their own layer over the **card** (not inside the portrait, whose
 * `overflow-hidden` cut them off), so the queries below start at the card.
 */
function card(side: 'player' | 'enemy' = 'player'): HTMLElement {
	const found = document.querySelector<HTMLElement>(`[data-avatar-card="${side}"]`)
	if (!found) throw new Error('avatar card not found')
	return found
}

describe('the avatar frame', () => {
	it('uses the cutie art when the cutie has no dedicated avatar yet', () => {
		render(<AvatarCard side="player" name="Cẩu Hỏa Sài" cutieId="fire-pup" />)

		const img = holder().querySelector('img')
		expect(img?.getAttribute('src'), 'falls back to the cutie art').toBe('/icons/cuties/fire-pup.png')
	})

	it('uses an emoji when there is no cutie (stage opponent)', () => {
		render(<AvatarCard side="enemy" name="Yêu Thú" emoji="👹" />)

		expect(holder().querySelector('img'), 'no image means no img element').toBeNull()
		expect(holder().textContent).toContain('👹')
	})

	it('uses 150% dimensions in the battle layout', () => {
		render(<AvatarCard side="player" name="Cẩu Hỏa Sài" cutieId="fire-pup" size="battle" />)

		expect(document.querySelector('[data-avatar-card="player"]')?.className).toContain('battle-cutie-card')
		expect(holder().className).toContain('battle-cutie-portrait')
		expect(document.querySelector('.battle-cutie-nameplate')?.textContent).toContain('Cẩu Hỏa Sài')
		expect(document.querySelectorAll('.battle-cutie-seal')).toHaveLength(2)
	})

	it('shows the name and the label', () => {
		render(<AvatarCard side="player" name="Cẩu Hỏa Sài" label="Lv3" cutieId="fire-pup" />)

		expect(document.body.textContent).toContain('Cẩu Hỏa Sài')
		expect(document.body.textContent).toContain('Lv3')
	})

	it('keeps two empty skill slots on the battle card only', () => {
		const { unmount } = render(<AvatarCard side="player" name="Cẩu Hỏa Sài" cutieId="fire-pup" />)
		expect(document.querySelector('[data-skill-slots]')).toBeNull()
		unmount()

		render(<AvatarCard side="player" name="Cẩu Hỏa Sài" cutieId="fire-pup" size="battle" />)
		const slots = [...document.querySelectorAll<HTMLElement>('[data-skill-slot]')]
		expect(slots).toHaveLength(CUTIE_SKILL_SLOTS)
		for (const slot of slots) {
			// A slot holds nothing until the skill system lands — no text, no picture, no fill.
			expect(slot.textContent).toBe('')
			expect(slot.querySelector('img')).toBeNull()
			expect(slot.className).toContain('battle-cutie-seal-empty')
			expect(slot.className).not.toContain('battle-cutie-seal-on')
		}
	})

	it('fills the frame with the picture instead of letterboxing it', () => {
		render(<AvatarCard side="player" name="Cẩu Hỏa Sài" cutieId="fire-pup" />)

		const img = holder().querySelector('img')
		expect(img?.className, 'the square crop has to cover the tall frame').toContain('object-cover')
		expect(holder().className, 'and the frame grows with the card').toContain('flex-1')
	})

	it('shows damage and healing feedback born above the hit with an impact flash', () => {
		render(
			<AvatarCard
				side="player"
				name="Cẩu Hỏa Sài"
				cutieId="fire-pup"
				feedback={[
					{ key: 1, type: 'damage', value: 28 },
					{ key: 2, type: 'heal', value: 12 },
				]}
			/>,
		)

		const damage = card().querySelector<HTMLElement>('[data-combat-feedback="damage"]')
		const heal = card().querySelector<HTMLElement>('[data-combat-feedback="heal"]')
		expect(holder().querySelector('[data-combat-impact]')).toBeTruthy()
		expect(damage?.textContent).toBe('−28')
		expect(heal?.textContent).toBe('+12')
		// 🔴 Every number is born **well above the hit**, in the upper middle of the card — never in a
		// corner and never near the portrait's centre, so it reads as leaving the blow upward.
		for (const floater of [damage, heal]) {
			const left = Number.parseFloat(floater?.style.left ?? '0')
			const top = Number.parseFloat(floater?.style.top ?? '0')
			expect(left).toBeGreaterThanOrEqual(38)
			expect(left).toBeLessThanOrEqual(62)
			// The hit lands at ~46 %: the birth band has to sit clearly higher than that.
			expect(top).toBeGreaterThanOrEqual(24)
			expect(top).toBeLessThanOrEqual(36)
		}
		const vectorOf = (node: HTMLElement | null | undefined) => {
			const inner = node?.firstElementChild as HTMLElement | null
			return `${inner?.style.getPropertyValue('--floater-dx')},${inner?.style.getPropertyValue('--floater-dy')}`
		}
		// …and two hits do not sit on top of each other.
		expect(`${damage?.style.left},${damage?.style.top}`).not.toBe(`${heal?.style.left},${heal?.style.top}`)
		expect(vectorOf(damage)).not.toBe(vectorOf(heal))
		expect(document.querySelector('[aria-label="Damage 28"]')).toBeTruthy()
		expect(document.querySelector('[aria-label="Healing 12"]')).toBeTruthy()
	})

	it('scatters a dense burst above the hit, each number still flying straight up', () => {
		const feedback = Array.from({ length: 18 }, (_, key) => ({
			key,
			type: key % 2 === 0 ? ('damage' as const) : ('heal' as const),
			value: key + 1,
		}))
		render(<AvatarCard side="enemy" name="Yêu Thú" emoji="👹" feedback={feedback} />)

		const floaters = [...card('enemy').querySelectorAll<HTMLElement>('[data-combat-feedback]')]
		expect(floaters).toHaveLength(feedback.length)
		// Birth spots scatter (a burst covers a band, not one pixel)…
		const births = floaters.map((floater) => `${floater.style.left},${floater.style.top}`)
		expect(new Set(births).size).toBeGreaterThan(3)
		// …but every one of them leaves **straight up**: 12 o'clock, no sideways component.
		for (const floater of floaters) {
			const inner = floater.firstElementChild as HTMLElement | null
			expect(inner?.style.getPropertyValue('--floater-dx'), 'no sideways travel').toBe('0px')
			expect(Number.parseFloat(inner?.style.getPropertyValue('--floater-dy') ?? '0')).toBeLessThan(0)
		}
	})

	it('marks a critical hit by making the number itself bigger and blazing', () => {
		render(
			<AvatarCard
				side="enemy"
				name="Yêu Thú"
				emoji="👹"
				size="battle"
				feedback={[
					{ key: 1, type: 'damage', value: 120, critical: true },
					{ key: 2, type: 'damage', value: 30 },
				]}
			/>,
		)

		const critical = card('enemy').querySelector<HTMLElement>('[data-combat-feedback-key="1"]')
		const normal = card('enemy').querySelector<HTMLElement>('[data-combat-feedback-key="2"]')
		expect(critical?.hasAttribute('data-combat-critical-hit'), 'flagged for tests and CSS').toBe(true)
		// Only the number changes: one step bigger, fire-gold, punched in. ❌ No `CRITICAL` lettering.
		expect(critical?.textContent).toBe('−120')
		expect(critical?.querySelector('[data-combat-critical-label]'), 'no extra word').toBeNull()
		expect(critical?.firstElementChild?.className).toContain('text-[26px]')
		expect(critical?.firstElementChild?.className).toContain('text-[#ffd45c]')
		expect(critical?.querySelector('.animate-critical-pop')).toBeTruthy()
		expect(normal?.firstElementChild?.className, 'a normal number is smaller still').toContain('text-[20px]')
		expect(normal?.hasAttribute('data-combat-critical-hit')).toBe(false)
		expect(normal?.textContent).toBe('−30')
	})

	it('shoots every number straight up (12 o’clock) out of the impact point', () => {
		render(
			<>
				<AvatarCard
					side="player"
					name="Cẩu Hỏa Sài"
					cutieId="fire-pup"
					feedback={[{ key: 1, type: 'damage', value: 10 }]}
				/>
				<AvatarCard
					side="enemy"
					name="Yêu Thú"
					emoji="👹"
					feedback={[{ key: 1, type: 'damage', value: 10 }]}
				/>
			</>,
		)
		const find = (side: 'player' | 'enemy') =>
			document
				.querySelector(`[data-avatar-card="${side}"]`)!
				.querySelector<HTMLElement>('[data-combat-feedback-key="1"]')
		const onPlayer = find('player')
		const onEnemy = find('enemy')
		const inner = (node: HTMLElement | null) => node?.firstElementChild as HTMLElement | null
		const vectorOf = (node: HTMLElement | null) => {
			const element = inner(node)
			return {
				dx: Number.parseFloat(element?.style.getPropertyValue('--floater-dx') ?? '0'),
				dy: Number.parseFloat(element?.style.getPropertyValue('--floater-dy') ?? '0'),
			}
		}
		// Born **above the hit**, in the upper middle of the card so the nameplate never covers it.
		for (const floater of [onPlayer, onEnemy]) {
			const left = Number.parseFloat(floater?.style.left ?? '0')
			const top = Number.parseFloat(floater?.style.top ?? '100')
			expect(left).toBeGreaterThanOrEqual(38)
			expect(left).toBeLessThanOrEqual(62)
			expect(top).toBeGreaterThanOrEqual(24)
			expect(top).toBeLessThanOrEqual(36)
		}
		// 🔴 Straight up on **both** cards: no sideways travel, and a flight short enough that the highest
		// birth row (24 % of a 492 px card) still clears the nameplate.
		for (const vector of [vectorOf(onPlayer), vectorOf(onEnemy)]) {
			expect(vector.dx, '12 o’clock has no sideways component').toBe(0)
			expect(vector.dy, 'always rises').toBeLessThan(-60)
			expect(vector.dy).toBeGreaterThanOrEqual(-95)
		}
		expect(vectorOf(onPlayer)).toEqual(vectorOf(onEnemy))
	})

	it('keeps a number on its own spot and path while the others come and go', () => {
		const spotOf = (key: number) => {
			const floater = card().querySelector<HTMLElement>(`[data-combat-feedback-key="${key}"]`)
			const inner = floater?.firstElementChild as HTMLElement | null
			return `${floater?.style.left},${floater?.style.top}|${inner?.style.getPropertyValue('--floater-dx')},${inner?.style.getPropertyValue('--floater-dy')}`
		}
		const { rerender } = render(
			<AvatarCard
				side="player"
				name="Cẩu Hỏa Sài"
				cutieId="fire-pup"
				feedback={[
					{ key: 4, type: 'damage', value: 20 },
					{ key: 11, type: 'damage', value: 34 },
				]}
			/>,
		)
		const before = spotOf(11)
		// The older number fades (and a new one shows up): the remaining number must **not** move,
		// which is what made a whole burst look like it jumped at once.
		rerender(
			<AvatarCard
				side="player"
				name="Cẩu Hỏa Sài"
				cutieId="fire-pup"
				feedback={[
					{ key: 11, type: 'damage', value: 34 },
					{ key: 12, type: 'damage', value: 8 },
				]}
			/>,
		)
		expect(spotOf(11)).toBe(before)
		expect(spotOf(12)).not.toBe(before)
	})
})
