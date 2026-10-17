import { petArtSrc } from '../game/art'
import { getPet } from '../game/pets'
import { ArtIcon } from './ArtIcon'
import { cn } from './ui'

/**
 * The **round portrait** of a pet — the big avatar in the middle of the preparation room.
 *
 * ⚠️ The picture **fills** the circle: `object-cover` plus `overflow-hidden` clip the square crop to
 * the ring. With `contain` (and inner padding) the corners of the square stayed visible inside the
 * gold ring, which read as "the picture did not fit".
 *
 * Kept in one place so the admin page can preview the imported crop in the very same ring
 * (`ArtImportDialog`) instead of a look-alike circle.
 */
export function PetPortrait({
	petId,
	artSrc,
	className,
	iconClass = 'text-[104px]',
}: {
	petId: string
	/** Explicit picture to draw instead of the pet's own art (preview before saving). */
	artSrc?: string | null
	className?: string
	iconClass?: string
}) {
	const pet = getPet(petId)
	const src = artSrc === undefined ? petArtSrc(petId) : artSrc
	return (
		<div
			data-pet-portrait={petId}
			className={cn(
				'surface-pet relative grid place-items-center overflow-hidden rounded-full border-2 border-gold/40 leading-none shadow-[0_0_48px_rgb(217_162_39/25%)]',
				className ?? 'size-40',
			)}
		>
			<ArtIcon src={src} emoji={pet.icon} emojiClass={iconClass} fit="cover" />
		</div>
	)
}
