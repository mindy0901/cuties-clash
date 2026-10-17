// @vitest-environment jsdom
/**
 * Khung **đại diện** của sàn đấu — chỗ sẽ đặt ảnh đại diện sau này.
 *
 * Khoá lại thứ tự ưu tiên của nguồn ảnh, vì đó là hợp đồng để bổ sung art sau mà **không phải
 * sửa component**: ảnh đại diện riêng (`avatar: true`) → art thú cưng → emoji.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AvatarCard } from '../AvatarCard'

afterEach(cleanup)

function holder(): HTMLElement {
	const found = document.querySelector<HTMLElement>('[data-avatar-holder]')
	if (!found) throw new Error('không thấy khung đại diện')
	return found
}

describe('khung đại diện', () => {
	it('thú cưng chưa có ảnh đại diện riêng thì dùng art thú cưng', () => {
		render(<AvatarCard side="player" name="Cẩu Hỏa Sài" petId="fire-pup" />)

		const img = holder().querySelector('img')
		expect(img?.getAttribute('src'), 'lùi về art thú cưng').toBe('/icons/pets/fire-pup.png')
	})

	it('không có thú cưng (đối thủ theo màn) thì dùng emoji', () => {
		render(<AvatarCard side="enemy" name="Yêu Thú" emoji="👹" />)

		expect(holder().querySelector('img'), 'không có ảnh thì không render img').toBeNull()
		expect(holder().textContent).toContain('👹')
	})

	it('hiện tên, nhãn và ô kỹ năng kèm tiến độ hồi', () => {
		render(
			<AvatarCard
				side="player"
				name="Cẩu Hỏa Sài"
				label="Lv3"
				petId="fire-pup"
				skills={[
					{ uid: 'skill', icon: <span>🔥</span>, label: 'Hỏa Khuyển Trảo', charge: 40 },
				]}
			/>,
		)

		expect(document.body.textContent).toContain('Cẩu Hỏa Sài')
		expect(document.body.textContent).toContain('Lv3')
		expect(document.body.textContent).toContain('🔥')
		const [chip] = [...document.querySelectorAll<HTMLElement>('[title="Hỏa Khuyển Trảo"]')]
		expect(chip, 'ô kỹ năng phải có tiêu đề').toBeTruthy()
		expect(chip.querySelector<HTMLElement>('[style*="width"]')?.style.width).toBe('40%')
	})
})
