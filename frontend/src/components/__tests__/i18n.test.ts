// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { translate, useLanguageStore } from '../../i18n'
import { fireEvent, screen } from '@testing-library/react'
import { renderApp } from '../../test/router'

beforeEach(() => {
	localStorage.removeItem('martial-cutie-language')
	useLanguageStore.setState({ language: 'en' })
})

afterEach(() => {
	localStorage.removeItem('martial-cutie-language')
	useLanguageStore.setState({ language: 'en' })
})

describe('language preference', () => {
	it('defaults to English text and interpolates translated values', () => {
		expect(translate('Màn {stage}', { stage: 12 })).toBe('Stage 12')
		expect(translate('Đăng nhập')).toBe('Sign in')
		expect(translate('Bản đồ hành trình')).toBe('Journey Map')
		expect(translate('Cuties')).toBe('Cuties')
		expect(translate('Đấu Cutie')).toBe('Cutie Battle')
		expect(translate('Vào màn')).toBe('Enter Stage')
	})

	it('switches to Vietnamese and persists the preference', () => {
		useLanguageStore.getState().setLanguage('vi')
		expect(translate('Màn {stage}', { stage: 12 })).toBe('Màn 12')
		expect(translate('Bản đồ hành trình')).toBe('Bản đồ hành trình')
		expect(JSON.parse(localStorage.getItem('martial-cutie-language') ?? '{}').state.language).toBe('vi')
	})

	it('updates the rendered app and document language when the selector changes', async () => {
		await renderApp('/', 'en')
		expect(screen.getByRole('heading', { name: 'Equipment' })).toBeTruthy()
		expect(document.title).toBe('Cuties Clash')

		fireEvent.click(screen.getByRole('button', { name: 'Tiếng Việt' }))
		expect(await screen.findByRole('heading', { name: 'Trang bị' })).toBeTruthy()
		expect(document.documentElement.lang).toBe('vi')
		expect(document.title).toBe('Cuties Clash')

		fireEvent.click(screen.getByRole('button', { name: 'English' }))
		expect(await screen.findByRole('heading', { name: 'Equipment' })).toBeTruthy()
		expect(document.documentElement.lang).toBe('en')
		expect(document.title).toBe('Cuties Clash')
	})
})
