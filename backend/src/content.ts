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

import { Prisma } from '@prisma/client'
import { badRequest } from './errors'
import type { Db } from './db'

export const CONTENT_KINDS = ['item', 'cutie'] as const
export type ContentKind = (typeof CONTENT_KINDS)[number]


/** Editable values: plain JSON, already validated. */
export type ContentPayload = Record<string, unknown>

/** Entity name: `wooden-blade`, `fire-pup` — lowercase letters, digits and dashes. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * Must match `ItemClass` in `frontend/src/game/types.ts`. `melee` / `ranged` / `artifact` are the
 * **three weapon types**; `focus` is the old name of `artifact` and is accepted for an old row, then
 * stored as `artifact`.
 */
const ITEM_CLASSES = ['melee', 'ranged', 'artifact', 'jade', 'accessory', 'armor', 'potion'] as const
const LEGACY_ITEM_CLASSES: Record<string, string> = { focus: 'artifact', jewelry: 'jade' }
/** Must match `ItemKitId` in `frontend/src/game/types.ts` / `KIT_DEFS` in `game/kits.ts`. */
const ATTACK_KIT_IDS = ['basic-attack'] as const
/**
 * The charged variant — a **sub-kit inside** `basic-attack`, never a kit at the item's top level: it
 * has no rhythm of its own, it replaces one swing of the basic attack.
 */
const CHARGE_KIT_IDS = ['charge-attack'] as const
const ON_HIT_KIT_IDS = [
	'burn-on-hit',
	'poison-on-hit',
	'slow-on-hit',
	'freeze-on-hit',
	'lifesteal-on-hit',
	'shield-on-hit',
	'sword-energy-on-hit',
	'brittle-on-hit',
	'wound-on-hit',
	'weaken-on-hit',
	'shock-on-hit',
] as const
/** Option kits that sit beside the main kit — `parry` (Chấn Đao) is one of them now. */
const OPTION_KIT_IDS = [
	'stats',
	'damage-boost',
	'sword-energy',
	'aura',
	'parry',
	'freeze-haste',
	'freeze-heal',
	'freeze-reflect',
	'slow-strike',
	'rage-on-hit',
	'rage-on-heal',
	'armor-on-heal',
	'se-drain',
	'heal-haste',
	'damage-reduction',
	'starting-shield',
	'healing-boost',
	'regen',
	'block-chance',
	'debuff-heal',
	'block-charged',
	'shield-when-hit',
	'cleanse',
	'overcharge',
] as const
const ITEM_KIT_IDS = [...ATTACK_KIT_IDS, ...OPTION_KIT_IDS] as const
/**
 * Option kits that may appear **more than once** on one item: `stats` and `aura` each carry a single
 * stat, so a second stat is a second kit. Must match `REPEATABLE_OPTION_KITS` in `game/kits.ts`.
 */
const REPEATABLE_KIT_IDS: readonly string[] = ['stats', 'aura']
const AURA_TARGETS = ['adjacent', 'adjacentWeapon', 'adjacentNonWeapon', 'all'] as const
const STARS = [1, 2, 3, 4, 5] as const

/** The engine half of a kit: how `build.ts` treats it. */
export type KitKind = 'attack' | 'onHit' | 'charge' | 'option'

/** One kit id the client may attach, and the mechanic it runs on. */
export interface KitRuntime {
	kind: KitKind
	mechanic: string
}

/**
 * Mechanic → engine kind, from the whitelists above.
 *
 * ⚠️ This is the **only** thing the server knows about a kit, and it must stay a copy of
 * `KIT_DEFS[i].kind` in `frontend/src/game/kits.ts` — a kit added there must be added here, or its
 * payload is rejected. Everything else about a kit (labels, categories, default numbers) is data.
 */
const KIT_KIND_BY_MECHANIC: Record<string, KitKind> = Object.fromEntries([
	...ATTACK_KIT_IDS.map((id) => [id, 'attack' as const]),
	...ON_HIT_KIT_IDS.map((id) => [id, 'onHit' as const]),
	...CHARGE_KIT_IDS.map((id) => [id, 'charge' as const]),
	...OPTION_KIT_IDS.map((id) => [id, 'option' as const]),
])

const KIT_APPLIES_TO = ['both', 'item'] as const

export function isMechanic(value: string): boolean {
	return Object.hasOwn(KIT_KIND_BY_MECHANIC, value)
}

/** Default runtime map: the code mechanics only (validation without a catalogue). */
const CODE_KIT_RUNTIME: Map<string, KitRuntime> = new Map(
	Object.entries(KIT_KIND_BY_MECHANIC).map(([id, kind]) => [id, { kind, mechanic: id }]),
)

/** Must match `StatKey` in `frontend/src/game/stats.ts`. */
const STAT_KEYS = [
	'atk',
	'atkPct',
	'critRate',
	'critDamage',
	'lifesteal',
	'dr',
	'maxHp',
	'haste',
	'shield',
] as const

/**
 * Sword Energy is **not** a plain stat: it may only be changed by the `sword-energy` kit, so a
 * `stats` / `aura` table that tries to set it is rejected with this explanation instead of the
 * generic "unknown stat" message.
 */
const SE_STAT_KEY = 'seRegen'

export function isContentKind(value: string): value is ContentKind {
	return (CONTENT_KINDS as readonly string[]).includes(value)
}

export function assertEntityId(id: string): string {
	if (!ID_PATTERN.test(id)) {
		throw badRequest('Invalid content id: use lowercase letters, digits and dashes.', 'invalid_id')
	}
	return id
}

/**
 * Row key of one uploaded picture: `item:wooden-blade`.
 *
 * ⚠️ Items and Cuties have their own tables now, so this key only survives for `content_art` — the
 * picture is deliberately **not** a column of the entity (deleting/restoring a row must never touch
 * the bytes, and one picture per entity is the whole model).
 */
export function artKey(kind: ContentKind, id: string): string {
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
 * A **per-star** field: exactly 5 entries, each checked by `check`.
 *
 * Why 5: templates in code declare values per star rank (1★…5★) and the client rebuilds the
 * function from this array. A missing or extra entry would silently lose a star rank.
 */
function asPerStar<T>(field: string, value: unknown, check: (index: number, raw: unknown) => T): T[] {
	if (!Array.isArray(value) || value.length !== STARS.length) {
		fieldError(field, `must be an array of exactly ${STARS.length} entries, in 1★ → 5★ order`)
	}
	return (value as unknown[]).map((raw, index) => check(index + 1, raw))
}

/** Per-star parameter table of one kit. */
function asKitParams(label: string, value: unknown): Record<string, number[]> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		fieldError(`${label}.params`, 'must be an object of per-star numbers')
	}
	const params: Record<string, number[]> = {}
	for (const [key, values] of Object.entries(value as Record<string, unknown>)) {
		if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) fieldError(`${label}.params.${key}`, 'invalid key')
		params[key] = asPerStar(`${label}.params.${key}`, values, (star, rawValue) =>
			asNumber(`${label}.params.${key}[${star}★]`, rawValue, -1_000_000, 1_000_000),
		)
	}
	return params
}

/** The charged sub-kit of one attack kit: `{ id: 'charge-attack', params }`. */
function asChargeKit(
	label: string,
	value: unknown,
	runtime: Map<string, KitRuntime> = CODE_KIT_RUNTIME,
): { id: string; params: Record<string, number[]> } {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		fieldError(label, 'must be { id, params }')
	}
	const entry = value as Record<string, unknown>
	const id = asString(`${label}.id`, entry.id, 40)
	if (runtime.get(id)?.kind !== 'charge') {
		fieldError(`${label}.id`, 'must be the charge-attack sub-kit')
	}
	return { id, params: asKitParams(label, entry.params) }
}

/** `StatMods` table — only keys from `STAT_KEYS` are accepted. */
function asStatMods(field: string, value: unknown): Record<string, number> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		fieldError(field, 'must be a stat table')
	}
	const mods: Record<string, number> = {}
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		if (key === SE_STAT_KEY) {
			fieldError(`${field}.${key}`, 'Sword Energy is changed through the "sword-energy" kit')
		}
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

// ── Editable fields ──────────────────────────────────────────────────────────

type FieldCheck = (field: string, value: unknown) => unknown

/**
 * Combat **kits** of an item or a cutie — must stay in sync with `game/kits.ts` on the frontend.
 *
 * `allowOptions` is false for a cutie: it takes the attack kits with their on-hit effects only,
 * because `stats` / `aura` describe an item's tables and `parry` belongs to a weapon.
 *
 * `runtime` is the catalogue's id → mechanic table (`kitRuntime`), so a kit **created on the admin
 * page** (`burn-on-hit-2`) is accepted exactly where its mechanic is accepted.
 *
 * The charged variant is validated **inside** an attack kit (`charge`), ❌ not as a top-level kit.
 */
function asKits(
	field: string,
	value: unknown,
	allowOptions: boolean,
	runtime: Map<string, KitRuntime> = CODE_KIT_RUNTIME,
): unknown[] {
	if (!Array.isArray(value)) fieldError(field, 'must be an array of kits')
	const seen = new Set<string>()
	const kindOf = (id: string): KitKind | undefined => runtime.get(id)?.kind
	const isRepeatable = (id: string): boolean => {
		const mechanic = runtime.get(id)?.mechanic ?? id
		return REPEATABLE_KIT_IDS.includes(mechanic)
	}
	return value.map((raw, index) => {
		const label = `${field}[${index}]`
		if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
			fieldError(label, 'must be { id, params }')
		}
		const entry = raw as Record<string, unknown>
		const id = asString(`${label}.id`, entry.id, 40)
		// Only an attack kit and the optional stat/aura kits sit on the item itself.
		const kind = kindOf(id)
		const allowed = kind === 'attack' || (allowOptions && kind === 'option')
		if (!allowed) {
			fieldError(
				`${label}.id`,
				allowOptions ? 'must be an attack or an option kit' : 'must be an attack kit',
			)
		}
		if (seen.has(id) && !isRepeatable(id)) fieldError(`${label}.id`, 'duplicate kit')
		seen.add(id)
		const params = asKitParams(label, entry.params)

		if (kind === 'attack') {
			const charge =
				entry.charge === undefined ? undefined : asChargeKit(`${label}.charge`, entry.charge, runtime)
			if (entry.onHit === undefined) return { id, params, ...(charge ? { charge } : {}) }
			if (!Array.isArray(entry.onHit)) fieldError(`${label}.onHit`, 'must be an array of effects')
			const seenEffects = new Set<string>()
			const onHit = entry.onHit.map((effect, effectIndex) => {
				const effectLabel = `${label}.onHit[${effectIndex}]`
				if (typeof effect !== 'object' || effect === null || Array.isArray(effect)) {
					fieldError(effectLabel, 'must be { id, params }')
				}
				const effectEntry = effect as Record<string, unknown>
				const effectId = asString(`${effectLabel}.id`, effectEntry.id, 40)
				if (kindOf(effectId) !== 'onHit') {
					fieldError(`${effectLabel}.id`, 'unknown on-hit effect')
				}
				if (seenEffects.has(effectId)) fieldError(`${effectLabel}.id`, 'duplicate effect')
				seenEffects.add(effectId)
				return { id: effectId, params: asKitParams(effectLabel, effectEntry.params) }
			})
			return { id, params, onHit, ...(charge ? { charge } : {}) }
		}

		const mechanic = runtime.get(id)?.mechanic ?? id
		if (mechanic === 'stats') {
			if (entry.stats === undefined) return { id, params }
			return {
				id,
				params,
				stats: asPerStar(`${label}.stats`, entry.stats, (star, table) =>
					asStatMods(`${label}.stats[${star}★]`, table),
				),
			}
		}

		// Every other option kit (the reaction / defensive gems) is a plain parameter table: only
		// `aura` owns the JSON tables below.
		if (mechanic !== 'aura' || entry.aura === undefined) return { id, params }
		return {
			id,
			params,
			aura: asPerStar(`${label}.aura`, entry.aura, (star, rawAura) => {
				const auraLabel = `${label}.aura[${star}★]`
				if (typeof rawAura !== 'object' || rawAura === null || Array.isArray(rawAura)) {
					fieldError(auraLabel, 'must be { target, mods }')
				}
				const aura = rawAura as Record<string, unknown>
				return {
					target: asOneOf(`${auraLabel}.target`, aura.target, AURA_TARGETS),
					mods: asStatMods(`${auraLabel}.mods`, aura.mods),
				}
			}),
		}
	})
}


/** Editable **item** fields — must match `ItemTemplate` in `game/types.ts`. */
const ITEM_FIELDS: Record<string, FieldCheck> = {
	name: (field, value) => asString(field, value, 80),
	icon: (field, value) => asString(field, value, 8),
	// `focus` is the pre-`artifact` name: accepted, then stored as the current class.
	cls: (field, value) =>
		typeof value === 'string' && LEGACY_ITEM_CLASSES[value]
			? LEGACY_ITEM_CLASSES[value]
			: asOneOf(field, value, ITEM_CLASSES),
	tier: (field, value) => asInteger(field, value, 1, 3),
	/** Rarity band that colours the tile: 1 = silver … 5 = gold-orange. */
	quality: (field, value) => asInteger(field, value, 1, 5),
	cost: (field, value) => asInteger(field, value, 1, 999),
	space: asSpace,
	/** One art per item: `public/icons/items/<id>.png` — art files are never per star rank. */
	art: asBoolean,
	/** The item was deleted on the admin page: it leaves the catalogue and the shop. */
	removed: asBoolean,
	/** Combat kits — must stay in sync with `game/kits.ts` on the frontend. */
	kits: (field, value) => asKits(field, value, true),
}

/** Editable **cutie** fields — must match `CutieDef` in `game/types.ts`. */
const CUTIE_FIELDS: Record<string, FieldCheck> = {
	name: (field, value) => asString(field, value, 80),
	icon: (field, value) => asString(field, value, 8),
	blurb: (field, value) => asString(field, value, 400),
	unlockStage: (field, value) => asInteger(field, value, 0, 60),
	maxHp: (field, value) => asInteger(field, value, 50, 100_000),
	maxSe: (field, value) => asInteger(field, value, 10, 1000),
	seRegen: (field, value) => asNumber(field, value, 0, 100),
	art: asBoolean,
	skillArt: asBoolean,
	avatar: asBoolean,
	/** Base attack of the cutie — the number its attack kits scale (a cutie has levels, not stars). */
	attack: (field, value) => asInteger(field, value, 0, 100_000),
	/** Combat kits: attack kits with their on-hit effects, exactly like an item's. */
	kits: (field, value) => asKits(field, value, false),
}

const FIELDS: Record<ContentKind, Record<string, FieldCheck>> = { item: ITEM_FIELDS, cutie: CUTIE_FIELDS }

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
export function validateContentPayload(
	kind: ContentKind,
	payload: unknown,
	runtime?: Map<string, KitRuntime>,
): ContentPayload {
	if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
		throw badRequest('Payload must be a JSON object.', 'invalid_content')
	}

	const fields = FIELDS[kind]
	const clean: ContentPayload = {}
	for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
		// A kit list is checked against the **catalogue** when the caller has it: a kit created on the
		// admin page must be accepted exactly where its mechanic is.
		if (key === 'kits' && runtime) {
			clean[key] = asKits(key, value, kind === 'item', runtime)
			continue
		}
		const check = fields[key]
		if (!check) {
			throw badRequest(
				`Field "${key}" is not editable on ${kind === 'item' ? 'items' : 'cuties'}.`,
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
	cuties: Record<string, ContentPayload>
	/**
	 * The **kit catalogue**: the catalogues (headings) plus one payload per kit that differs from code.
	 *
	 * A kit is a **mechanic of the engine** (`game/kits.ts`), so the client merges this over its own
	 * catalogue: `removed: true` takes a kit out of the game, `label` / `categoryId` / `appliesTo` /
	 * `params` retune it, and an entry whose id is **not** a code kit is a kit the admin created on top
	 * of `mechanic`.
	 */
	kits: {
		categories: { id: string; label: string; position: number }[]
		entries: Record<string, ContentPayload>
	}
	/**
	 * Uploaded pictures, ready to use as `<img src>`: `{ "item:wooden-blade": "/api/content/art/item/wooden-blade?v=3" }`.
	 *
	 * ⚠️ Kept out of the per-entity payload on purpose: a payload **replaces** the whole field set on
	 * save, so an admin editing `damage` would silently drop the picture. Separately, it also means
	 * "Về mặc định" (delete the override) cannot lose an uploaded image.
	 */
	art: Record<string, string>
}

/** Raw rows, so the admin page can tell which entities are overridden and by whom. */
export async function listContentOverrides(db: Db): Promise<ContentOverrideRow[]> {
	// ⚠️ Two queries instead of one join: Prisma cannot include a relation whose order matters without
	// `orderBy` per parent, and the kit `position` **is** the order the admin page draws.
	const [items, cuties] = await Promise.all([
		db.item.findMany({ include: { kits: { orderBy: { position: 'asc' } } }, orderBy: { id: 'asc' } }),
		db.cutie.findMany({ include: { kits: { orderBy: { position: 'asc' } } }, orderBy: { id: 'asc' } }),
	])
	return [
		...items.map((item) => ({
			kind: 'item' as const,
			entityId: item.id,
			payload: itemPayload(item),
			updatedAt: item.updatedAt.toISOString(),
			updatedBy: item.updatedBy,
		})),
		...cuties.map((cutie) => ({
			kind: 'cutie' as const,
			entityId: cutie.id,
			payload: cutiePayload(cutie),
			updatedAt: cutie.updatedAt.toISOString(),
			updatedBy: cutie.updatedBy,
		})),
	]
}

type ItemRowWithKits = Prisma.ItemGetPayload<{ include: { kits: true } }>
type CutieRowWithKits = Prisma.CutieGetPayload<{ include: { kits: true } }>
type KitRow = Pick<Prisma.ItemKitGetPayload<object>, 'kitId' | 'params' | 'stats' | 'aura' | 'onHit' | 'charge'>

/**
 * One row back into the payload the **client** expects.
 *
 * ⚠️ A `null` column / kit column is **omitted**, never sent as `null`: the client merges the payload
 * over its own definition (`mergeItem` / `mergePet`), and an explicit `null` would land in the model.
 */
function kitPayload(kit: KitRow): ContentPayload {
	return {
		id: kit.kitId,
		params: kit.params as Record<string, number[]>,
		...(kit.stats === null ? {} : { stats: kit.stats }),
		...(kit.aura === null ? {} : { aura: kit.aura }),
		...(kit.onHit === null ? {} : { onHit: kit.onHit }),
		...(kit.charge === null ? {} : { charge: kit.charge }),
	}
}

function itemPayload(item: ItemRowWithKits): ContentPayload {
	return {
		name: item.name,
		...(item.icon === null ? {} : { icon: item.icon }),
		cls: item.cls,
		tier: item.tier,
		quality: item.quality,
		cost: item.cost,
		space: { w: item.spaceW, h: item.spaceH },
		...(item.art ? { art: true } : {}),
		...(item.removed ? { removed: true } : {}),
		kits: item.kits.map(kitPayload),
	}
}

function cutiePayload(cutie: CutieRowWithKits): ContentPayload {
	const payload: ContentPayload = {}
	const scalars = ['name', 'icon', 'blurb', 'unlockStage', 'attack', 'maxHp', 'maxSe', 'seRegen'] as const
	for (const key of scalars) {
		const value = cutie[key]
		if (value !== null) payload[key] = value
	}
	for (const key of ['art', 'skillArt', 'avatar'] as const) {
		if (cutie[key] !== null) payload[key] = cutie[key]
	}
	// 🔴 Only when the admin really touched the list: an empty array means "this Cutie has no kit",
	// which is a legal choice and must not fall back to the code kit.
	if (cutie.kitsSynced) payload.kits = cutie.kits.map(kitPayload)
	return payload
}

/** The shape the game client needs: `{ items: { id: payload }, cuties: { id: payload }, art: { key: url } }`. */
export async function readContent(db: Db): Promise<ContentOut> {
	const overrides = await listContentOverrides(db)
	const [categories, entries] = await Promise.all([listKitCategories(db), listKitEntries(db)])
	const out: ContentOut = {
		items: {},
		cuties: {},
		kits: {
			categories: categories.map(({ id, label, position }) => ({ id, label, position })),
			entries: {},
		},
		art: {},
	}
	for (const override of overrides) {
		out[override.kind === 'item' ? 'items' : 'cuties'][override.entityId] = override.payload
	}
	for (const entry of entries) out.kits.entries[entry.id] = kitEntryPayload(entry)
	for (const art of await listArt(db)) {
		out.art[`${art.kind}:${art.entityId}`] = artUrl(art.kind, art.entityId, art.updatedAt)
	}
	return out
}

// ── Kit catalogue ────────────────────────────────────────────────────────────
//
// 🔴 **A kit is a mechanic of the engine.** `basic-attack`, `burn-on-hit`, … are implemented in the
// client (`frontend/src/game/kits.ts`): the engine has to run them, and the game has to play with no
// backend at all, so those mechanics ship in code and cannot be written here.
//
// What the database owns is the **catalogue**: the catalogues (headings) the admin can create, rename,
// reorder and delete, and one row per kit that was renamed, moved to another catalogue, retuned,
// created or deleted. A row is an **overlay over a mechanic** (`mechanic`), which is exactly what makes
// a new kit possible — the engine is never taught a new id, it is handed a mechanic it already knows.

export interface KitCategoryRow {
	id: string
	label: string
	position: number
	updatedAt: string
	updatedBy: string | null
}

export interface KitEntryRow {
	id: string
	/** Engine mechanic the kit runs on. For a code kit this is its own id. */
	mechanic: string
	label: string | null
	categoryId: string | null
	appliesTo: string | null
	params: ContentPayload | null
	position: number | null
	removed: boolean
	updatedAt: string
	updatedBy: string | null
}

export async function listKitCategories(db: Db): Promise<KitCategoryRow[]> {
	const rows = await db.kitCategory.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] })
	return rows.map((row) => ({
		id: row.id,
		label: row.label,
		position: row.position,
		updatedAt: row.updatedAt.toISOString(),
		updatedBy: row.updatedBy,
	}))
}

export async function listKitEntries(db: Db): Promise<KitEntryRow[]> {
	const rows = await db.kitEntry.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] })
	return rows.map((row) => ({
		id: row.id,
		mechanic: row.mechanic,
		label: row.label,
		categoryId: row.categoryId,
		appliesTo: row.appliesTo,
		params: (row.params ?? null) as ContentPayload | null,
		position: row.position,
		removed: row.removed,
		updatedAt: row.updatedAt.toISOString(),
		updatedBy: row.updatedBy,
	}))
}

/** One row back into the payload the client merges (`null` columns are **omitted**, never sent). */
function kitEntryPayload(entry: KitEntryRow): ContentPayload {
	const payload: ContentPayload = { mechanic: entry.mechanic }
	if (entry.label !== null) payload.label = entry.label
	if (entry.categoryId !== null) payload.categoryId = entry.categoryId
	if (entry.appliesTo !== null) payload.appliesTo = entry.appliesTo
	if (entry.params !== null) payload.params = entry.params
	if (entry.position !== null) payload.position = entry.position
	if (entry.removed) payload.removed = true
	return payload
}

/**
 * Every kit a client may attach to an item or a Cutie: the code mechanics **plus** the catalogue
 * entries, which inherit their mechanic's kind.
 *
 * Used to validate a kit list — a created kit (`burn-on-hit-2`) must be accepted exactly where its
 * mechanic is, and nowhere else.
 */
export async function kitRuntime(db: Db): Promise<Map<string, KitRuntime>> {
	const runtime = new Map<string, KitRuntime>()
	for (const [id, kind] of Object.entries(KIT_KIND_BY_MECHANIC)) runtime.set(id, { kind, mechanic: id })
	for (const entry of await db.kitEntry.findMany({ select: { id: true, mechanic: true, removed: true } })) {
		const kind = KIT_KIND_BY_MECHANIC[entry.mechanic]
		if (!kind || entry.removed) {
			// A deleted kit cannot be attached any more; a broken mechanic id is ignored (the row is
			// still listed in the admin page so it can be fixed there).
			runtime.delete(entry.id)
			continue
		}
		runtime.set(entry.id, { kind, mechanic: entry.mechanic })
	}
	return runtime
}

/** Ids that exist in `KIT_KIND_BY_MECHANIC` only — the kits that ship in code. */
export function isCodeKit(kitId: string): boolean {
	return Object.hasOwn(KIT_KIND_BY_MECHANIC, kitId)
}

function asKitDefaults(field: string, value: unknown): Record<string, number[]> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		fieldError(field, 'must be { "<parameter>": [1★ … 5★] }')
	}
	const defaults: Record<string, number[]> = {}
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		if (!Array.isArray(raw) || raw.length !== 5) fieldError(`${field}.${key}`, 'must hold exactly 5 numbers')
		defaults[key] = raw.map((entry, index) => asNumber(`${field}.${key}[${index}]`, entry, -1_000_000, 1_000_000))
	}
	return defaults
}

/** Category ids are slugs; a label that slugs to nothing gets a stable fallback. */
function slugId(label: string): string {
	const slug = label
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/đ/g, 'd')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40)
	return slug || 'catalogue'
}

/** The catalogue a kit is filed under; the row must exist (the client offers the list). */
async function assertCategory(db: Db, value: unknown): Promise<string> {
	if (typeof value !== 'string' || value.length === 0) fieldError('categoryId', 'must be a catalogue id')
	const id = assertEntityId(value)
	const found = await db.kitCategory.findUnique({ where: { id } })
	if (!found) throw badRequest(`Unknown catalogue "${id}".`, 'unknown_category')
	return id
}

/**
 * Create a kit on top of an engine mechanic.
 *
 * 🔴 **Why a mechanic is required**: `build.ts` runs a kit by comparing its id with the mechanics it
 * knows. A kit invented from nothing would sit in the catalogue, attach to an item and then do
 * nothing at all — the worst kind of silent bug for a designer.
 */
export async function createKit(
	db: Db,
	payload: ContentPayload,
	updatedBy: string | null,
): Promise<KitEntryRow> {
	const mechanic = asString('mechanic', payload.mechanic, 40)
	if (!isMechanic(mechanic)) {
		throw badRequest(`Unknown kit mechanic "${mechanic}".`, 'unknown_mechanic')
	}
	const label = asString('label', payload.label, 80)
	const categoryId = await assertCategory(db, payload.categoryId)
	const appliesTo =
		payload.appliesTo === undefined
			? KIT_KIND_BY_MECHANIC[mechanic] === 'option'
				? 'item'
				: 'both'
			: asOneOf('appliesTo', payload.appliesTo, KIT_APPLIES_TO)
	const params = payload.params === undefined ? null : asKitDefaults('params', payload.params)

	// The plain mechanic id belongs to the code kit, so a created one is `<mechanic>-2`, `-3`…
	const taken = new Set([...Object.keys(KIT_KIND_BY_MECHANIC), ...(await db.kitEntry.findMany({ select: { id: true } })).map((row) => row.id)])
	let suffix = 2
	while (taken.has(`${mechanic}-${suffix}`)) suffix += 1
	const id = `${mechanic}-${suffix}`.slice(0, 40)

	await db.kitEntry.create({
		data: {
			id,
			mechanic,
			label,
			categoryId,
			appliesTo,
			params: params as Prisma.InputJsonValue,
			removed: false,
			updatedBy,
		},
	})
	const rows = await listKitEntries(db)
	const saved = rows.find((row) => row.id === id)
	if (!saved) throw badRequest('The kit could not be created.', 'invalid_content')
	return saved
}

/**
 * Save one catalogue entry: rename it, **move it to another catalogue**, change who may carry it, retune
 * its default numbers, or hide it from the game (`removed: true`).
 *
 * ⚠️ `mechanic` is accepted only when it matches the stored one: changing it would turn one mechanic
 * into another everywhere the kit is attached, without touching a single instance.
 */
export async function saveKitEntry(
	db: Db,
	kitId: string,
	payload: ContentPayload,
	updatedBy: string | null,
): Promise<KitEntryRow> {
	const id = assertEntityId(kitId)
	const existing = await db.kitEntry.findUnique({ where: { id } })
	if (payload.mechanic !== undefined) {
		const mechanic = asString('mechanic', payload.mechanic, 40)
		if (!isMechanic(mechanic)) throw badRequest(`Unknown kit mechanic "${mechanic}".`, 'unknown_mechanic')
		// For a code kit with no row yet, the row's mechanic is its own id.
		if ((existing?.mechanic ?? id) !== mechanic) {
			throw badRequest('The mechanic of an existing kit cannot change.', 'mechanic_immutable')
		}
	}

	/** The row after the payload: fields it did not send keep what the row already had. */
	const next = {
		mechanic: existing?.mechanic ?? (payload.mechanic === undefined ? id : String(payload.mechanic)),
		label: payload.label === undefined ? (existing?.label ?? null) : asString('label', payload.label, 80),
		categoryId:
			payload.categoryId === undefined ? (existing?.categoryId ?? null) : await assertCategory(db, payload.categoryId),
		appliesTo:
			payload.appliesTo === undefined
				? (existing?.appliesTo ?? null)
				: asOneOf('appliesTo', payload.appliesTo, KIT_APPLIES_TO),
		params:
			payload.params === undefined
				? ((existing?.params ?? null) as Record<string, number[]> | null)
				: asKitDefaults('params', payload.params),
		position:
			payload.position === undefined
				? (existing?.position ?? null)
				: asInteger('position', payload.position, 0, 999),
		removed: payload.removed === undefined ? (existing?.removed ?? false) : asBoolean('removed', payload.removed),
	}

	if (!existing) {
		// Editing a code kit that has no row yet: its own id is the mechanic. A kit that is neither in
		// code nor created here cannot be written into existence — "New kit" is the only door.
		if (!isMechanic(next.mechanic)) {
			throw badRequest(
				'Creating a kit needs its mechanic — use "New kit" so the engine has something to run.',
				'unknown_mechanic',
			)
		}
		await db.kitEntry.create({
			data: {
				id,
				mechanic: next.mechanic,
				label: next.label,
				categoryId: next.categoryId,
				appliesTo: next.appliesTo,
				params: next.params === null ? Prisma.DbNull : (next.params as Prisma.InputJsonValue),
				position: next.position,
				removed: next.removed,
				updatedBy,
			},
		})
	} else if (!next.removed && noOverrides({ id, ...next })) {
		// Back to the code definition with nothing to say: drop the row instead of leaving an empty
		// overlay behind (it would show up as a catalogue entry that changes nothing).
		await db.kitEntry.deleteMany({ where: { id } })
	} else {
		await db.kitEntry.update({
			where: { id },
			data: {
				...next,
				params: next.params === null ? Prisma.DbNull : (next.params as Prisma.InputJsonValue),
				updatedBy,
			},
		})
	}

	const rows = await listKitEntries(db)
	const saved = rows.find((row) => row.id === id)
	if (saved) return saved
	// The row was just dropped (back to the code definition): report the code kit as it now stands.
	return {
		id,
		mechanic: next.mechanic,
		label: null,
		categoryId: null,
		appliesTo: null,
		params: null,
		position: null,
		removed: false,
		updatedAt: new Date().toISOString(),
		updatedBy,
	}
}

/** A row that differs from the code definition in no way at all. */
function noOverrides(entry: {
	id: string
	mechanic: string
	label: string | null
	categoryId: string | null
	appliesTo: string | null
	params: unknown
	position: number | null
}): boolean {
	return (
		entry.mechanic === entry.id &&
		entry.label === null &&
		entry.categoryId === null &&
		entry.appliesTo === null &&
		entry.params === null &&
		entry.position === null
	)
}

function normalise(data: Prisma.KitEntryUncheckedUpdateInput) {
	return {
		label: (data.label ?? null) as string | null,
		categoryId: (data.categoryId ?? null) as string | null,
		appliesTo: (data.appliesTo ?? null) as string | null,
		params: (data.params ?? null) as unknown,
		position: (data.position ?? null) as number | null,
	}
}

/**
 * Drop a catalogue row completely.
 *
 * For a **code** kit that is the way back to the definition in `game/kits.ts`; for a kit **created**
 * here it is gone for good (there is nothing in code to fall back to).
 */
export async function deleteKitEntry(db: Db, kitId: string): Promise<void> {
	assertEntityId(kitId)
	await db.kitEntry.deleteMany({ where: { id: kitId } })
}

/**
 * The columns to rewrite when a kit row still points at the deleted kit, or `null` when it does not.
 *
 * `Prisma.DbNull` (not `null`) is what clears a nullable `Json` column: a plain `null` would store the
 * JSON value `null` and the client would read a "charge kit" that is the value null. The same value
 * is used for an `onHit` list whose every effect was deleted — the swing has no on-hit list any more,
 * rather than an empty one the admin page would draw as an empty box.
 */
function stripNestedKit(
	row: { onHit: Prisma.JsonValue; charge: Prisma.JsonValue },
	kitId: string,
): { onHit?: Prisma.InputJsonValue | typeof Prisma.DbNull; charge?: typeof Prisma.DbNull } | null {
	let onHit: Prisma.InputJsonValue | typeof Prisma.DbNull | undefined
	if (Array.isArray(row.onHit)) {
		const kept = row.onHit.filter((effect) => !(isJsonRecord(effect) && effect.id === kitId))
		if (kept.length !== row.onHit.length) {
			onHit = kept.length === 0 ? Prisma.DbNull : (kept as Prisma.InputJsonValue)
		}
	}
	const charge = isJsonRecord(row.charge) && row.charge.id === kitId ? Prisma.DbNull : undefined
	if (onHit === undefined && charge === undefined) return null
	return { ...(onHit === undefined ? {} : { onHit }), ...(charge === undefined ? {} : { charge }) }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Delete one kit from the **whole game**: remember that it is gone, then take it off every item and
 * Cutie — including the `onHit` effects and the `charge` variant that live *inside* another kit.
 *
 * ⚠️ Delete-then-write, never a nested transaction: `db` is a `Prisma.TransactionClient` inside the
 * tests (they roll the whole case back), and a transaction client has no `$transaction` of its own.
 */
export async function removeKit(db: Db, kitId: string, updatedBy: string | null): Promise<void> {
	assertEntityId(kitId)
	const existing = await db.kitEntry.findUnique({ where: { id: kitId } })
	await db.kitEntry.upsert({
		where: { id: kitId },
		create: { id: kitId, mechanic: kitId, removed: true, updatedBy },
		update: { removed: true, updatedBy },
	})
	if (existing && !isMechanic(existing.mechanic)) {
		// Nothing the engine knows: the row is only a catalogue entry, forget it.
		await db.kitEntry.deleteMany({ where: { id: kitId } })
	}

	await db.itemKit.deleteMany({ where: { kitId } })
	await db.cutieKit.deleteMany({ where: { kitId } })

	// A nested reference is a kit too: an attack kit that still lists the deleted effect would keep
	// rolling it, and a deleted charged variant would keep replacing a swing.
	const [itemKits, cutieKits] = await Promise.all([
		db.itemKit.findMany({ select: { id: true, onHit: true, charge: true } }),
		db.cutieKit.findMany({ select: { id: true, onHit: true, charge: true } }),
	])
	for (const row of itemKits) {
		const data = stripNestedKit(row, kitId)
		if (data) await db.itemKit.update({ where: { id: row.id }, data })
	}
	for (const row of cutieKits) {
		const data = stripNestedKit(row, kitId)
		if (data) await db.cutieKit.update({ where: { id: row.id }, data })
	}
}

/** Create or update one catalogue (a heading on the Kits tab). */
export async function saveKitCategory(
	db: Db,
	categoryId: string | null,
	payload: ContentPayload,
	updatedBy: string | null,
): Promise<KitCategoryRow> {
	const label = asString('label', payload.label, 60)
	const position =
		payload.position === undefined
			? undefined
			: asInteger('position', payload.position, 0, 999)
	if (position !== undefined && categoryId === null) {
		fieldError('position', 'is only used when moving an existing catalogue')
	}

	if (categoryId === null) {
		const rows = await db.kitCategory.findMany({ select: { id: true } })
		const taken = new Set(rows.map((row) => row.id))
		const base = slugId(label)
		let id = base
		let suffix = 2
		while (taken.has(id)) {
			id = `${base}-${suffix}`
			suffix += 1
		}
		const nextPosition = rows.length
		await db.kitCategory.create({ data: { id, label, position: nextPosition, updatedBy } })
		const created = await db.kitCategory.findUnique({ where: { id } })
		if (!created) throw badRequest('The catalogue could not be created.', 'invalid_content')
		return {
			id: created.id,
			label: created.label,
			position: created.position,
			updatedAt: created.updatedAt.toISOString(),
			updatedBy: created.updatedBy,
		}
	}

	const id = assertEntityId(categoryId)
	const existing = await db.kitCategory.findUnique({ where: { id } })
	if (!existing) throw badRequest(`Unknown catalogue "${id}".`, 'unknown_category')
	await db.kitCategory.update({
		where: { id },
		data: { label, ...(position === undefined ? {} : { position }), updatedBy },
	})
	const saved = await db.kitCategory.findUnique({ where: { id } })
	return {
		id,
		label: saved?.label ?? label,
		position: saved?.position ?? existing.position,
		updatedAt: (saved?.updatedAt ?? existing.updatedAt).toISOString(),
		updatedBy,
	}
}

/**
 * Remove one catalogue.
 *
 * ⚠️ Refused while a kit is still filed under it: those kits would lose their heading (and a code
 * kit's own category could vanish from under it), which looks exactly like the kit being deleted.
 * Move them to another catalogue first — that is what "move" in the admin page is for.
 */
export async function deleteKitCategory(db: Db, categoryId: string): Promise<void> {
	const id = assertEntityId(categoryId)
	const [categories, used] = await Promise.all([
		db.kitCategory.count(),
		db.kitEntry.count({ where: { categoryId: id } }),
	])
	if (categories <= 1) throw badRequest('The last catalogue cannot be deleted.', 'last_category')
	if (used > 0) {
		throw badRequest(
			`${used} kit(s) are still filed under this catalogue — move them to another one first.`,
			'category_in_use',
		)
	}
	await db.kitCategory.deleteMany({ where: { id } })
}

export async function saveContentOverride(
	db: Db,
	kind: ContentKind,
	entityId: string,
	payload: ContentPayload,
	updatedBy: string | null,
): Promise<ContentOverrideRow> {
	const now = new Date()
	const kits = 'kits' in payload ? (payload.kits as ContentPayload[]) : null

	if (kind === 'item') {
		const scalars = itemColumns(payload, entityId)
		await db.item.upsert({
			where: { id: entityId },
			create: { id: entityId, ...scalars.create, updatedAt: now, updatedBy, createdAt: now },
			update: { ...scalars.update, updatedAt: now, updatedBy },
		})
		if (kits) await replaceKits(db, 'item', entityId, kits)
	} else {
		const scalars = petColumns(payload)
		await db.cutie.upsert({
			where: { id: entityId },
			create: { id: entityId, ...scalars.create, kitsSynced: kits !== null, updatedAt: now, updatedBy, createdAt: now },
			update: { ...scalars.update, ...(kits === null ? {} : { kitsSynced: true }), updatedAt: now, updatedBy },
		})
		if (kits) await replaceKits(db, 'cutie', entityId, kits)
	}

	const rows = await listContentOverrides(db)
	const saved = rows.find((row) => row.kind === kind && row.entityId === entityId)
	return saved ?? { kind, entityId, payload, updatedAt: now.toISOString(), updatedBy }
}

/**
 * Replace one entity's whole kit list.
 *
 * ⚠️ Delete-then-insert, **not** a nested transaction: `db` is a `Prisma.TransactionClient` inside the
 * tests (they roll the whole case back), and a transaction client has no `$transaction` of its own.
 */
async function replaceKits(
	db: Db,
	kind: ContentKind,
	entityId: string,
	kits: ContentPayload[],
): Promise<void> {
	const rows = kits.map((kit, position) => ({
		kitId: String(kit.id),
		position,
		params: (kit.params ?? {}) as Prisma.InputJsonValue,
		stats: (kit.stats ?? null) as Prisma.InputJsonValue,
		aura: (kit.aura ?? null) as Prisma.InputJsonValue,
		onHit: (kit.onHit ?? null) as Prisma.InputJsonValue,
		charge: (kit.charge ?? null) as Prisma.InputJsonValue,
	}))
	if (kind === 'item') {
		await db.itemKit.deleteMany({ where: { itemId: entityId } })
		if (rows.length > 0) {
			await db.itemKit.createMany({ data: rows.map((row) => ({ ...row, itemId: entityId })) })
		}
		return
	}
	await db.cutieKit.deleteMany({ where: { cutieId: entityId } })
	if (rows.length > 0) {
		await db.cutieKit.createMany({ data: rows.map((row) => ({ ...row, cutieId: entityId })) })
	}
}

interface ItemScalars {
	name?: string
	icon?: string
	cls?: string
	tier?: number
	quality?: number
	cost?: number
	spaceW?: number
	spaceH?: number
	art?: boolean
	removed?: boolean
}

/**
 * Payload → columns of `items`.
 *
 * An item **is** its row (the client ships no templates any more), so `create` carries a value for
 * every NOT NULL column; `update` only touches the keys the payload actually sent, otherwise a client
 * that omits `tier` would reset it.
 */
function itemColumns(
	payload: ContentPayload,
	entityId: string,
): { update: ItemScalars; create: Omit<Prisma.ItemUncheckedCreateInput, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'> } {
	const space = payload.space as { w?: unknown; h?: unknown } | undefined
	const num = (value: unknown, fallback: number): number =>
		typeof value === 'number' && Number.isFinite(value) ? value : fallback
	const update: ItemScalars = {}
	if (typeof payload.name === 'string') update.name = payload.name
	if (typeof payload.icon === 'string') update.icon = payload.icon
	if (typeof payload.cls === 'string') update.cls = payload.cls
	if (payload.tier !== undefined) update.tier = num(payload.tier, 1)
	if (payload.quality !== undefined) update.quality = num(payload.quality, 1)
	if (payload.cost !== undefined) update.cost = num(payload.cost, 1)
	if (space !== undefined) {
		update.spaceW = num(space.w, 1)
		update.spaceH = num(space.h, 1)
	}
	if (payload.art !== undefined) update.art = payload.art === true
	if (payload.removed !== undefined) update.removed = payload.removed === true
	return {
		update,
		create: {
			name: update.name ?? entityId,
			icon: update.icon ?? null,
			cls: update.cls ?? 'melee',
			tier: update.tier ?? 1,
			quality: update.quality ?? 1,
			cost: update.cost ?? 1,
			spaceW: update.spaceW ?? 1,
			spaceH: update.spaceH ?? 1,
			art: update.art ?? false,
			removed: update.removed ?? false,
		},
	}
}

interface PetScalars {
	name?: string
	icon?: string
	blurb?: string
	unlockStage?: number
	attack?: number
	maxHp?: number
	maxSe?: number
	seRegen?: number
	art?: boolean
	skillArt?: boolean
	avatar?: boolean
}

/** Payload → columns of `cuties`. A `null` column means "keep the code value", so only real keys are written. */
function petColumns(payload: ContentPayload): { update: PetScalars; create: PetScalars } {
	const update: PetScalars = {}
	const numbers = ['attack', 'maxHp', 'maxSe', 'unlockStage'] as const
	for (const key of numbers) {
		const value = payload[key]
		if (typeof value === 'number' && Number.isFinite(value)) update[key] = value
	}
	if (typeof payload.seRegen === 'number' && Number.isFinite(payload.seRegen)) update.seRegen = payload.seRegen
	if (typeof payload.name === 'string') update.name = payload.name
	if (typeof payload.icon === 'string') update.icon = payload.icon
	if (typeof payload.blurb === 'string') update.blurb = payload.blurb
	for (const key of ['art', 'skillArt', 'avatar'] as const) {
		if (payload[key] !== undefined) update[key] = payload[key] === true
	}
	return { update, create: update }
}

/** Deleting a row puts that entity back on the code default (and takes its kits with it, by FK). */
export async function deleteContentOverride(db: Db, kind: ContentKind, entityId: string): Promise<void> {
	if (kind === 'item') await db.item.deleteMany({ where: { id: entityId } })
	else await db.cutie.deleteMany({ where: { id: entityId } })
}

// ── Uploaded art ─────────────────────────────────────────────────────────────
//
// One picture per entity (item or cutie), stored as a PNG in the database. The server does **not**
// edit the picture: the admin page crops it in the browser (`react-easy-crop`) and uploads the
// finished PNG. The server only checks that it really is a PNG of a sane size and hands it out again
// with cache headers — it holds no game rules and no image processing.

/**
 * Hard limit for one upload.
 *
 * Sized for a **Full HD portrait** PNG (1080×1920 with transparency is a few MB at worst); this only
 * exists to stop abuse.
 */
export const ART_MAX_BYTES = 8 * 1024 * 1024

/**
 * Accepted side length of the uploaded picture.
 *
 * ⚠️ **Not forced to be square**: the admin page crops to the item's own footprint (1×3 sword,
 * 2×3 sabre), so the stored picture has the shape of the tile it will fill. The ceiling is the long side
 * of Full HD (1920 px) — the browser exports at that resolution so a photo keeps its detail.
 */
const ART_MIN_SIDE = 8
const ART_MAX_SIDE = 1920

const ART_MIME = 'image/png'

export interface ArtRow {
	kind: ContentKind
	entityId: string
	version: number
	width: number
	height: number
	updatedAt: string
	updatedBy: string | null
}

export interface ArtFile {
	bytes: Buffer
	mime: string
	/** Cache tag of these exact bytes — see `artUrl`. */
	tag: string
}

/**
 * **Cache tag** of one upload: the write time in ms.
 *
 * ⚠️ WHY NOT THE UPLOAD COUNTER (`version`): the counter restarts at 1 when a picture is deleted
 * and uploaded again, so the URL would repeat — and because responses are cached `immutable`, the
 * browser would keep showing the **deleted** picture. That really happened: delete an axe, upload a
 * sword, still see the axe. The timestamp is unique per upload, so a repeated URL can only ever mean
 * the same bytes.
 */
function artTag(updatedAt: Date | string): string {
	return String(new Date(updatedAt).getTime())
}

/** Public URL of one entity's picture. The tag makes each upload a **different** URL, so it can be cached forever. */
export function artUrl(kind: ContentKind, entityId: string, updatedAt: Date | string): string {
	return `/api/content/art/${kind}/${entityId}?v=${artTag(updatedAt)}`
}

/**
 * Read the PNG header and return its size, or `null` when this is not a PNG.
 *
 * ⚠️ The signature is checked byte by byte, ❌ not by the `Content-Type` the client claims: a
 * mislabelled file would otherwise be served as an image and show as a broken icon.
 * Dimensions come from the `IHDR` chunk, which every PNG must have first.
 */
export function readPngSize(bytes: Buffer): { width: number; height: number } | null {
	const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
	if (bytes.length < 24) return null
	for (let index = 0; index < signature.length; index += 1) {
		if (bytes[index] !== signature[index]) return null
	}
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/**
 * Copy a Node `Buffer` into a plain `Uint8Array`.
 *
 * Prisma types `Bytes` as `Uint8Array<ArrayBuffer>`; a `Buffer` is a view over an `ArrayBufferLike`
 * and does not satisfy it. One copy of a ≤512 KB icon is cheaper than casting the type away.
 */
function toBytes(bytes: Buffer): Uint8Array<ArrayBuffer> {
	const copy = new ArrayBuffer(bytes.byteLength)
	const view = new Uint8Array(copy)
	view.set(bytes)
	return view
}

/** Store (or replace) the picture of one entity and return it with its new version number. */
export async function saveArt(
	db: Db,
	kind: ContentKind,
	entityId: string,
	bytes: Buffer,
	updatedBy: string | null,
): Promise<ArtRow> {
	if (bytes.length === 0) throw badRequest('The uploaded file is empty.', 'empty_art')
	if (bytes.length > ART_MAX_BYTES) {
		throw badRequest(
			`The picture is too large (${Math.round(bytes.length / 1024)} KB). Keep it under ${ART_MAX_BYTES / 1024} KB.`,
			'art_too_large',
		)
	}

	const size = readPngSize(bytes)
	if (!size) throw badRequest('The picture must be a PNG file.', 'invalid_art')
	if (
		size.width < ART_MIN_SIDE ||
		size.width > ART_MAX_SIDE ||
		size.height < ART_MIN_SIDE ||
		size.height > ART_MAX_SIDE
	) {
		throw badRequest(
			`The picture must be ${ART_MIN_SIDE}–${ART_MAX_SIDE} px on each side (got ${size.width}×${size.height}).`,
			'invalid_art',
		)
	}

	const id = artKey(kind, entityId)
	const existing = await db.contentArt.findUnique({ where: { id }, select: { version: true } })
	const version = (existing?.version ?? 0) + 1
	const row = await db.contentArt.upsert({
		where: { id },
		create: {
			id,
			kind,
			bytes: toBytes(bytes),
			mime: ART_MIME,
			version,
			width: size.width,
			height: size.height,
			updatedAt: new Date(),
			updatedBy,
		},
		update: {
			bytes: toBytes(bytes),
			mime: ART_MIME,
			version,
			width: size.width,
			height: size.height,
			updatedAt: new Date(),
			updatedBy,
		},
		select: { version: true, width: true, height: true, updatedAt: true, updatedBy: true },
	})

	return { kind, entityId, ...row, updatedAt: row.updatedAt.toISOString() }
}

/** Remove the uploaded picture. Idempotent: deleting twice is not an error. */
export async function deleteArt(db: Db, kind: ContentKind, entityId: string): Promise<void> {
	await db.contentArt.deleteMany({ where: { id: artKey(kind, entityId) } })
}

/** The picture itself, for the public endpoint. `null` = nothing uploaded for this entity. */
export async function readArt(db: Db, kind: ContentKind, entityId: string): Promise<ArtFile | null> {
	const row = await db.contentArt.findUnique({
		where: { id: artKey(kind, entityId) },
		select: { bytes: true, mime: true, updatedAt: true },
	})
	if (!row) return null
	return { bytes: Buffer.from(row.bytes), mime: row.mime, tag: artTag(row.updatedAt) }
}

/**
 * Versions (no bytes!) of every uploaded picture.
 *
 * ⚠️ `select` is mandatory: without it Prisma would load every BYTEA column and the public overlay
 * — which every anonymous player fetches — would carry megabytes of images.
 */
export async function listArt(db: Db): Promise<ArtRow[]> {
	const rows = await db.contentArt.findMany({
		orderBy: { id: 'asc' },
		select: { id: true, kind: true, version: true, width: true, height: true, updatedAt: true, updatedBy: true },
	})
	return rows.flatMap((row) => {
		const [kind, ...rest] = row.id.split(':')
		const entityId = rest.join(':')
		if (!isContentKind(kind) || entityId.length === 0) return []
		return [
			{
				kind,
				entityId,
				version: row.version,
				width: row.width,
				height: row.height,
				updatedAt: row.updatedAt.toISOString(),
				updatedBy: row.updatedBy,
			},
		]
	})
}
