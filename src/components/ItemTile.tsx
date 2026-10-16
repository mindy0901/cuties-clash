import { sellValue } from '../game/bag'
import { getTemplate, starLabel } from '../game/items'
import type { ItemInstance } from '../game/types'

interface ItemTileProps {
	item: ItemInstance
	onSell?: (uid: string) => void
	onDragStart?: (uid: string) => void
	onDragEnd?: () => void
}

/** Compact square representation of a bag item, used in the bag, tray and shop. */
export function ItemTile({ item, onSell, onDragStart, onDragEnd }: ItemTileProps) {
	const template = getTemplate(item.templateId)
	const tooltip = [
		`${template.name} ${starLabel(item.star)}`,
		template.desc(item.star),
		onSell ? `Bán được +${sellValue(item)} Paw Tally` : '',
	]
		.filter(Boolean)
		.join('\n')

	return (
		<div
			className={`item cls-${template.cls} star-${item.star}`}
			draggable={Boolean(onDragStart)}
			title={tooltip}
			onDragStart={(event) => {
				event.dataTransfer.setData('text/plain', item.uid)
				event.dataTransfer.effectAllowed = 'move'
				onDragStart?.(item.uid)
			}}
			onDragEnd={() => onDragEnd?.()}
		>
			<span className="item-stars">{'★'.repeat(item.star)}</span>
			<span className="item-icon">{template.icon}</span>
			<span className="item-name">{template.name}</span>
			{onSell ? (
				<span className="item-actions">
					<button
						type="button"
						className="icon-btn"
						title={`Bán +${sellValue(item)} Paw Tally (50%)`}
						onClick={(event) => {
							event.stopPropagation()
							onSell(item.uid)
						}}
					>
						✕
					</button>
				</span>
			) : null}
		</div>
	)
}
