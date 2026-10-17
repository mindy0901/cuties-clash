import { describe, expect, it } from 'vitest'
import { itemArtSrc, petArtSrc, skillArtSrc } from '../art'
import { ITEM_TEMPLATES } from '../items'
import { PETS } from '../pets'
import type { Star } from '../types'

/**
 * Art declared in `items.ts`/`pets.ts` **must have a real file behind it**.
 *
 * When one is missing the UI still does not break (it falls back to the emoji), but the player sees
 * an inconsistent mix: one item has an image and the next one is an emoji. This test catches that
 * right away.
 *
 * `import.meta.glob` runs through Vite, so no Node types are needed — `tsconfig.app.json` only
 * declares `types: ["vite/client"]`.
 */
const FILES = new Set(Object.keys(import.meta.glob('../../../public/icons/**/*.png')))

/** Turn a public path (`/icons/x.png`) into a key inside `FILES`. */
function toKey(publicPath: string): string {
	return `../../../public${publicPath}`
}

describe('item art', () => {
	const templatesWithStars = ITEM_TEMPLATES.filter((template) => template.stars?.length)

	it('has at least one template that uses art', () => {
		expect(templatesWithStars.length).toBeGreaterThan(0)
	})

	it.each(templatesWithStars.map((template) => [template.id, template] as const))(
		'%s has a file for every declared star rank',
		(_id, template) => {
			for (const star of template.stars ?? []) {
				const src = itemArtSrc(template.id, star)
				expect(src, `${template.id} star ${star} must return a path`).not.toBeNull()
				expect(FILES.has(toKey(src!)), `missing file ${src}`).toBe(true)
			}
		},
	)

	it('never declares art for a star rank that does not exist', () => {
		const declared = new Set(templatesWithStars.flatMap((template) => template.stars ?? []))
		for (const star of declared) expect([1, 2, 3, 4, 5]).toContain(star)
	})

	it('every item file in public/ has a matching template', () => {
		// Catches extra files or typos in the name — a sign of a wrong mapping.
		const orphans = [...FILES]
			.filter((key) => key.includes('/icons/items/'))
			.map((key) => key.replace(/^.*\/icons\/items\//, '').replace(/-\d\.png$/, ''))
			.filter((id) => !ITEM_TEMPLATES.some((template) => template.id === id))
		expect([...new Set(orphans)]).toEqual([])
	})
})

describe('pet and skill art', () => {
	it.each(PETS.map((pet) => [pet.id, pet] as const))('%s has art and skill art when declared', (_id, pet) => {
		if (pet.art) {
			const src = petArtSrc(pet.id)
			expect(src).not.toBeNull()
			expect(FILES.has(toKey(src!)), `missing file ${src}`).toBe(true)
		}
		if (pet.skillArt) {
			const src = skillArtSrc(pet.id)
			expect(src).not.toBeNull()
			expect(FILES.has(toKey(src!)), `missing file ${src}`).toBe(true)
		}
	})

	it('every pet/skill file in public/ has a matching pet', () => {
		const orphanPets = [...FILES]
			.filter((key) => key.includes('/icons/pets/'))
			.map((key) => key.replace(/^.*\/icons\/pets\//, '').replace(/\.png$/, ''))
			.filter((id) => !PETS.some((pet) => pet.id === id))
		expect(orphanPets).toEqual([])

		const orphanSkills = [...FILES]
			.filter((key) => key.includes('/icons/skills/'))
			.map((key) => key.replace(/^.*\/icons\/skills\//, '').replace(/-skill\.png$/, ''))
			.filter((id) => !PETS.some((pet) => pet.id === id))
		expect(orphanSkills).toEqual([])
	})
})

describe('falls back to the emoji when art is missing', () => {
	it('returns null for an item that declares no star rank', () => {
		const bare = ITEM_TEMPLATES.find((template) => !template.stars?.length)
		if (bare) expect(itemArtSrc(bare.id, 1 as Star)).toBeNull()
	})

	it('returns null for a star rank outside the declared list', () => {
		const template = ITEM_TEMPLATES.find((entry) => entry.stars?.length)
		if (!template) return
		const missingStar = ([1, 2, 3, 4, 5] as Star[]).find((star) => !template.stars!.includes(star))
		if (missingStar) expect(itemArtSrc(template.id, missingStar)).toBeNull()
	})
})
