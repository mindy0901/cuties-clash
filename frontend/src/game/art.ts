import { getTemplate } from './items'
import { getCutie } from './cuties'
import { uploadedArt } from './content'

/**
 * Resolve an art path inside `public/`.
 *
 * Rule: **only return a path when the asset is declared** (`art`/`skillArt`/`avatar` in
 * `items.ts`/`cuties.ts`) or the admin has uploaded one, so nothing is guessed — a wrong guess would
 * render a broken icon.
 *
 * With no art this returns `null` and the component falls back to the emoji.
 */

/**
 * Art for one item: the picture uploaded from the admin page when there is one, otherwise
 * `public/icons/items/<id>.png`.
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
	return `/icons/items/${templateId}.png`
}

/** Art for a cutie: uploaded picture first, then the bundled file. */
export function cutieArtSrc(cutieId: string): string | null {
	const uploaded = uploadedArt('cutie', cutieId)
	if (uploaded) return uploaded
	const cutie = getCutie(cutieId)
	if (!cutie.art) return null
	return `/icons/cuties/${cutieId}.png`
}

/** Art for the cutie's skill. */
export function skillArtSrc(cutieId: string): string | null {
	const cutie = getCutie(cutieId)
	if (!cutie.skillArt) return null
	return `/icons/skills/${cutieId}-skill.png`
}

/**
 * Art for the cutie's **avatar** frame (`/icons/cuties/<id>-avatar.png`).
 *
 * ⚠️ Falls back to the **uploaded** cutie picture so the arena shows an imported image straight away
 * instead of waiting for a dedicated `-avatar` file. `null` = nothing at all, caller uses the emoji.
 */
export function avatarArtSrc(cutieId: string): string | null {
	const cutie = getCutie(cutieId)
	if (cutie.avatar) return `/icons/cuties/${cutieId}-avatar.png`
	return uploadedArt('cutie', cutieId)
}
