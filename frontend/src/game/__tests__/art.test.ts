import { describe, expect, it } from 'vitest'
import { itemArtSrc, petArtSrc, skillArtSrc } from '../art'
import { ITEM_TEMPLATES } from '../items'
import { PETS } from '../pets'

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
	const withArt = ITEM_TEMPLATES.filter((template) => template.art)

	it('has at least one template that uses art', () => {
		expect(withArt.length).toBeGreaterThan(0)
	})

	it.each(withArt.map((template) => [template.id, template] as const))('%s has its file', (_id, template) => {
		const src = itemArtSrc(template.id)
		expect(src, `${template.id} must return a path`).not.toBeNull()
		expect(FILES.has(toKey(src!)), `missing file ${src}`).toBe(true)
	})

	it('resolves one picture per item — the star rank is not part of the path', () => {
		const template = withArt[0]!
		expect(itemArtSrc(template.id)).toBe(`/icons/items/${template.id}.${template.artExt ?? 'png'}`)
	})

	it('keeps exactly one file per item — no `<id>-<star>.png` variants left', () => {
		const variants = [...FILES]
			.filter((key) => key.includes('/icons/items/'))
			.filter((key) => /-\d\.png$/.test(key))
		expect(variants, 'per-star art files are no longer used').toEqual([])
	})

	it('every item file in public/ has a matching template', () => {
		// Catches extra files or typos in the name — a sign of a wrong mapping.
		const orphans = [...FILES]
			.filter((key) => key.includes('/icons/items/'))
			.map((key) => key.replace(/^.*\/icons\/items\//, '').replace(/\.png$/, ''))
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
	it('returns null for an item that declares no art', () => {
		const bare = ITEM_TEMPLATES.find((template) => !template.art)
		// Every shipped item has art today; the branch is still the documented fallback contract.
		if (bare) expect(itemArtSrc(bare.id)).toBeNull()
	})
})
