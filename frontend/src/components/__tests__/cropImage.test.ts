import { describe, expect, it } from 'vitest'
import { ART_SIZE, artOutputSize } from '../cropImage'

/**
 * The saved picture must have the **shape of the item's tile**: the game draws it stretched to the
 * footprint, so a square crop in a 1×3 tile is exactly what looked squeezed.
 */
describe('art output size', () => {
	it('follows the item footprint with the longest side at ART_SIZE', () => {
		expect(artOutputSize({ w: 1, h: 1 })).toEqual({ width: ART_SIZE, height: ART_SIZE })
		expect(artOutputSize({ w: 1, h: 3 })).toEqual({ width: 171, height: 512 })
		expect(artOutputSize({ w: 2, h: 3 })).toEqual({ width: 341, height: 512 })
		expect(artOutputSize({ w: 4, h: 1 })).toEqual({ width: 512, height: 128 })
		expect(artOutputSize({ w: 1, h: 5 })).toEqual({ width: 102, height: 512 })
	})

	it('keeps at least 128 px per cell, so a picture is crisp even on a 2× screen', () => {
		// A 4-column grid cell is ~60 CSS px → ~120 device px on HiDPI.
		for (let w = 1; w <= 4; w += 1) {
			for (let h = 1; h <= 5; h += 1) {
				const size = artOutputSize({ w, h })
				const scale = ART_SIZE / Math.max(w, h)
				expect(size.width / w, `${w}×${h} per-cell width`).toBeGreaterThanOrEqual(scale - 1)
				expect(Math.min(size.width / w, size.height / h), `${w}×${h} per-cell`).toBeGreaterThanOrEqual(100)
			}
		}
	})

	it('keeps every side inside what the server accepts (8–512 px)', () => {
		for (let w = 1; w <= 4; w += 1) {
			for (let h = 1; h <= 5; h += 1) {
				const size = artOutputSize({ w, h })
				expect(size.width, `${w}×${h} width`).toBeGreaterThanOrEqual(8)
				expect(size.width, `${w}×${h} width`).toBeLessThanOrEqual(512)
				expect(size.height, `${w}×${h} height`).toBeGreaterThanOrEqual(8)
				expect(size.height, `${w}×${h} height`).toBeLessThanOrEqual(512)
			}
		}
	})
})
