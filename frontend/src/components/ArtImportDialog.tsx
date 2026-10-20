import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import type { Star } from '../game/types'
import { ArtPreview } from './ArtPreview'
import { AvatarCard } from './AvatarCard'
import { artOutputSize, croppedPng, loadImage } from './cropImage'
import { ImagePlus } from './icons'
import { CutiePortrait } from './CutiePortrait'
import { cn, dialogClass, hintClass, overlayClass, rowClass } from './ui'
import { Button } from './ui/button'
import { translate } from '../i18n'

/** Largest file accepted straight from the admin's disk (before cropping). */
const MAX_SOURCE_BYTES = 10 * 1024 * 1024
/** The crop frame is laid out inside these bounds; its shape always follows the item's footprint. */
const FRAME_MAX_WIDTH = 520
const FRAME_MAX_HEIGHT = 380
/** Checkerboard behind the picture, so a transparent PNG is readable while cropping. */
const CHECKER = 'repeating-conic-gradient(rgb(255 255 255 / 7%) 0% 25%, transparent 0% 50%) 50% / 16px 16px'

export interface ArtImportDialogProps {
	/** Human name of the item/cutie, shown in the title. */
	entityName: string
	/** Which entity this picture is for — the preview draws the real tile / cutie cell. */
	kind: 'item' | 'cutie'
	entityId: string
	/** Star rank to preview at (only changes the star colour). */
	star: Star
	/** Footprint in cells — the crop frame and the saved picture use exactly this aspect ratio. */
	space: { w: number; h: number }
	/** Called with the finished PNG. Resolving closes the dialog. */
	onSave: (png: Blob) => Promise<void>
	onCancel: () => void
}

/** Keep a rotation inside (−180°, 180°] so the slider and the read-out always agree. */
function wrapDegrees(value: number): number {
	const wrapped = ((value + 180) % 360 + 360) % 360 - 180
	return wrapped === -180 ? 180 : wrapped
}

/**
 * Pick a picture, crop it to the item's own grid shape, upload it.
 *
 * ⚠️ Only the cropped PNG leaves the browser — never the original file. The preview is drawn through
 * the **real** tile (`ArtPreview`), so it shows exactly what lands in the shop and the loadout grid.
 *
 * 🔴 The file input is **hidden and opened programmatically** (`input.click()` from a button), not a
 * `<label>` wrapping a clipped input: forwarding a label click into a `sr-only` input silently did
 * nothing in some browsers — "bấm vào không mở được hộp chọn ảnh". Drag-and-drop and Ctrl+V go through
 * the same handler, so there are three ways in and only one place that reads the file.
 */
export function ArtImportDialog({
	entityName,
	kind,
	entityId,
	star,
	// Defaulted so a caller that forgets `space` cannot crash the dialog (a crash here is a blank page).
	space = { w: 1, h: 1 },
	onSave,
	onCancel,
}: ArtImportDialogProps) {
	const output = artOutputSize(space)
	const aspect = space.w / space.h
	const [source, setSource] = useState<{ url: string; name: string; width: number; height: number } | null>(null)
	const [crop, setCrop] = useState({ x: 0, y: 0 })
	const [zoom, setZoom] = useState(1)
	const [rotation, setRotation] = useState(0)
	const [area, setArea] = useState<Area | null>(null)
	const [preview, setPreview] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [dragging, setDragging] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const objectUrl = useRef<string | null>(null)
	const previewUrl = useRef<string | null>(null)
	const fileInput = useRef<HTMLInputElement | null>(null)

	/**
	 * The crop frame, in CSS px: its **shape is the item's footprint**, so what the operator sees is
	 * exactly the picture that gets saved — no distortion, no guessing where the edges land.
	 */
	const frame = useMemo(() => {
		const height = Math.min(FRAME_MAX_HEIGHT, Math.round(FRAME_MAX_WIDTH / aspect))
		const width = Math.round(height * aspect)
		return { width: Math.max(60, width), height: Math.max(60, height) }
	}, [aspect])

	// Object URLs keep the file in memory until they are revoked.
	useEffect(
		() => () => {
			if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
			if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
		},
		[],
	)

	const onPick = useCallback(async (file: File | undefined) => {
		if (!file) return
		if (!file.type.startsWith('image/')) {
			setError(translate("Choose an image file (png, jpg, webp)."))
			return
		}
		if (file.size > MAX_SOURCE_BYTES) {
			setError(
				translate("That image is too large ({size} MB). The limit is 10 MB.", {
					size: Math.round(file.size / 1024 / 1024),
				}),
			)
			return
		}
		if (typeof URL.createObjectURL !== 'function') {
			setError(translate("This browser cannot read the chosen image."))
			return
		}
		if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
		const url = URL.createObjectURL(file)
		objectUrl.current = url
		let size = { width: 0, height: 0 }
		try {
			const image = await loadImage(url)
			size = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }
		} catch {
			// A file the browser cannot decode is reported by the cropper/preview instead.
		}
		setSource({ url, name: file.name, ...size })
		setRotation(0)
		setZoom(1)
		setCrop({ x: 0, y: 0 })
		setArea(null)
		setError(null)
	}, [])

	/** Open the OS file picker. The button, the drop zone and Ctrl+V all end up here. */
	const pickFile = () => fileInput.current?.click()

	const onDropFiles = (event: React.DragEvent) => {
		event.preventDefault()
		setDragging(false)
		void onPick(event.dataTransfer.files?.[0])
	}

	/** Ctrl+V of a copied image is the fastest way in, and costs nothing to support. */
	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			const file = [...(event.clipboardData?.files ?? [])].find((entry) => entry.type.startsWith('image/'))
			if (!file) return
			event.preventDefault()
			void onPick(file)
		}
		window.addEventListener('paste', onPaste)
		return () => window.removeEventListener('paste', onPaste)
	}, [onPick])

	/**
	 * Live preview: crop into a throw-away canvas shortly after the drag/zoom settles.
	 *
	 * Debounced because `onCropComplete` fires on every mouse move — re-cropping on each frame would
	 * make dragging stutter.
	 */
	useEffect(() => {
		if (!source || !area) return
		const timer = setTimeout(() => {
			void (async () => {
				try {
					const png = await croppedPng(source.url, area, { rotation, width: output.width, height: output.height })
					if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
					const url = URL.createObjectURL(png)
					previewUrl.current = url
					setPreview(url)
				} catch {
					// No canvas (jsdom) or a broken file — the preview simply does not update.
				}
			})()
		}, 140)
		return () => clearTimeout(timer)
	}, [source, area, rotation, output.width, output.height])

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !busy) onCancel()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onCancel, busy])

	const turn = (delta: number) => setRotation((value) => wrapDegrees(value + delta))

	const onConfirm = async () => {
		if (!source || !area) return
		setBusy(true)
		setError(null)
		try {
			const png = await croppedPng(source.url, area, {
				rotation,
				width: output.width,
				height: output.height,
			})
			await onSave(png)
		} catch (caught) {
			setError(caught instanceof Error ? translate(caught.message) : translate("Could not save the image."))
		} finally {
			setBusy(false)
		}
	}

	// A crop area smaller than the stored picture is upscaled; say so instead of letting it look soft later.
	const tooSmall = Boolean(area && (area.width < output.width || area.height < output.height))

	return (
		<div className={overlayClass} onClick={() => (busy ? undefined : onCancel())}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={translate("Upload art for {name}", { name: translate(entityName) })}
				data-art-import
				className={cn(dialogClass, 'max-h-[92vh] w-[min(680px,100%)] overflow-y-auto')}
				onClick={(event) => event.stopPropagation()}
				onDragOver={(event) => {
					event.preventDefault()
					setDragging(true)
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={onDropFiles}
			>
				<h2 className="text-[20px]">{translate("Upload art for “{name}”", { name: translate(entityName) })}</h2>
				<p className={hintClass}>
					{kind === 'item' ? (
						translate("The crop frame matches the item footprint ({width}×{height} cells) and the file is saved at {outWidth}×{outHeight} px.", {
							width: space.w,
							height: space.h,
							outWidth: output.width,
							outHeight: output.height,
						})
					) : (
						translate(
							"A cutie uses a 1:1 crop ({outWidth}×{outHeight} px): the picture fills both the round avatar ring and the taller battle frame, so the sides are trimmed.",
							{ outWidth: output.width, outHeight: output.height },
						)
					)}
				</p>

				{/* One hidden input feeds every entry point: the button, drag-drop and paste. */}
				<input
					ref={fileInput}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					data-art-file
					className="hidden"
					onChange={(event) => {
						void onPick(event.target.files?.[0])
						event.target.value = ''
					}}
				/>

				{source ? (
					<div
						data-art-crop
						className="relative mx-auto overflow-hidden rounded-[12px] border border-line bg-black/60"
						style={{
							/* The container is **exactly the crop box**: with a wider container the image gets scaled to
							   cover the container and the crop box only captures a fraction of it, so a 1080 px photo
							   was silently upscaled. Same width ⇒ 1:1 mapping ⇒ what you see is the saved pixels. */
							width: `${frame.width}px`,
							height: `${frame.height}px`,
							backgroundImage: CHECKER,
						}}
					>
						<Cropper
							image={source.url}
							crop={crop}
							zoom={zoom}
							rotation={rotation}
							aspect={aspect}
							/* The frame is passed explicitly, so it is exactly `frame` px and is never rounded off by
							   the container's own measurements. */
							cropSize={{ width: frame.width, height: frame.height }}
							objectFit="cover"
							showGrid
							restrictPosition={false}
							onCropChange={setCrop}
							onZoomChange={setZoom}
							onRotationChange={setRotation}
							onCropComplete={(_area, areaPixels) => setArea(areaPixels)}
							/* Zooming **out** below 1 stays available for an image that must be seen whole (a square
							   icon in a 1×3 frame); the checkerboard shows what is background, so nothing sneaks in
							   unnoticed. `cover` at 100 % is what keeps the crop free of transparent padding — with
							   `contain` a tall photo was fitted to the frame's height and the square crop box reached
							   past its sides, so the saved picture came out mostly empty. */
							minZoom={0.5}
						/>
					</div>
				) : (
					<button
						type="button"
						data-art-pick
						onClick={pickFile}
						className={cn(
							'flex flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed p-8 text-center transition-colors duration-100',
							dragging ? 'border-gold bg-gold/10' : 'border-line bg-black/30 hover:border-gold/60',
						)}
					>
						<ImagePlus className="size-7 text-muted" />
						<span className="text-[13.5px]">
							{translate("Click to pick an image, drag-and-drop or paste (Ctrl+V) — png, jpg, webp, up to 10 MB")}
						</span>
					</button>
				)}

				{source ? (
					<div className={cn(rowClass, 'justify-between')}>
						<span data-art-source-info className="text-[12.5px] text-muted">
							{source.name}
							{source.width > 0 ? ` · ${source.width}×${source.height} px` : ''}
							{area
								? ` · ${translate("selection {width}×{height} px", {
										width: Math.round(area.width),
										height: Math.round(area.height),
									})}`
								: ''}
						</span>
						<Button asChild variant="outline" size="sm">
							<label>
								{translate("Choose another image")}
								<input
									type="file"
									accept="image/png,image/jpeg,image/webp"
									className="hidden"
									onChange={(event) => {
										void onPick(event.target.files?.[0])
										event.target.value = ''
									}}
								/>
							</label>
						</Button>
					</div>
				) : null}

				{/* Zoom + rotation: the two controls that decide what lands inside the frame. */}
				{source ? (
					<div className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-black/25 p-3">
						<label className="flex items-center gap-2 text-[12.5px] text-muted">
							<span className="w-16 shrink-0">{translate("Zoom")}</span>
							<input
								type="range"
								data-art-zoom
								min={0.5}
								max={3}
								step={0.01}
								value={zoom}
								onChange={(event) => setZoom(Number(event.target.value))}
								className="flex-1"
							/>
							<span className="w-12 shrink-0 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
						</label>
						<label className="flex items-center gap-2 text-[12.5px] text-muted">
							<span className="w-16 shrink-0">{translate('Xoay')}</span>
							<input
								type="range"
								data-art-rotation
								min={-180}
								max={180}
								step={1}
								value={rotation}
								onChange={(event) => setRotation(Number(event.target.value))}
								className="flex-1"
							/>
							<span className="w-12 shrink-0 text-right tabular-nums">{Math.round(rotation)}°</span>
						</label>
						<div className={cn(rowClass, 'justify-end')}>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => turn(-90)}
								title={translate("Rotate left 90°")}
							>
								⟲ 90°
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => turn(90)}
								title={translate("Rotate right 90°")}
							>
								⟳ 90°
							</Button>
							<Button type="button" variant="outline" size="sm" onClick={() => setRotation(0)}>
								{translate('Về 0°')}
							</Button>
						</div>
					</div>
				) : null}

				{/* What the picture will look like **in the game**. */}
				{source ? (
					kind === 'item' ? (
						<div className="flex items-center gap-3 rounded-[10px] border border-line bg-black/25 p-2.5">
							<div data-art-preview className="shrink-0">
								<ArtPreview kind="item" id={entityId} star={star} artSrc={preview} />
							</div>
							<span className="text-[12px] text-muted">
								{translate("Preview in the real tile (plate by quality, stars by rank). Saved at {width}×{height} px when you press Save.", {
									width: output.width,
									height: output.height,
								})}
							</span>
						</div>
					) : (
						<div
							data-art-preview
							className="flex flex-wrap items-start gap-4 rounded-[10px] border border-line bg-black/25 p-2.5"
						>
							<figure className="flex flex-col items-center gap-1.5">
								<CutiePortrait cutieId={entityId} artSrc={preview} className="size-[110px]" iconClass="text-[60px]" />
								<figcaption className="text-[11.5px] text-muted">{translate("Avatar ring in the preparation room")}</figcaption>
							</figure>
							<figure className="flex flex-col items-center gap-1.5">
								{/* Tall on purpose: in battle the card stretches to the height of the item grids, so
								    the picture is a portrait crop — a square preview would hide that. */}
								<div className="flex h-[230px] items-stretch">
									<AvatarCard side="player" name={entityName} label="Lv1" cutieId={entityId} artSrc={preview} />
								</div>
								<figcaption className="text-[11.5px] text-muted">{translate("Battle frame")}</figcaption>
							</figure>
							<span className="min-w-[160px] flex-1 text-[12px] text-muted">
								{translate(
									"The picture fills both frames: the avatar ring is a circle and the battle frame is taller, so the sides are trimmed — keep the face in the middle of the crop.",
								)}
							</span>
						</div>
					)
				) : null}

				{source && rotation % 90 !== 0 ? (
					<p data-art-rotate-hint className="m-0 text-[12.5px] text-gold-soft">
						{translate("An odd rotation leaves the four corners empty — zoom in until the image fills the frame, otherwise the saved file has transparent corners.")}
					</p>
				) : null}

				{source && tooSmall ? (
					<p data-art-quality className="m-0 text-[12.5px] text-gold-soft">
						{translate(
							"The selection is smaller than the saved file ({outWidth}×{outHeight} px), so it will look soft — pick a larger region or a sharper source image.",
							{ outWidth: output.width, outHeight: output.height },
						)}
					</p>
				) : null}

				{error ? (
					<p data-art-error className="m-0 text-[12.5px] text-danger-soft">
						{translate(error)}
					</p>
				) : null}

				<div className={cn(rowClass, 'justify-end')}>
					<Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
						{translate("Cancel")}
					</Button>
					<Button
						type="button"
						variant="primary"
						onClick={() => void onConfirm()}
						disabled={busy || !source}
					>
						{busy ? translate("Saving…") : translate("Save art")}
					</Button>
				</div>
			</div>
		</div>
	)
}
