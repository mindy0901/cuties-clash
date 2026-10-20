/**
 * Content edited from the admin page: **merged over** the templates in code.
 *
 * ⚠️ WHY NOT EDIT `items.ts`/`cuties.ts` DIRECTLY: the code copy is the **default source** —
 * anonymous play, no network, or an empty database all have to keep the game complete. Server
 * content is only an overlay, and deleting a row returns the entity to its default.
 *
 * Per-star fields in code are **functions** (`passive: (star) => …`) while JSON can only
 * carry data (an array of exactly 5 entries, 1★ → 5★). `ITEM_UNPACKERS` rebuilds the function
 * from the array — **one single lookup table**, so adding a new per-star field only means
 * touching one place. Item **kits** are already data and only need normalising.
 *
 * ⚠️ Every merge step is **defensive**: a broken row (hand-edited in the database) is skipped
 * instead of throwing during render — throwing here means a blank page.
 */

import { KIT_DEFS, KIT_CATEGORIES, KIT_CATEGORY_LABELS, normalizeKits, registerKitCatalogue } from './kits'
import type { KitDef } from './kits'
import type { ItemClass, ItemKit, ItemKitId, ItemTemplate, CutieDef, KitAppliesTo, Quality } from './types'

/** Raw override for one entity: values already type-checked by the server. */
export type ContentOverride = Record<string, unknown>

/** One heading of the kit catalogue (`kit_categories`). */
export interface KitCategoryInfo {
	id: string
	label: string
	position: number
}

/**
 * One row of the kit catalogue, merged over the code mechanic it runs on.
 *
 * A created kit (`burn-on-hit-2`) is a row whose id is **not** in `KIT_DEFS`: `mechanic` says what the
 * engine runs, `label` / `categoryId` / `params` say how it reads and starts out.
 */
export interface KitEntryOverride {
	mechanic?: string
	label?: string
	categoryId?: string
	appliesTo?: KitAppliesTo
	/** Default numbers per parameter key, five entries (1★ → 5★). */
	params?: Record<string, number[]>
	position?: number | null
	removed?: boolean
}

export interface ContentOverrides {
	items: Record<string, ContentOverride>
	cuties: Record<string, ContentOverride>
	/**
	 * The **kit catalogue**: the headings, plus every kit that differs from the code definition.
	 *
	 * 🔴 Why an overlay and not a plain list: a kit is a **mechanic of the engine** (`game/kits.ts`), and
	 * the game has to stay complete with no backend at all. The rows here rename, move, retune, hide or
	 * add to that list — they can never remove the mechanic itself, which is exactly why a deleted kit
	 * needs the `removed` marker.
	 */
	kits: { categories: KitCategoryInfo[]; entries: Record<string, KitEntryOverride> }
	/**
	 * Pictures uploaded from the admin page, keyed `"item:<id>"` / `"cutie:<id>"`, value = URL ready
	 * for `<img src>` (`/api/content/art/item/wooden-blade?v=3`).
	 *
	 * ⚠️ Kept apart from the per-entity payload: a payload replaces the whole field set when saved,
	 * so a picture inside it would vanish the next time the admin edited `damage`.
	 */
	art: Record<string, string>
}

const EMPTY_KITS: ContentOverrides['kits'] = { categories: [], entries: {} }
const EMPTY: ContentOverrides = { items: {}, cuties: {}, kits: EMPTY_KITS, art: {} }

let overrides: ContentOverrides = EMPTY
/** Bumped on every apply, so derived data (the item catalogue) knows when it is stale. */
let version = 0

/**
 * Whether the server has answered `/api/content` at least once in this session.
 *
 * 🔴 Why it matters: the zustand store rehydrates **while its module is being imported**, i.e. long
 * before that fetch can resolve. At that moment an item id that is not in the code (`melting-ice`,
 * created on the admin page) is *not yet* a deleted item — it is an item whose row has not arrived.
 * `sanitizeRun` therefore keeps such an item until this flag turns on, and `pruneUnknownItems()` drops
 * the truly deleted ones afterwards. ❌ Treating "not in the catalogue yet" as "deleted" silently ate
 * a purchased item out of the player's bag on every reload.
 */
let resolved = false

/** The overlay is authoritative now: an unknown id really is gone. */
export function markContentResolved(): void {
	resolved = true
}

/** `false` only in the window between module import and the first successful `/api/content`. */
export function contentResolved(): boolean {
	return resolved
}

/** Keep only paths the game can actually load — a broken URL would show a broken icon. */
function cleanArt(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {}
	const clean: Record<string, string> = {}
	for (const [key, url] of Object.entries(value)) {
		if (typeof url === 'string' && url.startsWith('/')) clean[key] = url
	}
	return clean
}

/** One catalogue row from the wire, defensively cleaned (a hand-edited row must not break the page). */
function cleanKitOverlay(value: unknown): ContentOverrides['kits'] {
	if (!isRecord(value)) return EMPTY_KITS
	const categories: KitCategoryInfo[] = []
	const rawCategories = Array.isArray(value.categories) ? value.categories : []
	for (const raw of rawCategories) {
		if (!isRecord(raw)) continue
		const { id, label, position } = raw
		if (typeof id !== 'string' || id.length === 0) continue
		categories.push({
			id,
			label: typeof label === 'string' && label.length > 0 ? label : id,
			position: typeof position === 'number' && Number.isFinite(position) ? position : categories.length,
		})
	}
	const entries: Record<string, KitEntryOverride> = {}
	const rawEntries = isRecord(value.entries) ? value.entries : {}
	for (const [id, raw] of Object.entries(rawEntries)) {
		if (!isRecord(raw)) continue
		const entry: KitEntryOverride = {}
		if (typeof raw.mechanic === 'string') entry.mechanic = raw.mechanic
		if (typeof raw.label === 'string') entry.label = raw.label
		if (typeof raw.categoryId === 'string') entry.categoryId = raw.categoryId
		if (raw.appliesTo === 'both' || raw.appliesTo === 'item') entry.appliesTo = raw.appliesTo
		if (typeof raw.position === 'number' && Number.isFinite(raw.position)) entry.position = raw.position
		if (raw.removed === true) entry.removed = true
		if (isRecord(raw.params)) {
			const params: Record<string, number[]> = {}
			for (const [key, table] of Object.entries(raw.params)) {
				if (Array.isArray(table) && table.length === 5 && table.every((n) => typeof n === 'number')) {
					params[key] = table as number[]
				}
			}
			entry.params = params
		}
		entries[id] = entry
	}
	return { categories, entries }
}

/** Load overrides from the server. Pass `null`/`{}` to fall back to the code defaults. */
export function applyContentOverrides(next: Partial<ContentOverrides> | null | undefined): void {
	overrides = {
		items: isRecord(next?.items) ? (next.items as Record<string, ContentOverride>) : {},
		cuties: isRecord(next?.cuties) ? (next.cuties as Record<string, ContentOverride>) : {},
		kits: cleanKitOverlay(next?.kits),
		art: cleanArt(next?.art),
	}
	version += 1
	// The engine resolves kits through `kitDef()`, which reads the registry in `game/kits.ts`: point it
	// at the catalogue the game now plays with, before anything can ask for a kit.
	kitCatalogue()
}

/** Number of times the overlay has been applied — see `itemCatalogue()`. */
export function overridesVersion(): number {
	return version
}

/**
 * Write **one** row into the overlay right after the admin saved it, so the page already shows the
 * new item instead of waiting for the refetch. `payload = null` drops the row.
 *
 * ⚠️ The payload is stored **as is**: saving replaces the whole field set on the server, so merging
 * would keep a field the editor has just removed.
 */
export function putLocalOverride(
	kind: 'item' | 'cutie',
	id: string,
	payload: ContentOverride | null,
): void {
	const items = { ...overrides.items }
	const cuties = { ...overrides.cuties }
	const rows = kind === 'item' ? items : cuties
	if (payload) rows[id] = payload
	else delete rows[id]
	overrides = { items, cuties, kits: overrides.kits, art: overrides.art }
	version += 1
}

/** Overlay currently applied — the admin page uses it to mark overridden entities. */
export function currentContentOverrides(): ContentOverrides {
	return overrides
}

/** Uploaded picture of one entity, if the admin has imported one. */
export function uploadedArt(kind: 'item' | 'cutie', id: string): string | null {
	return overrides.art[`${kind}:${id}`] ?? null
}

export function itemOverride(id: string): ContentOverride | undefined {
	return overrides.items[id]
}

export function cutieOverride(id: string): ContentOverride | undefined {
	return overrides.cuties[id]
}

/**
 * Kits the admin deleted from the game, as a set — rebuilt only when the overlay changes.
 *
 * Read on **every** merge (`mergeItem` / `mergeCutie`), so it must not walk the record each time.
 */
let removedKitVersion = -1
let removedKitIds: ReadonlySet<string> = new Set()

export function removedKits(): ReadonlySet<string> {
	if (removedKitVersion === version) return removedKitIds
	const ids = new Set<string>()
	for (const [id, entry] of Object.entries(overrides.kits.entries)) {
		if (entry.removed === true) ids.add(id)
	}
	removedKitIds = ids
	removedKitVersion = version
	return removedKitIds
}

/** The catalogues (headings) of the Kits tab, in order — the code five when nothing has been loaded. */
export function kitCategories(): KitCategoryInfo[] {
	const rows = overrides.kits.categories
	if (rows.length > 0) return [...rows].sort((left, right) => left.position - right.position)
	return KIT_CATEGORIES.map((id, index) => ({ id, label: KIT_CATEGORY_LABELS[id] ?? id, position: index }))
}

/** One parameter list with the catalogue's **default numbers** folded in (1★ → 5★ per key). */
function withSeeds(params: KitDef['params'], seeds?: Record<string, number[]>): KitDef['params'] {
	if (!seeds) return params
	return params.map((param) => {
		const table = seeds[param.key]
		if (!table || table.length !== 5) return param
		const [first, second, third, fourth, fifth] = table as [number, number, number, number, number]
		return { ...param, default: first, defaults: [first, second, third, fourth, fifth] as const }
	})
}

const CODE_KIT_BY_ID = new Map(KIT_DEFS.map((def) => [def.id, def]))

let catalogueVersion = -1
let catalogue: KitDef[] = KIT_DEFS

/**
 * The kit catalogue **as the game plays it**: the code mechanics, renamed / moved / retuned / hidden by
 * the admin, plus every kit created there.
 *
 * ⚠️ A created kit is built from its `mechanic` (`burn-on-hit-2` → `burn-on-hit`): the engine only ever
 * branches on the mechanic, and the entry supplies the label, the catalogue and the starting numbers.
 * It is also what `registerKitCatalogue` hands to `kitDef()`, so a created id resolves everywhere.
 */
export function kitCatalogue(): KitDef[] {
	if (catalogueVersion === version) return catalogue
	catalogueVersion = version
	const entries = overrides.kits.entries
	const seen = new Set<string>()
	const built: KitDef[] = []

	for (const def of KIT_DEFS) {
		seen.add(def.id)
		const entry = entries[def.id]
		if (entry?.removed) continue
		built.push({
			...def,
			mechanic: def.id,
			label: entry?.label ?? def.label,
			category: entry?.categoryId ?? def.category,
			appliesTo: entry?.appliesTo ?? def.appliesTo,
			params: withSeeds(def.params, entry?.params),
			...(entry?.position == null ? {} : { position: entry.position }),
		})
	}

	for (const [id, entry] of Object.entries(entries)) {
		if (seen.has(id) || entry.removed) continue
		const base = CODE_KIT_BY_ID.get((entry.mechanic ?? id) as ItemKitId)
		// An entry whose mechanic no longer exists cannot run: it stays out of the game (the Kits tab
		// still lists it so it can be fixed).
		if (!base) continue
		built.push({
			...base,
			id: id as ItemKitId,
			mechanic: base.id,
			label: entry.label ?? base.label,
			category: entry.categoryId ?? base.category,
			appliesTo: entry.appliesTo ?? base.appliesTo,
			params: withSeeds(base.params, entry.params),
			...(entry.position == null ? {} : { position: entry.position }),
		})
	}

	// Catalogue order first, then the row's own `position`, then the code order (a stable sort keeps it).
	const categoryOrder = new Map(kitCategories().map((category, index) => [category.id, index]))
	built.sort((left, right) => {
		const leftCategory = categoryOrder.get(left.category) ?? Number.MAX_SAFE_INTEGER
		const rightCategory = categoryOrder.get(right.category) ?? Number.MAX_SAFE_INTEGER
		if (leftCategory !== rightCategory) return leftCategory - rightCategory
		const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER
		const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER
		return leftPosition - rightPosition
	})

	catalogue = built
	registerKitCatalogue(built)
	return catalogue
}

/** A kit id that belongs to the **code** catalogue (a "real" kit with its own engine mechanic). */
export function isCodeKit(id: string): boolean {
	return CODE_KIT_BY_ID.has(id as ItemKitId)
}

/**
 * Drop deleted kits out of one kit list — at the top level **and** inside an attack kit
 * (`onHit` effects, the `charge` variant), because those are kits too.
 *
 * ⚠️ Identity is preserved when nothing was deleted (`kits` comes back as the same array), so a
 * template that reads no removal does not get a fresh object on every call.
 */
function pruneKits(kits: ItemKit[], gone: ReadonlySet<string>): ItemKit[] {
	if (gone.size === 0) return kits
	const kept: ItemKit[] = []
	for (const kit of kits) {
		if (gone.has(kit.id)) continue
		let next = kit
		if (kit.onHit?.length) {
			const onHit = kit.onHit.filter((effect) => !gone.has(effect.id))
			if (onHit.length !== kit.onHit.length) {
				if (onHit.length > 0) {
					next = { ...next, onHit }
				} else {
					// Every effect was deleted: the swing has no on-hit list at all any more, rather than
					// an empty one that the admin page would draw as an empty box.
					const { onHit: _dropped, ...rest } = next
					next = rest as ItemKit
				}
			}
		}
		if (kit.charge && gone.has(kit.charge.id)) {
			const { charge: _dropped, ...rest } = next
			next = rest as ItemKit
		}
		kept.push(next)
	}
	return kept
}

function pruneTemplateKits<T extends { kits?: ItemKit[] }>(template: T): T {
	const gone = removedKits()
	if (gone.size === 0 || !template.kits?.length) return template
	return { ...template, kits: pruneKits(template.kits, gone) }
}

/**
 * Drop deleted kits out of one list.
 *
 * Exported for the admin editor, which compares a draft against the **code** values: the code copy of
 * an item still lists a deleted kit, and without this the editor would open showing a difference and
 * offer to save a kit that no longer exists.
 */
export function pruneRemovedKits(kits: ItemKit[]): ItemKit[] {
	return pruneKits(kits, removedKits())
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Every `ItemClass`, in the order the admin select shows them. */
const ITEM_CLASSES: readonly ItemClass[] = ['melee', 'ranged', 'artifact', 'jade', 'accessory', 'armor', 'potion']

/**
 * An item class from a stored row, with the **old names folded in**: `focus` → `artifact` and
 * `jewelry` → `jade`.
 *
 * `focus` was the third weapon type before it became `artifact`, and `jewelry` was renamed to `jade`
 * when `accessory` was added; a row saved back then must keep counting as the same thing, otherwise an
 * existing item silently stops swinging or stops receiving a support gem's buff.
 */
export function normalizeItemClass(value: unknown): ItemClass | undefined {
	if (value === 'focus') return 'artifact'
	if (value === 'jewelry') return 'jade'
	return ITEM_CLASSES.includes(value as ItemClass) ? (value as ItemClass) : undefined
}

/** Lookup table: JSON data → the value `ItemTemplate` expects. */
const ITEM_UNPACKERS: Record<string, (value: unknown) => unknown> = {
	kits: normalizeKits,
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
	// 🔴 A kit deleted from the app is pruned even when this item has **no** override: its kit may
	// come straight from the code template, and that is exactly the copy that must not resurrect.
	if (!override) return pruneTemplateKits(base)
	const next: ItemTemplate = { ...base }

	for (const [key, value] of Object.entries(override)) {
		try {
			if (key === 'space') {
				if (isRecord(value) && isPositiveInt(value.w, 4) && isPositiveInt(value.h, 5)) {
					next.space = { w: value.w as number, h: value.h as number }
				}
				continue
			}
			if (key === 'quality') {
				if (isPositiveInt(value, 5)) next.quality = value as Quality
				continue
			}
			if (key === 'art') {
				if (typeof value === 'boolean') next.art = value
				continue
			}
			if (key === 'cls') {
				// A row saved before the `focus` class became `artifact` still has to reach the item as
				// a **weapon**: an unknown class is dropped instead of copied onto the template.
				const cls = normalizeItemClass(value)
				if (cls) next.cls = cls
				continue
			}
			if (key === 'name' || key === 'icon') {
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

	return pruneTemplateKits(next)
}

/** Merge one cutie override over the base definition. `kits` is a list, so it replaces the base one. */
export function mergeCutie(base: CutieDef, override: ContentOverride | undefined): CutieDef {
	// Same rule as an item: the code kit list is pruned too (`getCutie` always merges).
	if (!override) return pruneTemplateKits(base)
	const next: CutieDef = { ...base }

	for (const [key, value] of Object.entries(override)) {
		try {
			if (key === 'name' || key === 'icon' || key === 'blurb') {
				if (typeof value === 'string' && value.length > 0) Object.assign(next, { [key]: value })
				continue
			}
			if (key === 'kits') {
				next.kits = normalizeKits(value)
				continue
			}
			if (key === 'art' || key === 'skillArt' || key === 'avatar') {
				if (typeof value === 'boolean') Object.assign(next, { [key]: value })
				continue
			}
			if (key === 'attack') {
				if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
					next.attack = value
				}
				continue
			}
			// ⚠️ `attackSpeed` is **gone** from the model (Cooldown Time lives on each kit), so a stored
			// row that still carries it is ignored instead of resurrecting a field nothing reads.
			if (key === 'attackSpeed') continue
			if (key === 'unlockStage' || key === 'maxHp' || key === 'maxSe') {
				if (isPositiveInt(value, 1_000_000) || value === 0) Object.assign(next, { [key]: value })
				continue
			}
			if (key === 'seRegen') {
				if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
					Object.assign(next, { [key]: value })
				}
			}
		} catch {
			// Skip just this field.
		}
	}

	return pruneTemplateKits(next)
}
