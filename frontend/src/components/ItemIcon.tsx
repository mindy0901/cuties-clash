import { itemArtSrc, petArtSrc, skillArtSrc } from '../game/art'
import { getTemplate } from '../game/items'
import { getPet } from '../game/pets'
import type { Star } from '../game/types'
import { ArtIcon } from './ArtIcon'
import { cn } from './ui'

/**
 * Icon of an item: dedicated art **per item and per star**, falling back to an emoji.
 *
 * Why per star: each star level uses a different material tier, so a 4★ item looks clearly
 * different from a 1★ one — the player sees at a glance how strong they are.
 */
export function ItemIcon({
	templateId,
	star,
	emojiClass = 'text-[22px]',
	className,
}: {
	templateId: string
	star: Star
	emojiClass?: string
	className?: string
}) {
	const template = getTemplate(templateId)
	return (
		<ArtIcon
			src={itemArtSrc(templateId, star)}
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
