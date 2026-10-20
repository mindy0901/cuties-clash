import { describe, expect, it } from 'vitest'

/**
 * Art images must **have an alpha channel** (PNG color type 6 = RGBA).
 *
 * Why this test exists: the Wuxia pack claims a "transparent background" but 31 files are actually
 * **solid black** images. Inside the game an item then shows up as a black block, and a long item (a
 * 4×1 spear) as a skewed black block. Looking at the code does not reveal it — the PNG header has to
 * be read.
 *
 * Checking the color type is a **structural invariant**: without an alpha channel the browser always
 * paints a black background, no matter what the image contains. That is what went wrong, and it is
 * caught immediately now.
 *
 * `node:fs`/`node:zlib` cannot be used because `tsconfig.app.json` only has the Vite types, so the
 * files are read through `import.meta.glob(..., { query: '?raw' })`.
 */
const RAW = import.meta.glob('../../../public/icons/**/*.png', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>

/**
 * Read the PNG header: returns { isPng, width, height, bitDepth, colorType }.
 *
 * ⚠️ The first byte of the PNG signature is `0x89` — **not valid UTF-8**, so Vite replaces it with a
 * replacement character when reading the file through `?raw`. That is why only the 3 `PNG` bytes (and
 * the length) are checked, never `0x89`.
 */
function readHeader(binary: string) {
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0) & 0xff)
	return {
		isPng: bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
		width: (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19],
		height: (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23],
		bitDepth: bytes[24],
		colorType: bytes[25],
	}
}

const files = Object.keys(RAW).map((key) => [key.replace(/^.*\/icons\//, ''), key] as const)

describe('art has an alpha channel', () => {
	it('has enough images to check', () => {
		// One art per item (27) plus cutie and skill art — the count dropped when the per-star item
		// variants were removed on purpose.
		expect(files.length).toBeGreaterThan(20)
	})

	it.each(files)('%s is an 8-bit RGBA PNG', (_label, key) => {
		const header = readHeader(RAW[key])
		expect(header.isPng, 'must be a PNG file').toBe(true)
		expect(header.bitDepth, 'must be 8-bit').toBe(8)
		expect(
			header.colorType,
			'must be RGBA (6) — color type 2 (RGB) has no alpha and would paint a black background',
		).toBe(6)
	})

	it('images are square and not too large (still crisp inside a grid cell)', () => {
		for (const [label, key] of files) {
			const header = readHeader(RAW[key])
			expect(header.width, `${label} must be square`).toBe(header.height)
			expect(header.width, `${label} must not be smaller than 48px`).toBeGreaterThanOrEqual(48)
		}
	})
})
