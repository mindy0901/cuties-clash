/** Tailwind class strings shared across screens. */

import type { Quality, Star } from '../game/types'
import { cn } from '../lib/utils'

/**
 * Joins classes conditionally — and **resolves conflicts** (`border-gold` really replaces
 * `border-line`, `bg-ink-600` replaces `bg-ink-700`).
 *
 * ⚠️ Re-exported from `lib/utils` (`clsx` + `tailwind-merge`), ❌ never a plain `join(' ')`: with a
 * plain join both classes reached the DOM and the **stylesheet order** decided, so an "active" variant
 * silently lost to the base one — the selected admin entry kept the normal border and background.
 */
export { cn }

export const panelClass =
	'flex flex-col gap-3 rounded-panel border border-line bg-linear-to-b from-white/3 to-transparent bg-ink-800 p-3.5 shadow-panel'

export const panelTitleClass = 'text-base tracking-[0.02em]'

/**
 * Panel header: **title in the middle**, one column on each side.
 *
 * ⚠️ `minmax(0,1fr)` on both side columns, not bare `1fr`: the right side of a header can be wide
 * (item counts, the sort button), and an auto-sized `1fr` would grow it and push the title off-centre.
 */
export const panelHeadClass =
	'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5'

export type ShopDropTarget = 'equipment'

/** Small info box shaped like label — value. */
export const statClass =
	'flex items-center justify-between gap-2 rounded-lg border border-line bg-black/25 px-2 py-1.5 text-[13px] tabular-nums'

export const statGridClass = 'grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2'

export const labelClass = 'text-muted'

export const valueClass = 'font-semibold'

export const tagClass = 'rounded-md border border-line px-1.5 py-px text-[11px] whitespace-nowrap text-muted'

export const tagGoldClass = 'border-gold/45 text-gold-soft'

export const hintClass = 'm-0 text-[13px] text-muted'

/**
 * Backdrop shared by every dialog. `z-[45]` sits **above the arena's result panel** (`z-40`, which
 * covers the whole screen after a fight) and below the map screen (`z-50`) — without it, opening an
 * item's details from the arena put the dialog behind the result overlay.
 */
export const overlayClass =
	'fixed inset-0 z-[45] grid place-items-center bg-[rgb(6_5_4/78%)] p-6 backdrop-blur-[3px]'

export const dialogClass =
	'flex w-[min(560px,100%)] flex-col gap-3.5 rounded-dialog border border-line bg-ink-800 p-5 shadow-panel'

export const rowClass = 'flex flex-wrap items-center gap-2.5'

export const rowBetweenClass = 'flex flex-wrap items-center justify-between gap-2.5'

export const stackClass = 'flex flex-col gap-2.5'

export const gearRowClass = 'grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-1.5'

/**
 * The little square button drawn over an item tile (rotate / sell) and next to a form label (✕).
 *
 * ⚠️ The font size sets the **icon** size too (`svg.lucide` is `1em`), so 12px here is what makes the
 * glyph fit a 20px box — ❌ do not shrink it back to 11px.
 */
export const iconButtonClass =
	'grid size-5 place-items-center rounded-md border border-line bg-black/65 text-[12px] hover:border-gold'

/** Border per item class. Must be full class names so Tailwind sees them at build time. */
export const ITEM_BORDER_BY_CLASS: Record<string, string> = {
	melee: 'border-[#8c4a3d]',
	ranged: 'border-[#8c6b3d]',
	artifact: 'border-[#6b4a8c]',
	jade: 'border-[#8c7a3d]',
	accessory: 'border-[#8c7a3d]',
	armor: 'border-[#4a6b8c]',
	potion: 'border-[#3d8c6a]',
}

/**
 * Colour of the **stars** drawn on an item tile, by star rank: 1★ silver … 5★ gold-orange — the
 * same five steps as the quality palette, so a rank never looks unrelated to the rest of the UI.
 *
 * ⚠️ Upgrading a star must show **only two things**: one more star, and this colour. ❌ No different
 * art (one art per item), no glow, no extra frame.
 */
export const ITEM_STAR_TEXT: Record<Star, string> = {
	1: 'text-rank-1',
	2: 'text-rank-2',
	3: 'text-rank-3',
	4: 'text-rank-4',
	5: 'text-rank-5',
}

/**
 * Background colour of one quality, used by the admin page to **show the mapping** next to the
 * quality select. Solid (no alpha) so the swatch is readable on its own.
 */
export const ITEM_QUALITY_SWATCH: Record<Quality, string> = {
	1: 'bg-rank-1',
	2: 'bg-rank-2',
	3: 'bg-rank-3',
	4: 'bg-rank-4',
	5: 'bg-rank-5',
}

/**
 * Colour of an item tile, shared by every place that draws one (Trang bị, Kho đồ, shop, the
 * enemy grid in battle, the detail dialog) so they can never drift apart.
 *
 * The **background** is painted from the tile's `data-item-quality` in `styles/app.css` (a stack of
 * gradients + smoke, not a flat tint), so only the **class** border is decided here. The star rank is
 * shown by `ITEM_STAR_TEXT` on the stars themselves — ❌ it must not change the tile as well.
 */
export function itemTileClass(cls: string): string {
	return ITEM_BORDER_BY_CLASS[cls] ?? ''
}

export const STATUS_CHIP_DEBUFF = 'border-danger/60 text-[#f0b6ac]'
export const STATUS_CHIP_BUFF = 'border-jade/55 text-[#a6e3d5]'

/** Display names of the supported login providers. */
export const PROVIDER_LABELS: Record<string, string> = {
	google: 'Google',
}

