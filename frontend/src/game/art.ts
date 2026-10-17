import { getTemplate } from './items'
import { getPet } from './pets'

/**
 * Resolve an art path inside `public/`.
 *
 * Rule: **only return a path when the file is declared** (`art`/`skillArt`/`avatar` in
 * `items.ts`/`pets.ts`), so nothing is guessed — a wrong guess would render a broken icon.
 *
 * With no art this returns `null` and the component falls back to the emoji.
 */

/**
 * Art for one item: `public/icons/items/<id>.<ext>`.
 *
 * ⚠️ ONE art per item, independent of the star rank — the star rank is drawn on top of it as a row
 * of stars (`ITEM_STAR_TEXT`). ❌ Never go back to `<id>-<star>.png`: that turned a single weapon
 * into four different pictures.
 */
export function itemArtSrc(templateId: string): string | null {
	const template = getTemplate(templateId)
	if (!template.art) return null
	return `/icons/items/${templateId}.${template.artExt ?? 'png'}`
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
