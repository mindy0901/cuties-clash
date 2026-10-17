import { getTemplate } from './items'
import { getPet } from './pets'
import type { Star } from './types'

/**
 * Tra đường dẫn art trong `public/`.
 *
 * Nguyên tắc: **chỉ trả về đường dẫn khi biết chắc file có thật**. Danh sách sao có
 * art được khai báo trong `items.ts`/`pets.ts` (`stars`, `artExt`), nên không cần
 * đoán file — đoán sai sẽ hiện icon vỡ.
 *
 * Không có art thì trả `null`, và component dùng emoji dự phòng.
 */

/** Art của một món đồ ở mức sao cụ thể. `null` = chưa có art, dùng emoji. */
export function itemArtSrc(templateId: string, star: Star): string | null {
	const template = getTemplate(templateId)
	return artPath('items', templateId, template.stars, star, template.artExt)
}

/** Art cho thú cưng (không phụ thuộc sao). */
export function petArtSrc(petId: string): string | null {
	const pet = getPet(petId)
	if (!pet.art) return null
	return `/icons/pets/${petId}.${pet.artExt ?? 'png'}`
}

/**
 * Art **đại diện** của thú cưng cho khung đấu sĩ (`/icons/pets/<id>-avatar.png`).
 *
 * `null` = chưa có ảnh đại diện riêng; chỗ gọi lùi về `petArtSrc` rồi emoji, nên bổ sung ảnh sau
 * không phải sửa component nào (xem `docs/ASSETS.md`).
 */
export function avatarArtSrc(petId: string): string | null {
	const pet = getPet(petId)
	if (!pet.avatar) return null
	return `/icons/pets/${petId}-avatar.${pet.avatarExt ?? 'png'}`
}

/** Art cho kỹ năng của thú cưng. */
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
