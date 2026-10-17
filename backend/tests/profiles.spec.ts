/** Read Google's OpenID Connect profile. */

import { describe, expect, it } from 'vitest'
import { GOOGLE, parseGoogleProfile } from '../src/oauth'

describe('parseGoogleProfile', () => {
	it('maps sub, name and picture', () => {
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

	it('falls back to given_name', () => {
		expect(parseGoogleProfile(GOOGLE, { sub: '1', given_name: 'Tên Riêng' }).displayName).toBe('Tên Riêng')
	})

	it('falls back to the part before @ in the email', () => {
		expect(parseGoogleProfile(GOOGLE, { sub: '1', email: 'khongten@example.com' }).displayName).toBe('khongten')
	})

	it('falls back to the default name when nothing is available', () => {
		const profile = parseGoogleProfile(GOOGLE, { sub: '1' })
		expect(profile.displayName).toBe('Người chơi Google')
		expect(profile.email).toBeUndefined()
		expect(profile.avatarUrl).toBeUndefined()
	})

	it('a missing sub becomes an empty subject string', () => {
		// The calling route rejects a profile that has no `sub`.
		expect(parseGoogleProfile(GOOGLE, { email: 'a@example.com', name: 'Không Sub' }).subject).toBe('')
	})

	it('a numeric sub still becomes a string', () => {
		expect(parseGoogleProfile(GOOGLE, { sub: 987 }).subject).toBe('987')
	})
})
