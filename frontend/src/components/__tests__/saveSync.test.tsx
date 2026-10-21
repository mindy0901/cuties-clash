// @vitest-environment jsdom
/**
 * Save synchronization with the server.
 *
 * Two bugs happened here before, both causing repeated 400s:
 * - On `revision_conflict`, loading the server save **on top** of the new change → conflicts again.
 * - Loading the server save and recording the revision **after** writing localStorage → the push
 *   right after uses a stale revision → conflict.
 *
 * The sync logic lives in `api/saveSync.ts` (pure, no React) so most tests call the functions
 * directly. Only "no repeated pushes" has to render `AuthSync`, because the `pushedRef` guard lives
 * inside an effect.
 */
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import type { RunState } from '../../game/types'

const getSave = vi.fn()
const putSave = vi.fn()
const session = vi.fn()
const logout = vi.fn()

vi.mock('../../api/client', async () => {
	const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client')
	return {
		...actual,
		// `pushRun` checks `instanceof ApiError`, so the real class must be kept.
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

/** Fake revision that records the order of calls so the sequence can be asserted. */
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
	it('sends the current revision and stores the new one', async () => {
		putSave.mockResolvedValue({ run: null, revision: 16, updated_at: null })
		const { box, holder } = fakeRevision(15)

		await pushRun({ stage: 5 }, holder)

		expect(putSave).toHaveBeenCalledTimes(1)
		expect(putSave.mock.calls[0][1]).toBe(15)
		expect(box.value).toBe(16)
	})

	it('on conflict, fetches the new revision and retries ONCE with its own data', async () => {
		putSave.mockRejectedValueOnce(conflict()).mockResolvedValueOnce({ run: null, revision: 18, updated_at: null })
		getSave.mockResolvedValue({ run: { stage: 99 }, revision: 17, updated_at: null })
		const { box, holder } = fakeRevision(15)

		await pushRun({ stage: 5 }, holder)

		expect(getSave).toHaveBeenCalledTimes(1)
		expect(putSave).toHaveBeenCalledTimes(2)
		// The resend uses the revision just fetched and still our own data (not overwritten).
		expect(putSave.mock.calls[1][0]).toEqual({ stage: 5 })
		expect(putSave.mock.calls[1][1]).toBe(17)
		expect(box.value).toBe(18)
	})

	it('throws when the retry after a conflict fails too, never retrying forever', async () => {
		putSave.mockRejectedValue(conflict())
		getSave.mockResolvedValue({ run: null, revision: 17, updated_at: null })

		await expect(pushRun({ stage: 5 }, fakeRevision(15).holder)).rejects.toThrow()

		expect(putSave).toHaveBeenCalledTimes(2)
	})

	it('a different error (not a conflict) is not retried', async () => {
		putSave.mockRejectedValue(new ApiError(500, 'boom', 'Máy chủ lỗi.'))

		await expect(pushRun({ stage: 5 }, fakeRevision(15).holder)).rejects.toThrow()

		expect(putSave).toHaveBeenCalledTimes(1)
		expect(getSave).not.toHaveBeenCalled()
	})
})

describe('pullRun', () => {
	it('records the revision BEFORE writing localStorage so the next push does not conflict', async () => {
		getSave.mockResolvedValue({ run: { gold: 123 }, revision: 42, updated_at: null })
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

	it('records only the revision when the server has no save yet, without overwriting localStorage', async () => {
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

describe('no repeated pushes', () => {	// The debounce is 1.5s so real timers are used; `waitFor` does not work with fake timers.
	const afterDebounce = () => new Promise((done) => setTimeout(done, 1700))

	it(
		'pushes only when the progress content really changed',
		async () => {
			putSave.mockResolvedValue({ run: null, revision: 16, updated_at: null })
			session.mockResolvedValue({
				authenticated: true,
				user: USER,
				available_providers: ['google'],
				auto_login: false,
			})
			// The device already has progress ⇒ `AuthSync` does not load the server save, it only pushes.
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

			// After the push, with nothing changed → no further calls.
			await afterDebounce()
			expect(putSave).toHaveBeenCalledTimes(1)

			// A real progress change → exactly one more push.
			useGameStore.setState((state) => ({ run: { ...state.run, gold: state.run.gold + 1 } }))
			await afterDebounce()
			expect(putSave).toHaveBeenCalledTimes(2)

			// Then quiet again.
			await afterDebounce()
			expect(putSave).toHaveBeenCalledTimes(2)
		},
		// Four 1.7s debounce waits need more than the default 5s timeout.
		20_000,
	)
})

/**
 * The save lives in the **browser**, but progress belongs to an **account**.
 *
 * Without the owner tag, signing in as a second account on the same browser pushed the first
 * player's run into it and silently replaced that account's own save (seen in the API log:
 * `PUT` 14 ms after the session, `400 revision_conflict`, `GET`, `PUT`).
 */
describe('account switching', () => {
	const SAVE_KEY = 'martial-cutie-save'
	const OWNER_KEY = 'martial-cutie-save-owner'
	const afterDebounce = () => new Promise((done) => setTimeout(done, 1700))

	const mount = () =>
		render(
			<QueryClientProvider client={createQueryClient()}>
				<AuthSync />
			</QueryClientProvider>,
		)

	function signInAs(id: number) {
		session.mockResolvedValue({
			authenticated: true,
			user: { ...USER, id },
			available_providers: ['google'],
			auto_login: false,
		})
	}

	/** Progress already on this machine, owned by `owner` (`null` = anonymous play). */
	function seedDevice(run: Partial<RunState>, owner: string | null) {
		useGameStore.setState((state) => ({ run: { ...state.run, ...run } }))
		if (owner) window.localStorage.setItem(OWNER_KEY, owner)
		else window.localStorage.removeItem(OWNER_KEY)
	}

	it(
		'lets anonymous progress follow the player into the account',
		async () => {
			seedDevice({ stage: 6, clearedStage: 5 }, null)
			signInAs(9)
			putSave.mockResolvedValue({ run: null, revision: 1, updated_at: null })

			mount()
			await afterDebounce()

			expect(getSave).not.toHaveBeenCalled()
			expect(putSave).toHaveBeenCalledTimes(1)
			expect(putSave.mock.calls[0][0]).toMatchObject({ stage: 6, clearedStage: 5 })
			expect(window.localStorage.getItem(OWNER_KEY)).toBe('u:9')
		},
		20_000,
	)

	it(
		'keeps the run of the account that is signing back in',
		async () => {
			seedDevice({ stage: 6, clearedStage: 5 }, 'u:7')
			signInAs(7)
			putSave.mockResolvedValue({ run: null, revision: 2, updated_at: null })

			mount()
			await afterDebounce()

			expect(getSave).not.toHaveBeenCalled()
			expect(putSave).toHaveBeenCalledTimes(1)
			expect(putSave.mock.calls[0][0]).toMatchObject({ stage: 6 })
		},
		20_000,
	)

	it(
		"loads the account's own save instead of the run of another account",
		async () => {
			seedDevice({ stage: 6, clearedStage: 5, gold: 999 }, 'u:7')
			signInAs(9)
			getSave.mockResolvedValue({ run: { stage: 42, clearedStage: 41 }, revision: 5, updated_at: null })

			mount()
			await waitFor(() => expect(useGameStore.getState().run.stage).toBe(42))
			await afterDebounce()

			expect(getSave).toHaveBeenCalledTimes(1)
			// The other account's progress was never uploaded into this one.
			expect(putSave).not.toHaveBeenCalled()
			expect(window.localStorage.getItem(OWNER_KEY)).toBe('u:9')
		},
		20_000,
	)

	it(
		'starts a fresh run for a new account instead of inheriting another run',
		async () => {
			seedDevice({ stage: 6, clearedStage: 5, gold: 999 }, 'u:7')
			signInAs(9)
			getSave.mockResolvedValue({ run: null, revision: 0, updated_at: null })

			mount()
			await waitFor(() => expect(useGameStore.getState().run.clearedStage).toBe(0))
			await afterDebounce()

			expect(useGameStore.getState().run.stage).toBe(1)
			expect(useGameStore.getState().run.gold).toBe(12)
			expect(putSave).not.toHaveBeenCalled()
			expect(window.localStorage.getItem(OWNER_KEY)).toBe('u:9')
		},
		20_000,
	)

	it(
		"takes the account's save on a device with no progress",
		async () => {
			window.localStorage.removeItem(SAVE_KEY)
			signInAs(9)
			const blade = { uid: 'a', templateId: 'wooden-blade', star: 1, slot: 0, paid: 10 }
			getSave.mockResolvedValue({ run: { stage: 42, clearedStage: 41, equipped: [blade] }, revision: 5, updated_at: null })

			mount()
			await waitFor(() => expect(useGameStore.getState().run.stage).toBe(42))
			await afterDebounce()

			// A current save must NOT be pushed through the v1 migration, which empties the bag.
			expect(useGameStore.getState().run.equipped).toHaveLength(1)
			expect(putSave).not.toHaveBeenCalled()
			expect(window.localStorage.getItem(OWNER_KEY)).toBe('u:9')
		},
		20_000,
	)
})
