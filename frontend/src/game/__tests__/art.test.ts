import { describe, expect, it } from 'vitest'
import { installRetiredItems } from '../../test/retiredItems'

installRetiredItems()
import { itemArtSrc, cutieArtSrc, skillArtSrc } from '../art'
import { ITEM_TEMPLATES } from '../items'
import { RETIRED_ITEM_TEMPLATES } from '../../test/retiredCatalogue'
import { CUTIES } from '../cuties'

/**
 * Art declared in `items.ts`/`cuties.ts` **must have a real file behind it**.
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
	const withArt = [...ITEM_TEMPLATES, ...RETIRED_ITEM_TEMPLATES].filter((template) => template.art)

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
		expect(itemArtSrc(template.id)).toBe(`/icons/items/${template.id}.png`)
	})

	it('keeps exactly one file per item — no `<id>-<star>.png` variants left', () => {
		const variants = [...FILES]
			.filter((key) => key.includes('/icons/items/'))
			.filter((key) => /-\d\.png$/.test(key))
		expect(variants, 'per-star art files are no longer used').toEqual([])
	})

	it('every item file in public/ has a matching template', () => {
		// Catches extra files or typos in the name — a sign of a wrong mapping. Art for a **retired**
		// template is allowed to stay: the catalogue is owned by the admin page now, and a re-created
		// item usually reuses its picture.
		const known = new Set(
			[...ITEM_TEMPLATES, ...RETIRED_ITEM_TEMPLATES].map((template) => template.id),
		)
		const orphans = [...FILES]
			.filter((key) => key.includes('/icons/items/'))
			.map((key) => key.replace(/^.*\/icons\/items\//, '').replace(/\.png$/, ''))
			.filter((id) => !known.has(id))
		expect([...new Set(orphans)]).toEqual([])
	})
})

describe('cutie and skill art', () => {
	it.each(CUTIES.map((cutie) => [cutie.id, cutie] as const))('%s has art and skill art when declared', (_id, cutie) => {
		if (cutie.art) {
			const src = cutieArtSrc(cutie.id)
			expect(src).not.toBeNull()
			expect(FILES.has(toKey(src!)), `missing file ${src}`).toBe(true)
		}
		if (cutie.skillArt) {
			const src = skillArtSrc(cutie.id)
			expect(src).not.toBeNull()
			expect(FILES.has(toKey(src!)), `missing file ${src}`).toBe(true)
		}
	})

	it('every cutie/skill file in public/ has a matching cutie', () => {
		const orphanPets = [...FILES]
			.filter((key) => key.includes('/icons/cuties/'))
			.map((key) => key.replace(/^.*\/icons\/cuties\//, '').replace(/\.png$/, ''))
			.filter((id) => !CUTIES.some((cutie) => cutie.id === id))
		expect(orphanPets).toEqual([])

		const orphanSkills = [...FILES]
			.filter((key) => key.includes('/icons/skills/'))
			.map((key) => key.replace(/^.*\/icons\/skills\//, '').replace(/-skill\.png$/, ''))
			.filter((id) => !CUTIES.some((cutie) => cutie.id === id))
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
