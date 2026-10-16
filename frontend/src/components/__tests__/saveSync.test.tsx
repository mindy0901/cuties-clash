// @vitest-environment jsdom
/**
 * Đồng bộ bản lưu với máy chủ.
 *
 * Hai lỗi từng xảy ra ở đây, cả hai đều gây 400 liên tục:
 * - Gặp `revision_conflict` thì nạp bản máy chủ **đè lên** thay đổi mới → lại xung đột.
 * - Nạp bản máy chủ mà ghi revision **sau** khi ghi localStorage → lần đẩy ngay sau dùng
 *   revision cũ → xung đột.
 *
 * Logic đồng bộ nằm ở `api/saveSync.ts` (thuần, không React) nên phần lớn test gọi thẳng
 * hàm. Riêng "không đẩy lặp" phải render `AuthSync` vì guard `pushedRef` nằm trong effect.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'

const getSave = vi.fn()
const putSave = vi.fn()
const session = vi.fn()
const logout = vi.fn()

vi.mock('../../api/client', async () => {
	const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
	return {
		...actual,
		// `pushRun` kiểm tra `instanceof ApiError` nên phải giữ nguyên lớp thật.
		api: {
			session: (...args: unknown[]) => session(...args),
			getSave: (...args: unknown[]) => getSave(...args),
			putSave: (...args: unknown[]) => putSave(...args),
			logout: (...args: unknown[]) => logout(...args),
			loginUrl: (provider: string) => `/api/auth/${provider}/login`,
		},
	}
})

const { createQueryClient } = await import('../../api/queryClient')
const { pullRun, pushRun } = await import('../../api/saveSync')
const { AuthSync } = await import('../AuthSync')
const { useGameStore } = await import('../../store/gameStore')

const USER = { id: 7, display_name: 'Mindy', email: 'm@example.com', avatar_url: null, providers: ['google'] }

function conflict() {
	return new ApiError(400, 'revision_conflict', 'Bản lưu đã thay đổi ở nơi khác.')
}

/** Revision giả, ghi lại thứ tự các lần gọi để kiểm tra thứ tự. */
function fakeRevision(value: number, log?: string[]) {
	const box = { value }
	return {
		box,
		holder: {
			get: () => box.value,
			set: (next: number) => {
				box.value = next
				log?.push('revision')
			},
		},
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	window.localStorage.clear()
	window.sessionStorage.clear()
	useGameStore.getState().newRun()
})

afterEach(cleanup)

describe('pushRun', () => {
	it('gửi kèm revision hiện có và cập nhật revision mới', async () => {
		putSave.mockResolvedValue({ run: null, revision: 16, updated_at: null })
		const { box, holder } = fakeRevision(15)

		await pushRun({ stage: 5 }, holder)

		expect(putSave).toHaveBeenCalledTimes(1)
		expect(putSave.mock.calls[0][1]).toBe(15)
		expect(box.value).toBe(16)
	})

	it('gặp xung đột thì lấy revision mới rồi thử lại MỘT lần với dữ liệu của mình', async () => {
		putSave.mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ run: null, revision: 18, updated_at: null })
		getSave.mockResolvedValue({ run: { stage: 99 }, revision: 17, updated_at: null })
		const { box, holder } = fakeRevision(15)

		await pushRun({ stage: 5 }, holder)

		expect(getSave).toHaveBeenCalledTimes(1)
		expect(putSave).toHaveBeenCalledTimes(2)
		// Lần gửi lại dùng revision vừa lấy, và vẫn là dữ liệu của mình (không bị ghi đè).
		expect(putSave.mock.calls[1][0]).toEqual({ stage: 5 })
		expect(putSave.mock.calls[1][1]).toBe(17)
		expect(box.value).toBe(18)
	})

	it('xung đột mà thử lại vẫn lỗi thì ném ra ngoài, không thử vô tận', async () => {
		putSave.mockRejectedValue(conflict())
		getSave.mockResolvedValue({ run: null, revision: 17, updated_at: null })

		await expect(pushRun({ stage: 5 }, fakeRevision(15).holder)).rejects.toThrow()

		expect(putSave).toHaveBeenCalledTimes(2)
	})

	it('lỗi khác (không phải xung đột) thì không thử lại', async () => {
		putSave.mockRejectedValue(new ApiError(500, 'boom', 'Máy chủ lỗi.'))

		await expect(pushRun({ stage: 5 }, fakeRevision(15).holder)).rejects.toThrow()

		expect(putSave).toHaveBeenCalledTimes(1)
		expect(getSave).not.toHaveBeenCalled()
	})
})

describe('pullRun', () => {
	it('ghi revision TRƯỚC khi ghi localStorage để lần đẩy sau không xung đột', async () => {
		getSave.mockResolvedValue({ run: { currency: 123 }, revision: 42, updated_at: null })
		const order: string[] = []
		const { box, holder } = fakeRevision(0, order)

		const applied = await pullRun({
			revision: holder,
			writeRun: () => order.push('write'),
			rehydrate: async () => {
				order.push('rehydrate')
			},
		})

		expect(applied).toBe(true)
		expect(box.value).toBe(42)
		expect(order).toEqual(['revision', 'write', 'rehydrate'])
	})

	it('máy chủ chưa có bản lưu thì chỉ ghi revision, không ghi đè localStorage', async () => {
		getSave.mockResolvedValue({ run: null, revision: 7, updated_at: null })
		const writeRun = vi.fn()

		const applied = await pullRun({
			revision: fakeRevision(0).holder,
			writeRun,
			rehydrate: async () => {},
		})

		expect(applied).toBe(false)
		expect(writeRun).not.toHaveBeenCalled()
	})
})

describe('không đẩy lặp', () => {
	// Debounce là 1.5s nên dùng timer thật; `waitFor` không hợp với fake timers.
	const afterDebounce = () => new Promise((done) => setTimeout(done, 1700))

	it(
		'chỉ đẩy khi nội dung tiến trình thật sự đổi',
		async () => {
			putSave.mockResolvedValue({ run: null, revision: 16, updated_at: null })
			session.mockResolvedValue({
				authenticated: true,
				user: USER,
				available_providers: ['google'],
				auto_login: false,
			})
			// Máy đã có tiến trình ⇒ `AuthSync` không nạp bản máy chủ, chỉ đẩy lên.
			window.localStorage.setItem(
				'martial-cutie-save',
				JSON.stringify({ state: { run: { stage: 1 } }, version: 2 }),
			)

			render(
				<QueryClientProvider client={createQueryClient()}>
					<AuthSync />
				</QueryClientProvider>,
			)

			await afterDebounce()
			expect(putSave).toHaveBeenCalledTimes(1)

			// Đẩy xong mà không có gì đổi → không được gọi thêm.
			await afterDebounce()
			expect(putSave).toHaveBeenCalledTimes(1)

			// Đổi tiến trình thật → đẩy đúng một lần nữa.
			useGameStore.setState((state) => ({ run: { ...state.run, currency: state.run.currency + 1 } }))
			await afterDebounce()
			expect(putSave).toHaveBeenCalledTimes(2)

			// Rồi lại yên.
			await afterDebounce()
			expect(putSave).toHaveBeenCalledTimes(2)
		},
		// Bốn lần chờ debounce 1.7s nên cần hơn timeout mặc định 5s.
		20_000,
	)
})
