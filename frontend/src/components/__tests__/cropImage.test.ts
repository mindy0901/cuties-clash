import { describe, expect, it } from 'vitest'
import { ART_LONG_SIDE, ART_SHORT_SIDE, artOutputSize } from '../cropImage'

/**
 * The saved picture must have the **shape of the item's tile**: the game draws it stretched to the
 * footprint, so a square crop in a 1×3 tile is exactly what looked squeezed.
 *
 * Resolution is **Full HD portrait**: the admin uploads photography and may re-crop later, so the long side
 * goes to 1920 px while a square item stays at 1080 (see `ART_SHORT_SIDE`).
 */
describe('art output size', () => {
	it('follows the item footprint at Full HD', () => {
		expect(artOutputSize({ w: 1, h: 1 })).toEqual({ width: 1080, height: 1080 })
		expect(artOutputSize({ w: 1, h: 3 })).toEqual({ width: 640, height: 1920 })
		expect(artOutputSize({ w: 2, h: 3 })).toEqual({ width: 1080, height: 1620 })
		expect(artOutputSize({ w: 4, h: 1 })).toEqual({ width: 1920, height: 480 })
		expect(artOutputSize({ w: 1, h: 5 })).toEqual({ width: 384, height: 1920 })
	})

	it('keeps the long side at 1920 and the short side at or below 1080', () => {
		for (let w = 1; w <= 4; w += 1) {
			for (let h = 1; h <= 5; h += 1) {
				const size = artOutputSize({ w, h })
				const long = Math.max(size.width, size.height)
				const short = Math.min(size.width, size.height)
				// A bound is always reached — either the long side hits 1920 or the short side hits 1080 —
				// so no footprint comes out squashed or oversized.
				expect(long === ART_LONG_SIDE || short === ART_SHORT_SIDE, `${w}×${h} hits a bound`).toBe(true)
				expect(long, `${w}×${h} long side`).toBeLessThanOrEqual(ART_LONG_SIDE)
				expect(short, `${w}×${h} short side`).toBeLessThanOrEqual(ART_SHORT_SIDE)
				// The aspect ratio is the footprint's own, to within a rounding pixel.
				expect(Math.abs(size.width / size.height - w / h), `${w}×${h} aspect`).toBeLessThan(0.01)
			}
		}
	})

	it('stays inside what the server accepts (8–1920 px)', () => {
		for (let w = 1; w <= 4; w += 1) {
			for (let h = 1; h <= 5; h += 1) {
				const size = artOutputSize({ w, h })
				expect(size.width, `${w}×${h} width`).toBeGreaterThanOrEqual(8)
				expect(size.width, `${w}×${h} width`).toBeLessThanOrEqual(1920)
				expect(size.height, `${w}×${h} height`).toBeGreaterThanOrEqual(8)
				expect(size.height, `${w}×${h} height`).toBeLessThanOrEqual(1920)
			}
		}
	})
})
