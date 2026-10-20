import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toEnglish, useLanguageStore } from '../i18n'
import { useAdminContent, useDeleteArt, useResetContent, useSaveContent, useSessionState, useUploadArt } from '../api/queries'
import { currentContentOverrides, kitCatalogue, pruneRemovedKits, putLocalOverride, removedKits } from '../game/content'
import {
	ITEM_BY_ID,
	QUALITY_VALUES,
	STARS,
	itemCatalogue,
	itemTemplateById,
	starLabel,
	uniqueItemCode,
} from '../game/items'
import {
	CHARGE_KITS,
	DIRECTION_LABELS,
	KIT_CATEGORIES,
	KIT_CATEGORY_LABELS,
	ON_HIT_KITS,
	defaultKit,
	isRepeatableKit,
	kitDef,
} from '../game/kits'
import { DIRECTION_BITS, DIRECTIONS } from '../game/bag'
import { STAT_KEYS, STAT_LABELS, isPercentStat } from '../game/stats'
import { AURA_TARGET_LABELS } from './itemFacts'
import type { StatKey } from '../game/types'
import { CUTIES, getCutie } from '../game/cuties'
import type {
	AuraSpec,
	ChargeKit,
	ItemKit,
	ItemKitId,
	ItemTemplate,
	OnHitKit,
	OnHitKitId,
	CutieDef,
	Quality,
	Star,
	StatMods,
} from '../game/types'
import { useUiStore, type AdminTab } from '../store/uiStore'
import { ArtPreview } from './ArtPreview'
import { ArtImportDialog } from './ArtImportDialog'
import { OptionPicker, selectTriggerClass } from './AdminPickers'
import { Button } from './ui/button'
import { ConfirmDialog } from './ConfirmDialog'
import { KitCatalogueScreen } from './KitCatalogueScreen'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Check, ChevronDown, ImagePlus, Plus, Save, Trash2, X } from './icons'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from './shadcn/dropdown-menu'
import {
	ITEM_QUALITY_SWATCH,
	ITEM_STAR_TEXT,
	cn,
	hintClass,
	panelClass,
	panelTitleClass,
	rowBetweenClass,
} from './ui'

type Kind = 'item' | 'cutie'

/**
 * Input control used for a field.
 *
 * ⚠️ Per-star fields are **not** one comma separated box: every star rank gets its own control,
 * laid out in a row. With a single box a typo (a missing comma) silently shifted every rank after
 * it, and the editor could not tell which number belonged to which star.
 */
type FieldKind =
	| 'text'
	| 'int'
	| 'number'
	| 'select'
	| 'json'
	| 'perStarNumber'
	| 'perStarJson'
	| 'size'
	| 'quality'
	| 'kits'

interface FieldDef {
	/** Payload key — must match the server whitelist in `backend/src/content.ts`. */
	key: string
	/** Label shown to the editor. */
	label: string
	/**
	 * Heading the field is grouped under. Fields are rendered **group by group**, in the order of
	 * `GROUP_ORDER`, so related stats sit together (attack next to Sword Energy, HP next to armour…)
	 * instead of in the order the payload happens to declare them.
	 */
	group: string
	kind: FieldKind
	min?: number
	max?: number
	/** `perStarNumber` only: the server stores these as whole numbers. */
	integer?: boolean
	options?: { value: string; label: string }[]
	/**
	 * Optional field: not every item has it (armour has no `multiplier`, a weapon has no `interval`
	 * for a self-triggering effect). The form hides it until the template declares it or the editor
	 * clicks "Thêm trường", so a blank row never implies that the item *has* an empty value.
	 */
	optional?: boolean
	/** Value every star box is seeded with when the editor adds an optional field. */
	addDefault?: string
}

const CLASS_OPTIONS = [
	{ value: 'melee', label: 'Melee weapon' },
	{ value: 'ranged', label: 'Ranged weapon' },
	{ value: 'artifact', label: 'Artifact' },
	{ value: 'jade', label: 'Jade' },
	{ value: 'accessory', label: 'Accessory' },
	{ value: 'armor', label: 'Armor' },
	{ value: 'potion', label: 'Potion' },
]

/** `cls` → English name, for the list row and the type picker (the page is English-only). */
const CLASS_LABEL_EN: Record<string, string> = Object.fromEntries(
	CLASS_OPTIONS.map((option) => [option.value, option.label]),
)

/** The five quality bands, labelled with the colour the tile will use. */
const QUALITY_NAMES: Record<Quality, string> = {
	1: 'Silver',
	2: 'Green',
	3: 'Blue',
	4: 'Purple',
	5: 'Gold',
}
const QUALITY_OPTIONS = QUALITY_VALUES.map((quality) => ({
	value: String(quality),
	label: `${quality} · ${QUALITY_NAMES[quality]}`,
}))

/** Editable site of the bag footprint. */
const SIZE_LIMITS = { w: { min: 1, max: 4 }, h: { min: 1, max: 5 } } as const

/**
 * The look of the entry **being edited** in the list — a gold frame, a gold wash and a 3 px gold bar
 * down the left edge, so "this is the one open on the right" reads without comparing colours.
 *
 * ⚠️ It only works because `cn()` is `tailwind-merge` (see `components/ui.ts`): these classes have to
 * **replace** the base background / border, and a plain string join let the stylesheet
 * order decide — the base button won and the selection looked unchanged.
 */
const ACTIVE_ENTRY_CLASS =
	'border-gold bg-gold/15 font-semibold text-paper shadow-[inset_3px_0_0_var(--color-gold)]'

/**
 * Editable **item** fields.
 *
 * ⚠️ The emoji (`icon`) and the art flags (`art`, `artExt`…) are **not** editable here: they only
 * declare which file on disk to use, and the picture itself is uploaded from this page. `onHit` and
 * `aura` effects are missing too — in code they are **functions**, and JSON cannot carry a function.
 */
const ITEM_FIELDS: FieldDef[] = [
	{ key: 'name', label: 'Name', group: 'Identity', kind: 'text' },
	{ key: 'cls', label: 'Type', group: 'Identity', kind: 'select', options: CLASS_OPTIONS },
	{ key: 'quality', label: 'Quality', group: 'Shop', kind: 'quality' },
	{ key: 'tier', label: 'Shop tier', group: 'Shop', kind: 'int', min: 1, max: 3 },
	{ key: 'cost', label: 'Base price (1★)', group: 'Shop', kind: 'int', min: 1, max: 999 },
	{ key: 'space', label: 'Cell footprint', group: 'Grid', kind: 'size' },
	{
		key: 'kits',
		label: 'Kits',
		group: 'Kits',
		kind: 'kits',
	},
]

/**
 * Editable **cutie** fields — every one of them is data, so all of them can be edited.
 *
 * Ordered by stat, offence first: a Cutie's identity, then the number its swings multiply, then its
 * health pool, then the Sword Energy it spends on a charged hit. ❌ No attack speed: the cadence
 * lives on each kit's own Cooldown Time.
 */
const CUTIE_FIELDS: FieldDef[] = [
	{ key: 'name', label: 'Name', group: 'Identity', kind: 'text' },
	{ key: 'blurb', label: 'Tagline', group: 'Identity', kind: 'text' },
	{ key: 'unlockStage', label: 'Unlocked at stage', group: 'Identity', kind: 'int', min: 0, max: 60 },
	{
		// The number every attack kit of the cutie scales — one value, since a cutie has levels, not stars.
		key: 'attack',
		label: 'Attack',
		group: 'Offence',
		kind: 'int',
		min: 0,
		max: 100_000,
	},

	{ key: 'maxHp', label: 'Health', group: 'Defence', kind: 'int', min: 50, max: 100_000 },
	{ key: 'maxSe', label: 'Max Sword Energy', group: 'Sword Energy', kind: 'int', min: 10, max: 1000 },
	{ key: 'seRegen', label: 'Sword Energy regen (/s)', group: 'Sword Energy', kind: 'number', min: 0, max: 100 },
	{
		// Same catalogue as an item: a cutie with no attack kit never swings.
		key: 'kits',
		label: 'Kits',
		group: 'Kits',
		kind: 'kits',
	},
]

/** The order the field groups are drawn in, per kind. A group with no visible field is skipped. */
const GROUP_ORDER: Record<Kind, string[]> = {
	item: ['Identity', 'Shop', 'Grid'],
	cutie: ['Identity', 'Offence', 'Defence', 'Sword Energy'],
}

const FIELDS: Record<Kind, FieldDef[]> = { item: ITEM_FIELDS, cutie: CUTIE_FIELDS }

/** Form state: every field holds **one string per control**; scalar fields hold a single entry. */
type Draft = Record<string, string[]>

/**
 * Values a field shows in the form.
 *
 * `merged` picks the baseline: `true` (default) reads the item **as it currently plays**
 * (code + any stored override) — that is what the editor must see, not the raw code; `false`
 * reads the code only, which is what the payload is compared against.
 */
function defaultValues(kind: Kind, id: string, field: FieldDef, merged = true): string[] {
	const base: ItemTemplate | CutieDef | undefined =
		kind === 'item'
			? merged
				? (itemTemplateById(id) ?? ITEM_BY_ID[id])
				: ITEM_BY_ID[id]
			: merged
				? getCutie(id)
				: CUTIES.find((cutie) => cutie.id === id)
	if (!base) return field.kind === 'kits' ? ['[]'] : ['']

	switch (field.kind) {
		case 'perStarNumber': {
			const source = (base as unknown as Record<string, number[] | ((star: Star) => number) | undefined>)[
				field.key
			]
			// An optional field the template does not declare starts out **absent**, not as five blanks.
			if (!source) return field.optional ? [] : STARS.map(() => '')
			if (typeof source === 'function') return STARS.map((star) => String(source(star)))
			return STARS.map((_star, index) => String(source[index] ?? 0))
		}
		case 'perStarJson': {
			const source = (base as unknown as Record<string, ((star: Star) => unknown) | undefined>)[field.key]
			return STARS.map((star) => (source ? JSON.stringify(source(star)) : ''))
		}
		case 'kits':
			// ⚠️ Pruned here too: with `merged = false` this reads the **code** template, which still
			// lists kits deleted from the game — a difference that would show up as an unsaved change.
			return [JSON.stringify(pruneRemovedKits((base as ItemTemplate).kits ?? []).map(kitToDraft))]
		case 'size': {
			const space = (base as ItemTemplate).space
			return [String(space.w), String(space.h)]
		}
		case 'quality':
			return [String((base as ItemTemplate).quality)]
		case 'json':
			return [JSON.stringify((base as unknown as Record<string, unknown>)[field.key] ?? '')]
		default: {
			const value = (base as unknown as Record<string, unknown>)[field.key]
			return [value === undefined ? '' : String(value)]
		}
	}
}

function defaultDraft(kind: Kind, id: string): Draft {
	const draft: Draft = {}
	for (const field of FIELDS[kind]) draft[field.key] = defaultValues(kind, id, field)
	return draft
}

/** The same draft, but taken from the **code only** — the baseline the payload is measured against. */
function codeDraft(kind: Kind, id: string): Draft {
	const draft: Draft = {}
	for (const field of FIELDS[kind]) draft[field.key] = defaultValues(kind, id, field, false)
	return draft
}

/** A positive number from a form box, or `null` when the box is empty or not a number. */
function positiveNumber(raw: string | undefined): number | null {
	const text = (raw ?? '').trim()
	if (text === '') return null
	const value = Number(text)
	return Number.isFinite(value) && value > 0 ? value : null
}



/**
 * Kit form state.
 *
 * Parameters are kept as **strings** while editing: a controlled number input whose state is already
 * a number eats the first keystroke of "0.625" (Number('0.') is 0), so decimals could not be typed.
 */
interface KitDraft {
	id: ItemKitId
	params: Record<string, string[]>
	/** Main (attack) kit only: the effects rolled when the attack lands. */
	onHit?: KitDraft[]
	/** Main (attack) kit only: the charged variant of the swing (at most one). */
	charge?: KitDraft
	/** `stats` option kit: one stat table per star, held as JSON text while editing. */
	stats?: string[]
	/** `aura` option kit: one `{ target, mods }` per star, held as JSON text while editing. */
	aura?: string[]
}

function kitToDraft(kit: ItemKit): KitDraft {
	const params: Record<string, string[]> = {}
	for (const param of kitDef(kit.id).params) {
		const stored = kit.params[param.key]
		params[param.key] = Array.from({ length: STARS.length }, (_, index) =>
			String(stored?.[index] ?? param.default),
		)
	}
	const draft: KitDraft = { id: kit.id, params }
	if (kit.onHit?.length) draft.onHit = kit.onHit.map(kitToDraft)
	if (kit.charge) draft.charge = kitToDraft(kit.charge)
	if (kit.stats) draft.stats = kit.stats.map((table) => JSON.stringify(table))
	if (kit.aura) draft.aura = kit.aura.map((entry) => JSON.stringify(entry))
	return draft
}

/** Parse one JSON text box; an object is required (a `Stats`/aura table). */
function parseJsonBox(raw: string | undefined, label: string, at: string): Record<string, unknown> | string {
	const text = (raw ?? '').trim()
	if (text === '') return `${label}: ${at} cannot be empty`
	try {
		const parsed: unknown = JSON.parse(text)
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return `${label}: ${at} must be a JSON object`
		}
		return parsed as Record<string, unknown>
	} catch {
		return `${label}: ${at} is not valid JSON`
	}
}

/** Convert one edited kit to the payload shape; a string means "error message". */
function draftToKit(kit: KitDraft): ItemKit | string {
	const def = kitDef(kit.id)
	const params: Record<string, number[]> = {}
	for (const param of def.params) {
		const values = kit.params[param.key] ?? []
		const numbers: number[] = []
		for (let index = 0; index < STARS.length; index += 1) {
			const raw = (values[index] ?? '').trim()
			const value = Number(raw)
			const at = `${index + 1}★`
			if (raw === '' || !Number.isFinite(value)) return `${param.label}: ${at} must be a number`
			if (param.integer && !Number.isInteger(value)) return `${param.label}: ${at} must be a whole number`
			if (value < param.min || value > param.max) {
				return `${param.label}: ${at} must be between ${param.min} and ${param.max}`
			}
			numbers.push(value)
		}
		params[param.key] = numbers
	}

	if (def.kind === 'option') {
		if (kit.id === 'parry') return { id: kit.id, params }
		if (kit.id === 'stats') {
			const stats: StatMods[] = []
			for (let index = 0; index < STARS.length; index += 1) {
				const parsed = parseJsonBox(kit.stats?.[index], def.label, `${index + 1}★`)
				if (typeof parsed === 'string') return parsed
				stats.push(parsed as StatMods)
			}
			return { id: kit.id, params, stats }
		}
		// Every other option kit (the support / defensive gems) is a plain parameter table; only
		// `aura` carries the extra JSON tables.
		if (kit.id !== 'aura') return { id: kit.id, params }
		const aura: AuraSpec[] = []
		for (let index = 0; index < STARS.length; index += 1) {
			const parsed = parseJsonBox(kit.aura?.[index], def.label, `${index + 1}★`)
			if (typeof parsed === 'string') return parsed
			if (
				typeof parsed.target !== 'string' ||
				typeof parsed.mods !== 'object' ||
				parsed.mods === null ||
				Array.isArray(parsed.mods)
			) {
				return `${def.label}: rank ${index + 1}★ must have { target, mods }`
			}
			aura.push({ target: parsed.target as AuraSpec['target'], mods: parsed.mods as StatMods })
		}
		return { id: kit.id, params, aura }
	}

	if (def.kind === 'charge') return { id: kit.id, params }

	if (def.kind !== 'attack') return { id: kit.id, params }
	const onHit: OnHitKit[] = []
	for (const effect of kit.onHit ?? []) {
		const converted = draftToKit(effect)
		if (typeof converted === 'string') return converted
		if (kitDef(converted.id).kind !== 'onHit') {
			return `${toEnglish(kitDef(converted.id).label)}: only on-hit effects belong here`
		}
		onHit.push({ id: converted.id as OnHitKitId, params: converted.params })
	}
	let charge: ChargeKit | undefined
	if (kit.charge) {
		const converted = draftToKit(kit.charge)
		if (typeof converted === 'string') return converted
		if (kitDef(converted.id).kind !== 'charge') {
			return `${toEnglish(kitDef(converted.id).label)}: only the charged hit belongs here`
		}
		charge = { id: 'charge-attack', params: converted.params }
	}
	return {
		id: kit.id,
		params,
		...(onHit.length > 0 ? { onHit } : {}),
		...(charge ? { charge } : {}),
	}
}

/**
 * Parse the kit list held in the draft; broken JSON reads as "no kits" instead of throwing.
 *
 * A draft saved before the charged attack became a sub-kit still carries it as a kit of its own —
 * it is folded into the basic attack here, so an already-open editor cannot send the old shape back
 * (the server rejects it) and the card never draws a second swing that no longer exists.
 */
function parseKitDrafts(raw: string | undefined): KitDraft[] {
	if (!raw) return []
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		return []
	}
	if (!Array.isArray(parsed)) return []
	const drafts = parsed as KitDraft[]
	const legacyCharge = drafts.find((kit) => kit.id === 'charge-attack')
	if (!legacyCharge) return drafts
	return drafts
		.filter((kit) => kit.id !== 'charge-attack')
		.map((kit) =>
			kit.id === 'basic-attack' && !kit.charge ? { ...kit, charge: legacyCharge } : kit,
		)
}

/** Error message for one value, prefixed with the star rank it belongs to. */
function invalid(star: Star | undefined, message: string): never {
	throw new Error(star ? `${star}★ ${message}` : message)
}

function textValue(raw: string, star?: Star): string {
	const value = raw.trim()
	if (value.length === 0) invalid(star, 'cannot be empty')
	return value
}

function numberValue(field: FieldDef, raw: string, star?: Star): number {
	const value = Number(raw.trim())
	if (!Number.isFinite(value)) invalid(star, 'must be a number')
	if (field.integer && !Number.isInteger(value)) invalid(star, 'must be a whole number')
	if (field.min !== undefined && value < field.min) invalid(star, `must be ≥ ${field.min}`)
	if (field.max !== undefined && value > field.max) invalid(star, `must be ≤ ${field.max}`)
	return value
}

/**
 * Build the payload to send: **only fields that differ from the code default**.
 *
 * ⚠️ WHY NOT SEND EVERYTHING: a row should only hold what the editor actually changed. Sending
 * the whole set would freeze every field, so a later code change to an untouched field would
 * silently stop having any effect.
 *
 * ⚠️ A per-star field is compared as a **whole array**: one edited rank sends all five, because
 * the server stores the field as one array and a partial array would lose the other ranks.
 */
function buildPayload(
	kind: Kind,
	id: string,
	draft: Draft,
): { payload: Record<string, unknown>; errors: string[] } {
	const payload: Record<string, unknown> = {}
	const errors: string[] = []
	const defaults = codeDraft(kind, id)

	for (const field of FIELDS[kind]) {
		const values = draft[field.key] ?? []
		const absent = values.every((value) => value.trim() === '')
		if (absent) {
			// An optional field the item declares **in code** but the editor removed: send zeros so the
			// removal is real (damage 0 = the item no longer swings). A field whose minimum is above 0
			// (cooldown) cannot be zeroed, so it keeps its code value — harmless once damage is 0.
			const code = defaults[field.key] ?? []
			if (field.optional && field.min === 0 && code.some((value) => value.trim() !== '')) {
				payload[field.key] = STARS.map(() => 0)
			}
			continue
		}
		// Items are stored **whole**: there is no code default to compare against any more, so every
		// field the form holds is sent. Cuties still diff, because their defaults do live in code.
		if (kind !== 'item' && JSON.stringify(values) === JSON.stringify(defaults[field.key] ?? [])) continue

		try {
			switch (field.kind) {
				case 'text':
					payload[field.key] = textValue(values[0] ?? '')
					break
				case 'int':
				case 'number':
					payload[field.key] = numberValue(field, values[0] ?? '')
					break
				case 'select': {
					// `có/không` selects send booleans, anything else sends the string.
					const raw = (values[0] ?? '').trim()
					const isBoolean = field.options?.every(
						(option) => option.value === 'true' || option.value === 'false',
					)
					payload[field.key] = isBoolean ? raw === 'true' : raw
					break
				}
				case 'json':
					payload[field.key] = JSON.parse(textValue(values[0] ?? ''))
					break
				case 'perStarNumber':
					payload[field.key] = STARS.map((rank, index) =>
						numberValue(field, values[index] ?? '', rank),
					)
					break
				case 'perStarJson':
					payload[field.key] = STARS.map((rank, index) =>
						JSON.parse(textValue(values[index] ?? '', rank)),
					)
					break
				case 'kits': {
					const drafts = JSON.parse(textValue(values[0] ?? '')) as KitDraft[]
					const converted = drafts.map(draftToKit)
					const error = converted.find((kit): kit is string => typeof kit === 'string')
					if (error) throw new Error(error)
					payload[field.key] = converted
					break
				}
				case 'size': {
					payload[field.key] = {
						w: integerInRange(values[0] ?? '', SIZE_LIMITS.w, 'w'),
						h: integerInRange(values[1] ?? '', SIZE_LIMITS.h, 'h'),
					}
					break
				}
				case 'quality': {
					const quality = integerInRange(values[0] ?? '', { min: 1, max: 5 }, 'phẩm')
					payload[field.key] = quality
					break
				}
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : 'invalid value'
			errors.push(`${field.label}: ${detail}`)
		}
	}

	return { payload, errors }
}

/** Whole number inside a fixed range, used by the two `space` inputs. */
function integerInRange(raw: string, range: { min: number; max: number }, axis: string): number {
	const value = Number(raw.trim())
	if (!Number.isInteger(value)) throw new Error(`${axis} must be a whole number`)
	if (value < range.min || value > range.max) {
		throw new Error(`${axis} must be between ${range.min} and ${range.max}`)
	}
	return value
}

/**
 * Content admin page: edit **items** and **cuties**, and see/delete the **kits** of the game.
 *
 * ⚠️ Editing here changes the game for **every player** (content lives on the server, it is not
 * part of a personal save). Access is limited to accounts whose email is listed in
 * `ADMIN_EMAILS`; with that variable unset nobody gets in.
 */
export function AdminContentScreen() {
	useLanguageStore((state) => state.language)
	const { user, loading } = useSessionState()

	return (
		<div className="flex flex-col gap-3.5">
			<Button asChild variant="ghost" size="sm" className="self-start">
				<Link to="/">← Back to the game</Link>
			</Button>
			{loading ? (
				<section className={panelClass}>
					<h2 className={panelTitleClass}>Content admin</h2>
					<p className={hintClass}>Checking your session…</p>
				</section>
			) : !user || !user.is_admin ? (
				<section className={cn(panelClass, 'gap-2.5')}>
					<h2 className={panelTitleClass}>Content admin</h2>
					<p className={hintClass}>
						{user
							? 'This account has no admin rights. Add your email to ADMIN_EMAILS in .env and restart the API.'
							: 'Sign in with an admin account (its email must be listed in ADMIN_EMAILS in .env).'}
					</p>
				</section>
			) : (
				<AdminContentTabs />
			)}
		</div>
	)
}

/**
 * The three tabs of the page.
 *
 * ⚠️ A **kit** is not an entity with an id to select: its tab shows the whole catalogue, so it gets
 * its own panel and the item editor is not mounted at all (its draft seeds from an entity id and
 * `getCutie('burn-on-hit')` would throw — a blank page, not a wrong panel).
 */
function AdminContentTabs() {
	const kind = useUiStore((state) => state.adminKind)
	const setAdminSelection = useUiStore((state) => state.setAdminSelection)
	const { data, isLoading } = useAdminContent(true)

	const selectTab = (value: AdminTab) => {
		if (value === 'kit') {
			setAdminSelection('kit', '')
			return
		}
		setAdminSelection(value, (value === 'item' ? itemCatalogue()[0]?.id : CUTIES[0]?.id) ?? '')
	}

	return (
		<div className="flex flex-col gap-3.5">
			<section className={cn(panelClass, 'gap-2.5')}>
				<div className={rowBetweenClass}>
					<h2 className={panelTitleClass}>Content admin</h2>
					<span className="text-[11.5px] text-muted">
						{data
							? `${data.overrides.length} edited ${data.overrides.length === 1 ? 'entry' : 'entries'}`
							: isLoading
								? 'loading…'
								: '—'}
					</span>
				</div>
				<div className="flex flex-wrap gap-2">
					{ADMIN_TABS.map((value) => (
						<Button
							type="button"
							key={value}
							data-admin-tab={value}
							size="sm"
							variant={kind === value ? 'primary' : 'secondary'}
							onClick={() => selectTab(value)}
						>
							{ADMIN_TAB_LABELS[value]}
						</Button>
					))}
				</div>
			</section>

			{kind === 'kit' ? <KitCatalogueScreen /> : <AdminContentEditor key={kind} kind={kind} />}
		</div>
	)
}

const ADMIN_TABS: AdminTab[] = ['item', 'cutie', 'kit']
const ADMIN_TAB_LABELS: Record<AdminTab, string> = { item: 'Items', cutie: 'Cuties', kit: 'Kits' }

function AdminContentEditor({ kind }: { kind: Kind }) {
	const language = useLanguageStore((state) => state.language)
	// Selection lives in the store: saving bumps `contentVersion`, which remounts this page (see
	// `__root`) — local state made the panel jump back to the first item after every save.
	const selected = useUiStore((state) => state.adminId)
	const setAdminSelection = useUiStore((state) => state.setAdminSelection)
	const [draft, setDraft] = useState<Draft>(() =>
		// Seed from the **stored** selection; when nothing is stored yet (`''`) use the first entry of
		// the kind, which is what `activeId` below resolves to.
		defaultDraft(
			kind,
			useUiStore.getState().adminId || (kind === 'item' ? itemCatalogue()[0]?.id : CUTIES[0]?.id) || '',
		),
	)
	const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)

	const { data } = useAdminContent(true)
	const saveContent = useSaveContent()
	const resetContent = useResetContent()
	const uploadArt = useUploadArt()
	const deleteArt = useDeleteArt()
	const bumpContent = useUiStore((state) => state.bumpContent)
	const contentVersion = useUiStore((state) => state.contentVersion)
	const [importOpen, setImportOpen] = useState(false)
	/** Deleting a picture cannot be undone (it has to be cropped again), so it asks first. */
	const [removeArtOpen, setRemoveArtOpen] = useState(false)
	const [createOpen, setCreateOpen] = useState(false)
	/**
	 * **Name** of the item being created — the admin never types an id. The code (`kiem-sat`) is
	 * generated from this name by `uniqueItemCode()` and shown as a preview.
	 */
	const [newName, setNewName] = useState('')
	/**
	 * Why the last create attempt did nothing.
	 *
	 * ⚠️ It has to live **beside the input**: `message` is drawn at the bottom of the editor panel on
	 * the right, so a rejected code looked exactly like a dead button.
	 */
	const [createError, setCreateError] = useState<string | null>(null)
	/** Deleting an item is asked first — it leaves the shop and everyone's bag. */
	const [deleteOpen, setDeleteOpen] = useState(false)
	/** Star rank the picture is previewed at — the art is the same, the stars only change colour. */
	const [previewStar, setPreviewStar] = useState<Star>(1)

	/**
	 * Ids in the list — the **live** catalogue for items, the code cuties otherwise.
	 *
	 * ⚠️ `contentVersion` is a real input even though the code never reads it: the overlay lives in a
	 * module variable (`game/content.ts`), so a new version is the **only** signal that the catalogue
	 * changed. Dropping it from the dependencies leaves a created item out of the list.
	 */
	const ids = useMemo(() => {
		void contentVersion
		if (kind !== 'item') return CUTIES.map((cutie) => cutie.id)
		return itemCatalogue().map((template) => template.id)
	}, [kind, contentVersion])

	/**
	 * Items deleted on this page: still listed so they can be brought back, marked "đã xoá".
	 *
	 * ⚠️ Read from the **overlay**, not from the admin payload: the catalogue and this list must
	 * come from the same place, otherwise deleting an item leaves it visible for one render.
	 */
	const removedIds: string[] = []

	/**
	 * Entity actually being edited.
	 *
	 * ⚠️ Derived, never trusted from `selected` alone: switching kind (item → cutie) leaves
	 * `selected` pointing at an id of the other kind for one render, and `getCutie('wooden-blade')`
	 * throws — which is a blank page, not a wrong label.
	 */
	const activeId = ids.includes(selected)
		? selected
		: removedIds.includes(selected)
			? selected
			: (ids[0] ?? '')

	/** Human name of the edited entity — used by the picture dialogs. */
	const entityName =
		kind === 'item'
			? (itemTemplateById(activeId)?.name ?? ITEM_BY_ID[activeId]?.name ?? activeId)
			: getCutie(activeId).name

	/** Values the form **started from** (code + any stored override) — the baseline for "đã sửa". */
	const loaded = useMemo(() => defaultDraft(kind, activeId), [kind, activeId])

	/** Values straight from the code — the baseline for what the payload has to send. */
	const codeDefaults = useMemo(() => codeDraft(kind, activeId), [kind, activeId])

	/** Attach an optional field (`passive`, `aura`…) to the entity being edited. */
	const addOptionalField = (field: FieldDef) =>
		setDraft((current) => ({
			...current,
			[field.key]: STARS.map(() => field.addDefault ?? ''),
		}))

	/** Kits currently attached to the item, parsed from the draft. */
	const kits = useMemo(() => parseKitDrafts(draft.kits?.[0]), [draft.kits])

	/** Items carry **one value per star rank**; a cutie has levels, so each kit box is a single value. */
	const starred = kind === 'item'

	/** Write the kit list back into the draft as canonical JSON. */
	const writeKits = (next: KitDraft[]) =>
		setDraft((current) => ({ ...current, kits: [JSON.stringify(next)] }))

	/**
	 * Attach a kit to the item being edited.
	 *
	 * A `stats` / `aura` kit carries **one** stat, so a second stat is a second kit: those two are
	 * repeatable, and a fresh copy starts on a stat the item does not grant yet.
	 */
	const addKit = (id: ItemKitId) => {
		const code = parseKitDrafts(codeDefaults.kits?.[0]).find((kit) => kit.id === id)
		const draftKit = code ?? kitToDraft(defaultKit(id))
		if (id === 'stats' || id === 'aura') {
			const free = freeStatKey(kits)
			const tables = STARS.map(() => JSON.stringify(id === 'aura' ? { target: 'adjacent', mods: { [free]: 0 } } : { [free]: 0 }))
			draftKit[id === 'stats' ? 'stats' : 'aura'] = tables
		}
		const next = [...kits, draftKit]
		// A cutie without an attack number gets a starting one; an item has no attack at all — its
		// kits multiply the cutie's attack.
		if (!starred && kitDef(id).kind === 'attack' && !(draft.attack ?? []).some((value) => value.trim() !== '')) {
			setDraft((current) => ({ ...current, attack: ['10'], kits: [JSON.stringify(next)] }))
			return
		}
		writeKits(next)
	}

	/** Detach **one** kit by its position — two `stats` kits are told apart by the slot they sit in. */
	const removeKit = (kitIndex: number) => writeKits(kits.filter((_kit, index) => index !== kitIndex))

	/**
	 * Every kit id is offered until it is attached — an item may carry several attack kits, and a
	 * second `stats` / `aura` kit is how a second stat is added.
	 *
	 * A cutie gets the **attack kits only** (plus their on-hit effects): `stats` / `aura` / `parry`
	 * describe an item's tables and adjacency, and Chấn Đao belongs to a weapon, not to a cutie.
	 *
	 * ⚠️ Read from `kitCatalogue()`, **not** from `KIT_DEFS`: a kit deleted on the Kits tab must not be
	 * offered here — attaching it would resurrect it in the entity's kit list.
	 */
	const availableKits = useMemo(() => {
		void contentVersion
		return kitCatalogue()
			.filter((def) => def.kind === 'attack' || (starred && def.kind === 'option'))
			.filter((def) => !kits.some((kit) => kit.id === def.id) || isRepeatableKit(def.id))
	}, [kits, starred, contentVersion])

	/**
	 * The same list, split into the headings the menu draws.
	 *
	 * ⚠️ Grouped by `KitDef.category` — the **same** taxonomy the Kits tab uses — so one kit is filed
	 * under one word everywhere (attack / control / support / defense / stats). Grouping by `kind`
	 * here would call a burn "On hit" on this page and "Control" on the other.
	 */
	const availableGroups = useMemo(() => {
		const groups = new Map<string, typeof availableKits>()
		for (const def of availableKits) {
			const label = KIT_CATEGORY_LABELS[def.category]
			groups.set(label, [...(groups.get(label) ?? []), def])
		}
		return KIT_CATEGORIES.filter((category) => groups.has(KIT_CATEGORY_LABELS[category])).map(
			(category) => ({ label: KIT_CATEGORY_LABELS[category], kits: groups.get(KIT_CATEGORY_LABELS[category])! }),
		)
	}, [availableKits])

	/** One parameter box of the kit at one star rank. */
	const setKitParam = (kitIndex: number, key: string, starIndex: number, raw: string) =>
		writeKits(
			kits.map((kit, index) => {
				if (index !== kitIndex) return kit
				const values = [...(kit.params[key] ?? [])]
				values[starIndex] = raw
				return { ...kit, params: { ...kit.params, [key]: values } }
			}),
		)

	/** A `single` parameter (e.g. `scaling`) covers the whole kit: copy it to every star rank. */
	const setKitParamAll = (kitIndex: number, key: string, raw: string) =>
		writeKits(
			kits.map((kit, index) =>
				index === kitIndex
					? { ...kit, params: { ...kit.params, [key]: STARS.map(() => raw) } }
					: kit,
			),
		)

	/** One parameter box of an on-hit effect inside the kit at `kitIndex`. */
	const setOnHitParam = (
		kitIndex: number,
		id: OnHitKitId,
		key: string,
		starIndex: number,
		raw: string,
	) =>
		writeKits(
			kits.map((kit, index) => {
				if (index !== kitIndex) return kit
				return {
					...kit,
					onHit: (kit.onHit ?? []).map((effect) => {
						if (effect.id !== id) return effect
						const values = [...(effect.params[key] ?? [])]
						values[starIndex] = raw
						return { ...effect, params: { ...effect.params, [key]: values } }
					}),
				}
			}),
		)

	/** One parameter box of the charged sub-kit at one star rank. */
	const setChargeParam = (kitIndex: number, key: string, starIndex: number, raw: string) =>
		writeKits(
			kits.map((kit, index) => {
				if (index !== kitIndex || !kit.charge) return kit
				const values = [...(kit.charge.params[key] ?? [])]
				values[starIndex] = raw
				return { ...kit, charge: { ...kit.charge, params: { ...kit.charge.params, [key]: values } } }
			}),
		)

	/** A `single` parameter of the charged sub-kit: copy it to every star rank. */
	const setChargeParamAll = (kitIndex: number, key: string, raw: string) =>
		writeKits(
			kits.map((kit, index) =>
				index === kitIndex && kit.charge
					? {
							...kit,
							charge: { ...kit.charge, params: { ...kit.charge.params, [key]: STARS.map(() => raw) } },
						}
					: kit,
			),
		)

	/** Detach the charged variant: the basic attack goes back to its plain swing. */
	const removeCharge = (kitIndex: number) =>
		writeKits(
			kits.map((kit, index) => {
				if (index !== kitIndex) return kit
				const { charge: _dropped, ...rest } = kit
				return rest
			}),
		)

	/** A `single` parameter of an on-hit effect: copy it to every star rank. */
	const setOnHitParamAll = (kitIndex: number, id: OnHitKitId, key: string, raw: string) =>
		writeKits(
			kits.map((kit, index) => {
				if (index !== kitIndex) return kit
				return {
					...kit,
					onHit: (kit.onHit ?? []).map((effect) =>
						effect.id === id
							? { ...effect, params: { ...effect.params, [key]: STARS.map(() => raw) } }
							: effect,
					),
				}
			}),
		)

	/**
	 * Replace the whole `stats` / `aura` table of one option kit.
	 *
	 * ⚠️ All five ranks in **one** write: five separate writes would each start from the same stale
	 * `kits` snapshot (the state has not re-rendered between them), so only the last one would survive.
	 */
	const setKitJson = (kitIndex: number, key: 'stats' | 'aura', values: string[]) =>
		writeKits(kits.map((kit, index) => (index === kitIndex ? { ...kit, [key]: values } : kit)))

	/** Attach the charged variant to one attack kit (❌ never a kit of its own). */
	const addCharge = (kitIndex: number) => {
		const id = kits[kitIndex]?.id
		const code = parseKitDrafts(codeDefaults.kits?.[0]).find((kit) => kit.id === id)?.charge
		writeKits(
			kits.map((kit, index) =>
				index === kitIndex ? { ...kit, charge: code ?? kitToDraft(defaultKit('charge-attack')) } : kit,
			),
		)
	}

	/** Attach an on-hit effect to one attack kit (the sub-kit only exists inside that kit). */
	const addOnHit = (kitIndex: number, id: OnHitKitId) => {
		const effect = kitToDraft({ id, params: defaultKit(id).params })
		writeKits(
			kits.map((kit, index) =>
				index === kitIndex ? { ...kit, onHit: [...(kit.onHit ?? []), effect] } : kit,
			),
		)
	}

	const removeOnHit = (kitIndex: number, id: OnHitKitId) =>
		writeKits(
			kits.map((kit, index) =>
				index === kitIndex
					? { ...kit, onHit: (kit.onHit ?? []).filter((effect) => effect.id !== id) }
					: kit,
			),
		)

	/**
	 * Data the editor can still switch on for this entity: every optional field that is not filled
	 * in yet. One "+" button opens this list — ❌ no chip per field, which left a row of buttons that
	 * all meant "add a field". Kits have their own add menu in the kit block.
	 */
	const optionalChoices = useMemo(() => {
		const choices: { key: string; label: string; field: FieldDef }[] = []
		for (const field of FIELDS[kind]) {
			if (!field.optional) continue
			if ((draft[field.key] ?? []).some((value) => value.trim() !== '')) continue
			choices.push({ key: field.key, label: field.label, field })
		}
		return choices
	}, [draft, kind])

	const addChoice = (choice: { field: FieldDef }) => addOptionalField(choice.field)

	/** Drop an optional field the editor added — the code value (or nothing) applies again. */
	const clearOptionalField = (key: string) =>
		setDraft((current) => ({ ...current, [key]: [] }))

	/**
	 * **Damage per minute** of one attack kit, per star rank, computed from the **draft** rather than
	 * the saved row, so the number follows every keystroke in the kit boxes.
	 *
	 * A plain swing hits for the owner's `attack` × this kit's `multiplier`, once every
	 * `cooldown` seconds, so the line is `attack × multiplier × 60 / cooldown`. ⚠️ An **item** has no
	 * attack of its own any more, so its line is read **per point of the cutie's attack** (base 1).
	 * The charged variant is a sub-kit, ❌ never a second timer, so it adds no DPM row of its own.
	 */
	const dpmOf = (attack: KitDraft) =>
		STARS.map((_star, index) => {
			const base = positiveNumber(draft.attack?.[index]) ?? 1
			const multiplier = positiveNumber(attack.params.multiplier?.[index])
			// The one rhythm number: seconds between two swings of this kit, editable right here.
			const cooldown = positiveNumber(attack.params.cooldown?.[index])
			if (multiplier === null || cooldown === null || cooldown <= 0) return null
			return Math.round((base * multiplier * 60_000) / (cooldown * 1000))
		})

	/**
	 * Damage of the **charged** hit per star rank: the entity's `attack` × the charged multiplier.
	 *
	 * It replaces the plain swing instead of adding to it, so it is shown on its own line — the DPM
	 * above stays the plain-swing rate (`charge-attack` is not a second timer).
	 */
	const chargedDamageOf = (charge: KitDraft) =>
		STARS.map((_star, index) => {
			const base = positiveNumber(draft.attack?.[index]) ?? 1
			const multiplier = positiveNumber(charge.params.multiplier?.[index])
			if (multiplier === null) return null
			return Math.round(base * multiplier)
		})

	/** Uploaded picture of the edited entity (metadata only — the bytes are in the image itself). */
	const artRow = useMemo(
		() => (data?.art ?? []).find((entry) => entry.kind === kind && entry.entityId === activeId),
		[data, kind, activeId],
	)

	const selectEntity = (id: string) => {
		setAdminSelection(kind, id)
		setDraft(defaultDraft(kind, id))
		setMessage(null)
	}

	const dirty = useMemo(
		() =>
			Object.keys(loaded).some(
				(key) => JSON.stringify(draft[key] ?? []) !== JSON.stringify(loaded[key] ?? []),
			),
		[draft, loaded],
	)

	/**
	 * Entities that have a row in the database — the item list marks them, so it is clear which ones a
	 * player can actually get.
	 */
	const onSave = () => {
		const { payload, errors } = buildPayload(kind, activeId, draft)
		if (errors.length > 0) {
			setMessage({ text: errors.join(' · '), bad: true })
			return
		}

		if (Object.keys(payload).length === 0) {
			// Nothing differs from the code defaults: the row would be empty, so nothing is sent.
			setMessage({ text: 'Nothing differs from the defaults yet.', bad: true })
			return
		}

		saveContent.mutate(
			{ kind, id: activeId, payload },
			{
				onSuccess: () => {
					putLocalOverride(kind, activeId, payload)
					bumpContent()
					setMessage({ text: 'Saved. Players see it on their next page load.', bad: false })
				},
				onError: (error) => setMessage({ text: error.message, bad: true }),
			},
		)
	}

	const busy = saveContent.isPending || resetContent.isPending

	/** Whether the edited item is one this page **created** (no template in the code). */
	const isCreatedItem = kind === 'item' && Boolean(itemTemplateById(activeId)) && !ITEM_BY_ID[activeId]
	/** Whether the edited item is currently deleted (it is only listed so it can come back). */
	const isRemovedItem = kind === 'item' && removedIds.includes(activeId)
	/** Row stored for this entity — needed to hide/restore it without losing fields. */
	const storedPayload = useMemo(
		() => {
			void contentVersion
			return currentContentOverrides()[kind === 'item' ? 'items' : 'cuties'][activeId] ?? {}
		},
		[kind, activeId, contentVersion],
	)

	/** The code the new item will get, shown under the name box (never typed by hand). */
	const newItemCode = newName.trim() ? uniqueItemCode(newName) : ''

	const createItem = () => {
		const name = newName.trim()
		if (name.length === 0) {
			setCreateError('Type a name first.')
			return
		}
		if (name.length > 80) {
			setCreateError('An item name is at most 80 characters.')
			return
		}
		const id = uniqueItemCode(name)
		setCreateError(null)
		// Only the fields an item cannot work without; everything else is an optional field.
		const payload = { name, cls: 'artifact', tier: 1, quality: 1, cost: 1, space: { w: 1, h: 1 } }
		saveContent.mutate(
			{ kind: 'item', id, payload },
			{
				onSuccess: () => {
					// Put the row in the overlay first: the catalogue is what the editor and the shop read,
					// and it has to contain the new item now — not after the refetch lands.
					putLocalOverride('item', id, payload)
					setAdminSelection('item', id)
					setDraft(defaultDraft('item', id))
					bumpContent()
					setCreateOpen(false)
					setNewName('')
					setCreateError(null)
					setMessage({ text: 'New item created.', bad: false })
				},
				onError: (error) => setCreateError(error.message),
			},
		)
	}

	const removeItem = () => {
		if (kind !== 'item') return
		// A created item is only the override row, so deleting it is a plain DELETE.
		if (isCreatedItem) {
			resetContent.mutate(
				{ kind: 'item', id: activeId },
				{
					onSuccess: () => {
						putLocalOverride('item', activeId, null)
						// The selection has to move off the deleted item **in the same event**.
						const nextId = itemCatalogue()[0]?.id ?? ''
						setAdminSelection('item', nextId)
						setDraft(defaultDraft('item', nextId))
						bumpContent()
						setMessage({ text: 'Item deleted.', bad: false })
					},
					onError: (error) => setMessage({ text: error.message, bad: true }),
				},
			)
			return
		}
		// A code item cannot be deleted from here: it is hidden with `removed`, keeping the rest of the row.
		const hidden = { ...storedPayload, removed: true }
		saveContent.mutate(
			{ kind: 'item', id: activeId, payload: hidden },
			{
				onSuccess: () => {
					putLocalOverride('item', activeId, hidden)
					bumpContent()
					setMessage({ text: 'Item deleted — press "Restore" to bring it back.', bad: false })
				},
				onError: (error) => setMessage({ text: error.message, bad: true }),
			},
		)
	}

	return (
		<>
			<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,268px)_minmax(0,1fr)]">
			<section className={cn(panelClass, 'gap-1.5')}>
				<div className={rowBetweenClass}>
					<h3 className="m-0 text-[13px] text-muted">
						{`${ids.length + removedIds.length} ${kind === 'item' ? 'entries' : 'cuties'}`}
						</h3>
						{kind === 'item' ? (
							<Button
								type="button"
								data-admin-create-open
								size="sm"
								title="Create a new item (data only — the code is never edited)"
								onClick={() => {
									setCreateOpen((open) => !open)
									setCreateError(null)
									setMessage(null)
								}}
							>
								<Plus /> New item
							</Button>
						) : null}
					</div>

					{createOpen ? (
						// A real form, so **Enter** in the name box creates the item too — pressing Enter used
						// to do nothing at all, which reads exactly like a broken button.
						<form
							className="flex flex-col gap-1.5 rounded-lg border border-line bg-black/25 p-2"
							onSubmit={(event) => {
								event.preventDefault()
								createItem()
							}}
						>
							<Label htmlFor="admin-create-name" className="flex-col items-start gap-1">
								Item name
								<Input
									id="admin-create-name"
									data-admin-create-name
									value={newName}
									placeholder="Iron Sword"
									autoFocus
									maxLength={80}
									aria-invalid={createError ? true : undefined}
									aria-describedby={createError ? 'admin-create-error' : undefined}
									onChange={(event) => {
										setNewName(event.target.value)
										if (createError) setCreateError(null)
									}}
								/>
							</Label>
							{/* The id is derived from the name — the admin never types it. */}
							{newItemCode ? (
								<p className="m-0 text-[11.5px] text-muted">
									Generated id:{' '}
									<code
										data-admin-create-code
										className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11.5px] text-paper/85"
									>
										{newItemCode}
									</code>
								</p>
							) : null}
							{createError ? (
								<p
									id="admin-create-error"
									data-admin-create-error
									role="alert"
									className="m-0 text-[12px] text-danger-soft"
								>
									{createError}
								</p>
							) : null}
							<div className="flex gap-1.5">
								<Button
									type="submit"
									data-admin-create-submit
									variant="primary"
									size="sm"
									className="flex-1"
									disabled={saveContent.isPending}
								>
									<Plus /> {saveContent.isPending ? 'Creating…' : 'Create'}
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => {
										setCreateOpen(false)
										setCreateError(null)
									}}
								>
									Cancel
								</Button>
							</div>
						</form>
					) : null}

					<div className="flex max-h-[520px] flex-col gap-1 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{ids.map((id) => {
							const template = kind === 'item' ? (itemTemplateById(id) ?? ITEM_BY_ID[id]) : getCutie(id)
							return (
								<Button
									type="button"
									key={id}
									data-admin-entry={id}
									variant="secondary"
									size="sm"
									className={cn(
										// A row, not a pill: two lines with the **name** owning the full width and
										// the type under it. Side by side, a long name had to share the row with
										// "Ranged weapon" and was cut to "Beginer's ...".
										'h-auto flex-col items-start gap-0.5 py-1.5 text-left',
										id === activeId && ACTIVE_ENTRY_CLASS,
									)}
									onClick={() => selectEntity(id)}
								>
									<span
										className="w-full truncate"
										title={`${template?.icon ?? ''} ${toEnglish(template?.name ?? '')}`.trim()}
									>
										{template?.icon} {toEnglish(template?.name ?? '')}
									</span>
									{kind === 'item' && template ? (
										<span
											data-admin-entry-class
											className="w-full truncate text-[11px] font-normal text-muted"
											title={`Type: ${CLASS_LABEL_EN[(template as ItemTemplate).cls]}`}
										>
											{CLASS_LABEL_EN[(template as ItemTemplate).cls]}
										</span>
									) : null}
								</Button>
							)
						})}
						{/* Deleted items stay listed: without them there would be no way back. */}
						{removedIds.map((id) => {
							const template = ITEM_BY_ID[id]
							return (
								<Button
									type="button"
									key={id}
									data-admin-entry={id}
									data-admin-removed
									variant="secondary"
									size="sm"
									className={cn(
										'h-auto flex-col items-start gap-0.5 py-1.5 text-left opacity-60',
										id === activeId && ACTIVE_ENTRY_CLASS,
									)}
									onClick={() => selectEntity(id)}
								>
									<span
										className="w-full truncate line-through"
										title={`${template?.icon ?? ''} ${toEnglish(template?.name ?? '')}`.trim()}
									>
										{template?.icon} {toEnglish(template?.name ?? '')}
									</span>
									<span className="text-[11px] font-normal text-danger-soft">{toEnglish("deleted")}</span>
								</Button>
							)
						})}
					</div>
				</section>

				<section className={cn(panelClass, 'gap-2.5')}>
					<div className={rowBetweenClass}>
						<h3 className="m-0 text-[15px] font-semibold">
							{toEnglish(entityName)} <span className="text-[12px] font-normal text-muted">{activeId}</span>
						</h3>
					</div>

					{/*
						Picture and base stats side by side at the top: the art is previewed **in the real grid
						tile** so it can be judged in context. A deleted item is out of the catalogue, so there is
						no tile to draw it in (and no point uploading art for something nobody can roll).
					*/}
					<div className="flex flex-wrap items-start gap-3 rounded-[10px] border border-line bg-black/25 p-2.5">
						{isRemovedItem ? null : (
							<div data-admin-art-preview className="shrink-0">
								<ArtPreview kind={kind} id={activeId} star={previewStar} />
							</div>
						)}
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							{isRemovedItem ? null : (
							<>
								{/* Upload buttons and the star preview share one row: the picture, the buttons and
								    the rank that colours it all belong to the same decision. */}
								<div className="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										data-admin-import-art
										variant="primary"
										size="sm"
										onClick={() => setImportOpen(true)}
										disabled={uploadArt.isPending || deleteArt.isPending}
									>
										<ImagePlus /> {toEnglish("Upload art")}
									</Button>
									{artRow ? (
										<Button
											type="button"
											data-admin-remove-art
											variant="outline"
											size="sm"
											onClick={() => setRemoveArtOpen(true)}
											disabled={uploadArt.isPending || deleteArt.isPending}
										>
											<Trash2 /> {toEnglish("Delete uploaded art")}
										</Button>
									) : null}
									{/* Star rank only recolours the stars and adds more of them — check that the art
									    still reads. */}
									<div className="flex flex-wrap items-center gap-1">
										{STARS.map((rank) => (
											<Button
												key={rank}
												type="button"
												data-admin-preview-star={rank}
												size="sm"
												variant={rank === previewStar ? 'primary' : 'secondary'}
												className="h-6 px-2 text-[11.5px]"
												onClick={() => setPreviewStar(rank)}
											>
												<span className={ITEM_STAR_TEXT[rank]}>{starLabel(rank)}</span>
											</Button>
										))}
									</div>
								</div>
							</>
						)}
						{GROUP_ORDER[kind].map((group) => {
							const fields = FIELDS[kind].filter((field) => {
								if (field.group !== group || field.kind === 'kits') return false
								const values = draft[field.key] ?? []
								return !field.optional || values.some((value) => value.trim() !== '')
							})
							if (fields.length === 0) return null
							return (
								<div key={group} className="flex flex-col gap-1.5">
									<span className="text-[11px] font-semibold tracking-wide text-muted uppercase">
										{group}
									</span>
									<div className="grid gap-2 md:grid-cols-2">
										{fields.map((field) => {
											const values = draft[field.key] ?? []
											// Only a field the editor added can be taken away again; a value from code stays.
											const removable =
												field.optional &&
												(codeDefaults[field.key] ?? []).every((value) => !value.trim())
											return (
												<div
													key={field.key}
													className={cn(
														'flex flex-col gap-1',
														isPerStar(field) && 'md:col-span-2',
													)}
												>
													<div className="flex items-center gap-1.5">
														<Label htmlFor={`admin-${field.key}`}>{field.label}</Label>
														{removable ? (
															<button
																type="button"
																data-admin-remove-field={field.key}
																className="rounded border border-line px-1 text-[12px] leading-5 hover:border-danger-soft hover:text-danger-soft"
																title={`Remove the ${field.label} field`}
																onClick={() => clearOptionalField(field.key)}
															>
																<X />
															</button>
														) : null}
													</div>
													<FieldInput
														field={field}
														values={values}
														onChange={(index, value) =>
															setDraft((current) => {
																const next = [...(current[field.key] ?? [])]
																next[index] = value
																return { ...current, [field.key]: next }
															})
														}
													/>
												</div>
											)
										})}
									</div>
								</div>
							)
						})}
						</div>
					</div>

					<div
						data-admin-kits
						className="flex flex-col gap-2 rounded-[10px] border border-line bg-black/20 p-2.5"
					>
						<span className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
							<span className="font-semibold">{toEnglish("Kits")}</span>
						</span>

						{/* ❌ No "no kit yet" sentence: an empty box with the `Add kit` button says it. */}

						{kits.map((kit, kitIndex) => {
							const def = kitDef(kit.id)
							const dpm = def.kind === 'attack' ? dpmOf(kit) : []
							const addableOnHit = ON_HIT_KITS.filter(
								(effect) => !(kit.onHit ?? []).some((attached) => attached.id === effect.id),
							).filter((effect) => !removedKits().has(effect.id))
							// The charged variant is offered right here, inside the swing it belongs to.
							const addableCharge =
								def.kind === 'attack' && !kit.charge
									? CHARGE_KITS.filter((charge) => !removedKits().has(charge.id))
									: []
							return (
								<div
									key={`${kit.id}-${kitIndex}`}
									data-admin-kit={kit.id}
									data-admin-kit-index={kitIndex}
									// Red frame = a **main** kit at the item's top level; green marks a sub-kit.
									className="flex flex-col gap-1.5 rounded-lg border border-danger-soft/60 bg-black/20 p-2"
								>
									<span className="flex w-full flex-wrap items-center gap-1.5 text-[12.5px]">
										<span className="font-semibold">{toEnglish(def.label)}</span>
										{def.kind === 'attack' && dpm.some((value) => value !== null) ? (
											<span
												data-admin-dpm
												className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
											>
												{starred ? (
													/* Each rank is drawn in its own star colour, the same palette as the stars. */
													dpm.map((value, index) => (
														<span
															key={index}
															className={cn(
																'font-semibold tabular-nums',
																ITEM_STAR_TEXT[(index + 1) as Star],
															)}
														>
															{index + 1}★ {value === null ? '—' : value.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}
														</span>
													))
												) : (
													/* A cutie has one attack number, so one line is enough. */
													<span className="font-semibold tabular-nums text-gold-soft">
														{dpm[0] === null ? '—' : dpm[0]?.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}
													</span>
												)}
											</span>
										) : null}
										{/* Any item can lose a kit — a weapon turned into a passive piece. */}
										<button
											type="button"
											data-admin-remove-kit={kit.id}
											className="ml-auto rounded border border-line px-1 text-[12px] leading-5 hover:border-danger-soft hover:text-danger-soft"
											title={toEnglish("Remove this kit from the item")}
											onClick={() => removeKit(kitIndex)}
										>
											<X />
										</button>
									</span>

									{kit.id === 'stats' || kit.id === 'aura' ? (
										<KitStatTableInputs
											kitId={kit.id}
											field={kit.id}
											values={(kit.id === 'stats' ? kit.stats : kit.aura) ?? []}
											onChange={(next) =>
												setKitJson(kitIndex, kit.id as 'stats' | 'aura', next)
											}
										/>
									) : (
										<KitParamInputs
											kitId={kit.id}
											params={kit.params}
											single={!starred}
											onChange={(key, index, value) => setKitParam(kitIndex, key, index, value)}
											onChangeAll={(key, value) => setKitParamAll(kitIndex, key, value)}
										/>
									)}

									{/* The charged variant lives **inside** this swing, never as a second card. */}
									{def.kind === 'attack' && kit.charge ? (
										<div
											data-admin-charge-kit="charge-attack"
											className="mt-1 flex flex-col gap-1.5 rounded-md border border-hp/60 bg-se/5 p-2"
										>
											<span className="flex w-full flex-wrap items-center justify-between gap-1.5 text-[12px]">
												<span className="font-semibold text-se-soft">
													{toEnglish(kitDef('charge-attack').label)}
												</span>
												{/* What the charged hit deals — on the title row, next to the ✕. */}
												<span
													data-admin-charged-damage
													className="flex items-center gap-x-2 text-[12px]"
												>
													{chargedDamageOf(kit.charge).map((value, index) => (
														<span
															key={index}
															className={cn(
																'font-semibold tabular-nums',
																starred ? ITEM_STAR_TEXT[(index + 1) as Star] : 'text-se-soft',
															)}
														>
															{starred ? `${index + 1}★ ` : ''}
															{value === null ? '—' : value.toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}
														</span>
													))}
												</span>
												<button
													type="button"
													data-admin-remove-charge="charge-attack"
													className="ml-auto rounded border border-line px-1 text-[12px] leading-5 hover:border-danger-soft hover:text-danger-soft"
													title={toEnglish("Remove the charged hit from this attack")}
													onClick={() => removeCharge(kitIndex)}
												>
													<X />
												</button>
											</span>
											<KitParamInputs
												kitId="charge-attack"
												params={kit.charge.params}
												single={!starred}
												onChange={(key, index, value) => setChargeParam(kitIndex, key, index, value)}
												onChangeAll={(key, value) => setChargeParamAll(kitIndex, key, value)}
											/>
										</div>
									) : null}

									{def.kind === 'attack' ? (
										<div
											data-admin-onhit
											// No label of its own: an on-hit effect is a **sub-kit card** exactly like the
											// charged hit, so it needs no group heading to explain it.
											className={cn(
												'mt-1 flex flex-col gap-1.5',
												kit.charge ? 'border-t border-line/60 pt-2' : null,
											)}
										>
											{/* ❌ No "No effect yet" sentence: a kit with no sub-kit is just a plain hit. */}

											{(kit.onHit ?? []).map((effect) => {
												const effectDef = kitDef(effect.id)
												return (
													<div
														key={effect.id}
														data-admin-onhit-kit={effect.id}
														className="flex flex-col gap-1.5 rounded-md border border-hp/60 bg-black/25 p-2"
													>
														<span className="flex w-full flex-wrap items-center justify-between gap-1.5 text-[12px]">
															<span className="font-semibold">{toEnglish(effectDef.label)}</span>
															<button
																type="button"
																data-admin-remove-onhit={effect.id}
																className="rounded border border-line px-1 text-[12px] leading-5 hover:border-danger-soft hover:text-danger-soft"
																title={toEnglish("Remove this effect from the attack")}
																onClick={() => removeOnHit(kitIndex, effect.id as OnHitKitId)}
															>
																<X />
															</button>
														</span>
														<KitParamInputs
															kitId={effect.id}
															params={effect.params}
															single={!starred}
															onChange={(key, index, value) =>
																setOnHitParam(kitIndex, effect.id as OnHitKitId, key, index, value)
															}
															onChangeAll={(key, value) =>
																setOnHitParamAll(kitIndex, effect.id as OnHitKitId, key, value)
															}
														/>
													</div>
												)
											})}

											{/* One menu for everything that lives **inside** this swing: the charged variant
											    and the on-hit effects. ❌ Neither is a card at the item's top level. */}
											{addableCharge.length > 0 || addableOnHit.length > 0 ? (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															type="button"
															data-admin-add-onhit-open
															variant="outline"
															size="sm"
															className="self-start"
															title={toEnglish("Add a sub-kit to this attack")}
														>
															<Plus /> {toEnglish("Add sub-kit")}
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="start">
														{addableCharge.length > 0 ? (
															<>
																<DropdownMenuLabel>{toEnglish("Charged hit")}</DropdownMenuLabel>
																{addableCharge.map((charge) => (
																	<DropdownMenuItem
																		key={charge.id}
																		data-admin-add-charge={charge.id}
																		onSelect={() => addCharge(kitIndex)}
																	>
																		<span className="font-semibold">
																			{toEnglish(charge.label)}
																		</span>
																	</DropdownMenuItem>
																))}
																<DropdownMenuSeparator />
															</>
														) : null}
														<DropdownMenuLabel>
															{toEnglish("On-hit effects")}
														</DropdownMenuLabel>
														{addableOnHit.map((effect) => (
															<DropdownMenuItem
																key={effect.id}
																data-admin-add-onhit={effect.id}
																onSelect={() => addOnHit(kitIndex, effect.id as OnHitKitId)}
															>
																<span className="font-semibold">{toEnglish(effect.label)}</span>
															</DropdownMenuItem>
														))}
													</DropdownMenuContent>
												</DropdownMenu>
											) : null}
										</div>
										) : null}
									</div>
								)
							})}

							{availableKits.length > 0 ? (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											type="button"
											data-admin-add-kit-open
											variant="outline"
											size="sm"
											className="self-start"
											title={toEnglish("Add one more kit to this item")}
										>
											<Plus /> {toEnglish("Add kit")}
										</Button>
									</DropdownMenuTrigger>
									{/* The catalogue is long, so the menu is grouped by kind and capped by the shared
									    `DropdownMenuContent` height: a flat list of every kit ran off the screen. */}
									<DropdownMenuContent align="start" className="w-[min(300px,calc(100vw-16px))]">
										<DropdownMenuLabel>{toEnglish("Available kits")}</DropdownMenuLabel>
										<DropdownMenuSeparator />
										{availableGroups.map((group) => (
											<div key={group.label}>
												<DropdownMenuLabel className="text-[11px] font-normal text-muted">
													{toEnglish(group.label)}
												</DropdownMenuLabel>
												{group.kits.map((def) => (
													<DropdownMenuItem
														key={def.id}
														data-admin-add-kit={def.id}
														onSelect={() => addKit(def.id)}
													>
														<span className="font-semibold">{toEnglish(def.label)}</span>
													</DropdownMenuItem>
												))}
											</div>
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							) : null}
						</div>

						{optionalChoices.length > 0 ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									data-admin-add-open
									variant="outline"
									size="sm"
									className="self-start"
									title={toEnglish("Add an optional field to this item")}
								>
									<Plus /> {toEnglish("Add field")}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								<DropdownMenuLabel>{toEnglish("Optional fields")}</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{optionalChoices.map((choice) => (
									<DropdownMenuItem
										key={choice.key}
										data-admin-add-option={choice.key}
										onSelect={() => addChoice(choice)}
									>
										<span className="font-semibold">{toEnglish(choice.label)}</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}

					{message ? (
						<p
							data-admin-message
							className={cn('m-0 text-[12.5px]', message.bad ? 'text-danger-soft' : 'text-jade')}
						>
							{toEnglish(message.text)}
						</p>
					) : null}

					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="primary"
							// Nothing changed → nothing to save.
							disabled={busy || !dirty}
							onClick={onSave}
						>
							<Save /> {toEnglish("Save")}
						</Button>
						{kind === 'item' ? (
							<Button
								type="button"
								data-admin-delete
								variant="destructive"
								disabled={busy}
								onClick={() => setDeleteOpen(true)}
								title={toEnglish("Delete this item from the game")}
							>
								<Trash2 /> {toEnglish("Delete item")}
							</Button>
						) : null}
					</div>
				</section>
			</div>

			{importOpen ? (
				<ArtImportDialog
					entityName={entityName}
					kind={kind}
					entityId={activeId}
					star={previewStar}
					// The crop frame follows the item's grid shape; cuties are square cells.
					space={
						kind === 'item'
							? (itemTemplateById(activeId)?.space ?? { w: 1, h: 1 })
							: { w: 1, h: 1 }
					}
					onCancel={() => setImportOpen(false)}
					onSave={async (png) => {
						await uploadArt.mutateAsync({ kind, id: activeId, png })
						bumpContent()
						setImportOpen(false)
					}}
				/>
			) : null}

			{/*
			 * ⚠️ Deleting is permanent and loses the crop: the admin has to pick and crop the original file
			 * again. Nobody should reach that with one stray click.
			 */}
			{removeArtOpen ? (
				<ConfirmDialog
					title={`Delete the uploaded art of "${entityName}"?`}
					message="The picture is removed from the server and this entry falls back to its bundled art (or its emoji). This cannot be undone — to get it back you have to upload and crop the original file again."
					confirmLabel="Delete art"
					onCancel={() => setRemoveArtOpen(false)}
					onConfirm={() => {
						setRemoveArtOpen(false)
						deleteArt.mutate(
							{ kind, id: activeId },
							{
								onSuccess: () => {
									bumpContent()
								},
								onError: (error) => setMessage({ text: error.message, bad: true }),
							},
						)
					}}
				/>
			) : null}

			{/* Deleting is asked first: the item leaves the shop and every bag it sits in. */}
			{deleteOpen ? (
				<ConfirmDialog
					title={`Delete "${entityName}"?`}
					message={
						isCreatedItem
							? 'This entry only exists in the admin data, so it is removed for good. This cannot be undone.'
							: 'The item disappears from the shop and from every player’s bag (equipped copies are unequipped too). It can still be restored from the list on the left.'
					}
					confirmLabel="Delete item"
					onCancel={() => setDeleteOpen(false)}
					onConfirm={() => {
						setDeleteOpen(false)
						removeItem()
					}}
				/>
			) : null}
		</>
	)
}
function isPerStar(field: FieldDef): boolean {
	return field.kind === 'perStarNumber' || field.kind === 'perStarJson'
}

/** Small label above one per-star control, so the rank is never ambiguous. */
function RankLabel({ star }: { star: Star }) {
	return <span className="text-[10.5px] text-muted">{starLabel(star)}</span>
}

/**
 * Four toggles (up / down / left / right) for a support gem's `directions` parameter.
 *
 * Click one to add or remove that side; the mask is stored as a single number, so the payload stays
 * a plain table of numbers (see `DIRECTION_BITS` in `game/bag.ts`).
 */
function DirectionPicker({
	kitId,
	value,
	onChange,
}: {
	kitId: ItemKitId
	value: number
	onChange: (mask: number) => void
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5" data-admin-kit-directions={kitId}>
			{DIRECTIONS.map((side) => {
				const on = (value & DIRECTION_BITS[side]) !== 0
				return (
					<button
						key={side}
						type="button"
						data-admin-direction={side}
						aria-pressed={on}
						className={cn(
							'rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors',
							on
								? 'border-gold bg-gold/20 text-gold-soft'
								: 'border-line text-muted hover:border-gold/60',
						)}
						onClick={() => onChange(on ? value & ~DIRECTION_BITS[side] : value | DIRECTION_BITS[side])}
					>
						{toEnglish(DIRECTION_LABELS[side])}
					</button>
				)
			})}
		</div>
	)
}

/**
 * Every parameter of one kit, with one number box per star rank — except a `single` parameter
 * (`scaling`), which is one control for the whole kit because it describes the mechanic rather than
 * its strength.
 *
 * `single` as a prop turns **every** parameter into one box: a cutie has levels, not star ranks, so
 * its kit is a single table of numbers (the value is copied into all five slots).
 */
function KitParamInputs({
	kitId,
	params,
	single = false,
	onChange,
	onChangeAll,
}: {
	kitId: ItemKitId
	params: Record<string, string[]>
	single?: boolean
	onChange: (key: string, index: number, value: string) => void
	onChangeAll: (key: string, value: string) => void
}) {
	/** A parameter is only drawn while the one it depends on holds an allowed value. */
	const defs = kitDef(kitId).params
	const valueOf = (key: string) =>
		Number(params[key]?.[0] ?? defs.find((param) => param.key === key)?.default ?? 0)
	const visible = defs.filter(
		(param) => !param.showWhen || param.showWhen.values.includes(valueOf(param.showWhen.key)),
	)
	/**
	 * A parameter whose stored unit is not the unit the designer types (`duration`: ms stored, seconds
	 * shown). Every box converts on the way in and out, so the payload keeps its stored unit.
	 */
	const scaleOf = (param: (typeof defs)[number]) => param.displayScale ?? 1
	const shownValue = (param: (typeof defs)[number], raw: string | undefined, index = 0) => {
		const stored = Number(raw ?? param.defaults?.[index] ?? param.default)
		return Number.isFinite(stored) ? String(Number((stored / scaleOf(param)).toFixed(3))) : ''
	}
	const storedValue = (param: (typeof defs)[number], shown: string) => {
		const value = Number(shown)
		return Number.isFinite(value) ? String(Number((value * scaleOf(param)).toFixed(3))) : shown
	}
	const stepOf = (param: (typeof defs)[number]) => (param.displayScale ? 0.1 : param.integer ? 1 : 'any')
	return (
		<>
			{visible.map((param) => (
				<div key={param.key} className="flex flex-col gap-1 text-[12.5px]">
					<span className="text-muted">
						{toEnglish(param.label)}
					</span>
					{param.control === 'directions' ? (
						<DirectionPicker
							kitId={kitId}
							value={Number(params[param.key]?.[0] ?? param.default)}
							onChange={(mask) => onChangeAll(param.key, String(mask))}
						/>
					) : single || param.single ? (
						param.choices ? (
							<select
								data-admin-kit-param={`${kitId}.${param.key}`}
								className={selectTriggerClass}
								value={params[param.key]?.[0] ?? String(param.default)}
								onChange={(event) => onChangeAll(param.key, event.target.value)}
							>
								{param.choices.map((choice) => (
									<option key={choice.value} value={choice.value}>
										{toEnglish(choice.label)}
									</option>
								))}
							</select>
						) : (
							<Input
								data-admin-kit-param={`${kitId}.${param.key}`}
								type="number"
								min={param.min / scaleOf(param)}
								max={param.max / scaleOf(param)}
								step={stepOf(param)}
								value={shownValue(param, params[param.key]?.[0])}
								onChange={(event) => onChangeAll(param.key, storedValue(param, event.target.value))}
							/>
						)
					) : (
					<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
						{STARS.map((star, index) => (
							<label key={star} className="flex min-w-0 flex-col gap-0.5">
								<RankLabel star={star} />
								{param.choices ? (
									<select
										data-admin-kit-param={`${kitId}.${param.key}`}
										data-admin-star={star}
										className={selectTriggerClass}
										value={params[param.key]?.[index] ?? String(param.default)}
										onChange={(event) => onChange(param.key, index, event.target.value)}
									>
										{param.choices.map((choice) => (
											<option key={choice.value} value={choice.value}>
												{toEnglish(choice.label)}
											</option>
										))}
									</select>
								) : (
									<Input
										data-admin-kit-param={`${kitId}.${param.key}`}
										data-admin-star={star}
										type="number"
										min={param.min / scaleOf(param)}
										max={param.max / scaleOf(param)}
										step={stepOf(param)}
										value={shownValue(param, params[param.key]?.[index], index)}
										onChange={(event) => onChange(param.key, index, storedValue(param, event.target.value))}
									/>
								)}
							</label>
						))}
					</div>
					)}
				</div>
			))}
		</>
	)
}

/**
 * Stat keys a `stats` / `aura` table may set. Sword Energy is the `sword-energy` kit's alone, so it
 * is never offered here (the server refuses it too).
 */
type TableStatKey = Exclude<StatKey, 'seRegen'>
const STAT_TABLE_KEYS = STAT_KEYS.filter((key): key is TableStatKey => key !== 'seRegen')

/** The four sides an aura can require, in the order they are offered. */
const AURA_TARGETS: AuraSpec['target'][] = ['adjacent', 'adjacentWeapon', 'adjacentNonWeapon', 'all']

/** One `stats` / `aura` table, read defensively: a half-typed row must never break the page. */function readTable(raw: string | undefined): { target: AuraSpec['target']; mods: StatMods } {
	try {
		const parsed: unknown = JSON.parse(raw ?? '{}')
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return { target: 'adjacent', mods: {} }
		}
		const entry = parsed as { target?: AuraSpec['target']; mods?: StatMods }
		return { target: entry.target ?? 'adjacent', mods: (entry.mods ?? parsed) as StatMods }
	} catch {
		return { target: 'adjacent', mods: {} }
	}
}

/**
 * Label for a stat the admin can pick. A **percentage** stat keeps its `%` in the name (`% Giảm sát
 * thương`), because the picker shows no value beside it: without the sign, "Damage reduction" would
 * read like 8 flat armour instead of 8 %.
 */
function adminStatLabel(key: TableStatKey): string {
	const label = toEnglish(STAT_LABELS[key])
	return isPercentStat(key) ? `% ${label}` : label
}

/**
 * The first stat the item does not grant yet — a new `stats` / `aura` kit starts on it, so adding
 * "Bonus stats" twice does not hand out two identical Attack rows.
 */
function freeStatKey(kits: KitDraft[]): TableStatKey {
	const used = new Set<string>()
	for (const kit of kits) {
		for (const raw of [...(kit.stats ?? []), ...(kit.aura ?? [])]) {
			for (const key of Object.keys(readTable(raw).mods)) used.add(key)
		}
	}
	return STAT_TABLE_KEYS.find((key) => !used.has(key)) ?? 'atk'
}

/**
 * The five amounts of a stat kit, from one typed number: rank `n` gets `n/5` of it, so a 5★ of `100`
 * reads `20 · 40 · 60 · 80 · 100`. Ranks 1–4 are rounded to two decimals so `1` becomes `0.2` rather
 * than `0.19999999999999998`.
 */
function starLadder(base: number): number[] {
	return STARS.map((star) =>
		star === STARS.length ? base : Number(((base * star) / STARS.length).toFixed(2)),
	)
}

/**
 * One `stats` / `aura` kit: **one stat**, picked from a shadcn `DropdownMenu`, typed as **plain
 * numbers** (one box per star rank).
 *
 * Why not JSON: the designer wants "a jade that gives +Attack — type 30", not to hand-write
 * `{ "atk": 30 }` five times. Every number is a **flat amount added to the Cutie** (`atk` +30 is +30
 * attack), so the row reads exactly like the number it is.
 *
 * 🔴 **A second stat is a second kit** — there is no "add a stat" menu inside the card, so a jade can
 * never quietly carry a table of numbers nobody chose.
 */
function KitStatTableInputs({
	kitId,
	field,
	values,
	onChange,
}: {
	kitId: ItemKitId
	field: 'stats' | 'aura'
	values: string[]
	onChange: (next: string[]) => void
}) {
	const rows = STARS.map((_star, index) => readTable(values[index]))
	/** The one stat this kit grants: the first known key in its 1★ table (any other key is legacy). */
	const stat: TableStatKey = Object.keys(rows[0].mods).find(isStatKey) ?? 'atk'

	/** Write the five tables back as the JSON the draft stores, in one go. */
	const writeAll = (
		next: (row: { target: AuraSpec['target']; mods: StatMods }, index: number) => {
			target: AuraSpec['target']
			mods: StatMods
		},
	) =>
		onChange(
			rows.map((row, index) => {
				const entry = next(row, index)
				return JSON.stringify(field === 'aura' ? entry : entry.mods)
			}),
		)

	/** Switch the stat this kit grants: the typed numbers stay, only the key changes. */
	const pickStat = (key: TableStatKey) =>
		writeAll((row) => ({ ...row, mods: { [key]: row.mods[stat] ?? 0 } }))

	/** The amount each of the five boxes shows, in 1★ → 5★ order. */
	const amounts = rows.map((row) => row.mods[stat] ?? 0)
	const writeAmounts = (next: number[]) => writeAll((row, rank) => ({ ...row, mods: { [stat]: next[rank] } }))

	/**
	 * 🔴 The **5★ box is the only one worth typing**: the four below it follow at 20 / 40 / 60 / 80 %
	 * of it (a 5★ of `100` gives `20 40 60 80 100`), which is the curve every stat kit climbs anyway.
	 * Any other rank still edits on its own, so a hand-set curve is never blown away.
	 */
	const setValue = (index: number, raw: string) => {
		const value = Number(raw)
		const safe = raw.trim() === '' || !Number.isFinite(value) ? 0 : value
		if (index !== STARS.length - 1) {
			writeAmounts(amounts.map((amount, rank) => (rank === index ? safe : amount)))
			return
		}
		writeAmounts(starLadder(safe))
	}

	return (
		<div className="flex flex-col gap-1.5 text-[12.5px]">
			{field === 'aura' ? (
				<label className="flex flex-col gap-1">
					<span className="text-muted">{toEnglish("Aura needs, beside it")}</span>
					<select
						data-admin-kit-param="aura.target"
						className={selectTriggerClass}
						value={rows[0].target}
						onChange={(event) =>
							writeAll((row) => ({ ...row, target: event.target.value as AuraSpec['target'] }))
						}
					>
						{AURA_TARGETS.map((target) => (
							<option key={target} value={target}>
								{toEnglish(AURA_TARGET_LABELS[target])}
							</option>
						))}
					</select>
				</label>
			) : null}

			<div data-admin-stat-row={stat} className="flex items-end gap-1.5">
				<div className="flex w-44 shrink-0 flex-col gap-0.5">
					<span className="text-[10.5px] text-muted">{toEnglish("Stat")}</span>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								data-admin-stat-picker={kitId}
								className={cn(selectTriggerClass, 'justify-between gap-1 text-left')}
								title={toEnglish("Pick the stat for this kit")}
							>
								<span className="min-w-0 truncate">{adminStatLabel(stat)}</span>
								<ChevronDown className="size-3.5 shrink-0 opacity-70" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="min-w-[240px]">
							<DropdownMenuLabel>{toEnglish("Stat")}</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{STAT_TABLE_KEYS.map((key) => (
								<DropdownMenuItem
									key={key}
									data-admin-pick-stat={key}
									// The shared item stacks its children; a stat reads as one taller row, so the
									// ✓ sits on the same line as the name instead of under it.
									className="flex-row items-center gap-2 py-2"
									onSelect={() => pickStat(key)}
								>
									<span className="font-semibold">{adminStatLabel(key)}</span>
									{key === stat ? (
										<Check className="ml-auto size-4 shrink-0 text-gold-soft" />
									) : null}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<div className="grid flex-1 grid-cols-5 gap-1.5">
					{STARS.map((star, index) => (
						<label key={star} className="flex min-w-0 flex-col gap-0.5">
							<RankLabel star={star} />
							<Input
								type="number"
								step="any"
								data-admin-stat={`${kitId}.${stat}`}
								data-admin-star={star}
								value={String(rows[index].mods[stat] ?? 0)}
								onChange={(event) => setValue(index, event.target.value)}
							/>
						</label>
					))}
				</div>
			</div>
		</div>
	)
}

function isStatKey(key: string): key is TableStatKey {
	return (STAT_KEYS as readonly string[]).includes(key)
}

function FieldInput({
	field,
	values,
	onChange,
}: {
	field: FieldDef
	values: string[]
	onChange: (index: number, value: string) => void
}) {
	if (isPerStar(field)) {
		return (
			<div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">
				{STARS.map((star, index) => (
					<label key={star} className="flex min-w-0 flex-col gap-0.5">
						<RankLabel star={star} />
						{field.kind === 'perStarJson' ? (
							<Textarea
								data-admin-field={field.key}
								data-admin-star={star}
								className={'min-h-[58px] font-mono text-[11px]'}
								value={values[index] ?? ''}
								onChange={(event) => onChange(index, event.target.value)}
							/>
						) : (
							<Input
								data-admin-field={field.key}
								data-admin-star={star}
								type="number"
								min={field.min}
								max={field.max}
								value={values[index] ?? ''}
								onChange={(event) => onChange(index, event.target.value)}
							/>
						)}
					</label>
				))}
			</div>
		)
	}

	if (field.kind === 'size') {
		return (
			<div className="flex items-center gap-2">
				{(['w', 'h'] as const).map((axis, index) => (
					<label key={axis} className="flex items-center gap-1">
						<span className="text-[11.5px] text-muted">{axis}</span>
						<Input
							type="number"
							data-admin-field={field.key}
							data-admin-size={axis}
							className={'w-16'}
							min={SIZE_LIMITS[axis].min}
							max={SIZE_LIMITS[axis].max}
							value={values[index] ?? ''}
							onChange={(event) => onChange(index, event.target.value)}
						/>
					</label>
				))}
			</div>
		)
	}

	if (field.kind === 'quality') {
		const quality = (Number(values[0]) || 1) as Quality
		return (
			<div className="flex items-center gap-2">
				<OptionPicker
					fieldKey={field.key}
					value={values[0] ?? ''}
					options={QUALITY_OPTIONS}
					onChange={(value) => onChange(0, value)}
				/>
				{/* Shows the mapping quality → colour straight away, without opening the game. */}
				<span
					data-admin-quality-swatch
					title={QUALITY_NAMES[quality]}
					className={cn('size-6 shrink-0 rounded-md border border-line', ITEM_QUALITY_SWATCH[quality])}
				/>
			</div>
		)
	}

	if (field.kind === 'select') {
		return (
			<OptionPicker
				fieldKey={field.key}
				value={values[0] ?? ''}
				options={field.options ?? []}
				onChange={(value) => onChange(0, value)}
			/>
		)
	}

	if (field.kind === 'json') {
		return (
			<Textarea
				data-admin-field={field.key}
				className={'min-h-[64px] font-mono text-[12px]'}
				value={values[0] ?? ''}
				onChange={(event) => onChange(0, event.target.value)}
			/>
		)
	}

	const isText = field.kind === 'text'

	return (
		<Input
			data-admin-field={field.key}
			type={isText ? 'text' : 'number'}
			min={isText ? undefined : field.min}
			max={isText ? undefined : field.max}
			step={field.kind === 'number' ? 'any' : undefined}
			value={values[0] ?? ''}
			onChange={(event) => onChange(0, event.target.value)}
		/>
	)
}
