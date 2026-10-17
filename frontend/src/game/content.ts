/**
 * Content edited from the admin page: **merged over** the templates in code.
 *
 * ⚠️ WHY NOT EDIT `items.ts`/`pets.ts` DIRECTLY: the code copy is the **default source** —
 * anonymous play, no network, or an empty database all have to keep the game complete. Server
 * content is only an overlay, and deleting a row returns the entity to its default.
 *
 * Per-star fields in code are **functions** (`damage: (star) => …`) while JSON can only
 * carry data (an array of exactly 5 entries, 1★ → 5★). `ITEM_UNPACKERS` rebuilds the function
 * from the array — **one single lookup table**, so adding a new per-star field only means
 * touching one place.
 *
 * ⚠️ Every merge step is **defensive**: a broken row (hand-edited in the database) is skipped
 * instead of throwing during render — throwing here means a blank page.
 */

import type { ItemTemplate, PetDef, Quality, Star, StatMods, AuraTarget } from './types'

/** Raw override for one entity: values already type-checked by the server. */
export type ContentOverride = Record<string, unknown>

export interface ContentOverrides {
	items: Record<string, ContentOverride>
	pets: Record<string, ContentOverride>
}

const EMPTY: ContentOverrides = { items: {}, pets: {} }

let overrides: ContentOverrides = EMPTY

/** Load overrides from the server. Pass `null`/`{}` to fall back to the code defaults. */
export function applyContentOverrides(next: Partial<ContentOverrides> | null | undefined): void {
	overrides = {
		items: isRecord(next?.items) ? (next.items as Record<string, ContentOverride>) : {},
		pets: isRecord(next?.pets) ? (next.pets as Record<string, ContentOverride>) : {},
	}
}

/** Overlay currently applied — the admin page uses it to mark overridden entities. */
export function currentContentOverrides(): ContentOverrides {
	return overrides
}

export function itemOverride(id: string): ContentOverride | undefined {
	return overrides.items[id]
}

export function petOverride(id: string): ContentOverride | undefined {
	return overrides.pets[id]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Number of star ranks every per-star field carries (1★ → 5★). */
const STAR_COUNT = 5

/** Rebuild a per-star function from an array with one entry per star rank. */
function perStar<T>(values: unknown): (star: Star) => T {
	if (!Array.isArray(values) || values.length !== STAR_COUNT) {
		throw new Error(`perStar: expected exactly ${STAR_COUNT} entries`)
	}
	const fixed = [...values] as T[]
	return (star) => fixed[star - 1]!
}

/** Per-star array of numbers. */
function perStarNumber(values: unknown): (star: Star) => number {
	if (!Array.isArray(values) || values.length !== STAR_COUNT) {
		throw new Error(`perStarNumber: expected exactly ${STAR_COUNT} entries`)
	}
	if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
		throw new Error('perStarNumber: entries must be numbers')
	}
	return perStar<number>(values)
}

/** Per-star array of `StatMods` tables. */
function perStarStatMods(values: unknown): (star: Star) => StatMods {
	if (!Array.isArray(values) || values.length !== STAR_COUNT || !values.every(isRecord)) {
		throw new Error(`perStarStatMods: expected ${STAR_COUNT} stat tables`)
	}
	return perStar<StatMods>(values)
}

/** Per-star array of `{ target, mods }` aura entries. */
function perStarAura(values: unknown): (star: Star) => { target: AuraTarget; mods: StatMods } {
	if (!Array.isArray(values) || values.length !== STAR_COUNT || !values.every(isRecord)) {
		throw new Error(`perStarAura: expected ${STAR_COUNT} { target, mods } entries`)
	}
	return perStar<{ target: AuraTarget; mods: StatMods }>(values)
}

/** Lookup table: JSON data → the function `ItemTemplate` expects. */
const ITEM_UNPACKERS: Record<string, (value: unknown) => unknown> = {
	desc: (value) => {
		if (
			!Array.isArray(value) ||
			value.length !== STAR_COUNT ||
			!value.every((entry) => typeof entry === 'string')
		) {
			throw new Error(`desc: expected ${STAR_COUNT} strings`)
		}
		return perStar<string>(value)
	},
	damage: perStarNumber,
	attackInterval: perStarNumber,
	interval: perStarNumber,
	passive: perStarStatMods,
	aura: perStarAura,
}

function isPositiveInt(value: unknown, max: number): boolean {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max
}

/**
 * Merge one item override over the base template.
 *
 * A broken field is skipped **on its own** while the remaining fields still apply, so one bad
 * value does not throw away the whole edit.
 */
export function mergeItem(base: ItemTemplate, override: ContentOverride | undefined): ItemTemplate {
	if (!override) return base
	const next: ItemTemplate = { ...base }

	for (const [key, value] of Object.entries(override)) {
		try {
			if (key === 'space') {
				if (isRecord(value) && isPositiveInt(value.w, 4) && isPositiveInt(value.h, 5)) {
					next.space = { w: value.w as number, h: value.h as number }
				}
				continue
			}
			if (key === 'stars') {
				if (Array.isArray(value) && value.length > 0 && value.every((star) => star >= 1 && star <= 5)) {
					next.stars = [...value] as Star[]
				}
				continue
			}
			if (key === 'quality') {
				if (isPositiveInt(value, 5)) next.quality = value as Quality
				continue
			}
			if (key === 'name' || key === 'icon' || key === 'cls' || key === 'artExt') {
				if (typeof value === 'string' && value.length > 0) Object.assign(next, { [key]: value })
				continue
			}
			if (key === 'cost' || key === 'tier') {
				if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
					Object.assign(next, { [key]: value })
				}
				continue
			}
			const unpack = ITEM_UNPACKERS[key]
			if (unpack) Object.assign(next, { [key]: unpack(value) })
		} catch {
			// Skip just this field and keep the value from code.
		}
	}

	return next
}

/** Merge one pet override over the base definition. `skill` is nested, so it merges per key. */
export function mergePet(base: PetDef, override: ContentOverride | undefined): PetDef {
	if (!override) return base
	const next: PetDef = { ...base }
	const skill: PetDef['skill'] = { ...base.skill }

	for (const [key, value] of Object.entries(override)) {
		try {
			if (key === 'skill') {
				if (isRecord(value)) {
					if (typeof value.name === 'string' && value.name.length > 0) skill.name = value.name
					if (typeof value.desc === 'string' && value.desc.length > 0) skill.desc = value.desc
					if (typeof value.interval === 'number' && value.interval > 0) skill.interval = value.interval
					if (typeof value.damage === 'number' && Number.isFinite(value.damage)) {
						skill.damage = value.damage
					}
				}
				continue
			}
			if (key === 'bags') {
				if (
					Array.isArray(value) &&
					value.length === base.bags.length &&
					value.every((entry) => isRecord(entry) && isPositiveInt(entry.rows, 5))
				) {
					next.bags = value.map((entry, index) => ({
						width: base.bags[index]!.width,
						rows: (entry as { rows: number }).rows,
					}))
				}
				continue
			}
			if (key === 'name' || key === 'icon' || key === 'blurb') {
				if (typeof value === 'string' && value.length > 0) Object.assign(next, { [key]: value })
				continue
			}
			if (key === 'art' || key === 'skillArt' || key === 'avatar') {
				if (typeof value === 'boolean') Object.assign(next, { [key]: value })
				continue
			}
			if (key === 'artExt' || key === 'skillArtExt' || key === 'avatarExt') {
				if (value === 'png' || value === 'svg' || value === 'webp') {
					Object.assign(next, { [key]: value })
				}
				continue
			}
			if (key === 'unlockStage' || key === 'maxHp' || key === 'maxSe') {
				if (isPositiveInt(value, 1_000_000) || value === 0) Object.assign(next, { [key]: value })
				continue
			}
			if (key === 'seRegen' || key === 'counterChance') {
				if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
					Object.assign(next, { [key]: value })
				}
			}
		} catch {
			// Skip just this field.
		}
	}

	next.skill = skill
	return next
}
