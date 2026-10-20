/**
 * Turn the area chosen in the cropper into a finished PNG shaped like the item's footprint.
 *
 * ⚠️ All of it happens **in the browser**: the server only accepts a ready PNG (see
 * `backend/src/content.ts`), and the admin's original file is never uploaded.
 *
 * ⚠️ Rotation is not free: `react-easy-crop` reports the crop area in the coordinates of the
 * **rotated** image, so the picture is first drawn rotated into a temporary canvas and the crop is
 * taken from that one. Drawing straight from the original would cut a slanted rectangle.
 */

/** Area of the source picture chosen in the cropper (in pixels of the rotated image). */
export interface CropArea {
	x: number
	y: number
	width: number
	height: number
}

/**
 * Longest side of the stored picture, in px — **Full HD portrait**.
 *
 * The admin uploads photography (typically 1080×1920) and crops it here, so the stored PNG keeps that
 * resolution instead of being flattened to 512 px: the art is shown on HiDPI screens and can be re-cropped
 * later, and a 512 px file leaves no room. `ART_SHORT_SIDE` stops a square icon from becoming 1920×1920.
 */
export const ART_LONG_SIDE = 1920
/** Shortest side of the stored picture, in px — a square item comes out 1080×1080. */
export const ART_SHORT_SIDE = 1080

/**
 * Output size for a picture of an item that covers `w`×`h` cells: **the item's own aspect ratio**,
 * long side `ART_LONG_SIDE`, short side never above `ART_SHORT_SIDE`
 * (1×3 → 640×1920, 2×3 → 1080×1620, 1×1 → 1080×1080, 4×1 → 1920×480).
 */
export function artOutputSize(space: { w: number; h: number }): { width: number; height: number } {
	const long = Math.max(space.w, space.h)
	const short = Math.min(space.w, space.h)
	const unit = Math.min(ART_LONG_SIDE / long, ART_SHORT_SIDE / short)
	return { width: Math.max(1, Math.round(space.w * unit)), height: Math.max(1, Math.round(space.h * unit)) }
}

/** Load an image element from an object URL (or a normal URL). */
export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error('Không đọc được ảnh này.'))
		image.src = src
	})
}

/** Bounding box of an image after rotating it by `radians`. */
function rotatedBounds(width: number, height: number, radians: number) {
	const cos = Math.abs(Math.cos(radians))
	const sin = Math.abs(Math.sin(radians))
	return { width: width * cos + height * sin, height: width * sin + height * cos }
}

/**
 * Crop `source` and scale it into `width`×`height`, **halving in steps** when the source is much larger.
 *
 * ⚠️ A single `drawImage` from a 1080×1920 photo down to 640×1920 samples too few pixels and produces
 * jaggies; two or three halvings keep the edges clean. `imageSmoothingQuality = 'high'` alone does not fix
 * a 3× reduction in one go.
 */
function drawScaled(
	context: CanvasRenderingContext2D,
	source: CanvasImageSource,
	sx: number,
	sy: number,
	sw: number,
	sh: number,
	width: number,
	height: number,
): void {
	let current: CanvasImageSource = source
	let currentWidth = sw
	let currentHeight = sh
	if (sw > width * 2 || sh > height * 2) {
		let buffer = document.createElement('canvas')
		buffer.width = Math.max(1, Math.round(sw))
		buffer.height = Math.max(1, Math.round(sh))
		const bufferContext = buffer.getContext('2d')
		if (bufferContext) {
			bufferContext.imageSmoothingEnabled = true
			bufferContext.imageSmoothingQuality = 'high'
			bufferContext.drawImage(source, sx, sy, sw, sh, 0, 0, buffer.width, buffer.height)
			current = buffer
			currentWidth = buffer.width
			currentHeight = buffer.height
			while (currentWidth / 2 >= width && currentHeight / 2 >= height) {
				buffer = document.createElement('canvas')
				buffer.width = Math.max(1, Math.floor(currentWidth / 2))
				buffer.height = Math.max(1, Math.floor(currentHeight / 2))
				const next = buffer.getContext('2d')
				if (!next) break
				next.imageSmoothingEnabled = true
				next.imageSmoothingQuality = 'high'
				next.drawImage(current, 0, 0, currentWidth, currentHeight, 0, 0, buffer.width, buffer.height)
				current = buffer
				currentWidth = buffer.width
				currentHeight = buffer.height
			}
			context.drawImage(current, 0, 0, currentWidth, currentHeight, 0, 0, width, height)
			return
		}
	}
	context.drawImage(current, sx, sy, sw, sh, 0, 0, width, height)
}

/**
 * Draw `area` of `src` (optionally rotated) onto a transparent canvas of the given size → PNG blob.
 *
 * The canvas starts empty, so the picture's own transparency is kept: a PNG with an alpha channel
 * stays clean instead of getting a black or white backdrop. `artAlpha.test.ts` guards the bundled
 * files; this keeps the imported ones just as usable.
 */
export async function croppedPng(
	src: string,
	area: CropArea,
	options: { rotation?: number; width?: number; height?: number } = {},
): Promise<Blob> {
	const { rotation = 0, width = ART_SHORT_SIDE, height = ART_SHORT_SIDE } = options
	const image = await loadImage(src)
	const radians = (rotation * Math.PI) / 180

	// 1. The source to crop from: the picture itself, or a rotated copy of it.
	let source: CanvasImageSource = image
	let sourceWidth = image.naturalWidth || image.width
	let sourceHeight = image.naturalHeight || image.height
	if (rotation % 360 !== 0) {
		const bounds = rotatedBounds(sourceWidth, sourceHeight, radians)
		const rotated = document.createElement('canvas')
		rotated.width = Math.round(bounds.width)
		rotated.height = Math.round(bounds.height)
		const rotatedContext = rotated.getContext('2d')
		if (!rotatedContext) throw new Error('Trình duyệt không hỗ trợ canvas.')
		rotatedContext.translate(rotated.width / 2, rotated.height / 2)
		rotatedContext.rotate(radians)
		rotatedContext.drawImage(image, -sourceWidth / 2, -sourceHeight / 2)
		source = rotated
		sourceWidth = rotated.width
		sourceHeight = rotated.height
	}

	// 2. Crop + scale into the final canvas (its shape follows the item's footprint).
	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	const context = canvas.getContext('2d')
	if (!context) throw new Error('Trình duyệt không hỗ trợ canvas.')
	context.imageSmoothingEnabled = true
	context.imageSmoothingQuality = 'high'

	// A crop area can stick out by a pixel after rounding the rotation — clamp it instead of
	// letting the browser draw a transparent edge.
	const clampedWidth = Math.min(area.width, sourceWidth)
	const clampedHeight = Math.min(area.height, sourceHeight)
	drawScaled(
		context,
		source,
		Math.max(0, Math.min(area.x, sourceWidth - clampedWidth)),
		Math.max(0, Math.min(area.y, sourceHeight - clampedHeight)),
		clampedWidth,
		clampedHeight,
		width,
		height,
	)

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
	if (!blob) throw new Error('Không tạo được tệp PNG từ ảnh này.')
	return blob
}