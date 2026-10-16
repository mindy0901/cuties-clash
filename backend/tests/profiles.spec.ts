/** Đọc hồ sơ OpenID Connect của Google. */

import { describe, expect, it } from 'vitest'
import { GOOGLE, parseGoogleProfile } from '../src/oauth'

describe('parseGoogleProfile', () => {
	it('ánh xạ sub, tên và ảnh', () => {
		const profile = parseGoogleProfile(GOOGLE, {
			sub: '12345',
			email: 'a@example.com',
			name: 'Tên Người Dùng',
			picture: 'https://x/p.png',
		})
		expect(profile.provider).toBe('google')
		expect(profile.subject).toBe('12345')
		expect(profile.displayName).toBe('Tên Người Dùng')
		expect(profile.email).toBe('a@example.com')
		expect(profile.avatarUrl).toBe('https://x/p.png')
	})

	it('lùi về given_name', () => {
		expect(parseGoogleProfile(GOOGLE, { sub: '1', given_name: 'Tên Riêng' }).displayName).toBe('Tên Riêng')
	})

	it('lùi về phần trước @ của email', () => {
		expect(parseGoogleProfile(GOOGLE, { sub: '1', email: 'khongten@example.com' }).displayName).toBe('khongten')
	})

	it('lùi về tên mặc định khi không có gì', () => {
		const profile = parseGoogleProfile(GOOGLE, { sub: '1' })
		expect(profile.displayName).toBe('Người chơi Google')
		expect(profile.email).toBeUndefined()
		expect(profile.avatarUrl).toBeUndefined()
	})

	it('thiếu sub thì subject thành chuỗi rỗng', () => {
		// Route gọi sẽ từ chối hồ sơ không có `sub`.
		expect(parseGoogleProfile(GOOGLE, { email: 'a@example.com', name: 'Không Sub' }).subject).toBe('')
	})

	it('sub dạng số vẫn thành chuỗi', () => {
		expect(parseGoogleProfile(GOOGLE, { sub: 987 }).subject).toBe('987')
	})
})
