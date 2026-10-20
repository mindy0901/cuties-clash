import { itemArtSrc, cutieArtSrc, skillArtSrc } from '../game/art'
import { uploadedArt } from '../game/content'
import { getTemplate } from '../game/items'
import { getCutie } from '../game/cuties'
import { ArtIcon } from './ArtIcon'
import { translate } from '../i18n'
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
	rotated = false,
}: {
	templateId: string
	/** Explicit picture to draw instead of the item's own (`null` = no art, use the emoji). */
	artSrc?: string | null
	emojiClass?: string
	className?: string
	/** Rotate the item's art with its footprint on the inventory/loadout boards. */
	rotated?: boolean
}) {
	const template = getTemplate(templateId)
	const src = artSrc === undefined ? itemArtSrc(templateId) : artSrc
	// `artSrc` is only passed by previews, which are generated in the item's shape as well.
	const shaped = artSrc !== undefined || uploadedArt('item', templateId) !== null
	const icon = (
		<ArtIcon
			src={src}
			emoji={template.icon}
			emojiClass={emojiClass}
			className={cn('pointer-events-none', className)}
			alt={translate(template.name)}
			fit={shaped ? 'contain' : 'fill'}
		/>
	)
	if (!rotated) return icon

	return (
		<span
			data-item-icon-rotated
			className="pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center"
			style={{
				width: '100cqh',
				height: '100cqw',
				transform: 'translate(-50%, -50%) rotate(90deg)',
			}}
		>
			{icon}
		</span>
	)
}

/** Cutie icon. */
export function CutieIcon({
	cutieId,
	artSrc,
	emojiClass = 'text-[22px]',
	className,
	fit = 'contain',
}: {
	cutieId: string
	/** Explicit picture to draw instead of the cutie's own. */
	artSrc?: string | null
	emojiClass?: string
	className?: string
	/** `cover` fills the frame (round avatars); `contain` keeps the whole picture (cells). */
	fit?: 'contain' | 'cover' | 'fill'
}) {
	const cutie = getCutie(cutieId)
	return (
		<ArtIcon
			src={artSrc === undefined ? cutieArtSrc(cutieId) : artSrc}
			emoji={cutie.icon}
			emojiClass={emojiClass}
			className={className}
			fit={fit}
			alt={translate(cutie.name)}
		/>
	)
}

/** Cutie skill icon. */
export function SkillIcon({
	cutieId,
	emoji = '✨',
	emojiClass = 'text-[22px]',
	className,
}: {
	cutieId: string
	emoji?: string
	emojiClass?: string
	className?: string
}) {
	return (
		<ArtIcon
			src={skillArtSrc(cutieId)}
			emoji={emoji}
			emojiClass={emojiClass}
			className={className}
			alt={translate('Kỹ năng')}
		/>
	)
}
