/**
 * Content edited from the admin page: **validation** of everything sent by the client
 * before it is stored.
 *
 * ⚠️ WHY THE SERVER VALIDATES EVEN THOUGH GAME RULES LIVE IN THE FRONTEND: these numbers are
 * fed into `simulateBattle` for **every** player, so a value of the wrong type (a string
 * instead of a number, `space.w` equal to 0) or a mistyped key would break the fight for
 * everyone, not just for whoever edited it. The server therefore enforces:
 *
 *   * only keys on the whitelist are accepted — anything else is a 400 and is **not stored**;
 *   * types and sane ranges for every field.
 *
 * The server does NOT balance numbers and does NOT contain game rules — it only keeps the
 * data in the right shape.
 *
 * Fields that are **functions** in code (`active`, `onHit`) are not accepted here: JSON
 * cannot represent a function, so they stay in `game/items.ts` and the admin page only shows
 * them read-only.
 */

import { badRequest } from './errors'
import type { Db } from './db'

export const CONTENT_KINDS = ['item', 'pet'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]

/** Editable values: plain JSON, already validated. */
export type ContentPayload = Record<string, unknown>

/** Entity name: `wooden-blade`, `fire-pup` — lowercase letters, digits and dashes. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

const ITEM_CLASSES = ['weapon', 'armor', 'souljade', 'curio', 'potion'] as const
const AURA_TARGETS = ['adjacent', 'adjacentWeapon', 'adjacentNonWeapon', 'all'] as const
const ART_EXTS = ['png', 'svg', 'webp'] as const
const STARS = [1, 2, 3, 4] as const

/** Must match `StatKey` in `frontend/src/game/stats.ts`. */
const STAT_KEYS = [
	'atk',
	'atkPct',
	'critRate',
	'lifesteal',
	'dr',
	'maxHp',
	'seRegen',
	'haste',
	'counterChance',
	'counterPower',
	'shield',
] as const

export function isContentKind(value: string): value is ContentKind {
	return (CONTENT_KINDS as readonly string[]).includes(value)
}

export function assertEntityId(id: string): string {
	if (!ID_PATTERN.test(id)) {
		throw badRequest('Invalid content id: use lowercase letters, digits and dashes.', 'invalid_id')
	}
	return id
}

/** Row key for an override: `item:wooden-blade`. */
export function contentOverrideId(kind: ContentKind, id: string): string {
	return `${kind}:${id}`
}

// ── Type checks ──────────────────────────────────────────────────────────────

function fieldError(field: string, expected: string): never {
	throw badRequest(`Field "${field}" is invalid: ${expected}.`, 'invalid_content')
}

function asString(field: string, value: unknown, maxLength: number): string {
	if (typeof value !== 'string') fieldError(field, 'must be a string')
	const trimmed = (value as string).trim()
	if (trimmed.length === 0 || trimmed.length > maxLength) {
		fieldError(field, `must be 1–${maxLength} characters`)
	}
	return trimmed
}

function asNumber(field: string, value: unknown, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) fieldError(field, 'must be a number')
	const number = value as number
	if (number < min || number > max) fieldError(field, `must be between ${min} and ${max}`)
	return number
}

function asInteger(field: string, value: unknown, min: number, max: number): number {
	const number = asNumber(field, value, min, max)
	if (!Number.isInteger(number)) fieldError(field, 'must be a whole number')
	return number
}

function asBoolean(field: string, value: unknown): boolean {
	if (typeof value !== 'boolean') fieldError(field, 'must be true or false')
	return value as boolean
}

function asOneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
	if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
		fieldError(field, `must be one of: ${allowed.join(', ')}`)
	}
	return value as T
}

/**
 * A **per-star** field: exactly 4 entries, each checked by `check`.
 *
 * Why 4: templates in code declare values per star rank (1★…4★) and the client rebuilds the
 * function from this array. A missing or extra entry would silently lose a star rank.
 */
function asPerStar<T>(field: string, value: unknown, check: (index: number, raw: unknown) => T): T[] {
	if (!Array.isArray(value) || value.length !== STARS.length) {
		fieldError(field, 'must be an array of exactly 4 entries, in 1★ → 4★ order')
	}
	return (value as unknown[]).map((raw, index) => check(index + 1, raw))
}

/** `StatMods` table — only keys from `STAT_KEYS` are accepted. */
function asStatMods(field: string, value: unknown): Record<string, number> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		fieldError(field, 'must be a stat table')
	}
	const mods: Record<string, number> = {}
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		if (!(STAT_KEYS as readonly string[]).includes(key)) {
			fieldError(`${field}.${key}`, `is not a known stat (${STAT_KEYS.join(', ')})`)
		}
		mods[key] = asNumber(`${field}.${key}`, raw, -1000, 1000)
	}
	if (Object.keys(mods).length === 0) fieldError(field, 'must contain at least one stat')
	return mods
}

function asSpace(field: string, value: unknown): { w: number; h: number } {
	if (typeof value !== 'object' || value === null) fieldError(field, 'must be { w, h }')
	const raw = value as Record<string, unknown>
	return {
		w: asInteger(`${field}.w`, raw.w, 1, 4),
		h: asInteger(`${field}.h`, raw.h, 1, 5),
	}
}

function asStars(field: string, value: unknown): number[] {
	if (!Array.isArray(value)) fieldError(field, 'must be an array of star ranks')
	const stars = [...new Set(value as unknown[])].map((raw) => asInteger(field, raw, 1, 4))
	if (stars.length !== (value as unknown[]).length) fieldError(field, 'must not repeat a star rank')
	return stars.sort((a, b) => a - b)
}

// ── Editable fields ──────────────────────────────────────────────────────────

type FieldCheck = (field: string, value: unknown) => unknown

/** Editable **item** fields — must match `ItemTemplate` in `game/types.ts`. */
const ITEM_FIELDS: Record<string, FieldCheck> = {
	name: (field, value) => asString(field, value, 80),
	icon: (field, value) => asString(field, value, 8),
	cls: (field, value) => asOneOf(field, value, ITEM_CLASSES),
	tier: (field, value) => asInteger(field, value, 1, 3),
	cost: (field, value) => asInteger(field, value, 1, 999),
	space: asSpace,
	stars: asStars,
	artExt: (field, value) => asOneOf(field, value, ART_EXTS),
	/** Description per star — 4 strings. */
	desc: (field, value) =>
		asPerStar(field, value, (index, raw) => asString(`${field}[${index}★]`, raw, 300)),
	damage: (field, value) =>
		asPerStar(field, value, (index, raw) => asNumber(`${field}[${index}★]`, raw, 0, 100_000)),
	attackInterval: (field, value) =>
		asPerStar(field, value, (index, raw) => asInteger(`${field}[${index}★]`, raw, 100, 60_000)),
	interval: (field, value) =>
		asPerStar(field, value, (index, raw) => asInteger(`${field}[${index}★]`, raw, 100, 60_000)),
	passive: (field, value) =>
		asPerStar(field, value, (index, raw) => asStatMods(`${field}[${index}★]`, raw)),
	aura: (field, value) =>
		asPerStar(field, value, (index, raw) => {
			const label = `${field}[${index}★]`
			if (typeof raw !== 'object' || raw === null) fieldError(label, 'must be { target, mods }')
			const entry = raw as Record<string, unknown>
			return {
				target: asOneOf(`${label}.target`, entry.target, AURA_TARGETS),
				mods: asStatMods(`${label}.mods`, entry.mods),
			}
		}),
}

/** Editable **pet** fields — must match `PetDef` in `game/types.ts`. */
const PET_FIELDS: Record<string, FieldCheck> = {
	name: (field, value) => asString(field, value, 80),
	icon: (field, value) => asString(field, value, 8),
	blurb: (field, value) => asString(field, value, 400),
	unlockStage: (field, value) => asInteger(field, value, 0, 60),
	maxHp: (field, value) => asInteger(field, value, 50, 100_000),
	maxSe: (field, value) => asInteger(field, value, 10, 1000),
	seRegen: (field, value) => asNumber(field, value, 0, 100),
	counterChance: (field, value) => asNumber(field, value, 0, 1),
	art: asBoolean,
	artExt: (field, value) => asOneOf(field, value, ART_EXTS),
	skillArt: asBoolean,
	skillArtExt: (field, value) => asOneOf(field, value, ART_EXTS),
	avatar: asBoolean,
	avatarExt: (field, value) => asOneOf(field, value, ART_EXTS),
	/** Innate skill, treated as a weapon. */
	skill: (field, value) => {
		if (typeof value !== 'object' || value === null) {
			fieldError(field, 'must be { name, interval, damage, desc }')
		}
		const raw = value as Record<string, unknown>
		return {
			name: asString(`${field}.name`, raw.name, 80),
			interval: asInteger(`${field}.interval`, raw.interval, 100, 60_000),
			damage: asNumber(`${field}.damage`, raw.damage, 0, 100_000),
			desc: asString(`${field}.desc`, raw.desc, 300),
		}
	},
	/**
	 * Bag grid per pet level (5 levels).
	 *
	 * ⚠️ `width` stays exactly 4: the prep screen and the battle arena lay the grid out in 4
	 * columns (`GRID_WIDTH`, `GRID_MAX_CELLS`), so a different width would shift cells and
	 * lock usable ones away.
	 */
	bags: (field, value) => {
		if (!Array.isArray(value) || value.length !== 5) fieldError(field, 'must have exactly 5 levels')
		return (value as unknown[]).map((raw, index) => {
			const label = `${field}[level ${index + 1}]`
			if (typeof raw !== 'object' || raw === null) fieldError(label, 'must be { width, rows }')
			const entry = raw as Record<string, unknown>
			const width = asInteger(`${label}.width`, entry.width, 4, 4)
			return { width, rows: asInteger(`${label}.rows`, entry.rows, 1, 5) }
		})
	},
}

const FIELDS: Record<ContentKind, Record<string, FieldCheck>> = { item: ITEM_FIELDS, pet: PET_FIELDS }

/** Editable keys for a kind (the admin page lists them). */
export function allowedFields(kind: ContentKind): string[] {
	return Object.keys(FIELDS[kind])
}

/**
 * Validate a payload and return the normalised copy (trimmed strings, sorted arrays…).
 *
 * ❌ Unknown keys are rejected: a mistyped key that reaches the database would sit there
 * silently doing nothing while the editor believes the change took effect.
 */
export function validateContentPayload(kind: ContentKind, payload: unknown): ContentPayload {
	if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
		throw badRequest('Payload must be a JSON object.', 'invalid_content')
	}

	const fields = FIELDS[kind]
	const clean: ContentPayload = {}
	for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
		const check = fields[key]
		if (!check) {
			throw badRequest(
				`Field "${key}" is not editable on ${kind === 'item' ? 'items' : 'pets'}.`,
				'unknown_field',
			)
		}
		clean[key] = check(key, value)
	}

	if (Object.keys(clean).length === 0) {
		throw badRequest('There is nothing to save.', 'empty_content')
	}
	return clean
}

// ── Read / write ─────────────────────────────────────────────────────────────

export interface ContentOverrideRow {
	kind: ContentKind
	entityId: string
	payload: ContentPayload
	updatedAt: string
	updatedBy: string | null
}

export interface ContentOut {
	items: Record<string, ContentPayload>
	pets: Record<string, ContentPayload>
}

/** Raw rows, so the admin page can tell which entities are overridden and by whom. */
export async function listContentOverrides(db: Db): Promise<ContentOverrideRow[]> {
	const rows = await db.contentOverride.findMany({ orderBy: { id: 'asc' } })
	return rows.flatMap((row) => {
		const [kind, ...rest] = row.id.split(':')
		const entityId = rest.join(':')
		if (!isContentKind(kind) || entityId.length === 0) return []
		return [
			{
				kind,
				entityId,
				payload: JSON.parse(row.payload) as ContentPayload,
				updatedAt: row.updatedAt.toISOString(),
				updatedBy: row.updatedBy,
			},
		]
	})
}

/** The shape the game client needs: `{ items: { id: payload }, pets: { id: payload } }`. */
export async function readContent(db: Db): Promise<ContentOut> {
	const overrides = await listContentOverrides(db)
	const out: ContentOut = { items: {}, pets: {} }
	for (const override of overrides) {
		out[override.kind === 'item' ? 'items' : 'pets'][override.entityId] = override.payload
	}
	return out
}

export async function saveContentOverride(
	db: Db,
	kind: ContentKind,
	entityId: string,
	payload: ContentPayload,
	updatedBy: string | null,
): Promise<ContentOverrideRow> {
	const row = await db.contentOverride.upsert({
		where: { id: contentOverrideId(kind, entityId) },
		create: {
			id: contentOverrideId(kind, entityId),
			kind,
			payload: JSON.stringify(payload),
			updatedAt: new Date(),
			updatedBy,
		},
		update: { payload: JSON.stringify(payload), updatedAt: new Date(), updatedBy },
	})
	return {
		kind,
		entityId,
		payload,
		updatedAt: row.updatedAt.toISOString(),
		updatedBy: row.updatedBy,
	}
}

/** Deleting a row puts that entity back on the code default. */
export async function deleteContentOverride(db: Db, kind: ContentKind, entityId: string): Promise<void> {
	await db.contentOverride.deleteMany({ where: { id: contentOverrideId(kind, entityId) } })
}
