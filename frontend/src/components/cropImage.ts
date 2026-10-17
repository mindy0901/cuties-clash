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

/** Side of the stored picture, in px. Square, and well above the size a grid cell can show. */
export const ART_SIZE = 256

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
 * Draw `area` of `src` (optionally rotated) onto a transparent `size`×`size` canvas → PNG blob.
 *
 * The canvas starts empty, so the picture's own transparency is kept: a PNG with an alpha channel
 * stays clean instead of getting a black or white backdrop. `artAlpha.test.ts` guards the bundled
 * files; this keeps the imported ones just as usable.
 */
export async function croppedPng(
	src: string,
	area: CropArea,
	options: { rotation?: number; size?: number } = {},
): Promise<Blob> {
	const { rotation = 0, size = ART_SIZE } = options
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

	// 2. Crop + scale into the final square canvas.
	const canvas = document.createElement('canvas')
	canvas.width = size
	canvas.height = size
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
		size,
		size,
	)

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
	if (!blob) throw new Error('Không tạo được tệp PNG từ ảnh này.')
	return blob
}
