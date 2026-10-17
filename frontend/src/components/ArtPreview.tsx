import { templateFootprint } from '../game/bag'
import type { Star } from '../game/types'
import { CELL_SIZE } from './GridBoard'
import { ItemTile } from './ItemTile'
import { LoadoutGrid } from './LoadoutGrid'
import { PetPortrait } from './PetPortrait'
import { cn } from './ui'

/**
 * Preview a picture **where it will actually appear**: the same tile the bag draws (quality
 * background, class border, art, stars), sized to the item's **own footprint**.
 *
 * ⚠️ Always the item's **default orientation**, never the rotation the player picked in the bag: the
 * picture is cropped to that shape, so a turned tile would stretch a portrait sword across a wide
 * one. A preview answers "what is this item", not "how is it lying right now".
 *
 * ⚠️ WHY IT IS NOT A LOOK-ALIKE BOX: a square thumbnail hides exactly what can go wrong — an item
 * spanning 2×3 cells, a bright picture over the quality tint, stars lost against the art.
 */
export function ItemGridPreview({
	templateId,
	star,
	artSrc,
	cellSize = CELL_SIZE,
	bare = false,
	className,
}: {
	templateId: string
	star: Star
	/** Picture to draw instead of the saved one (a crop that is not uploaded yet). */
	artSrc?: string | null
	/** Size of one cell in px — a preview is scaled down from the board's `CELL_SIZE`. */
	cellSize?: number
	/**
	 * Draw **only the tile**, without the board (background cells and dashed frame).
	 *
	 * ✅ The admin art panel wants the board: it has to show how many cells the picture covers.
	 * ✅ The shop card and the item dialog want `bare`: a second grid frame inside a card reads as a
	 * board of its own instead of the tile the player already knows from the bag.
	 */
	bare?: boolean
	className?: string
}) {
	const { w, h } = templateFootprint(templateId, false)

	if (bare) {
		// Emoji (an item with no picture yet) has to shrink with the cell: ❌ a literal class map, not
		// a `${px}` string — Tailwind only emits classes it can read in the source.
		const iconClass = cellSize >= 48 ? 'text-[22px]' : cellSize >= 32 ? 'text-[16px]' : 'text-[12px]'
		return (
			<div className={cn('shrink-0', className)} style={{ width: w * cellSize, height: h * cellSize }}>
				<ItemTile templateId={templateId} star={star} artSrc={artSrc} iconClass={iconClass} />
			</div>
		)
	}

	// Board = **exactly the item's footprint**: one look at the weapon and the cells it takes, with
	// no empty cells around it to distract from the picture.
	return (
		<LoadoutGrid
			width={w}
			rows={h}
			items={[{ uid: 'preview', templateId, star, slot: 0, rotated: false, paid: 0 }]}
			artSrc={artSrc}
			className={className}
		/>
	)
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
	// A pet is shown as the **round portrait** wherever it represents the pet itself (its identity),
	// the square pet cell being the small list tile.
	if (kind === 'item') return <ItemGridPreview templateId={id} star={star} artSrc={artSrc} />
	return <PetPortrait petId={id} artSrc={artSrc} className="size-[72px]" iconClass="text-[38px]" />
}
