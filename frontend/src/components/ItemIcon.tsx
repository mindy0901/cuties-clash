import { itemArtSrc, petArtSrc, skillArtSrc } from '../game/art'
import { uploadedArt } from '../game/content'
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
 * ⚠️ How the picture fills the tile depends on **where it came from**:
 * - an **uploaded** picture (or a `artSrc` preview) is cropped to the item's own footprint, so
 *   `contain` is right — it fits the tile with no squeeze (a couple of pixels of margin at most);
 * - the **bundled** art is square, and the tile is the item's footprint (1×3, 2×3…), so it is
 *   stretched with `fill` to cover every cell — ❌ with `contain` it would sit in one cell in the
 *   middle of a long tile.
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
	const src = artSrc === undefined ? itemArtSrc(templateId) : artSrc
	// `artSrc` is only passed by previews, which are generated in the item's shape as well.
	const shaped = artSrc !== undefined || uploadedArt('item', templateId) !== null
	return (
		<ArtIcon
			src={src}
			emoji={template.icon}
			emojiClass={emojiClass}
			className={cn('pointer-events-none', className)}
			alt={template.name}
			fit={shaped ? 'contain' : 'fill'}
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
