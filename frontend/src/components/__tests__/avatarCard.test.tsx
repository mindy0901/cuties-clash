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

	it('shows damage and healing feedback at separate randomized positions with an impact flash', () => {
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

		const damage = holder().querySelector<HTMLElement>('[data-combat-feedback="damage"]')
		const heal = holder().querySelector<HTMLElement>('[data-combat-feedback="heal"]')
		expect(holder().querySelector('[data-combat-impact]')).toBeTruthy()
		expect(damage?.textContent).toBe('−28')
		expect(heal?.textContent).toBe('+12')
		expect(damage?.style.left).toMatch(/^\d+%$/)
		expect(damage?.style.top).toMatch(/^\d+%$/)
		expect(heal?.style.left).toMatch(/^\d+%$/)
		expect(heal?.style.top).toMatch(/^\d+%$/)
		expect(`${damage?.style.left},${damage?.style.top}`).not.toBe(`${heal?.style.left},${heal?.style.top}`)
		expect(document.querySelector('[aria-label="Damage 28"]')).toBeTruthy()
		expect(document.querySelector('[aria-label="Healing 12"]')).toBeTruthy()
	})

	it('keeps a dense burst of floating numbers in distinct positions', () => {
		const feedback = Array.from({ length: 18 }, (_, key) => ({
			key,
			type: key % 2 === 0 ? ('damage' as const) : ('heal' as const),
			value: key + 1,
		}))
		render(<AvatarCard side="enemy" name="Yêu Thú" emoji="👹" feedback={feedback} />)

		const floaters = [...holder().querySelectorAll<HTMLElement>('[data-combat-feedback]')]
		const positions = floaters.map((floater) => `${floater.style.left},${floater.style.top}`)
		expect(floaters).toHaveLength(feedback.length)
		expect(new Set(positions).size).toBe(feedback.length)
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

		const critical = holder().querySelector<HTMLElement>('[data-combat-feedback-key="1"]')
		const normal = holder().querySelector<HTMLElement>('[data-combat-feedback-key="2"]')
		expect(critical?.hasAttribute('data-combat-critical-hit'), 'flagged for tests and CSS').toBe(true)
		// Only the number changes: one step bigger, fire-gold, punched in. ❌ No `CRITICAL` lettering.
		expect(critical?.textContent).toBe('−120')
		expect(critical?.querySelector('[data-combat-critical-label]'), 'no extra word').toBeNull()
		expect(critical?.firstElementChild?.className).toContain('text-[34px]')
		expect(critical?.firstElementChild?.className).toContain('text-[#ffd45c]')
		expect(critical?.querySelector('.animate-critical-pop')).toBeTruthy()
		expect(normal?.firstElementChild?.className, 'normal stays 27px').toContain('text-[27px]')
		expect(normal?.hasAttribute('data-combat-critical-hit')).toBe(false)
		expect(normal?.textContent).toBe('−30')
	})

	it('floats every number above the fighter, knocked back behind the one who took the hit', () => {
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
		const onPlayer = document
			.querySelector('[data-avatar-card="player"]')!
			.querySelector<HTMLElement>('[data-combat-feedback-key="1"]')
		const onEnemy = document
			.querySelector('[data-avatar-card="enemy"]')!
			.querySelector<HTMLElement>('[data-combat-feedback-key="1"]')
		// The band sits above the portrait's centre — near the hit, not floating above the head.
		for (const floater of [onPlayer, onEnemy]) {
			const top = Number.parseFloat(floater?.style.top ?? '100')
			expect(top).toBeGreaterThanOrEqual(14)
			expect(top).toBeLessThanOrEqual(48)
		}
		// …and it pops on the **back half** of the card, never in front of the fighter: the player is hit
		// from the right (so the number starts left of centre), the enemy from the left (right of centre).
		expect(Number.parseFloat(onPlayer?.style.left ?? '0')).toBeLessThanOrEqual(44)
		expect(Number.parseFloat(onEnemy?.style.left ?? '0')).toBeGreaterThanOrEqual(56)
		// The blow comes from the right, so the number is knocked back to the **left**, behind the fighter.
		expect(
			(onPlayer?.firstElementChild as HTMLElement | null)?.style.getPropertyValue('--floater-drift'),
		).toBe('-18px')
		expect(
			(onEnemy?.firstElementChild as HTMLElement | null)?.style.getPropertyValue('--floater-drift'),
		).toBe('18px')
	})

	it('keeps a number in its own spot while the others come and go', () => {		const spotOf = (key: number) => {
			const floater = holder().querySelector<HTMLElement>(`[data-combat-feedback-key="${key}"]`)
			return `${floater?.style.left},${floater?.style.top}`
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
