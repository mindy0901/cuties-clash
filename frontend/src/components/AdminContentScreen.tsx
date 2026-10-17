import { useMemo, useState } from 'react'
import { useAdminContent, useResetContent, useSaveContent, useSessionState } from '../api/queries'
import { ITEM_BY_ID, ITEM_TEMPLATES } from '../game/items'
import { PETS, getPet } from '../game/pets'
import type { ItemTemplate, PetDef, Star } from '../game/types'
import { useGameStore } from '../store/gameStore'
import { useUiStore } from '../store/uiStore'
import {
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

/** Input control used for a field. */
type FieldKind = 'text' | 'int' | 'number' | 'select' | 'perStarNumber' | 'json'

interface FieldDef {
	/** Payload key — must match the server whitelist in `backend/src/content.ts`. */
	key: string
	/** Label shown to the editor (Vietnamese, like the rest of the UI for now). */
	label: string
	kind: FieldKind
	min?: number
	max?: number
	options?: { value: string; label: string }[]
	hint?: string
}

const CLASS_OPTIONS = [
	{ value: 'weapon', label: 'Vũ khí' },
	{ value: 'armor', label: 'Hộ giáp' },
	{ value: 'souljade', label: 'Hồn Ngọc' },
	{ value: 'curio', label: 'Pháp Bảo' },
	{ value: 'potion', label: 'Đan Dược' },
]

const ART_EXT_OPTIONS = [
	{ value: 'png', label: 'png' },
	{ value: 'svg', label: 'svg' },
	{ value: 'webp', label: 'webp' },
]

const BOOLEAN_OPTIONS = [
	{ value: 'true', label: 'có' },
	{ value: 'false', label: 'không' },
]

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
	{ key: 'cost', label: 'Giá gốc (1★)', kind: 'int', min: 1, max: 999 },
	{ key: 'space', label: 'Kích thước ô', kind: 'json', hint: '{"w":1,"h":3} — w 1–4, h 1–5' },
	{ key: 'stars', label: 'Sao có art riêng', kind: 'json', hint: '[1,2,3,4] — rỗng nếu chỉ dùng emoji' },
	{ key: 'artExt', label: 'Đuôi art', kind: 'select', options: ART_EXT_OPTIONS },
	{ key: 'desc', label: 'Mô tả', kind: 'json', hint: 'mảng 4 chuỗi — ❌ không tự tính lại theo chỉ số' },
	{ key: 'damage', label: 'Sát thương (1★→4★)', kind: 'perStarNumber', min: 0, max: 100_000 },
	{ key: 'attackInterval', label: 'Nhịp đánh ms (1★→4★)', kind: 'perStarNumber', min: 100, max: 60_000 },
	{ key: 'interval', label: 'Nhịp hiệu lực ms (1★→4★)', kind: 'perStarNumber', min: 100, max: 60_000 },
	{ key: 'passive', label: 'Chỉ số cộng thêm', kind: 'json', hint: '[{ "atk": 2 }, …] × 4 sao' },
	{
		key: 'aura',
		label: 'Hào khí liền kề',
		kind: 'json',
		hint: '[{ "target": "adjacent", "mods": {…} }, …] × 4',
	},
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

/** Form state: every value as a string so any input can display it. */
type Draft = Record<string, string>

/** Value stored in code for a field, as text for the input. */
function defaultText(kind: Kind, id: string, field: FieldDef): string {
	if (kind === 'item') {
		const base = ITEM_BY_ID[id]
		if (!base) return ''
		switch (field.kind) {
			case 'perStarNumber': {
				const source = (base as unknown as Record<string, (star: Star) => number>)[field.key]
				return source ? [1, 2, 3, 4].map((star) => source(star as Star)).join(', ') : ''
			}
			case 'json':
				return JSON.stringify(jsonValue(base, field.key) ?? '')
			default: {
				const value = (base as unknown as Record<string, unknown>)[field.key]
				return value === undefined ? '' : String(value)
			}
		}
	}

	const base = getPet(id)
	switch (field.kind) {
		case 'json':
			return JSON.stringify(jsonValue(base, field.key) ?? '')
		default: {
			const value = (base as unknown as Record<string, unknown>)[field.key]
			return value === undefined ? '' : String(value)
		}
	}
}

/** JSON view of a field: per-star arrays for functions, the value itself otherwise. */
function jsonValue(base: ItemTemplate | PetDef, key: string): unknown {
	if (key === 'space') return (base as ItemTemplate).space
	if (key === 'stars') return (base as ItemTemplate).stars ?? []
	const source = (base as unknown as Record<string, unknown>)[key]
	if (typeof source === 'function') {
		const fn = source as (star: Star) => unknown
		return [1, 2, 3, 4].map((star) => fn(star as Star))
	}
	return source
}

function defaultDraft(kind: Kind, id: string): Draft {
	const draft: Draft = {}
	for (const field of FIELDS[kind]) draft[field.key] = defaultText(kind, id, field)
	return draft
}

/**
 * Build the payload to send: **only fields that differ from the code default**.
 *
 * ⚠️ WHY NOT SEND EVERYTHING: a row should only hold what the editor actually changed. Sending
 * the whole set would freeze every field, so a later code change to an untouched field would
 * silently stop having any effect.
 */
function buildPayload(
	kind: Kind,
	id: string,
	draft: Draft,
): { payload: Record<string, unknown>; errors: string[] } {
	const payload: Record<string, unknown> = {}
	const errors: string[] = []

	for (const field of FIELDS[kind]) {
		const raw = (draft[field.key] ?? '').trim()
		if (raw === defaultText(kind, id, field).trim()) continue

		try {
			switch (field.kind) {
				case 'text':
					if (raw.length === 0) throw new Error('không được để trống')
					payload[field.key] = raw
					break
				case 'int': {
					const value = Number.parseInt(raw, 10)
					if (!Number.isFinite(value)) throw new Error('phải là số nguyên')
					payload[field.key] = value
					break
				}
				case 'number': {
					const value = Number(raw)
					if (!Number.isFinite(value)) throw new Error('phải là số')
					payload[field.key] = value
					break
				}
				case 'select': {
					// `có/không` selects send booleans, anything else sends the string.
					const isBoolean = field.options?.every(
						(option) => option.value === 'true' || option.value === 'false',
					)
					payload[field.key] = isBoolean ? raw === 'true' : raw
					break
				}
				case 'perStarNumber': {
					const parts = raw.split(',').map((part) => part.trim())
					if (parts.length !== 4) throw new Error('cần đúng 4 giá trị, ngăn bằng dấu phẩy')
					if (parts.some((part) => !Number.isFinite(Number(part)))) throw new Error('phải là số')
					payload[field.key] = parts.map((part) => Number(part))
					break
				}
				case 'json':
					payload[field.key] = JSON.parse(raw)
					break
			}
		} catch (error) {
			errors.push(`${field.label}: ${error instanceof Error ? error.message : 'giá trị không hợp lệ'}`)
		}
	}

	return { payload, errors }
}

/**
 * Content admin page: edit **items** and **pets** at `/quan-tri`.
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
	const [kind, setKind] = useState<Kind>('item')
	const [selected, setSelected] = useState<string>(ITEM_TEMPLATES[0]?.id ?? '')
	const [draft, setDraft] = useState<Draft>(() => defaultDraft('item', ITEM_TEMPLATES[0]?.id ?? ''))
	const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)

	const { data, isLoading } = useAdminContent(true)
	const saveContent = useSaveContent()
	const resetContent = useResetContent()
	const pushToast = useGameStore((state) => state.pushToast)
	const bumpContent = useUiStore((state) => state.bumpContent)

	const ids = useMemo(
		() => (kind === 'item' ? ITEM_TEMPLATES.map((template) => template.id) : PETS.map((pet) => pet.id)),
		[kind],
	)

	/** Entities that currently have an override, mapped to the last editor's email. */
	const overridden = useMemo(() => {
		const map = new Map<string, string | null>()
		for (const override of data?.overrides ?? []) {
			if (override.kind === kind) map.set(override.entityId, override.updatedBy)
		}
		return map
	}, [data, kind])

	/**
	 * Entity actually being edited.
	 *
	 * ⚠️ Derived, never trusted from `selected` alone: switching kind (item → pet) leaves
	 * `selected` pointing at an id of the other kind for one render, and `getPet('wooden-blade')`
	 * throws — which is a blank page, not a wrong label.
	 */
	const activeId = ids.includes(selected) ? selected : (ids[0] ?? '')

	/** Switch kind: the id has to move to the other list **in the same event**, never later. */
	const selectKind = (value: Kind) => {
		const first = value === 'item' ? ITEM_TEMPLATES[0]?.id : PETS[0]?.id
		const nextId = first ?? ''
		setKind(value)
		setSelected(nextId)
		setDraft(defaultDraft(value, nextId))
		setMessage(null)
	}

	const selectEntity = (id: string) => {
		setSelected(id)
		setDraft(defaultDraft(kind, id))
		setMessage(null)
	}

	const dirty = useMemo(() => {
		const base = defaultDraft(kind, activeId)
		return Object.keys(base).some((key) => (draft[key] ?? '') !== base[key])
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

					<div className="grid gap-2 md:grid-cols-2">
						{FIELDS[kind].map((field) => (
							<label key={field.key} className="flex flex-col gap-1 text-[12.5px]">
								<span className="text-muted">
									{field.label}
									{field.hint ? <span className="ml-1 opacity-70">· {field.hint}</span> : null}
								</span>
								<FieldInput
									field={field}
									value={draft[field.key] ?? ''}
									onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
								/>
							</label>
						))}
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
		</div>
	)
}

function FieldInput({
	field,
	value,
	onChange,
}: {
	field: FieldDef
	value: string
	onChange: (value: string) => void
}) {
	const className = 'w-full rounded-lg border border-line bg-black/40 px-2 py-1.5 text-[13px]'

	if (field.kind === 'select') {
		return (
			<select
				data-admin-field={field.key}
				className={className}
				value={value}
				onChange={(event) => onChange(event.target.value)}
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
				className={cn(className, 'min-h-[64px] font-mono text-[12px]')}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
		)
	}

	// ⚠️ Per-star fields hold a comma separated list ("12, 20, 32, 50"), so they must be plain
	// text inputs: a `type="number"` input drops the commas and the value can never be edited.
	const isText = field.kind === 'text' || field.kind === 'perStarNumber'

	return (
		<input
			data-admin-field={field.key}
			className={className}
			type={isText ? 'text' : 'number'}
			inputMode={isText ? 'decimal' : undefined}
			min={isText ? undefined : field.min}
			max={isText ? undefined : field.max}
			step={field.kind === 'number' ? 'any' : undefined}
			value={value}
			onChange={(event) => onChange(event.target.value)}
		/>
	)
}
