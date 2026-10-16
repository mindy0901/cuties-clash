import { describe, expect, it } from 'vitest'
import { itemArtSrc, petArtSrc, skillArtSrc } from '../art'
import { ITEM_TEMPLATES } from '../items'
import { PETS } from '../pets'
import type { Star } from '../types'

/**
 * Art khai báo trong `items.ts`/`pets.ts` **phải có file thật**.
 *
 * Nếu thiếu, giao diện vẫn không vỡ (tự lùi về emoji), nhưng người chơi sẽ thấy lẫn
 * lộn: món này có ảnh, món kia là emoji. Test này bắt lỗi đó ngay.
 *
 * `import.meta.glob` chạy qua Vite nên không cần type Node — `tsconfig.app.json` chỉ
 * khai báo `types: ["vite/client"]`.
 */
const FILES = new Set(Object.keys(import.meta.glob('../../../public/icons/**/*.png')))

/** Đổi đường dẫn public (`/icons/x.png`) thành khoá trong `FILES`. */
function toKey(publicPath: string): string {
	return `../../../public${publicPath}`
}

describe('art vật phẩm', () => {
	const templatesWithStars = ITEM_TEMPLATES.filter((template) => template.stars?.length)

	it('có ít nhất một template dùng art', () => {
		expect(templatesWithStars.length).toBeGreaterThan(0)
	})

	it.each(templatesWithStars.map((template) => [template.id, template] as const))(
		'%s có đủ file cho mọi sao đã khai báo',
		(_id, template) => {
			for (const star of template.stars ?? []) {
				const src = itemArtSrc(template.id, star)
				expect(src, `${template.id} sao ${star} phải trả đường dẫn`).not.toBeNull()
				expect(FILES.has(toKey(src!)), `thiếu file ${src}`).toBe(true)
			}
		},
	)

	it('không khai báo art cho sao không tồn tại', () => {
		const declared = new Set(templatesWithStars.flatMap((template) => template.stars ?? []))
		for (const star of declared) expect([1, 2, 3, 4]).toContain(star)
	})

	it('mọi file item trong public/ đều có template tương ứng', () => {
		// Bắt file thừa/thừa gõ sai tên — dấu hiệu ánh xạ sai.
		const orphans = [...FILES]
			.filter((key) => key.includes('/icons/items/'))
			.map((key) => key.replace(/^.*\/icons\/items\//, '').replace(/-\d\.png$/, ''))
			.filter((id) => !ITEM_TEMPLATES.some((template) => template.id === id))
		expect([...new Set(orphans)]).toEqual([])
	})
})

describe('art thú cưng và kỹ năng', () => {
	it.each(PETS.map((pet) => [pet.id, pet] as const))('%s có art và art kỹ năng nếu đã khai báo', (_id, pet) => {
		if (pet.art) {
			const src = petArtSrc(pet.id)
			expect(src).not.toBeNull()
			expect(FILES.has(toKey(src!)), `thiếu file ${src}`).toBe(true)
		}
		if (pet.skillArt) {
			const src = skillArtSrc(pet.id)
			expect(src).not.toBeNull()
			expect(FILES.has(toKey(src!)), `thiếu file ${src}`).toBe(true)
		}
	})

	it('mọi file pet/skill trong public/ đều có thú cưng tương ứng', () => {
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

describe('lùi về emoji khi không có art', () => {
	it('trả null cho món không khai báo sao nào', () => {
		const bare = ITEM_TEMPLATES.find((template) => !template.stars?.length)
		if (bare) expect(itemArtSrc(bare.id, 1 as Star)).toBeNull()
	})

	it('trả null cho sao không nằm trong danh sách khai báo', () => {
		const template = ITEM_TEMPLATES.find((entry) => entry.stars?.length)
		if (!template) return
		const missingStar = ([1, 2, 3, 4] as Star[]).find((star) => !template.stars!.includes(star))
		if (missingStar) expect(itemArtSrc(template.id, missingStar)).toBeNull()
	})
})
