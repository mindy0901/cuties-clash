import { getPet } from '../game/pets'
import { PetIcon } from './ItemIcon'
import { cn } from './ui'

/**
 * The square **pet cell** used in the pet panel — one picture, on the pet background.
 *
 * Kept in one place so the admin page can preview a pet image in the very same cell instead of a
 * look-alike box that could drift from the real one.
 */
export function PetTile({
	petId,
	artSrc,
	className,
	iconClass = 'text-[30px]',
}: {
	petId: string
	/** Explicit picture to draw instead of the pet's own art (preview before saving). */
	artSrc?: string | null
	className?: string
	iconClass?: string
}) {
	// Touch `getPet` so a wrong id fails loudly instead of rendering an empty cell.
	getPet(petId)
	return (
		<div
			data-pet-tile={petId}
			className={cn(
				'surface-pet grid shrink-0 place-items-center rounded-[14px] border border-line p-1',
				className ?? 'size-[52px]',
			)}
		>
			<PetIcon petId={petId} artSrc={artSrc} emojiClass={iconClass} />
		</div>
	)
}
