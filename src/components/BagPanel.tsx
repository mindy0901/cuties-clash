import { useState } from 'react'
import { isMergeable } from '../game/bag'
import { CLASS_LABELS } from '../game/items'
import { getPet, petLevelStats } from '../game/pets'
import { useGameStore } from '../store/gameStore'
import { ItemTile } from './ItemTile'

/** Bag grid + waiting tray with drag & drop, merging and 50% selling. */
export function BagPanel() {
	const run = useGameStore((state) => state.run)
	const dropItem = useGameStore((state) => state.dropItem)
	const dropToTray = useGameStore((state) => state.dropToTray)
	const sell = useGameStore((state) => state.sell)
	const [dragging, setDragging] = useState<string | null>(null)
	const [hoverSlot, setHoverSlot] = useState<number | null>(null)
	const [trayHover, setTrayHover] = useState(false)

	const level = run.pets[run.petId] ?? 1
	const { bag, bagSize } = petLevelStats(getPet(run.petId), level)
	const totalSlots = bag.width * bag.rows
	const placed = new Map(run.items.filter((item) => item.slot >= 0).map((item) => [item.slot, item]))
	const tray = run.items.filter((item) => item.slot < 0)
	const draggingItem = dragging ? run.items.find((item) => item.uid === dragging) : undefined

	const handleDrop = (slot: number) => {
		if (!dragging) return
		dropItem(dragging, slot)
		setDragging(null)
		setHoverSlot(null)
	}

	const autoArrange = () => {
		const taken = new Set(placed.keys())
		let slot = 0
		for (const item of tray) {
			while (taken.has(slot) && slot < bagSize) slot += 1
			if (slot >= bagSize) return
			dropItem(item.uid, slot)
			taken.add(slot)
			slot += 1
		}
	}

	return (
		<section className="panel">
			<div className="panel-head">
				<h2 className="panel-title">Túi đồ của thú cưng</h2>
				<div className="row">
					<span className="tag nowrap">
						{placed.size}/{bagSize} ô
					</span>
					{tray.length > 0 ? (
						<button type="button" className="btn btn-sm" onClick={autoArrange}>
							Xếp tự động
						</button>
					) : null}
				</div>
			</div>

			<div className="bag-grid" style={{ gridTemplateColumns: `repeat(${bag.width}, minmax(0, 1fr))` }}>
				{Array.from({ length: totalSlots }, (_, slot) => {
					const item = placed.get(slot)
					const isLocked = slot >= bagSize
					const mergeable = Boolean(item && draggingItem && isMergeable(draggingItem, item))
					const classes = ['slot']
					if (isLocked) classes.push('locked')
					if (hoverSlot === slot && draggingItem) classes.push(mergeable ? 'merge-target' : 'drop-target')
					return (
						<div
							key={slot}
							className={classes.join(' ')}
							onDragOver={(event) => {
								if (!dragging) return
								event.preventDefault()
								setHoverSlot(slot)
							}}
							onDragLeave={() => setHoverSlot((current) => (current === slot ? null : current))}
							onDrop={(event) => {
								event.preventDefault()
								handleDrop(slot)
							}}
						>
							{item ? <ItemTile item={item} onSell={sell} onDragStart={setDragging} onDragEnd={() => setDragging(null)} /> : null}
						</div>
					)
				})}
			</div>

			<div className="row-between">
				<span className="hint">
					Kéo 1 món lên món giống hệt để <strong>nhập thành +1★</strong> (tối đa 4★). Bán lại nhận 50% Paw Tally.
				</span>
			</div>

			<div
				className={`tray${trayHover ? ' drop-target' : ''}`}
				onDragOver={(event) => {
					if (!dragging) return
					event.preventDefault()
					setTrayHover(true)
				}}
				onDragLeave={() => setTrayHover(false)}
				onDrop={(event) => {
					event.preventDefault()
					if (dragging) dropToTray(dragging)
					setDragging(null)
					setTrayHover(false)
				}}
			>
				{tray.length === 0 ? (
					<span className="hint">Khay chờ trống — món mua khi túi đầy sẽ nằm ở đây, kéo vào túi để dùng.</span>
				) : (
					tray.map((item) => <ItemTile key={item.uid} item={item} onSell={sell} onDragStart={setDragging} onDragEnd={() => setDragging(null)} />)
				)}
			</div>

			<p className="hint">
				Vật phẩm trong túi sẽ tham chiến tự động. {CLASS_LABELS.weapon}, {CLASS_LABELS.armor},{' '}
				{CLASS_LABELS.souljade}, {CLASS_LABELS.curio}, {CLASS_LABELS.potion} — món{' '}
				<strong>liền kề</strong> nhau mới kích hoạt hiệu ứng hào khí.
			</p>
		</section>
	)
}
