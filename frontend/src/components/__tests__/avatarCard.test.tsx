// @vitest-environment jsdom
/**
 * The arena's **avatar** frame — where avatar art will go later.
 *
 * Locks down the priority order of the image sources, because that is the contract that lets art
 * be added later **without touching the component**: dedicated avatar (`avatar: true`) → pet art
 * → emoji.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AvatarCard } from '../AvatarCard'

afterEach(cleanup)

function holder(): HTMLElement {
	const found = document.querySelector<HTMLElement>('[data-avatar-holder]')
	if (!found) throw new Error('avatar holder not found')
	return found
}

describe('the avatar frame', () => {
	it('uses the pet art when the pet has no dedicated avatar yet', () => {
		render(<AvatarCard side="player" name="Cẩu Hỏa Sài" petId="fire-pup" />)

		const img = holder().querySelector('img')
		expect(img?.getAttribute('src'), 'falls back to the pet art').toBe('/icons/pets/fire-pup.png')
	})

	it('uses an emoji when there is no pet (stage opponent)', () => {
		render(<AvatarCard side="enemy" name="Yêu Thú" emoji="👹" />)

		expect(holder().querySelector('img'), 'no image means no img element').toBeNull()
		expect(holder().textContent).toContain('👹')
	})

	it('shows the name and the label', () => {
		render(<AvatarCard side="player" name="Cẩu Hỏa Sài" label="Lv3" petId="fire-pup" />)

		expect(document.body.textContent).toContain('Cẩu Hỏa Sài')
		expect(document.body.textContent).toContain('Lv3')
	})

	it('draws the skill slots under the picture, never on top of it', () => {
		render(
			<AvatarCard
				side="player"
				name="Cẩu Hỏa Sài"
				petId="fire-pup"
				skills={[{ uid: 'skill', icon: <span>🔥</span>, label: 'Hỏa Khuyển Trảo', charge: 40 }]}
			/>,
		)

		const [chip] = [...document.querySelectorAll<HTMLElement>('[title="Hỏa Khuyển Trảo"]')]
		expect(chip, 'the skill slot must carry a title').toBeTruthy()
		expect(chip.querySelector<HTMLElement>('[style*="width"]')?.style.width).toBe('40%')
		// The picture owns the frame; the slots sit **below** it, so the photo is never covered.
		expect(holder().contains(chip), 'not inside the picture frame').toBe(false)
		expect(document.body.textContent).toContain('🔥')
	})

	it('fills the frame with the picture instead of letterboxing it', () => {
		render(<AvatarCard side="player" name="Cẩu Hỏa Sài" petId="fire-pup" />)

		const img = holder().querySelector('img')
		expect(img?.className, 'the square crop has to cover the tall frame').toContain('object-cover')
		expect(holder().className, 'and the frame grows with the card').toContain('flex-1')
	})
})
