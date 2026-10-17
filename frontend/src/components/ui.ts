/** Tailwind class strings shared across screens. */

import type { Quality, Star } from '../game/types'

/** Joins classes conditionally, skipping empty values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
	return parts.filter(Boolean).join(' ')
}

export const panelClass =
	'flex flex-col gap-3 rounded-panel border border-line bg-linear-to-b from-white/3 to-transparent bg-ink-800 p-3.5 shadow-panel'

export const panelTitleClass = 'text-base tracking-[0.02em]'

export const panelHeadClass = 'flex items-center justify-between gap-2.5'

export const btnClass =
	'inline-flex items-center gap-2 rounded-[10px] border border-line bg-ink-700 px-3.5 py-2 transition-[transform,background-color,border-color] duration-[80ms] hover:not-disabled:border-gold hover:not-disabled:bg-ink-600 active:not-disabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-45'

export const btnPrimaryClass =
	'border-[#7d2318] bg-linear-to-b from-danger-soft to-danger font-semibold text-white hover:not-disabled:border-gold hover:not-disabled:from-[#ea6c5c] hover:not-disabled:to-danger-soft'

export const btnGoldClass =
	'border-[#8a6316] bg-linear-to-b from-gold-soft to-gold font-bold text-ink-900 hover:not-disabled:border-white'

export const btnGhostClass = 'bg-transparent'

export const btnSmClass = 'rounded-lg px-2.5 py-1.5 text-[13px]'

export const btnBlockClass = 'w-full justify-center'

/** Small info box shaped like label — value. */
export const statClass =
	'flex justify-between gap-2 rounded-lg border border-line bg-black/25 px-2 py-1.5 text-[13px] tabular-nums'

export const statGridClass = 'grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2'

export const labelClass = 'text-muted'

export const valueClass = 'font-semibold'

export const tagClass = 'rounded-md border border-line px-1.5 py-px text-[11px] whitespace-nowrap text-muted'

export const tagGoldClass = 'border-gold/45 text-gold-soft'

export const hintClass = 'm-0 text-[13px] text-muted'

export const overlayClass =
	'fixed inset-0 z-30 grid place-items-center bg-[rgb(6_5_4/78%)] p-6 backdrop-blur-[3px]'

export const dialogClass =
	'flex w-[min(560px,100%)] flex-col gap-3.5 rounded-dialog border border-line bg-ink-800 p-5 shadow-panel'

export const rowClass = 'flex flex-wrap items-center gap-2.5'

export const rowBetweenClass = 'flex flex-wrap items-center justify-between gap-2.5'

export const stackClass = 'flex flex-col gap-2.5'

export const gearRowClass = 'grid grid-cols-[repeat(auto-fill,minmax(58px,1fr))] gap-1.5'

export const iconButtonClass =
	'grid size-5 place-items-center rounded-md border border-line bg-black/65 text-[11px] hover:border-gold'

/** Border per item class. Must be full class names so Tailwind sees them at build time. */
export const ITEM_BORDER_BY_CLASS: Record<string, string> = {
	weapon: 'border-[#8c4a3d]',
	armor: 'border-[#4a6b8c]',
	souljade: 'border-[#6b4a8c]',
	curio: 'border-[#8c7a3d]',
	potion: 'border-[#3d8c6a]',
}

/**
 * Tile **background** per item quality: 1 = silver … 5 = gold-orange.
 *
 * ⚠️ Full class names, never a dynamic `` `bg-rank-${q}` `` — Tailwind only emits classes it can
 * see literally in the source. The colour tokens live in `src/styles/app.css` (`@theme`).
 */
export const ITEM_QUALITY_BG: Record<Quality, string> = {
	1: 'bg-rank-1/22',
	2: 'bg-rank-2/22',
	3: 'bg-rank-3/22',
	4: 'bg-rank-4/22',
	5: 'bg-rank-5/28',
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
 * enemy grid in battle, the detail dialog) so they can never drift apart:
 * the **quality** colours the background and the **class** the border. The star rank is shown by
 * `ITEM_STAR_TEXT` on the stars themselves — ❌ it must not change the tile as well.
 */
export function itemTileClass(cls: string, quality: Quality): string {
	return cn(ITEM_QUALITY_BG[quality] ?? '', ITEM_BORDER_BY_CLASS[cls] ?? '')
}

export const STATUS_CHIP_DEBUFF = 'border-danger/60 text-[#f0b6ac]'
export const STATUS_CHIP_BUFF = 'border-jade/55 text-[#a6e3d5]'

/** Display names of the supported login providers. */
export const PROVIDER_LABELS: Record<string, string> = {
	google: 'Google',
}
