import { getTemplate } from './items'
import { getPet } from './pets'
import type { Star } from './types'

/**
 * Resolve an art path inside `public/`.
 *
 * Rule: **only return a path when the file is known to exist**. The star ranks that have art are
 * declared in `items.ts`/`pets.ts` (`stars`, `artExt`), so nothing is guessed — a wrong guess would
 * render a broken icon.
 *
 * With no art this returns `null` and the component falls back to the emoji.
 */

/** Art for one item at a specific star rank. `null` = no art yet, use the emoji. */
export function itemArtSrc(templateId: string, star: Star): string | null {
	const template = getTemplate(templateId)
	return artPath('items', templateId, template.stars, star, template.artExt)
}

/** Art for a pet (independent of the star rank). */
export function petArtSrc(petId: string): string | null {
	const pet = getPet(petId)
	if (!pet.art) return null
	return `/icons/pets/${petId}.${pet.artExt ?? 'png'}`
}

/**
 * The pet's **avatar** art for the fighter frame (`/icons/pets/<id>-avatar.png`).
 *
 * `null` = no dedicated avatar yet; callers fall back to `petArtSrc` and then the emoji, so adding
 * an image later needs no component change (see `docs/ASSETS.md`).
 */
export function avatarArtSrc(petId: string): string | null {
	const pet = getPet(petId)
	if (!pet.avatar) return null
	return `/icons/pets/${petId}-avatar.${pet.avatarExt ?? 'png'}`
}

/** Art for the pet's skill. */
export function skillArtSrc(petId: string): string | null {
	const pet = getPet(petId)
	if (!pet.skillArt) return null
	return `/icons/skills/${petId}-skill.${pet.skillArtExt ?? 'png'}`
}

function artPath(
	folder: string,
	id: string,
	stars: Star[] | undefined,
	star: Star,
	ext: string | undefined,
): string | null {
	if (!stars?.includes(star)) return null
	return `/icons/${folder}/${id}-${star}.${ext ?? 'png'}`
}
