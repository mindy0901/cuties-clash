// @vitest-environment jsdom
/**
 * The **jade trigger flash** — a jade item's tile lights up when one of its kits fires.
 *
 * The game side is what makes it possible: `BattleEvent.triggerUid` names the item whose kit caused the
 * event (a support gem's retaliate freeze, a gem's shield, a cooldown buff), which a `sourceUid` pointing at
 * the affected weapon cannot express. This file pins the view half: the tile draws the overlay, and a new
 * trigger **remounts** it so the CSS animation restarts instead of being swallowed by the running one.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LoadoutGrid } from '../LoadoutGrid'
import { createItemInstance } from '../../game/bag'
import { combatItemUid } from '../../game/build'
import { useGameStore } from '../../store/gameStore'
import { installRetiredItems } from '../../test/retiredItems'

const OVERLAY = '[data-jade-trigger]'

beforeEach(() => {
	installRetiredItems()
	useGameStore.getState().newRun()
})

afterEach(cleanup)

function board(triggers: Record<string, number>) {
	const item = createItemInstance('jade-guard', 1, 'gem', 0)
	const { container, rerender } = render(
		<LoadoutGrid rows={4} items={[item]} jadeTriggers={triggers} />,
	)
	const uid = combatItemUid(item.templateId, item.slot)
	return {
		uid,
		overlay: () => container.querySelector<HTMLElement>(OVERLAY),
		rerender: (next: Record<string, number>) =>
			rerender(<LoadoutGrid rows={4} items={[item]} jadeTriggers={next} />),
	}
}

describe('a jade item firing', () => {
	it('lights its own tile and leaves the other tiles alone', () => {
		const item = createItemInstance('jade-guard', 1, 'gem', 0)
		const uid = combatItemUid(item.templateId, item.slot)
		const { container } = render(
			<LoadoutGrid rows={4} items={[item]} jadeTriggers={{ [uid]: 1 }} />,
		)

		const overlay = container.querySelector<HTMLElement>(OVERLAY)
		expect(overlay, 'the gem flashes').toBeTruthy()
		expect(overlay?.getAttribute('data-jade-trigger')).toBe(uid)
		expect(overlay?.className, 'the animation is a CSS utility, not an inline style').toContain(
			'animate-jade-trigger',
		)
		// It must never intercept a click: the tile below still opens its details.
		expect(overlay?.className).toContain('pointer-events-none')
	})

	it('draws nothing for a tile that did not fire', () => {
		const { container } = render(<LoadoutGrid rows={4} items={[]} />)
		expect(container.querySelector(OVERLAY)).toBeNull()
	})

	it('restarts the animation when the same gem fires again', () => {
		const board1 = board({})
		expect(board1.overlay(), 'nothing before the first trigger').toBeNull()

		board1.rerender({ [board1.uid]: 7 })
		const first = board1.overlay()
		expect(first).toBeTruthy()

		board1.rerender({ [board1.uid]: 8 })
		const second = board1.overlay()
		expect(second).toBeTruthy()
		// A fresh node (`key` = the flash counter), so the keyframes run from the start again.
		expect(second).not.toBe(first)
	})
})
