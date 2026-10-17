import { useCallback, useRef } from 'react'
import { ActionBar } from './ActionBar'
import { HeldGhost } from './HeldGhost'
import { InventoryPanel } from './InventoryPanel'
import { PetIcon } from './ItemIcon'
import { PetLoadoutPanel } from './PetLoadoutPanel'
import { PetPanel } from './PetPanel'
import { useHeldItem } from './useHeldItem'
import { estimatePower } from '../game/build'
import { templateFootprint } from '../game/bag'
import { loadoutCellLocked } from '../game/loadout'
import { MAX_PET_LEVEL, getPet } from '../game/pets'
import { FINAL_STAGE, MAPS, getStage } from '../game/stages'
import { playerCombatantFor, useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import type { ItemInstance } from '../game/types'
import { Paw } from './icons'
import { PetPortrait } from './PetPortrait'
import { cn, panelClass } from './ui'

function StatRow({ label, value, tone }: { label: string; value: string; tone?: 'gold' | 'jade' }) {
	return (
		<div className="flex items-center justify-between gap-3 border-b border-line/60 px-3 py-1.5 last:border-b-0">
			<span className="text-[12.5px] text-muted">{label}</span>
			<span className={cn('font-semibold tabular-nums', tone === 'gold' && 'text-gold-soft', tone === 'jade' && 'text-jade')}>
				{value}
			</span>
		</div>
	)
}

/**
 * Preparation room — layout mirrors the original:
 * left is the pet plus stat table, middle is the pet stage, right is the loadout panel;
 * at the bottom is the action button bar. The inventory (editable) sits in the middle column
 * below the stage.
 */
export function PrepScreen() {
	const run = useGameStore((state) => state.run)
	const pet = getPet(run.petId)
	const level = run.pets[run.petId] ?? 1
	const combatant = playerCombatantFor(run)
	const power = estimatePower(combatant)
	const stage = getStage(run.stage)
	const map = MAPS[Math.min(MAPS.length - 1, Math.floor((run.stage - 1) / 20))]
	const totalMatches = run.wins + run.losses

	// Dragging items between inventory and loadout — the state has to live here because the two
	// panels are siblings.
	/**
	 * The item **being dragged**, so `onDragEnd` knows what to place.
	 *
	 * ⚠️ A separate ref is needed for drags **from the inventory**: `held` inside `onDragEnd`'s
	 * closure may not have the fresh value yet, while `pointerup` needs it immediately.
	 *
	 * ⚠️ The rotation must be **read from `held`** on release, not the value captured when the
	 * drag started — the player may have pressed `R` midway and a captured value would be stale.
	 */
	const dragRef = useRef<{ uid: string; from: 'inventory' | 'loadout' } | null>(null)

	/**
	 * Cancels the drag (`Esc`).
	 *
	 * ⚠️ It must **forget `dragRef` too**, ❌ not merely let `useHeldItem` clear `held`: the
	 * pointer release that follows still runs `onDragEnd` and would drop the item on the last
	 * cell the cursor passed over, even though the player cancelled.
	 */
	const cancelDrag = useCallback(() => {
		dragRef.current = null
	}, [])

	const { held, hold, clear, pointerRef } = useHeldItem(run.equipped, run.inventory, cancelDrag)
	const equipAt = useGameStore((state) => state.equipAt)
	const unequipAt = useGameStore((state) => state.unequipAt)
	const dropItem = useGameStore((state) => state.dropItem)
	const dropInStorage = useGameStore((state) => state.dropInStorage)
	const rotateInStorage = useGameStore((state) => state.rotateInStorage)
	const pushToast = useGameStore((state) => state.pushToast)
	const openItem = useUiStore((state) => state.openItem)

	const hoverSlotRef = useRef<number | null>(null)
	/** Anchor cell the hint is drawn from **inside the inventory** (it is a grid, so a drop lands
	 * on a cell rather than just "into the inventory"). */
	const inventorySlotRef = useRef<number | null>(null)
	/**
	 * Whether each board's hint is currently reporting **blocked** (clashing with another item /
	 * a locked cell) → dropping there places nothing.
	 *
	 * ⚠️ There must be **one flag per board**, ❌ never a shared one: both boards report on every
	 * render, so a shared flag would be overwritten by whichever reported last — the other board
	 * would say "blocked" while the flag ended up `false` and the drop would still place the item
	 * (this exact bug happened when dropping inside the inventory).
	 */
	const gridBlockedRef = useRef(false)
	const inventoryBlockedRef = useRef(false)
	const inventoryRef = useRef<HTMLElement | null>(null)

	/** Whether the cursor is inside the inventory area. */
	const isOverInventory = () => {
		const box = inventoryRef.current?.getBoundingClientRect()
		if (!box) return false
		const { x, y } = pointerRef.current
		return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
	}

	/**
	 * Starts dragging an item (shared by the grid and the inventory).
	 */
	const startDrag = (item: ItemInstance, from: 'inventory' | 'loadout') => {
		dragRef.current = { uid: item.uid, from }
		hold(item, from)
	}

	/**
	 * Pointer release.
	 *
	 * `moved = true` (the drag actually moved) → drop onto the hovered cell, or store into the
	 * inventory when released over it.
	 * `moved = false` (a plain press without movement) → places **nothing**: the `click` that
	 * follows opens the detail dialog, and the "dragging" state was never created.
	 */
	const onDragEnd = (moved: boolean) => {
		if (!moved) return
		const dragging = dragRef.current
		dragRef.current = null
		if (!dragging) return

		// The rotation is read from `held` **on release** — the player may have pressed `R` midway.
		const rotated = held?.rotated ?? false

		// Released **inside the inventory**: it is a free grid, so the item lands on the hovered cell.
		// - An item from the loadout → stored in the inventory (on the hovered cell; with no hovered
		//   cell a free spot is found automatically).
		// - An item already in the inventory → **moved within the inventory** (this used to be
		//   skipped, so dragging inside the inventory did nothing).
		if (isOverInventory()) {
			// The inventory hint reports **blocked** (clashing with another item) → place nothing,
			// the item returns to where it was.
			if (inventoryBlockedRef.current) {
				pushToast('Chỗ đó đã có món — chọn chỗ trống khác', 'bad')
				clear()
				return
			}
			if (dragging.from === 'loadout') unequipAt(dragging.uid, inventorySlotRef.current, rotated)
			else dropInStorage(dragging.uid, inventorySlotRef.current, rotated)
			clear()
			return
		}

		const slot = hoverSlotRef.current
		if (slot === null) {
			// Released outside **every** drop target (not on the inventory, not on any grid cell) →
			// cancel: the item returns to where it was. Dragging an item is a UI state only; the item
			// was never removed from `run`, so
			//
			// ⚠️ ❌ do not fall back to a remembered cell: since the board clears the hovered cell when
			// the cursor leaves it, `slot` is `null` exactly when the cursor is **not** over a board —
			// placing there would drop the item on a cell the player never pointed at. And ❌ do not
			// leave the item "hanging" either: the player released the mouse, so a ghost still stuck to
			// the cursor would look like a frozen action.
			clear()
			return
		}

		// The hint reports **blocked** → dropping **places nothing**, the item returns to where it
		// was. That is exactly what the red outline promised; ❌ it must not silently go elsewhere.
		//
		// ⚠️ A long item (1×4) that does not fit the open loadout (low pet level) also falls here —
		// by design: rotate with `R` and drop again, instead of letting the game auto-rotate and place
		// it on a cell the player never pointed at.
		if (gridBlockedRef.current) {
			pushToast(
				'Chỗ đó không vừa món — bấm R để xoay, hoặc chọn ô khác',
				'bad',
			)
			clear()
			return
		}

		if (dragging.from === 'loadout') {
			dropItem(dragging.uid, slot, rotated)
			clear()
			return
		}

		// Inventory → loadout. A **locked** cell cannot take the item, and it must not fall back to
		// searching for a spot either — that would defeat the very purpose of locked cells.
		if (loadoutCellLocked(run, slot)) {
			pushToast('Ô đó còn khoá — nâng cấp thú cưng để mở thêm ô', 'bad')
			clear()
			return
		}
		// The hint and the placement share **one anchor cell**, so getting here means it fits; if it
		// still does not, report it, ❌ do not look elsewhere (the item would land off the outline the
		// player is looking at).
		if (!equipAt(dragging.uid, slot, rotated)) pushToast('Không đặt được món vào ô đó', 'bad')
		clear()
	}

	/**
	 * The **anchor cell the hint is drawn from**, reported by `LoadoutGrid`.
	 *
	 * ⚠️ This cell is used for placement, ❌ it is not recomputed from the raw cell: the hint is
	 * centered on the cursor so the anchor differs from the raw cell — recomputing would make the
	 * item land off the outline the player is looking at.
	 */
	const onAnchorSlotFromGrid = (slot: number | null, blocked: boolean) => {
		hoverSlotRef.current = slot
		gridBlockedRef.current = blocked
	}

	/**
	 * Anchor cell the hint is drawn from **inside the inventory**. It is a free grid too, so on
	 * release the item lands on exactly this cell (no more "stored into the inventory" as an end
	 * state; the inventory no longer arranges positions by itself).
	 */
	const onAnchorSlotFromInventory = (slot: number | null, blocked: boolean) => {
		inventorySlotRef.current = slot
		inventoryBlockedRef.current = blocked
	}

	const heldItem = held
		? ([...run.equipped, ...run.inventory].find((item) => item.uid === held.uid) ?? null)
		: null
	/**
	 * The item being dragged, in its full `HeldItem` form.
	 *
	 * ⚠️ ❌ **Do not trim fields**: both grids need `star` to know whether the item can **merge
	 * stars** into the item right under the cursor (the inventory allows merging only, never
	 * swapping). An earlier version passed only `uid`/`rotated`/`templateId`, so that check was
	 * always wrong.
	 */
	const heldInfo = held

	return (
		<div className="flex flex-col gap-3.5">
			{/*
			 * Three columns in a **1 : 2 : 1 flex ratio** — pet stats · stage + inventory · loadout.
			 * The columns take the full width and split it, and every panel inside a column stretches
			 * to that column's width (`items-stretch`), so the three panels line up edge to edge.
			 *
			 * ⚠️ Cell size stays the **fixed `CELL_SIZE` px** on both boards: a wider column does not
			 * stretch the cells, it only gives the board room. ❌ Do not switch the columns back to
			 * fixed px either — that overflowed horizontally on narrow screens.
			 */}
			<div className="flex flex-col gap-3.5 lg:flex-row lg:items-stretch">
				{/* ── Left: stat table + pet panel ───────────────────────────────── */}
				<div className="flex min-w-0 flex-col gap-2.5 lg:flex-1">
					<section className={cn(panelClass, 'gap-2.5')}>
						<div className="flex items-center gap-3">
							<div className="surface-pet grid size-16 shrink-0 place-items-center rounded-[16px] border border-line p-1.5">
								<PetIcon petId={pet.id} emojiClass="text-4xl" />
							</div>
							<div>
								<div className="flex items-baseline gap-2">
									<span className="text-3xl leading-none font-bold text-gold-soft">{level}</span>
									<span className="font-semibold">{pet.name}</span>
								</div>
								<div className="text-[12px] text-muted">
									{level >= MAX_PET_LEVEL ? 'Đã đạt cấp tối đa' : `Cấp ${level}/${MAX_PET_LEVEL}`}
								</div>
							</div>
						</div>

						<div className="overflow-hidden rounded-[10px] border border-line bg-black/25">
							<StatRow label="Sức mạnh" value={power.toLocaleString('vi-VN')} tone="gold" />
							<StatRow label="Máu tối đa" value={String(Math.round(combatant.maxHp))} />
							<StatRow
								label="Lịch sử đấu"
								value={totalMatches === 0 ? 'chưa đấu' : `${run.wins} thắng, ${run.losses} thua`}
								tone={run.losses === 0 && run.wins > 0 ? 'jade' : undefined}
							/>
							<StatRow label="Tiến trình" value={`${Math.round((run.clearedStage / FINAL_STAGE) * 100)}%`} />
							<StatRow label="Kiếm Thế" value={`${combatant.maxSe} (+${Math.round(combatant.seRegen)}/s)`} />
						</div>
					</section>

					<PetPanel />
				</div>

				{/* ── Middle: pet stage + inventory (twice as wide as the sides) ── */}
				<div className="flex min-w-0 flex-col gap-2.5 lg:flex-[2]">
					<section className="surface-stage relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-panel border border-line px-4 py-8">
						<PetPortrait petId={pet.id} />
						<div className="relative text-center">
							<div className="text-lg font-bold tracking-[0.02em] text-gold-soft">{pet.name}</div>
							<div className="text-[12px] text-muted">
								{map.name} · Màn {stage.index} · {pet.skill.name}
							</div>
						</div>
					</section>

					<InventoryPanel
						onRef={(node) => {
							inventoryRef.current = node
						}}
						held={heldInfo}
						onItemClick={(item) => openItem(item.uid)}
						onDragStart={(item) => startDrag(item, 'inventory')}
						onDragEnd={onDragEnd}
						onAnchorSlot={onAnchorSlotFromInventory}
						onRotate={rotateInStorage}
					/>
				</div>

				{/* ── Right: loadout + next opponent ─────────────────────────────── */}
				<div className="flex min-w-0 flex-col gap-2.5 lg:flex-1">
					<PetLoadoutPanel
						held={heldInfo}
						onItemClick={(item) => openItem(item.uid)}
						onDragStart={(item) => startDrag(item, 'loadout')}
						onDragEnd={onDragEnd}
						onAnchorSlot={onAnchorSlotFromGrid}
					/>

					<section className={cn(panelClass, 'gap-2.5')}>
						<div className="flex items-center gap-3">
							<div className="grid size-14 shrink-0 place-items-center rounded-[14px] border border-line bg-ink-700 text-3xl">
								{stage.enemy.icon}
							</div>
							<div className="min-w-0">
								<div className="font-semibold">{stage.enemy.name}</div>
								<div className="text-[12px] text-muted">
									Màn {stage.index} · {stage.enemy.items.length} món · thưởng {stage.reward} <Paw />
								</div>
							</div>
						</div>
						<div className="overflow-hidden rounded-[10px] border border-line bg-black/25">
							<StatRow label="Máu đối thủ" value={String(stage.enemy.maxHp)} />
							<StatRow label="Sát thương" value={String(stage.enemy.attackDamage)} />
							<StatRow label="Tỉ lệ Chấn Đao" value={`${Math.round(stage.enemy.counterChance * 100)}%`} />
						</div>
					</section>
				</div>
			</div>

			<ActionBar />

			{/* The item image following the cursor while an item is held. */}
			{held && heldItem ? (
				<HeldGhost
					templateId={held.templateId}
					rotated={held.rotated}
					w={templateFootprint(heldItem.templateId, false).w}
					h={templateFootprint(heldItem.templateId, false).h}
					x={held.x}
					y={held.y}
				/>
			) : null}
		</div>
	)
}
