import { itemArtSrc, petArtSrc, skillArtSrc } from '../game/art'
import { getTemplate } from '../game/items'
import { getPet } from '../game/pets'
import { ArtIcon } from './ArtIcon'
import { cn } from './ui'

/**
 * Icon of an item, falling back to an emoji.
 *
 * ⚠️ **One art per item**, so the star rank is not a parameter: upgrading an item only adds stars
 * and changes their colour on the tile, it never swaps the picture (see `docs/ASSETS.md`).
 */
export function ItemIcon({
	templateId,
	emojiClass = 'text-[22px]',
	className,
}: {
	templateId: string
	emojiClass?: string
	className?: string
}) {
	const template = getTemplate(templateId)
	return (
		<ArtIcon
			src={itemArtSrc(templateId)}
			emoji={template.icon}
			emojiClass={emojiClass}
			className={cn('pointer-events-none', className)}
			alt={template.name}
		/>
	)
}

/** Pet icon. */
export function PetIcon({
	petId,
	emojiClass = 'text-[22px]',
	className,
}: {
	petId: string
	emojiClass?: string
	className?: string
}) {
	const pet = getPet(petId)
	return <ArtIcon src={petArtSrc(petId)} emoji={pet.icon} emojiClass={emojiClass} className={className} alt={pet.name} />
}

/** Pet skill icon. */
export function SkillIcon({
	petId,
	emoji = '✨',
	emojiClass = 'text-[22px]',
	className,
}: {
	petId: string
	emoji?: string
	emojiClass?: string
	className?: string
}) {
	return (
		<ArtIcon src={skillArtSrc(petId)} emoji={emoji} emojiClass={emojiClass} className={className} alt="Kỹ năng" />
	)
}
