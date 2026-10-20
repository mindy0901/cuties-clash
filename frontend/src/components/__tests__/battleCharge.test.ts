import { describe, expect, it } from 'vitest'
import { frozenShift, pausedAttackTimes, weaponChargeAt, weaponChargeState } from '../battleCharge'

describe('weaponChargeAt', () => {
	it('fills steadily toward the next simulated attack', () => {
		expect(weaponChargeAt([1000, 2000], 0, 1000, 120)).toBe(0)
		expect(weaponChargeAt([1000, 2000], 500, 1000, 120)).toBe(50)
		expect(weaponChargeAt([1000, 2000], 900, 1000, 120)).toBe(90)
	})

	it('flashes full at each attack and resets into the next cycle', () => {
		expect(weaponChargeAt([1000, 2000], 1000, 1000, 120)).toBe(100)
		expect(weaponChargeAt([1000, 2000], 1100, 1000, 120)).toBe(100)
		expect(weaponChargeAt([1000, 2000], 1120, 1000, 120)).toBe(100)
		expect(weaponChargeAt([1000, 2000], 1240, 1000, 120)).toBe(0)
		expect(weaponChargeAt([1000, 2000], 1360, 1000, 120)).toBeGreaterThan(0)
	})

	it('continues charging at the item attack speed after its last recorded attack', () => {
		expect(weaponChargeAt([1000], 1500, 1000, 120)).toBe(34)
	})

	it('opens a new cycle when the bar resets, so it rises again instead of sliding down', () => {
		// Full-pulse frames still belong to the cycle that fired…
		expect(weaponChargeState([1000, 2000], 1000, 1000, 120).cycle).toBe(0)
		expect(weaponChargeState([1000, 2000], 1100, 1000, 120).cycle).toBe(0)
		// …and the very frame the bar leaves 100 % is already the **next** cycle, at zero. Keeping the old
		// key here is what animated the full line sliding back down.
		const reset = weaponChargeState([1000, 2000], 1130, 1000, 120)
		expect(reset.cycle).toBe(1)
		expect(reset.percent).toBe(0)
		expect(weaponChargeState([1000, 2000], 1360, 1000, 120).cycle).toBe(1)
	})
})

describe('a frozen weapon does not charge', () => {
	// Attack at 1000, next at 5000, one freeze in the middle: 2000 → 3000.
	const windows = [{ start: 2000, duration: 1000 }]
	const times = pausedAttackTimes([1000, 5000], windows)
	const chargeAt = (elapsed: number) =>
		weaponChargeState(times, elapsed - frozenShift(windows, elapsed), 4000, 120).percent

	it('pauses the bar where it stood for the whole freeze', () => {
		const atFreezeStart = chargeAt(2000)
		expect(atFreezeStart).toBeGreaterThan(0)
		// Mid-freeze the bar has not moved at all, and it is not creeping toward the next attack either.
		expect(chargeAt(2500)).toBe(atFreezeStart)
		expect(chargeAt(3000)).toBe(atFreezeStart)
	})

	it('resumes from the same point once the ice melts', () => {
		expect(chargeAt(4000)).toBeGreaterThan(chargeAt(3000))
		// The frozen span is skipped, so the cycles stay aligned with the real attack times.
		expect(frozenShift(windows, 3500)).toBe(1000)
		expect(pausedAttackTimes([5000], windows)).toEqual([4000])
	})

	it('counts several freezes in a row', () => {
		const twice = [
			{ start: 1000, duration: 500 },
			{ start: 4000, duration: 500 },
		]
		expect(frozenShift(twice, 3000)).toBe(500)
		expect(frozenShift(twice, 4500)).toBe(1000)
	})
})
