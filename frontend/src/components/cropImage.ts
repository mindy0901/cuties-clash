/**
 * Turn the area chosen in the cropper into a finished square PNG.
 *
 * ⚠️ All of it happens **in the browser**: the server only accepts a ready PNG (see
 * `backend/src/content.ts`). That keeps image processing out of the API and means the admin's
 * original file is never uploaded.
 *
 * ⚠️ Rotation is not free: `react-easy-crop` reports the crop area in the coordinates of the
 * **rotated** image, so the picture is first drawn rotated into a temporary canvas and the crop is
 * taken from that one. Drawing straight from the original with the reported area would cut a
 * slanted rectangle.
 */

/** Area of the source picture chosen in the cropper (in pixels of the rotated image). */
export interface CropArea {
	x: number
	y: number
	width: number
	height: number
}

/**
 * Longest side of the stored picture, in px.
 *
 * ⚠️ Sized for the **worst case on a HiDPI screen**: a 4-column grid cell is ~60 CSS px, so on a 2×
 * screen it is ~120 device px, and a 4-wide item gets `ART_SIZE / 4` = 128 px per cell. Cropping
 * smaller (256) left the picture stretched and soft.
 */
export const ART_SIZE = 512

/**
 * Output size for a picture of an item that covers `w`×`h` cells.
 *
 * ⚠️ The **aspect ratio follows the item's footprint**, because the tile is exactly that footprint:
 * a 1×3 sword gets a 85×256 picture, a 2×3 sabre 171×256, a jade 256×256. Cropping square and then
 * stretching it into a long tile is what made the art look squeezed.
 */
export function artOutputSize(space: { w: number; h: number }): { width: number; height: number } {
	const scale = ART_SIZE / Math.max(space.w, space.h)
	return { width: Math.max(1, Math.round(space.w * scale)), height: Math.max(1, Math.round(space.h * scale)) }
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
	const { rotation = 0, width = ART_SIZE, height = ART_SIZE } = options
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
	context.drawImage(
		source,
		Math.max(0, Math.min(area.x, sourceWidth - clampedWidth)),
		Math.max(0, Math.min(area.y, sourceHeight - clampedHeight)),
		clampedWidth,
		clampedHeight,
		0,
		0,
		width,
		height,
	)

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
	if (!blob) throw new Error('Không tạo được tệp PNG từ ảnh này.')
	return blob
}
