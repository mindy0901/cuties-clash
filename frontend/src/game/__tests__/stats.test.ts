import { describe, expect, it } from 'vitest'
import { formatStat, statNumber } from '../stats'

describe('stat read-out', () => {
	it('keeps small percentages instead of rounding them away', () => {
		// An admin can set `0.2` % damage reduction; rounding printed `+0%`, so the item looked dead.
		expect(formatStat('dr', 0.2)).toBe('+0.2%')
		expect(formatStat('critRate', 12.5)).toBe('+12.5%')
		expect(formatStat('dr', 3)).toBe('+3%')
	})

	it('prints a flat amount without a needless decimal tail', () => {
		expect(formatStat('atk', 30)).toBe('+30')
		expect(formatStat('maxHp', 240.004)).toBe('+240')
		expect(statNumber(0.2)).toBe('0.2')
	})
})
