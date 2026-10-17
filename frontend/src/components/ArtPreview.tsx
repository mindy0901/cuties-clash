import { getTemplate } from '../game/items'
import type { ItemInstance, Star } from '../game/types'
import { LoadoutGrid } from './LoadoutGrid'
import { PetTile } from './PetTile'

/**
 * Preview a picture **where it will actually appear**:
 * - an item → a real grid tile (`LoadoutGrid`, so cell size, quality background, class border and
 *   stars all come from the same code as the game), on a board sized to the item's **own footprint**;
 * - a pet → the square pet cell used by the pet panel.
 *
 * ⚠️ WHY IT IS NOT A LOOK-ALIKE BOX: a plain thumbnail hides exactly what can go wrong — an item
 * spanning 2×3 cells, a bright picture over the quality tint, stars lost against the art.
 */
export function ItemGridPreview({
	templateId,
	star,
	artSrc,
	className,
}: {
	templateId: string
	star: Star
	/** Picture to draw instead of the saved one (a crop that is not uploaded yet). */
	artSrc?: string | null
	className?: string
}) {
	const template = getTemplate(templateId)
	// Board = **exactly the item's footprint**: one look at the weapon and the cells it takes, with
	// no empty cells around it to distract from the picture.
	const { w, h } = template.space
	const items: ItemInstance[] = [
		{ uid: 'preview', templateId, star, slot: 0, rotated: false, paid: 0 },
	]
	return <LoadoutGrid width={w} rows={h} items={items} artSrc={artSrc} className={className} />
}

export function ArtPreview({
	kind,
	id,
	star,
	artSrc,
}: {
	kind: 'item' | 'pet'
	id: string
	star: Star
	artSrc?: string | null
}) {
	if (kind === 'item') return <ItemGridPreview templateId={id} star={star} artSrc={artSrc} />
	return <PetTile petId={id} artSrc={artSrc} className="size-[72px]" iconClass="text-[38px]" />
}
