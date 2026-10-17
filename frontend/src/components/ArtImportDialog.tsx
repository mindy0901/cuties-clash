import { useEffect, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { ART_SIZE, croppedPng } from './cropImage'
import { btnClass, btnGoldClass, btnSmClass, cn, dialogClass, hintClass, overlayClass, rowClass } from './ui'

/** Largest file accepted straight from the admin's disk (before cropping). */
const MAX_SOURCE_BYTES = 10 * 1024 * 1024

export interface ArtImportDialogProps {
	/** Human name of the item/pet, shown in the title. */
	entityName: string
	/** Called with the finished square PNG. Resolving closes the dialog. */
	onSave: (png: Blob) => Promise<void>
	onCancel: () => void
}

/**
 * Pick a picture, crop it square, upload it.
 *
 * ⚠️ The crop is **square on purpose**: item cells and the arena avatar frame are square, so a
 * picture of another shape would be squashed or would leave gaps. `ART_SIZE` (256 px) stays crisp
 * even on a high-DPI screen.
 *
 * ⚠️ The chosen file is never uploaded as-is — only the cropped PNG leaves the browser.
 */
export function ArtImportDialog({ entityName, onSave, onCancel }: ArtImportDialogProps) {
	const [source, setSource] = useState<{ url: string; name: string } | null>(null)
	const [crop, setCrop] = useState({ x: 0, y: 0 })
	const [zoom, setZoom] = useState(1)
	const [rotation, setRotation] = useState(0)
	const [area, setArea] = useState<Area | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const objectUrl = useRef<string | null>(null)

	// Object URLs keep the file in memory until they are revoked.
	useEffect(
		() => () => {
			if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
		},
		[],
	)

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && !busy) onCancel()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [onCancel, busy])

	const onPick = (file: File | undefined) => {
		if (!file) return
		if (!file.type.startsWith('image/')) {
			setError('Hãy chọn một tệp ảnh (png, jpg, webp).')
			return
		}
		if (file.size > MAX_SOURCE_BYTES) {
			setError(`Ảnh quá lớn (${Math.round(file.size / 1024 / 1024)} MB). Giới hạn là 10 MB.`)
			return
		}
		if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
		const url = URL.createObjectURL(file)
		objectUrl.current = url
		setSource({ url, name: file.name })
		setRotation(0)
		setZoom(1)
		setCrop({ x: 0, y: 0 })
		setError(null)
	}

	const onConfirm = async () => {
		if (!source || !area) return
		setBusy(true)
		setError(null)
		try {
			const png = await croppedPng(source.url, area, { rotation, size: ART_SIZE })
			await onSave(png)
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : 'Không lưu được ảnh.')
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className={overlayClass} onClick={() => (busy ? undefined : onCancel())}>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={`Tải ảnh cho ${entityName}`}
				data-art-import
				className={cn(dialogClass, 'w-[min(560px,100%)]')}
				onClick={(event) => event.stopPropagation()}
			>
				<h2 className="text-[20px]">Tải ảnh cho “{entityName}”</h2>
				<p className={hintClass}>
					Ảnh được cắt thành ô vuông {ART_SIZE}×{ART_SIZE}, giữ nền trong suốt nếu ảnh có. Kéo để chọn vùng,
					lăn chuột để thu phóng, bấm xoay nếu ảnh nằm ngang.
				</p>

				{source ? (
					<div className="relative h-[300px] overflow-hidden rounded-[12px] border border-line bg-black/60">
						<Cropper
							image={source.url}
							crop={crop}
							zoom={zoom}
							rotation={rotation}
							aspect={1}
							objectFit="contain"
							showGrid
							restrictPosition={false}
							onCropChange={setCrop}
							onZoomChange={setZoom}
							onRotationChange={setRotation}
							onCropComplete={(_area, areaPixels) => setArea(areaPixels)}
						/>
					</div>
				) : (
					<label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-line bg-black/30 p-8 text-center">
						<span className="text-[28px]">🖼️</span>
						<span className="text-[13.5px]">Bấm để chọn ảnh (png, jpg, webp — tối đa 10 MB)</span>
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							data-art-file
							className="sr-only"
							onChange={(event) => onPick(event.target.files?.[0])}
						/>
					</label>
				)}

				{source ? (
					<div className={cn(rowClass, 'justify-between')}>
						<span className="text-[12.5px] text-muted">
							{source.name} · đã xoay {rotation}°
						</span>
						<div className={rowClass}>
							<button
								type="button"
								className={cn(btnClass, btnSmClass)}
								onClick={() => setRotation((value) => (value + 270) % 360)}
								title="Xoay trái 90°"
							>
								⟲
							</button>
							<button
								type="button"
								className={cn(btnClass, btnSmClass)}
								onClick={() => setRotation((value) => (value + 90) % 360)}
								title="Xoay phải 90°"
							>
								⟳
							</button>
							<label className={cn(btnClass, btnSmClass, 'cursor-pointer')}>
								Chọn ảnh khác
								<input
									type="file"
									accept="image/png,image/jpeg,image/webp"
									data-art-file
									className="sr-only"
									onChange={(event) => onPick(event.target.files?.[0])}
								/>
							</label>
						</div>
					</div>
				) : null}

				{source ? (
					<label className="flex items-center gap-2 text-[12.5px] text-muted">
						Thu phóng
						<input
							type="range"
							data-art-zoom
							min={1}
							max={3}
							step={0.01}
							value={zoom}
							onChange={(event) => setZoom(Number(event.target.value))}
							className="flex-1"
						/>
					</label>
				) : null}

				{error ? (
					<p data-art-error className="m-0 text-[12.5px] text-danger-soft">
						{error}
					</p>
				) : null}

				<div className={cn(rowClass, 'justify-end')}>
					<button type="button" className={cn(btnClass)} onClick={onCancel} disabled={busy}>
						Huỷ
					</button>
					<button
						type="button"
						className={cn(btnClass, btnGoldClass)}
						onClick={() => void onConfirm()}
						disabled={busy || !source}
					>
						{busy ? 'Đang lưu…' : 'Lưu ảnh'}
					</button>
				</div>
			</div>
		</div>
	)
}
