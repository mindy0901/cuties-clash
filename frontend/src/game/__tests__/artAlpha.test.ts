import { describe, expect, it } from 'vitest'

/**
 * Ảnh art phải **có kênh alpha** (PNG color type 6 = RGBA).
 *
 * Vì sao test này tồn tại: pack Wuxia ghi "transparent background" nhưng 31 file thực
 * tế là ảnh **đen đục**. Đưa vào game thì món đồ hiện thành khối đen, món dài (thương
 * 4×1) thành khối đen méo. Nhìn code không thấy được — phải đọc header file PNG.
 *
 * Kiểm tra color type là **bất biến cấu trúc**: PNG không có kênh alpha thì trình duyệt
 * luôn vẽ nền đen, không phụ thuộc nội dung ảnh. Đây là thứ đã sai và sẽ bị bắt ngay.
 *
 * Không dùng được `node:fs`/`node:zlib` vì `tsconfig.app.json` chỉ có type của Vite,
 * nên đọc file qua `import.meta.glob(..., { query: '?raw' })`.
 */
const RAW = import.meta.glob('../../../public/icons/**/*.png', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>

/**
 * Đọc header PNG: trả { isPng, width, height, bitDepth, colorType }.
 *
 * ⚠️ Byte đầu của chữ ký PNG là `0x89` — **không phải UTF-8 hợp lệ**, nên khi Vite đọc
 * file bằng `?raw` nó bị thay bằng ký tự thay thế. Vì vậy chỉ kiểm tra 3 byte `PNG`
 * (và độ dài), không kiểm tra `0x89`.
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

describe('art có kênh alpha', () => {
	it('có đủ ảnh để kiểm tra', () => {
		expect(files.length).toBeGreaterThan(100)
	})

	it.each(files)('%s là PNG 8-bit RGBA', (_label, key) => {
		const header = readHeader(RAW[key])
		expect(header.isPng, 'phải là file PNG').toBe(true)
		expect(header.bitDepth, 'phải là 8-bit').toBe(8)
		expect(
			header.colorType,
			'phải là RGBA (6) — color type 2 (RGB) không có alpha nên sẽ hiện nền đen',
		).toBe(6)
	})

	it('ảnh vuông và không quá lớn (đủ nét khi hiển thị trong ô lưới)', () => {
		for (const [label, key] of files) {
			const header = readHeader(RAW[key])
			expect(header.width, `${label} phải vuông`).toBe(header.height)
			expect(header.width, `${label} không nhỏ hơn 48px`).toBeGreaterThanOrEqual(48)
		}
	})
})
