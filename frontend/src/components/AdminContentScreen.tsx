import { useMemo, useState } from 'react'
import { useAdminContent, useDeleteArt, useResetContent, useSaveContent, useSessionState, useUploadArt } from '../api/queries'
import { DEFAULT_SPEED, ITEM_BY_ID, ITEM_TEMPLATES, QUALITY_LABELS, QUALITY_VALUES, STARS, starLabel } from '../game/items'
import { PETS, getPet } from '../game/pets'
import type { ItemTemplate, PetDef, Quality, Star } from '../game/types'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import { ArtPreview } from './ArtPreview'
import { ArtImportDialog } from './ArtImportDialog'
import { ConfirmDialog } from './ConfirmDialog'
import {
	ITEM_QUALITY_SWATCH,
	ITEM_STAR_TEXT,
	btnClass,
	btnGoldClass,
	btnSmClass,
	cn,
	hintClass,
	panelClass,
	panelTitleClass,
	rowBetweenClass,
	statClass,
} from './ui'

type Kind = 'item' | 'pet'

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

interface FieldDef {
	/** Payload key — must match the server whitelist in `backend/src/content.ts`. */
	key: string
	/** Label shown to the editor (Vietnamese, like the rest of the UI for now). */
	label: string
	kind: FieldKind
	min?: number
	max?: number
	/** `perStarNumber` only: the server stores these as whole numbers. */
	integer?: boolean
	options?: { value: string; label: string }[]
	hint?: string
	/**
	 * Optional field: not every item has it (armour has no `speed`, a weapon has no `interval`
	 * for a self-triggering effect). The form hides it until the template declares it or the editor
	 * clicks "＋ thêm", so a blank row never implies that the item *has* an empty value.
	 */
	optional?: boolean
	/** Value every star box is seeded with when the editor adds an optional field. */
	addDefault?: string
}

const CLASS_OPTIONS = [
	{ value: 'weapon', label: 'Vũ khí' },
	{ value: 'armor', label: 'Hộ giáp' },
	{ value: 'souljade', label: 'Hồn Ngọc' },
	{ value: 'curio', label: 'Pháp Bảo' },
	{ value: 'potion', label: 'Đan Dược' },
]

const BOOLEAN_OPTIONS = [
	{ value: 'true', label: 'có' },
	{ value: 'false', label: 'không' },
]

/** The five quality bands, labelled with the colour the tile will use. */
const QUALITY_OPTIONS = QUALITY_VALUES.map((quality) => ({
	value: String(quality),
	label: `${quality} · ${QUALITY_LABELS[quality]}`,
}))

/** Editable site of the bag footprint. */
const SIZE_LIMITS = { w: { min: 1, max: 4 }, h: { min: 1, max: 5 } } as const

/**
 * Editable **item** fields.
 *
 * ⚠️ `active` and `onHit` are missing on purpose: in code they are **functions**, and JSON
 * cannot carry a function. They stay in `game/items.ts` and this page only shows the note.
 */
const ITEM_FIELDS: FieldDef[] = [
	{ key: 'name', label: 'Tên', kind: 'text' },
	{ key: 'icon', label: 'Emoji dự phòng', kind: 'text', hint: 'dùng khi chưa có art' },
	{ key: 'cls', label: 'Lớp', kind: 'select', options: CLASS_OPTIONS },
	{ key: 'tier', label: 'Bậc bán', kind: 'int', min: 1, max: 3, hint: '1 = có từ đầu, 3 = bản đồ cuối' },
	{ key: 'quality', label: 'Phẩm', kind: 'quality', hint: 'màu nền ô của món' },
	{ key: 'cost', label: 'Giá gốc (1★)', kind: 'int', min: 1, max: 999 },
	{ key: 'space', label: 'Kích thước ô', kind: 'size', hint: 'w 1–4, h 1–5' },
	{
		key: 'art',
		label: 'Có art riêng',
		kind: 'select',
		options: BOOLEAN_OPTIONS,
		hint: 'một ảnh cho mỗi món — public/icons/items/<id>.png',
	},
	{
		key: 'damage',
		label: 'Sát thương',
		kind: 'perStarNumber',
		min: 0,
		max: 100_000,
		optional: true,
		addDefault: '10',
	},
	{
		key: 'speed',
		label: 'Speed',
		kind: 'perStarNumber',
		min: 0.05,
		max: 20,
		optional: true,
		addDefault: String(DEFAULT_SPEED),
		hint: 'số đòn mỗi giây · mặc định 0.625 (1 đòn / 1.6s)',
	},
	{
		key: 'interval',
		label: 'Nhịp hiệu lực (ms)',
		kind: 'perStarNumber',
		min: 100,
		max: 60_000,
		integer: true,
		optional: true,
		addDefault: '9000',
		hint: 'hiệu ứng bị động tự kích hoạt mỗi … ms',
	},
	{ key: 'passive', label: 'Chỉ số cộng thêm', kind: 'perStarJson', hint: 'một ô JSON cho mỗi sao' },
	{ key: 'aura', label: 'Hào khí liền kề', kind: 'perStarJson', hint: 'một ô JSON cho mỗi sao' },
]

/** Editable **pet** fields — every one of them is data, so all of them can be edited. */
const PET_FIELDS: FieldDef[] = [
	{ key: 'name', label: 'Tên', kind: 'text' },
	{ key: 'icon', label: 'Emoji dự phòng', kind: 'text' },
	{ key: 'blurb', label: 'Giới thiệu', kind: 'text' },
	{ key: 'unlockStage', label: 'Mở ở màn', kind: 'int', min: 0, max: 60 },
	{ key: 'maxHp', label: 'Máu gốc', kind: 'int', min: 50, max: 100_000 },
	{ key: 'maxSe', label: 'Kiếm Thế tối đa', kind: 'int', min: 10, max: 1000 },
	{ key: 'seRegen', label: 'Hồi Kiếm Thế / giây', kind: 'number', min: 0, max: 100 },
	{ key: 'counterChance', label: 'Tỉ lệ Chấn Đao', kind: 'number', min: 0, max: 1, hint: '0–1, ví dụ 0.15' },
	{
		key: 'skill',
		label: 'Kỹ năng',
		kind: 'json',
		hint: '{ "name", "interval", "damage", "desc" }',
	},
	{
		key: 'bags',
		label: 'Lưới theo cấp',
		kind: 'json',
		hint: '[{ "width": 4, "rows": 3 }, …] × 5 cấp — width phải là 4',
	},
	{ key: 'art', label: 'Có art thú cưng', kind: 'select', options: BOOLEAN_OPTIONS },
	{ key: 'avatar', label: 'Có art đại diện', kind: 'select', options: BOOLEAN_OPTIONS },
	{ key: 'skillArt', label: 'Có art kỹ năng', kind: 'select', options: BOOLEAN_OPTIONS },
]

const FIELDS: Record<Kind, FieldDef[]> = { item: ITEM_FIELDS, pet: PET_FIELDS }

/** Form state: every field holds **one string per control**; scalar fields hold a single entry. */
type Draft = Record<string, string[]>

/** Default values of a field, as the strings its controls display. */
function defaultValues(kind: Kind, id: string, field: FieldDef): string[] {
	const base: ItemTemplate | PetDef = kind === 'item' ? ITEM_BY_ID[id]! : getPet(id)
	if (!base) return ['']

	switch (field.kind) {
		case 'perStarNumber': {
			const source = (base as unknown as Record<string, ((star: Star) => number) | undefined>)[field.key]
			// An optional field the template does not declare starts out **absent**, not as five blanks.
			if (!source) return field.optional ? [] : STARS.map(() => '')
			return STARS.map((star) => String(source(star)))
		}
		case 'perStarJson': {
			const source = (base as unknown as Record<string, ((star: Star) => unknown) | undefined>)[field.key]
			return STARS.map((star) => (source ? JSON.stringify(source(star)) : ''))
		}
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

/** Error message for one value, prefixed with the star rank it belongs to. */
function invalid(star: Star | undefined, message: string): never {
	throw new Error(star ? `${star}★ ${message}` : message)
}

function textValue(raw: string, star?: Star): string {
	const value = raw.trim()
	if (value.length === 0) invalid(star, 'không được để trống')
	return value
}

function numberValue(field: FieldDef, raw: string, star?: Star): number {
	const value = Number(raw.trim())
	if (!Number.isFinite(value)) invalid(star, 'phải là số')
	if (field.integer && !Number.isInteger(value)) invalid(star, 'phải là số nguyên')
	if (field.min !== undefined && value < field.min) invalid(star, `phải ≥ ${field.min}`)
	if (field.max !== undefined && value > field.max) invalid(star, `phải ≤ ${field.max}`)
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
	const defaults = defaultDraft(kind, id)

	for (const field of FIELDS[kind]) {
		const values = draft[field.key] ?? []
		// An optional field the editor never filled is simply absent from the row.
		if (field.optional && values.every((value) => value.trim() === '')) continue
		if (JSON.stringify(values) === JSON.stringify(defaults[field.key] ?? [])) continue

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
				case 'size':
					payload[field.key] = {
						w: integerInRange(values[0] ?? '', SIZE_LIMITS.w, 'w'),
						h: integerInRange(values[1] ?? '', SIZE_LIMITS.h, 'h'),
					}
					break
				case 'quality': {
					const quality = integerInRange(values[0] ?? '', { min: 1, max: 5 }, 'phẩm')
					payload[field.key] = quality
					break
				}
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : 'giá trị không hợp lệ'
			errors.push(`${field.label}: ${detail}`)
		}
	}

	return { payload, errors }
}

/** Whole number inside a fixed range, used by the two `space` inputs. */
function integerInRange(raw: string, range: { min: number; max: number }, axis: string): number {
	const value = Number(raw.trim())
	if (!Number.isInteger(value)) throw new Error(`${axis} phải là số nguyên`)
	if (value < range.min || value > range.max) {
		throw new Error(`${axis} phải trong khoảng ${range.min}–${range.max}`)
	}
	return value
}

/**
 * Content admin page: edit **items** and **pets** at `/admin`.
 *
 * ⚠️ Editing here changes the game for **every player** (content lives on the server, it is not
 * part of a personal save). Access is limited to accounts whose email is listed in
 * `ADMIN_EMAILS`; with that variable unset nobody gets in.
 */
export function AdminContentScreen() {
	const { user, loading } = useSessionState()

	if (loading) {
		return (
			<section className={panelClass}>
				<h2 className={panelTitleClass}>Quản trị nội dung</h2>
				<p className={hintClass}>Đang kiểm tra phiên đăng nhập…</p>
			</section>
		)
	}

	if (!user || !user.is_admin) {
		return (
			<section className={cn(panelClass, 'gap-2.5')}>
				<h2 className={panelTitleClass}>Quản trị nội dung</h2>
				<p className={hintClass}>
					{user
						? 'Tài khoản này không có quyền quản trị. Thêm email của bạn vào ADMIN_EMAILS trong .env rồi khởi động lại API.'
						: 'Hãy đăng nhập bằng tài khoản quản trị (email nằm trong ADMIN_EMAILS của .env).'}
				</p>
			</section>
		)
	}

	return <AdminContentEditor />
}

function AdminContentEditor() {
	// Selection lives in the store: saving bumps `contentVersion`, which remounts this page (see
	// `__root`) — local state made the panel jump back to the first item after every save.
	const kind = useUiStore((state) => state.adminKind)
	const selected = useUiStore((state) => state.adminId)
	const setAdminSelection = useUiStore((state) => state.setAdminSelection)
	const [draft, setDraft] = useState<Draft>(() =>
		// Seed from the **stored** selection; when nothing is stored yet (`''`) use the first entry of
		// the kind, which is what `activeId` below resolves to.
		defaultDraft(
			useUiStore.getState().adminKind,
			useUiStore.getState().adminId ||
				(useUiStore.getState().adminKind === 'item' ? ITEM_TEMPLATES[0]?.id : PETS[0]?.id) ||
				'',
		),
	)
	const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)

	const { data, isLoading } = useAdminContent(true)
	const saveContent = useSaveContent()
	const resetContent = useResetContent()
	const uploadArt = useUploadArt()
	const deleteArt = useDeleteArt()
	const pushToast = useGameStore((state) => state.pushToast)
	const bumpContent = useUiStore((state) => state.bumpContent)
	const [importOpen, setImportOpen] = useState(false)
	/** Deleting a picture cannot be undone (it has to be cropped again), so it asks first. */
	const [removeArtOpen, setRemoveArtOpen] = useState(false)
	/** Star rank the picture is previewed at — the art is the same, the stars only change colour. */
	const [previewStar, setPreviewStar] = useState<Star>(1)

	const ids = useMemo(
		() => (kind === 'item' ? ITEM_TEMPLATES.map((template) => template.id) : PETS.map((pet) => pet.id)),
		[kind],
	)

	/**
	 * Entity actually being edited.
	 *
	 * ⚠️ Derived, never trusted from `selected` alone: switching kind (item → pet) leaves
	 * `selected` pointing at an id of the other kind for one render, and `getPet('wooden-blade')`
	 * throws — which is a blank page, not a wrong label.
	 */
	const activeId = ids.includes(selected) ? selected : (ids[0] ?? '')

	/** Human name of the edited entity — used by the picture dialogs. */
	const entityName = kind === 'item' ? (ITEM_BY_ID[activeId]?.name ?? activeId) : getPet(activeId).name

	/** Code defaults of the edited entity: an optional field with no value here can be removed again. */
	const defaults = useMemo(() => defaultDraft(kind, activeId), [kind, activeId])

	/** Attach an optional field (`speed`, `interval`…) to the item being edited. */
	const addOptionalField = (field: FieldDef) =>
		setDraft((current) => ({
			...current,
			[field.key]: STARS.map(() => field.addDefault ?? ''),
		}))

	/** Drop an optional field the editor added — the code value (or nothing) applies again. */
	const clearOptionalField = (key: string) =>
		setDraft((current) => ({ ...current, [key]: [] }))

	/** Entities that currently have an override, mapped to the last editor's email. */
	const overridden = useMemo(() => {
		const map = new Map<string, string | null>()
		for (const override of data?.overrides ?? []) {
			if (override.kind === kind) map.set(override.entityId, override.updatedBy)
		}
		return map
	}, [data, kind])

	/** Uploaded picture of the edited entity (metadata only — the bytes are in the image itself). */
	const artRow = useMemo(
		() => (data?.art ?? []).find((entry) => entry.kind === kind && entry.entityId === activeId),
		[data, kind, activeId],
	)

	/** Switch kind: the id has to move to the other list **in the same event**, never later. */
	const selectKind = (value: Kind) => {
		const first = value === 'item' ? ITEM_TEMPLATES[0]?.id : PETS[0]?.id
		const nextId = first ?? ''
		setAdminSelection(value, nextId)
		setDraft(defaultDraft(value, nextId))
		setMessage(null)
	}

	const selectEntity = (id: string) => {
		setAdminSelection(kind, id)
		setDraft(defaultDraft(kind, id))
		setMessage(null)
	}

	const dirty = useMemo(() => {
		const base = defaultDraft(kind, activeId)
		return Object.keys(base).some(
			(key) => JSON.stringify(draft[key] ?? []) !== JSON.stringify(base[key] ?? []),
		)
	}, [draft, kind, activeId])

	const onSave = () => {
		const { payload, errors } = buildPayload(kind, activeId, draft)
		if (errors.length > 0) {
			setMessage({ text: errors.join(' · '), bad: true })
			return
		}

		if (Object.keys(payload).length === 0) {
			// Nothing differs from the defaults: best to drop the row so the entity follows code.
			if (!overridden.has(activeId)) {
				setMessage({ text: 'Chưa có gì khác mặc định để lưu.', bad: true })
				return
			}
			resetContent.mutate(
				{ kind, id: activeId },
				{
					onSuccess: () => {
						bumpContent()
						pushToast(`Đã trả "${activeId}" về mặc định`, 'good')
						setMessage({ text: 'Đã trả về mặc định.', bad: false })
					},
					onError: (error) => setMessage({ text: error.message, bad: true }),
				},
			)
			return
		}

		saveContent.mutate(
			{ kind, id: activeId, payload },
			{
				onSuccess: () => {
					bumpContent()
					pushToast(`Đã lưu ${kind === 'item' ? 'vật phẩm' : 'thú cưng'} "${activeId}"`, 'good')
					setMessage({ text: 'Đã lưu. Người chơi thấy ở lần tải trang kế tiếp.', bad: false })
				},
				onError: (error) => setMessage({ text: error.message, bad: true }),
			},
		)
	}

	const onReset = () => {
		resetContent.mutate(
			{ kind, id: activeId },
			{
				onSuccess: () => {
					setDraft(defaultDraft(kind, activeId))
					bumpContent()
					pushToast(`Đã trả "${activeId}" về mặc định`, 'good')
					setMessage({ text: 'Đã trả về mặc định.', bad: false })
				},
				onError: (error) => setMessage({ text: error.message, bad: true }),
			},
		)
	}

	const busy = saveContent.isPending || resetContent.isPending

	return (
		<div className="flex flex-col gap-3.5">
			<section className={cn(panelClass, 'gap-2.5')}>
				<div className={rowBetweenClass}>
					<h2 className={panelTitleClass}>Quản trị nội dung</h2>
					<span className="text-[11.5px] text-muted">
						{data ? `${data.overrides.length} mục đang bị sửa` : isLoading ? 'đang tải…' : '—'}
					</span>
				</div>
				<p className={hintClass}>
					Sửa ở đây áp cho <strong>mọi người chơi</strong>. Chỉ trường <strong>khác mặc định</strong> được
					lưu, nên sau này sửa code vẫn có tác dụng với những trường bạn không đụng tới. Hiệu lực chủ
					động (<code>active</code>, <code>onHit</code>) vẫn nằm trong mã nguồn.
				</p>
				<div className="flex flex-wrap gap-2">
					{(['item', 'pet'] as Kind[]).map((value) => (
						<button
							type="button"
							key={value}
							className={cn(btnClass, btnSmClass, kind === value && btnGoldClass)}
							onClick={() => selectKind(value)}
						>
							{value === 'item' ? 'Vật phẩm' : 'Thú cưng'}
						</button>
					))}
				</div>
			</section>

			<div className="grid items-start gap-3 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
				<section className={cn(panelClass, 'gap-1.5')}>
					<h3 className="m-0 text-[13px] text-muted">{ids.length} mục</h3>
					<div className="flex max-h-[520px] flex-col gap-1 overflow-y-auto pr-1">
						{ids.map((id) => {
							const template = kind === 'item' ? ITEM_BY_ID[id]! : getPet(id)
							return (
								<button
									type="button"
									key={id}
									data-admin-entry={id}
									className={cn(
										btnClass,
										btnSmClass,
										'justify-between text-left',
										id === activeId && 'border-gold bg-ink-600',
									)}
									onClick={() => selectEntity(id)}
								>
									<span className="truncate">
										{template.icon} {template.name}
									</span>
									{overridden.has(id) ? (
										<span
											className="shrink-0 text-[11px] text-gold-soft"
											title={`Sửa bởi ${overridden.get(id) ?? '—'}`}
										>
											●
										</span>
									) : null}
								</button>
							)
						})}
					</div>
				</section>

				<section className={cn(panelClass, 'gap-2.5')}>
					<div className={rowBetweenClass}>
						<h3 className="m-0 text-[15px] font-semibold">
							{kind === 'item' ? ITEM_BY_ID[activeId]?.name : getPet(activeId).name}{' '}
							<span className="text-[12px] font-normal text-muted">{activeId}</span>
						</h3>
						{overridden.has(activeId) ? (
							<span className="rounded-md border border-gold/45 px-1.5 py-px text-[11px] text-gold-soft">
								đang ghi đè
							</span>
						) : null}
					</div>

					{/* Picture: one per entity, previewed **in the real grid tile** so it can be judged in context. */}
					<div className="flex flex-col gap-2 rounded-[10px] border border-line bg-black/25 p-2.5">
						<div className="flex flex-wrap items-start gap-3">
							<div data-admin-art-preview className="shrink-0">
								<ArtPreview kind={kind} id={activeId} star={previewStar} />
							</div>
							<div className="flex min-w-0 flex-1 flex-col gap-1.5">
								<div className="flex flex-wrap items-center gap-2">
									<button
										type="button"
										data-admin-import-art
										className={cn(btnClass, btnSmClass, btnGoldClass)}
										onClick={() => setImportOpen(true)}
										disabled={uploadArt.isPending || deleteArt.isPending}
									>
										🖼️ Tải ảnh lên
									</button>
									{artRow ? (
										<button
											type="button"
											data-admin-remove-art
											className={cn(btnClass, btnSmClass)}
											onClick={() => setRemoveArtOpen(true)}
											disabled={uploadArt.isPending || deleteArt.isPending}
										>
											🗑️ Xoá ảnh đã tải
										</button>
									) : null}
								</div>
								<span className="text-[11.5px] text-muted">
									{artRow
										? `Ảnh tải lên · ${artRow.width}×${artRow.height} · v${artRow.version} · ${
												artRow.updatedBy ?? '—'
											}`
										: 'Đang dùng ảnh đóng gói sẵn (hoặc emoji).'}
								</span>
								{/* Star rank only recolours the stars and adds more of them — check that the art still reads. */}
								<div className="flex flex-wrap items-center gap-1">
									<span className="mr-1 text-[11.5px] text-muted">Xem ở</span>
									{STARS.map((rank) => (
										<button
											key={rank}
											type="button"
											data-admin-preview-star={rank}
											className={cn(
												btnClass,
												btnSmClass,
												'px-2 py-0.5 text-[11.5px]',
												rank === previewStar && btnGoldClass,
											)}
											onClick={() => setPreviewStar(rank)}
										>
											<span className={ITEM_STAR_TEXT[rank]}>{starLabel(rank)}</span>
										</button>
									))}
								</div>
							</div>
						</div>
					</div>

					<div className="grid gap-2 md:grid-cols-2">
						{FIELDS[kind].map((field) => {
							const values = draft[field.key] ?? []
							const present = !field.optional || values.some((value) => value.trim() !== '')
							// Only a field the editor added can be taken away again; a value from code stays.
							const removable = field.optional && (defaults[field.key] ?? []).every((value) => !value.trim())

							if (!present) {
								return (
									<div key={field.key} className="flex flex-col gap-1 text-[12.5px]">
										<button
											type="button"
											data-admin-add-field={field.key}
											className={cn(btnClass, btnSmClass, 'self-start')}
											title={field.hint}
											onClick={() => addOptionalField(field)}
										>
											＋ {field.label}
										</button>
									</div>
								)
							}

							return (
								<div
									key={field.key}
									className={cn('flex flex-col gap-1 text-[12.5px]', isPerStar(field) && 'md:col-span-2')}
								>
									<span className="flex items-center gap-1.5 text-muted">
										{field.label}
										{field.hint ? <span className="opacity-70">· {field.hint}</span> : null}
										{removable ? (
											<button
												type="button"
												data-admin-remove-field={field.key}
												className="rounded border border-line px-1 text-[11px] leading-4 hover:border-danger-soft hover:text-danger-soft"
												title={`Bỏ trường ${field.label}`}
												onClick={() => clearOptionalField(field.key)}
											>
												✕
											</button>
										) : null}
									</span>
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

					<div className={statClass}>
						<span className="text-muted">Trạng thái</span>
						<span className={dirty ? 'font-semibold text-gold-soft' : 'text-muted'}>
							{dirty ? 'có thay đổi chưa lưu' : 'khớp mặc định'}
						</span>
					</div>

					{message ? (
						<p
							data-admin-message
							className={cn('m-0 text-[12.5px]', message.bad ? 'text-danger-soft' : 'text-jade')}
						>
							{message.text}
						</p>
					) : null}

					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							className={cn(btnClass, btnGoldClass, 'justify-center')}
							disabled={busy}
							onClick={onSave}
						>
							💾 Lưu
						</button>
						<button
							type="button"
							className={cn(btnClass, 'justify-center')}
							disabled={busy}
							onClick={onReset}
							title="Xoá phần ghi đè của mục này"
						>
							↺ Về mặc định
						</button>
						<button
							type="button"
							className={cn(btnClass, 'justify-center')}
							onClick={() => setDraft(defaultDraft(kind, activeId))}
						>
							Hoàn tác ô nhập
						</button>
					</div>
				</section>
			</div>

			{importOpen ? (
				<ArtImportDialog
					entityName={entityName}
					kind={kind}
					entityId={activeId}
					star={previewStar}
					// The crop frame follows the item's grid shape; pets are square cells.
					space={
						kind === 'item'
							? (ITEM_BY_ID[activeId]?.space ?? { w: 1, h: 1 })
							: { w: 1, h: 1 }
					}
					onCancel={() => setImportOpen(false)}
					onSave={async (png) => {
						await uploadArt.mutateAsync({ kind, id: activeId, png })
						bumpContent()
						pushToast(`Đã cập nhật ảnh cho "${activeId}"`, 'good')
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
					title={`Xoá ảnh đã tải của "${entityName}"?`}
					message="Ảnh sẽ bị xoá khỏi máy chủ và món này quay về ảnh đóng gói sẵn (hoặc emoji). Không thể hoàn tác — muốn có lại thì phải tải lên và cắt ảnh từ tệp gốc."
					confirmLabel="Xoá ảnh"
					onCancel={() => setRemoveArtOpen(false)}
					onConfirm={() => {
						setRemoveArtOpen(false)
						deleteArt.mutate(
							{ kind, id: activeId },
							{
								onSuccess: () => {
									bumpContent()
									pushToast(`Đã xoá ảnh đã tải của "${activeId}"`, 'good')
								},
								onError: (error) => setMessage({ text: error.message, bad: true }),
							},
						)
					}}
				/>
			) : null}
		</div>
	)
}

/** Whether a field edits a value per star rank and therefore needs a full-width row of controls. */
function isPerStar(field: FieldDef): boolean {
	return field.kind === 'perStarNumber' || field.kind === 'perStarJson'
}

const inputClass = 'w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 text-[13px]'

/** Small label above one per-star control, so the rank is never ambiguous. */
function RankLabel({ star }: { star: Star }) {
	return <span className="text-[10.5px] text-muted">{starLabel(star)}</span>
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
							<textarea
								data-admin-field={field.key}
								data-admin-star={star}
								className={cn(inputClass, 'min-h-[58px] font-mono text-[11px]')}
								value={values[index] ?? ''}
								onChange={(event) => onChange(index, event.target.value)}
							/>
						) : (
							<input
								data-admin-field={field.key}
								data-admin-star={star}
								className={inputClass}
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
						<input
							type="number"
							data-admin-field={field.key}
							data-admin-size={axis}
							className={cn(inputClass, 'w-16')}
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
				<select
					data-admin-field={field.key}
					className={cn(inputClass, 'flex-1')}
					value={values[0] ?? ''}
					onChange={(event) => onChange(0, event.target.value)}
				>
					{QUALITY_OPTIONS.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
				{/* Shows the mapping quality → colour straight away, without opening the game. */}
				<span
					data-admin-quality-swatch
					title={QUALITY_LABELS[quality]}
					className={cn('size-6 shrink-0 rounded-md border border-line', ITEM_QUALITY_SWATCH[quality])}
				/>
			</div>
		)
	}

	if (field.kind === 'select') {
		return (
			<select
				data-admin-field={field.key}
				className={inputClass}
				value={values[0] ?? ''}
				onChange={(event) => onChange(0, event.target.value)}
			>
				{field.options?.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		)
	}

	if (field.kind === 'json') {
		return (
			<textarea
				data-admin-field={field.key}
				className={cn(inputClass, 'min-h-[64px] font-mono text-[12px]')}
				value={values[0] ?? ''}
				onChange={(event) => onChange(0, event.target.value)}
			/>
		)
	}

	const isText = field.kind === 'text'

	return (
		<input
			data-admin-field={field.key}
			className={inputClass}
			type={isText ? 'text' : 'number'}
			min={isText ? undefined : field.min}
			max={isText ? undefined : field.max}
			step={field.kind === 'number' ? 'any' : undefined}
			value={values[0] ?? ''}
			onChange={(event) => onChange(0, event.target.value)}
		/>
	)
}
