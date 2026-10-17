import { getTemplate } from './items'
import { getPet } from './pets'
import { uploadedArt } from './content'

/**
 * Resolve an art path inside `public/`.
 *
 * Rule: **only return a path when the asset is declared** (`art`/`skillArt`/`avatar` in
 * `items.ts`/`pets.ts`) or the admin has uploaded one, so nothing is guessed — a wrong guess would
 * render a broken icon.
 *
 * With no art this returns `null` and the component falls back to the emoji.
 */

/**
 * Art for one item: the picture uploaded from the admin page when there is one, otherwise
 * `public/icons/items/<id>.<ext>`.
 *
 * ⚠️ ONE art per item, independent of the star rank — the star rank is drawn on top of it as a row
 * of stars (`ITEM_STAR_TEXT`). ❌ Never go back to `<id>-<star>.png`: that turned a single weapon
 * into four different pictures.
 */
export function itemArtSrc(templateId: string): string | null {
	const uploaded = uploadedArt('item', templateId)
	if (uploaded) return uploaded
	const template = getTemplate(templateId)
	if (!template.art) return null
	return `/icons/items/${templateId}.${template.artExt ?? 'png'}`
}

/** Art for a pet: uploaded picture first, then the bundled file. */
export function petArtSrc(petId: string): string | null {
	const uploaded = uploadedArt('pet', petId)
	if (uploaded) return uploaded
	const pet = getPet(petId)
	if (!pet.art) return null
	return `/icons/pets/${petId}.${pet.artExt ?? 'png'}`
}

/** Art for the pet's skill. */
export function skillArtSrc(petId: string): string | null {
	const pet = getPet(petId)
	if (!pet.skillArt) return null
	return `/icons/skills/${petId}-skill.${pet.skillArtExt ?? 'png'}`
}

/**
 * Art for the pet's **avatar** frame (`/icons/pets/<id>-avatar.png`).
 *
 * ⚠️ Falls back to the **uploaded** pet picture so the arena shows an imported image straight away
 * instead of waiting for a dedicated `-avatar` file. `null` = nothing at all, caller uses the emoji.
 */
export function avatarArtSrc(petId: string): string | null {
	const pet = getPet(petId)
	if (pet.avatar) return `/icons/pets/${petId}-avatar.${pet.avatarExt ?? 'png'}`
	return uploadedArt('pet', petId)
}
