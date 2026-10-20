import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { templateFootprint, mergeUpStar, sellValue } from '../game/bag'
import { estimatePower } from '../game/build'
import { REROLL_COST, STAR_TWO_FROM_CLEARED, shopQualityOdds, shopStarOdds } from '../game/economy'
import { QUALITY_LABELS, getTemplate, itemCatalogue, itemTemplatesUpToTier } from '../game/items'
import { FINAL_STAGE, getStage, stageTier } from '../game/stages'
import type { Quality } from '../game/types'
import { GRID_WIDTH, MAX_CUTIE_LEVEL, getCutie, cutieBag, cutieOwnerStats } from '../game/cuties'
import { playerCombatantFor, useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { ItemGridPreview } from './ArtPreview'
import { CELL_SIZE, type PointerPosition } from './GridBoard'
import { GoldPill } from './GoldPill'
import { HeldGhost } from './HeldGhost'
import { LoadoutGrid } from './LoadoutGrid'
import { CutiePortrait } from './CutiePortrait'
import { ShopOfferCard } from './ShopOfferCard'
import { ArrowUp, ChevronLeft, Dices, Gold, Grid2x2, Info, Recycle, Star, StarRow } from './icons'
import { useHeldItem } from './useHeldItem'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { cn } from '../lib/utils'
import { translate, useLanguageStore } from '../i18n'

/** `0.005` → `0.5%`, `1` → `100%` — one decimal, but only when it says something. */
function formatChance(chance: number): string {
	return `${(chance * 100).toFixed(1).replace(/\.0$/, '')}%`
}

/**
 * Colour swatch of a quality band in the odds tooltip.
 *
 * ⚠️ Written out as a table instead of `` `text-rank-${quality}` ``: Tailwind only generates classes
 * that appear literally in the source (see `docs/ARCHITECTURE.md` §8).
 */
function qualityDotClass(quality: Quality): string {
	const classes: Record<Quality, string> = {
		1: 'size-2 rounded-full bg-rank-1',
		2: 'size-2 rounded-full bg-rank-2',
		3: 'size-2 rounded-full bg-rank-3',
		4: 'size-2 rounded-full bg-rank-4',
		5: 'size-2 rounded-full bg-rank-5',
	}
	return classes[quality]
}

/**
 * The dedicated shop page (`/shop`), built from **shadcn/ui** primitives (`Button`, `Card`, `Badge`)
 * themed with the game's tokens.
 *
 * The header is a **profile strip**: the cutie's portrait, its level, its power, the stage it is on
 * and the gold it holds — everything a purchase decision needs, in one glance. Below it two columns:
 * the **shop board** on the left, the current loadout on the right.
 *
 * The shop board follows the reference art: a bordered grid of cells, each holding one item at its real
 * board size, its footprint (`2×3`) in the corner and **only its price** below it. ❌ There is no "buy"
 * button — the **whole cell** is the buy button, exactly like clicking an item in the reference.
 */
export function ShopScreen() {
	useLanguageStore((state) => state.language)
	const run = useGameStore((state) => state.run)
	const buyOffer = useGameStore((state) => state.buyOffer)
	const reroll = useGameStore((state) => state.reroll)
	const dropItem = useGameStore((state) => state.dropItem)
	const sell = useGameStore((state) => state.sell)
	const openItem = useUiStore((state) => state.openItem)
	const navigate = useNavigate()

	/**
	 * The equipment board is **live on this screen too**: the same drag machinery as the
	 * preparation room (`useHeldItem`), so an item can be inspected (click), moved (drag) and
	 * rotated (`R` / right click) without leaving the shop.
	 *
	 * ⚠️ `dragUidRef` is separate from `held` on purpose: `pointerup` runs `onDragEnd` before
	 * `held` has the fresh value, and `Esc` clears `held` but must also forget the drag (otherwise
	 * the following release would drop the item on the last hovered cell).
	 */
	const dragUidRef = useRef<string | null>(null)
	/** Anchor cell the hint is drawn from, plus whether it is blocked — both reported by the grid. */
	const dropSlotRef = useRef<number | null>(null)
	const dropBlockedRef = useRef(false)
	const cancelDrag = useCallback(() => {
		dragUidRef.current = null
	}, [])
	const { held, hold, clear } = useHeldItem(run.equipped, run.inventory, cancelDrag)

	const heldItem = held ? (run.equipped.find((item) => item.uid === held.uid) ?? null) : null

	/** Is a screen point inside the shop's sell zone? (`data-shop-drop-target` is the same hook the
	 * preparation room uses, so "drop to sell" behaves identically on both screens.) */
	const isOverSellZone = (position: PointerPosition) =>
		Array.from(document.querySelectorAll<HTMLElement>('[data-shop-drop-target]')).some((target) => {
			const rect = target.getBoundingClientRect()
			if (rect.width === 0 || rect.height === 0) return false
			return (
				position.x >= rect.left &&
				position.x <= rect.right &&
				position.y >= rect.top &&
				position.y <= rect.bottom
			)
		})

	/**
	 * The offer under the pointer, plus where its **hover card** is drawn.
	 *
	 * ⚠️ The card is anchored to the **tile**, not to the cell: a cell is far wider than the item, so
	 * anchoring to the cell pushed the card over the next column's item and over half the empty cell.
	 * With the tile as anchor the panel opens **to the right of the item** (the reference's side), 10 px
	 * away, and never covers the item being inspected.
	 *
	 * ⚠️ `position: fixed` with a rect measured on enter: the board is `overflow-hidden` and scrolls,
	 * so the card is dropped on scroll instead of being laid out inside a cell.
	 */
	const [hovered, setHovered] = useState<{
		index: number
		left: number
		top: number
		maxHeight: number
	} | null>(null)
	/** Pointer is over the sell zone while an item is being dragged. */
	const [overSell, setOverSell] = useState(false)

	/** Width of the hover card, in px — kept here because the placement maths needs it. */
	const CARD_WIDTH = 258

	/**
	 * Hover intent: the card waits before it opens.
	 *
	 * The pointer crosses a cell on its way anywhere else on the board, and a card that appears on the
	 * first pixel of contact flickers over the neighbouring items on every pass. A short wait makes the
	 * panel answer a **deliberate** stop instead.
	 */
	const HOVER_DELAY_MS = 350
	const hoverTimerRef = useRef<number | null>(null)

	useEffect(
		() => () => {
			if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current)
		},
		[],
	)

	const showCard = (index: number, node: HTMLElement) => {
		const tile = node.querySelector<HTMLElement>('[data-shop-tile]') ?? node
		const tileRect = tile.getBoundingClientRect()
		const gap = 10
		// **Right side first**, like the reference — the card must never cover the tile it describes,
		// and covering a neighbouring item is accepted. It only flips to the left of the tile when the
		// right side would run off the window.
		const right = tileRect.right + gap
		const left = right + CARD_WIDTH <= window.innerWidth - 8 ? right : Math.max(8, tileRect.left - gap - CARD_WIDTH)
		const top = Math.max(8, Math.min(tileRect.top, window.innerHeight - 120))
		setHovered({ index, left, top, maxHeight: Math.max(140, window.innerHeight - top - 16) })
	}

	/** Drops the card and any pending open — used on leave, blur, scroll and after a purchase. */
	const hideCard = () => {
		if (hoverTimerRef.current !== null) {
			window.clearTimeout(hoverTimerRef.current)
			hoverTimerRef.current = null
		}
		setHovered(null)
	}

	/** Arms the card for `index`, cancelled by `hideCard` if the pointer moves on first. */
	const queueCard = (index: number, node: HTMLElement) => {
		hideCard()
		hoverTimerRef.current = window.setTimeout(() => {
			hoverTimerRef.current = null
			// The cell may have been bought (replaced by the sold placeholder) while the timer ran.
			if (!node.isConnected) return
			showCard(index, node)
		}, HOVER_DELAY_MS)
	}

	const onDragEnd = (moved: boolean, releasePosition: PointerPosition | null) => {
		if (!moved) return
		const uid = dragUidRef.current
		dragUidRef.current = null
		if (!uid) return

		// Dropped on the **sell zone** → sell it (50% refund, the same rule as the preparation room).
		// ⚠️ Checked **before** the board cell: the zone sits outside the grid, so a release over it must
		// never be read as "put the item back on the last hovered cell".
		if (releasePosition !== null && isOverSellZone(releasePosition)) {
			sell(uid)
			clear()
			return
		}

		const slot = dropSlotRef.current
		if (slot === null) {
			// Released outside the board: the item goes back where it was.
			clear()
			return
		}
		if (dropBlockedRef.current) {
			clear()
			return
		}
		// Rotation is read from `held` on release — the player may have pressed `R` mid-drag.
		dropItem(uid, slot, held?.rotated ?? false)
		clear()
	}

	const cutie = getCutie(run.cutieId)
	// Every item number on this page is a multiplier of the cutie's own attack; an item's cadence
	// is its own Cooldown Time.
	const owner = cutieOwnerStats(cutie, run.cuties[run.cutieId] ?? 1)
	const level = run.cuties[run.cutieId] ?? 1
	const bag = cutieBag(level)
	const combatant = playerCombatantFor(run)
	const power = estimatePower(combatant)
	const stage = getStage(run.stage)
	const tier = stageTier(run.stage)
	const equippedCount = run.equipped.length
	const odds = shopStarOdds(run.clearedStage)
	const qualityOdds = shopQualityOdds(run.stage)
	const poolSize = itemTemplatesUpToTier(tier).length
	/** Everything the player owns — the shop suggests a merge when an offer has a twin in here. */
	const bagItems = [...run.equipped, ...run.inventory]
	/**
	 * Height of **every** shop cell, in px — fixed by the tallest item the catalogue can contain, ❌ not
	 * by the offers of this roll.
	 *
	 * Why: with the height following the offers, a reroll that swapped a 1×1 gem for a 1×3 blade made
	 * the whole board jump (and every cell grew, so the price row slid down with it). The board now has
	 * one stable cell size — a 1×3 tile simply leaves less empty space than a 1×1 one.
	 */
	const cellHeight = Math.max(
		220,
		Math.max(1, ...itemCatalogue().map((template) => template.space.h)) * CELL_SIZE + 76,
	)

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col gap-3.5">
			{/* Profile strip: portrait · name/level + power + stage · gold. No page subtitle: the shop is
			    obvious from the offers below, so the line under the name is spent on the numbers instead.
			    It is `shrink-0` and first in the column, so it always sits flush against the top edge. */}
			<Card className="shrink-0 p-3.5">
				<div className="flex flex-wrap items-center gap-x-5 gap-y-3">
					<CutiePortrait cutieId={cutie.id} className="size-16" iconClass="text-[34px]" />
					<div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<h1 className="m-0 text-xl">{translate(cutie.name)}</h1>
							<Badge variant="gold" className="px-2 py-0.5 text-[12px] font-bold">
								{translate('Cấp {level}', { level: `${level}/${MAX_CUTIE_LEVEL}` })}
							</Badge>
						</div>
						<span className="flex items-baseline gap-1.5 text-[13px] text-muted">
							{translate('Sức mạnh')}
							<span data-shop-power className="text-lg font-bold tabular-nums text-gold-soft">
								{power.toLocaleString('en-US')}
							</span>
						</span>
						<span className="flex items-baseline gap-1.5 text-[13px] text-muted">
							{translate('Màn {stage}', { stage: '' }).trim()}
							<span data-shop-stage className="text-lg font-bold tabular-nums text-paper">
								{stage.index}
								<span className="text-[13px] font-normal text-muted">/{FINAL_STAGE}</span>
							</span>
						</span>
					</div>

					<GoldPill amount={run.gold} size="lg" className="sm:ml-auto" />
				</div>
			</Card>

			{/* The board sits in the **middle of the page**: the wrapper takes the leftover height and
			    centres its content, and only scrolls when the board is genuinely taller than the screen
			    (`min-h-full` keeps the top of the board reachable instead of clipping it). */}
			{/* The card is measured from the hovered cell, so scrolling the board must drop it —
			    otherwise it would stay pinned while its tile moves away. */}
			<div className="min-h-0 flex-1 overflow-y-auto" onScroll={hideCard}>
				<div className="flex min-h-full items-center">
					{/* The equipment column sizes itself to the board (`auto`), so a 4×90 px grid is never
					    squeezed — see AGENTS.md §4.6. */}
					<div className="grid w-full items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
						<section className="overflow-hidden rounded-panel border border-border">
							{/* Shop bar, like the reference: name on the left, shop level on the right — plus an
							    info toggle for the drop rates (the board is `overflow-hidden`, so the rates open
							    as a strip **inside** the section instead of a floating popover that would be
							    clipped). */}
							<div className="flex items-center justify-between gap-3 border-b border-gold/20 bg-linear-to-r from-gold/15 to-transparent px-4 py-2.5">
								<h2 className="m-0 text-base font-semibold tracking-[0.02em]">{translate('Cửa hàng')}</h2>
								<span className="flex items-center gap-2 text-[12.5px] text-muted">
									<span>
										{translate('Cấp cửa hàng')}{' '}
										<span data-shop-tier className="font-bold text-gold-soft">
											{tier}
										</span>
									</span>
									{/*
									 * Hover, not a click toggle: the rates are a hint you glance at while
									 * shopping, and a toggle would sit open over the board. The panel is
									 * only `invisible` — it stays mounted so the browser can show it with no
									 * JS round trip, and `group-focus-within` opens it for keyboard users.
									 */}
									<span className="group relative grid place-items-center">
										<button
											type="button"
											data-shop-odds-toggle
											aria-describedby="shop-odds"
											aria-label={translate('Tỉ lệ ra đồ của cửa hàng')}
											className="grid size-5 place-items-center rounded-full border border-border text-muted transition-colors hover:border-gold hover:text-gold-soft"
										>
											<Info className="size-3.5" />
										</button>
										<div
											id="shop-odds"
											role="tooltip"
											data-shop-odds
											className="invisible absolute top-full right-0 z-30 mt-2 w-[248px] rounded-lg border border-border bg-popover p-3 text-[12.5px] text-muted opacity-0 shadow-panel transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
										>
											<div className="mb-1.5 font-semibold text-paper">{translate('Tỉ lệ ra đồ')}</div>
											{(
												[
													[1, odds.one],
													[2, odds.two],
													[3, odds.three],
												] as const
											).map(([star, chance]) => (
												<div key={star} className="flex items-center justify-between gap-3 py-0.5">
													<StarRow count={star} className="text-gold-soft" />
													<span
														data-shop-odds-star={star}
														className="font-bold tabular-nums text-paper"
													>
														{formatChance(chance)}
													</span>
												</div>
											))}

											{/* Quality is the second half of the roll: the star hit above is decided
											    **after** a template is picked, and candidates are weighted by band. */}
											<div className="mt-1.5 border-t border-border/70 pt-1.5 font-semibold text-paper">
												{translate('Phẩm')}
											</div>
											{qualityOdds.map(({ quality, chance, count }) => (
												<div key={quality} className="flex items-center justify-between gap-3 py-0.5">
													<span className="flex items-center gap-1.5">
														<span aria-hidden className={qualityDotClass(quality)} />
														{translate(QUALITY_LABELS[quality])}
													</span>
													<span
														data-shop-odds-quality={quality}
														className={cn('font-bold tabular-nums', count === 0 ? 'text-muted' : 'text-paper')}
													>
														{formatChance(chance)}
													</span>
												</div>
											))}

											<div className="mt-1.5 border-t border-border/70 pt-1.5 text-[11.5px]">
												<div>{translate('Bể đồ: {count} món', { count: poolSize })}</div>
												{odds.two === 0 ? (
													<div>{translate('2★ mở sau khi qua màn {stage}', { stage: STAR_TWO_FROM_CLEARED })}</div>
												) : null}
											</div>
										</div>
									</span>
								</span>
							</div>

							{/* Cell grid: no gaps, 1 px gold dividers — the shop board itself, not a list of cards.
							    ⚠️ **Exactly the offers are drawn, never padding.** A padded "whole row of three" used
							    to add an empty cell with a divider under it, which reads as a broken slot that never
							    refills on reroll (it was reported as a bug). A short last row is honest: it is the
							    board ending, not a missing item. */}
							<div className="grid auto-rows-fr grid-cols-2 divide-x divide-gold/15 sm:grid-cols-3">
								{run.shop.length === 0 ? (
									<p className="col-span-full px-4 py-10 text-center text-[13px] text-muted">
										{translate('Cửa hàng đang trống — chưa có món nào để bán')}
									</p>
								) : null}
								{run.shop.map((offer, index) => {
									const template = getTemplate(offer.templateId)
									// A template that the admin removed → the slot is skipped, not drawn as a hole.
									if (!template) return null
									// Bought → the item **is gone**: an empty cell is drawn in its place so the board
									// keeps its shape (a reflow would shuffle every other offer). ❌ Never leave a
									// dimmed ghost of a sold item — a faded copy reads as "still for sale but broken".
									if (offer.sold) {
										return (
											<span
												key={`sold-${index}`}
												data-shop-sold="true"
												aria-hidden
												className="border-b border-gold/15"
												style={{ height: `${cellHeight}px` }}
											/>
										)
									}
									const affordable = run.gold >= offer.cost
									const size = template.space
									const blocked = !affordable
									// Does the player already own a twin? Then buying this is a **step up in star**,
									// not just one more item — the cell says so (ring + badge) without being asked.
									const mergeStar = mergeUpStar(bagItems, offer)
									return (
										<button
											type="button"
											key={`${offer.templateId}-${index}`}
											data-shop-offer
											data-shop-merge={mergeStar ?? undefined}
											onClick={() => {
												if (blocked) return
												// Buying replaces this button with the sold placeholder, so no pointer-leave
												// ever reaches it: the card has to be dropped here or it stays on screen
												// over an offer that no longer exists.
												hideCard()
												buyOffer(index)
											}}
											// `aria-disabled`, ❌ not `disabled`: a disabled button fires no pointer
											// events, and the **unaffordable** offers are exactly the ones a player
											// wants to inspect. The click guard above keeps them unbuyable.
											aria-disabled={blocked ? true : undefined}
											data-shop-cell-height={cellHeight}
											style={{ height: `${cellHeight}px` }}
											onPointerEnter={(event) => queueCard(index, event.currentTarget)}
											onPointerLeave={hideCard}
											onFocus={(event) => showCard(index, event.currentTarget)}
											onBlur={hideCard}
											aria-label={
												mergeStar === null
													? translate('Mua {name} với {cost} Vàng', {
															name: translate(template.name),
															cost: offer.cost,
														})
													: translate('Mua {name} với {cost} Vàng để gộp lên {star}★', {
															name: translate(template.name),
															cost: offer.cost,
															star: mergeStar,
														})
											}
											className={cn(
												// `justify-between` + a flexible tile box: the price is pinned to the
												// bottom edge of every cell, whatever the tile's height is.
												'group relative flex flex-col items-center justify-between gap-2 border-b border-gold/15 px-4 pt-7 pb-3',
												'transition-colors',
												blocked
													? 'cursor-not-allowed'
													: 'hover:bg-gold/8 focus-visible:bg-gold/8 focus-visible:outline-none',
											)}
										>
											{/* Footprint, top-right of the cell. */}
											<span className="absolute top-2 right-2.5 flex items-center gap-1 text-[11px] tabular-nums text-muted">
												<Grid2x2 className="size-3.5 opacity-70" />
												{size.w}×{size.h}
											</span>

											{/* A twin is already owned → `↑ 2★`. Top-left on purpose: the bottom of the
											    cell belongs to the price alone.
											    ⚠️ Both glyphs are **lucide icons** (`ArrowUp`, `Star`), ❌ not the `↑` / `★`
											    characters: a text glyph sits on the baseline of another font, so the
											    badge read as a wobbly, uneven sticker. */}
											{mergeStar !== null ? (
												<span
													data-shop-merge-badge
													className="absolute top-2 left-2.5 flex items-center gap-1 rounded-full border border-gold/60 bg-gold/15 py-0.5 pr-1.5 pl-1 text-[11px] font-bold leading-none text-gold-soft shadow-[0_0_12px_rgb(240_205_122/30%)]"
												>
													<ArrowUp className="size-3 shrink-0" strokeWidth={3} aria-hidden />
													<span className="tabular-nums leading-none">{mergeStar}</span>
													<Star className="size-2.5 shrink-0 fill-current" aria-hidden />
												</span>
											) : null}

											{/* The tile at the **real board size** (`CELL_SIZE = 90`), so a 1×3 blade is 90×270. */}
											<span
												className={cn(
													'flex flex-1 items-center justify-center transition-transform',
													blocked ? 'opacity-60 grayscale-[0.5]' : 'group-hover:scale-[1.03]',
												)}
											>
												{/* The tile and its frame share one box, so the outline hugs the tile (1×3 stays
												    1×3) instead of outlining the whole cell. The dashed frame is always on:
												    it is what makes a tile read as **buyable** in the reference art. */}
												<span className="relative inline-flex" data-shop-tile>
													<ItemGridPreview
														templateId={offer.templateId}
														star={offer.star}
														cellSize={CELL_SIZE}
														bare
													/>
													{/* One frame per tile: the dashed "buyable" outline. ❌ A suggested merge draws
													    **no second dashed line** (it would double up) — it only turns the glow
													    on, so the tile reads as brighter rather than outlined twice. */}
													{/* One frame per tile, and it is **always** the dashed "buyable" outline — a merge
													    suggestion adds the glow on top of it, it never replaces it (an item you can
													    merge is still an item you can buy). */}
													<span
														aria-hidden
														data-shop-tile-frame
														data-shop-merge-ring={mergeStar !== null ? '' : undefined}
														className={cn(
															'pointer-events-none absolute -inset-1.5 rounded-md border border-dashed transition-colors',
															mergeStar !== null
																// ⚠️ Both an **outer** and an **inset** shadow: an outer `box-shadow` is
																// painted only outside the border box, so the 6 px gap between the tile and
																// the dashed line stayed plain black. The inset half fills that gap (and
																// bleeds onto the tile's edge), so the light reads as coming from the item.
																? 'animate-pulse border-gold/70 shadow-[0_0_26px_rgb(240_205_122/55%),inset_0_0_20px_rgb(240_205_122/50%)]'
																: 'border-paper/35 group-hover:border-gold/60',
														)}
													/>
												</span>
											</span>

											{/* Bottom of the cell: the price and nothing else. */}
											<span
												data-shop-price
												className={cn(
													'mt-auto flex items-center gap-1.5 text-[15px] font-bold tabular-nums',
													affordable ? 'text-gold-soft' : 'text-danger-soft',
												)}
											>
												{offer.cost} <Gold />
											</span>
										</button>
									)
								})}
							</div>
						</section>

						{/* Stretches to the board's height (`items-stretch` on the wrapper): the sell zone at the
						    bottom then grows to fill the leftover space, so both columns end on the same line. */}
						<Card className="h-full gap-2.5 p-3.5">
							<CardHeader className="flex-row items-center justify-between">
								<CardTitle>{translate('Trang bị')}</CardTitle>
								<span data-shop-equipment-count className="text-[12.5px] tabular-nums text-muted">
									{equippedCount}
								</span>
							</CardHeader>
							<CardContent className="flex flex-1 flex-col gap-2.5">
								{/* The same board the player arranges in the preparation room — **same 90 px cells**:
								    a grid is never re-scaled per screen (see AGENTS.md §4.6). It stays **fully
								    interactive** here: click = details, drag = move, `R` / right click = rotate. */}
								<LoadoutGrid
									width={GRID_WIDTH}
									rows={bag.rows}
									items={run.equipped}
									interactive
									held={held}
									onItemClick={(item) => openItem(item.uid)}
									onDragStart={(item) => {
										dragUidRef.current = item.uid
										hold(item, 'loadout')
									}}
									onDragEnd={onDragEnd}
									onAnchorSlot={(slot, blocked) => {
										dropSlotRef.current = slot
										dropBlockedRef.current = blocked
									}}
								/>

								{/* Drop-to-sell: the same gesture the preparation room teaches (drag an item onto the
								    shop button), made obvious here with a permanent zone that lights up while an item
								    is in hand. Only a real drop sells — ❌ a click on it never does.
								    ⚠️ It is a drop target **hit-tested by pointer position**, so a thin strip is hard to hit
								    mid-drag: it keeps a 96 px floor and then grows (`flex-1`) to fill whatever height the
								    equipment card has left, so this column ends level with the shop board. */}
								<div
									data-shop-drop-target="sell"
									data-shop-sell-zone
									aria-hidden
									onPointerEnter={() => setOverSell(true)}
									onPointerLeave={() => setOverSell(false)}
									className={cn(
										'mt-1 flex min-h-24 flex-1 items-center justify-center gap-2.5 rounded-lg border-2 border-dashed px-3 py-3 text-center text-[13px] transition-colors',
										overSell
											? 'border-danger-soft bg-danger/20 text-white'
											: heldItem
												? 'animate-pulse border-danger/70 bg-danger/10 text-danger-soft'
												: 'border-line/80 text-muted',
									)}
								>
									<Recycle className="size-5 shrink-0" />
									{heldItem ? (
										<span className="font-semibold leading-snug">
											{translate('Thả để bán {name} · +{refund}', {
												name: translate(getTemplate(heldItem.templateId).name),
												refund: sellValue(heldItem),
											})}{' '}
											<Gold />
										</span>
									) : (
										<span className="leading-snug">{translate('Kéo món vào đây để bán (hoàn 50%)')}</span>
									)}
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>

			{/* The action card is last and `shrink-0`, so it always sits flush against the bottom edge. */}
			<Card className="shrink-0 gap-2.5 p-3.5">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<Button
						variant="secondary"
						size="lg"
						className="flex-1"
						onClick={() => void navigate({ to: '/' })}
					>
						<ChevronLeft /> {translate('Quay về')}
					</Button>
					<span className="order-last text-center text-[11.5px] text-muted sm:order-none">
						{translate('Lần đổi: {count}', { count: run.rerolls })}
					</span>
					<Button
						variant="primary"
						size="lg"
						className="flex-1"
						disabled={run.gold < REROLL_COST}
						onClick={reroll}
						title={translate('Đổi danh sách đồ với {cost} Vàng', { cost: REROLL_COST })}
					>
						<Dices /> {translate('Đổi danh sách · {cost}', { cost: REROLL_COST })} <Gold />
					</Button>
				</div>
			</Card>

			{/* The hover card of the offer under the pointer — a details panel **beside the tile**, the
			    way the reference shows it. It only reads; the cell below it still owns the click.
			    ⚠️ `!sold` is part of the guard, not only a nicety: a bought offer must never keep a card
			    on screen (its cell is replaced, so no pointer-leave fires there). */}
			{hovered && run.shop[hovered.index] && !run.shop[hovered.index].sold ? (
				<ShopOfferCard
					templateId={run.shop[hovered.index].templateId}
					star={run.shop[hovered.index].star}
					owner={owner}
					left={hovered.left}
					top={hovered.top}
					maxHeight={hovered.maxHeight}
				/>
			) : null}

			{/* The item image following the cursor while an item is dragged off the equipment board. */}
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
