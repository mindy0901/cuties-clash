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
 *
 * `artSrc` overrides the picture — the admin page uses it to preview an image **before** it is
 * saved, through the very same tile as the game.
 */
export function ItemIcon({
	templateId,
	artSrc,
	emojiClass = 'text-[22px]',
	className,
}: {
	templateId: string
	/** Explicit picture to draw instead of the item's own (`null` = no art, use the emoji). */
	artSrc?: string | null
	emojiClass?: string
	className?: string
}) {
	const template = getTemplate(templateId)
	return (
		<ArtIcon
			src={artSrc === undefined ? itemArtSrc(templateId) : artSrc}
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
	artSrc,
	emojiClass = 'text-[22px]',
	className,
}: {
	petId: string
	/** Explicit picture to draw instead of the pet's own. */
	artSrc?: string | null
	emojiClass?: string
	className?: string
}) {
	const pet = getPet(petId)
	return (
		<ArtIcon
			src={artSrc === undefined ? petArtSrc(petId) : artSrc}
			emoji={pet.icon}
			emojiClass={emojiClass}
			className={className}
			alt={pet.name}
		/>
	)
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
