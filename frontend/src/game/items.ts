import type { ItemTemplate, ItemClass, Quality, Star } from './types'
import { kitDef } from './kits'
import { currentContentOverrides, mergeItem, overridesVersion } from './content'

/** Star-indexed values: `pick(star, [1★, 2★, 3★, 4★, 5★])`. */
export function pick(star: Star, values: readonly [number, number, number, number, number]): number {
	return values[star - 1]
}

const STAR_LABEL: Record<Star, string> = { 1: '1★', 2: '2★', 3: '3★', 4: '4★', 5: '5★' }

export function starLabel(star: Star): string {
	return STAR_LABEL[star]
}

export const CLASS_LABELS: Record<ItemClass, string> = {
	melee: 'Vũ khí cận chiến',
	ranged: 'Vũ khí tầm xa',
	artifact: 'Pháp khí',
	jade: 'Ngọc',
	accessory: 'Phụ kiện',
	armor: 'Giáp',
	potion: 'Đan dược',
}

/**
 * Whether a class swings at the enemy — the **three** weapon types: melee, ranged and artifact.
 *
 * Used by the aura targets `adjacentWeapon` / `adjacentNonWeapon` and by the support gems, so an
 * artifact counts as a weapon exactly like a melee blade does — it swings; it just leans on debuffs
 * (freeze / slow / poison) rather than on direct damage.
 */
export function isWeaponClass(cls: ItemClass): boolean {
	return cls === 'melee' || cls === 'ranged' || cls === 'artifact'
}

/**
 * A neighbour a **support gem can actually buff**: a weapon class that also **swings**.
 *
 * ⚠️ `isWeaponClass` alone is not enough. An `artifact` with no attack kit — a pure trinket such as
 * `the-icy-vow` (`freeze-reflect` only) — never produces a swing, so the engine never hands it a charge
 * buff; the direction overlay used to turn that arrow gold anyway and promised something that could not
 * happen. This mirrors `build.ts`, which builds one entry per **attack kit** and then filters by class.
 */
export function isBuffableWeapon(templateId: string): boolean {
	const template = getTemplate(templateId)
	if (!template || !isWeaponClass(template.cls)) return false
	return (template.kits ?? []).some((kit) => kitDef(kit.id).kind === 'attack')
}

/** Merging two of the same item at 5★ is not possible. */
export const MAX_STAR: Star = 5

/** Every star rank, in order — the single list the per-star UI and tests iterate. */
export const STARS: readonly Star[] = [1, 2, 3, 4, 5]

/** Vietnamese label of a quality band, shown in the admin editor. */
export const QUALITY_LABELS: Record<Quality, string> = {
	1: 'Bạc',
	2: 'Xanh lá',
	3: 'Lam',
	4: 'Tím',
	5: 'Vàng cam',
}

export const QUALITY_VALUES: readonly Quality[] = [1, 2, 3, 4, 5]

/**
 * Price of one item at `star`: the **number of 1★ copies** it is worth, `2^(star-1)`.
 *
 * Merging means a 3★ needs four copies and a 5★ sixteen, so a straight `cost × star` would have made
 * a high star far cheaper than the copies it is made of (3★ of a 3 🐾 item costs 12 🐾 to build,
 * not 9).
 */
export function starPrice(baseCost: number, star: Star): number {
	return baseCost * 2 ** (star - 1)
}

/**
 * Fallback **Cooldown Time**, in seconds: the gap between two swings when neither the item nor the
 * skill says otherwise. 1.6 s is the old 0.625 hits/s, kept so existing rows feel the same.
 */
export const DEFAULT_COOLDOWN = 1.6

/** Cooldown in seconds → the millisecond interval the simulation counts down. */
export function cooldownMs(seconds: number): number {
	return Math.max(0, Math.round(seconds * 1000))
}

/**
 * Items **shipped in code** — deliberately **empty**.
 *
 * Content lives in the database only (the admin page), so the game never carries a hardcoded item
 * list: itemCatalogue() builds everything from the stored rows. Keeping the export keeps the
 * rest of the engine (and the tests) talking about one catalogue instead of two sources.
 */
export const ITEM_TEMPLATES: ItemTemplate[] = []
export const ITEM_BY_ID: Record<string, ItemTemplate> = Object.fromEntries(
	ITEM_TEMPLATES.map((template) => [template.id, template]),
)

/** What a brand-new item starts from — the admin payload fills the rest in. */
function blankTemplate(id: string): ItemTemplate {
	return {
		id,
		name: id,
		icon: '❔',
		cls: 'artifact',
		tier: 1,
		quality: 1,
		cost: 1,
		space: { w: 1, h: 1 },
	}
}

let catalogue: ItemTemplate[] = ITEM_TEMPLATES
let catalogueById: Record<string, ItemTemplate> = ITEM_BY_ID
let catalogueVersion = -1

/**
 * The **live** item list: the code templates with their overrides, **plus** items created on the
 * admin page, **minus** items the admin deleted (`removed: true` in the override).
 *
 * ⚠️ Everything that lists or rolls items must read this instead of `ITEM_TEMPLATES`: a created item
 * has to reach the shop, and a deleted one must stop dropping — while `ITEM_TEMPLATES` stays the
 * untouched code catalogue that tests and docs talk about.
 */
export function itemCatalogue(): ItemTemplate[] {
	if (catalogueVersion === overridesVersion()) return catalogue
	catalogueVersion = overridesVersion()

	// The database is the **only** source: one row per item. A row marked `removed` is a leftover from
	// the old soft-delete and is skipped, so it can never come back.
	const overrides = currentContentOverrides().items
	const items: ItemTemplate[] = []
	for (const [id, payload] of Object.entries(overrides)) {
		if (payload?.removed === true) continue
		items.push(mergeItem(ITEM_BY_ID[id] ?? blankTemplate(id), payload))
	}

	catalogue = items
	catalogueById = Object.fromEntries(items.map((template) => [template.id, template]))
	return catalogue
}

/** One item by id, or `undefined` when it does not exist (or the admin deleted it). */
export function itemTemplateById(templateId: string): ItemTemplate | undefined {
	itemCatalogue()
	return catalogueById[templateId]
}

/**
 * Shown for an id that exists **nowhere** — a created item whose row has not arrived yet (the store
 * rehydrates before `/api/content` answers) or one the admin just deleted.
 *
 * ❌ Never throw there: a bag entry that cannot draw is a **blank page**, and the player then has no
 * UI at all. The placeholder is 1×1 and has no kits, so it cannot reach a fight (`build.ts` filters
 * on `itemTemplateById`) and renders as a ❔ tile with the raw id until the overlay lands.
 */
const UNKNOWN_TEMPLATE: ItemTemplate = {
	id: 'unknown',
	name: 'unknown',
	icon: '❔',
	cls: 'artifact',
	tier: 1,
	quality: 1,
	cost: 1,
	space: { w: 1, h: 1 },
}

/**
 * Template **with the admin overlay applied** (if any).
 *
 * ⚠️ Falls back to the **code** template when the admin deleted the item, and to a neutral
 * placeholder for an id that is in neither the catalogue nor the code — see `UNKNOWN_TEMPLATE`. A bag
 * or shop entry that still holds such an id has to keep drawing, otherwise the first render after a
 * reload would be a blank page.
 */
export function getTemplate(templateId: string): ItemTemplate {
	const template = itemTemplateById(templateId) ?? ITEM_BY_ID[templateId]
	if (!template) return { ...UNKNOWN_TEMPLATE, id: templateId, name: templateId }
	return template
}

/**
 * Items whose `tier` is at most `tier`, **with the admin overlay applied**.
 *
 * ⚠️ Roll pools (shop, enemy gear, PvP rival gear) must go through this instead of filtering
 * `ITEM_TEMPLATES` directly: changing `tier` on the admin page has to **actually take effect**,
 * otherwise the editor sees battles keep using the old items and has no idea why.
 */
export function itemTemplatesUpToTier(tier: number): ItemTemplate[] {
	return itemCatalogue().filter((template) => template.tier <= tier)
}

/** Longest id the backend accepts for a content row. */
const MAX_ITEM_ID = 49

/**
 * Vietnamese letters Unicode does **not** decompose, so `normalize('NFD')` alone would keep them and
 * the slug would come out empty.
 */
const SLUG_LETTERS: Record<string, string> = {
	đ: 'd',
	Đ: 'd',
	ơ: 'o',
	Ơ: 'o',
	ư: 'u',
	Ư: 'u',
}

/**
 * The **code** of an item, generated from the name the admin typed — ❌ the admin never types an id.
 *
 * "Kiếm Sắt" → `kiem-sat`: tones are stripped (`NFD` + the letters above), everything that is not a
 * letter or a digit becomes a dash, and the dashes at both ends are trimmed. A name with no Latin
 * letters at all (e.g. Chinese) gives `''` and the caller falls back to `mon`.
 */
export function itemCodeFromName(name: string): string {
	return name
		.trim()
		.split('')
		.map((char) => SLUG_LETTERS[char] ?? char)
		.join('')
		.normalize('NFD')
		// Combining marks left behind by NFD (all the Vietnamese tones and the breve/circumflex).
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_ITEM_ID)
		.replace(/-+$/, '')
}

/**
 * First free code for a name: `kiem-sat`, then `kiem-sat-2`, `kiem-sat-3`…
 *
 * The catalogue is asked, not just the code templates, so two admins naming an item the same thing
 * never overwrite each other — the second one simply becomes `kiem-sat-2`.
 */
export function uniqueItemCode(name: string): string {
	const base = itemCodeFromName(name) || 'mon'
	const taken = (id: string) => Boolean(ITEM_BY_ID[id]) || Boolean(itemTemplateById(id))
	if (!taken(base)) return base
	for (let suffix = 2; suffix < 10_000; suffix += 1) {
		const tail = `-${suffix}`
		const candidate = `${base.slice(0, MAX_ITEM_ID - tail.length).replace(/-+$/, '')}${tail}`
		if (!taken(candidate)) return candidate
	}
	return `${base.slice(0, 40)}-moi`
}
