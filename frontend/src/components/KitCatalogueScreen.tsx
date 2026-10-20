import { useMemo, useState } from 'react'
import { toEnglish } from '../i18n'
import {
	useCreateKit,
	useCreateKitCategory,
	useDeleteKit,
	useDeleteKitCategory,
	useRemoveKit,
	useSaveKit,
	useSaveKitCategory,
} from '../api/queries'
import { isCodeKit, kitCategories, kitCatalogue, removedKits } from '../game/content'
import { itemCatalogue } from '../game/items'
import { cutieList } from '../game/cuties'
import { KIT_DEFS, kitDef, kitSeed } from '../game/kits'
import type { KitDef, KitParamDef } from '../game/kits'
import type { ItemKit, ItemKitId } from '../game/types'
import { useUiStore } from '../store/uiStore'
import { OptionPicker } from './AdminPickers'
import { ConfirmDialog } from './ConfirmDialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Plus, Save, Trash2, X } from './icons'
import { cn, panelClass, panelTitleClass, rowBetweenClass, tagClass } from './ui'
import { Button } from './ui/button'

/** One owner of a kit: the entity it hangs on, plus the name to show. */
interface KitOwner {
	name: string
	kind: 'item' | 'cutie'
}

/** What the "New kit" panel collects before the server builds the id. */
interface NewKitDraft {
	mechanic: ItemKitId
	label: string
	categoryId: string
}

/**
 * The kit catalogue of the game — read, extended and re-filed from here.
 *
 * A kit is a **mechanic of the engine** (`game/kits.ts`, shipped in code so the game works with no
 * backend) plus a catalogue entry: label, catalogue, who may carry it, starting numbers. This page edits
 * the entry, creates new ones on top of an existing mechanic, moves them between catalogues and deletes
 * them — which is also what takes a kit off every item and Cutie at once.
 */
export function KitCatalogueScreen() {
	// Catalogue and overlay live in module variables; `contentVersion` is what tells React they moved.
	const contentVersion = useUiStore((state) => state.contentVersion)
	const removeKit = useRemoveKit()
	const deleteKit = useDeleteKit()
	const createKit = useCreateKit()
	const saveKit = useSaveKit()
	const createCategory = useCreateKitCategory()
	const saveCategory = useSaveKitCategory()
	const deleteCategory = useDeleteKitCategory()

	const [error, setError] = useState<string | null>(null)
	/** Kit waiting for the confirmation — deleting takes it off every entity at once. */
	const [pendingDelete, setPendingDelete] = useState<ItemKitId | null>(null)
	/** Kit whose edit form is open. */
	const [editing, setEditing] = useState<ItemKitId | null>(null)
	/** Catalogue being renamed / deleted. */
	const [renaming, setRenaming] = useState<string | null>(null)
	const [pendingCategory, setPendingCategory] = useState<string | null>(null)
	const [newCategory, setNewCategory] = useState<string | null>(null)
	/** Draft of the "New kit" panel; `null` = closed. */
	const [newKit, setNewKit] = useState<NewKitDraft | null>(null)

	const catalogue = useMemo(() => {
		void contentVersion
		return kitCatalogue()
	}, [contentVersion])
	const categories = useMemo(() => {
		void contentVersion
		return kitCategories()
	}, [contentVersion])
	const gone = useMemo(() => {
		void contentVersion
		return removedKits()
	}, [contentVersion])

	const removedDefs = useMemo(() => KIT_DEFS.filter((def) => gone.has(def.id)), [gone])

	/** Which entity carries which kit — top level, inside an attack kit's `onHit`, and the `charge`. */
	const owners = useMemo(() => {
		void contentVersion
		const map = new Map<string, KitOwner[]>()
		const add = (kit: ItemKit, owner: KitOwner) => {
			map.set(kit.id, [...(map.get(kit.id) ?? []), owner])
			for (const effect of kit.onHit ?? []) add(effect, owner)
			if (kit.charge) add(kit.charge, owner)
		}
		for (const item of itemCatalogue()) {
			for (const kit of item.kits ?? []) add(kit, { name: toEnglish(item.name), kind: 'item' })
		}
		for (const cutie of cutieList()) {
			for (const kit of cutie.kits ?? []) add(kit, { name: toEnglish(cutie.name), kind: 'cutie' })
		}
		return map
	}, [contentVersion])

	const byCategory = useMemo(() => {
		const groups = new Map<string, KitDef[]>()
		for (const def of catalogue) groups.set(def.category, [...(groups.get(def.category) ?? []), def])
		const known = new Set(categories.map((category) => category.id))
		const rows = categories.map((category) => ({ category, kits: groups.get(category.id) ?? [] }))
		// A kit whose catalogue no longer exists still has to be shown: it keeps its own heading, so
		// nothing disappears because a heading was removed.
		for (const [id, kits] of groups) {
			if (!known.has(id)) rows.push({ category: { id, label: id, position: 999 }, kits })
		}
		return rows
	}, [catalogue, categories])

	const shared = catalogue.filter((def) => def.appliesTo === 'both').length
	const fail = (cause: unknown, fallback: string) =>
		setError(cause instanceof Error ? cause.message : fallback)

	const categoryOptions = categories.map((category) => ({ value: category.id, label: category.label }))

	const startNewKit = () => {
		setError(null)
		setNewKit({
			mechanic: (KIT_DEFS[0]?.id ?? 'basic-attack') as ItemKitId,
			label: '',
			categoryId: categories[0]?.id ?? 'attack',
		})
	}

	const submitNewKit = () => {
		if (!newKit) return
		const label = newKit.label.trim()
		if (label === '') {
			setError('A new kit needs a label.')
			return
		}
		setError(null)
		createKit.mutate(
			{ mechanic: newKit.mechanic, label, categoryId: newKit.categoryId },
			{
				onSuccess: () => setNewKit(null),
				onError: (cause) => fail(cause, 'Could not create this kit.'),
			},
		)
	}

	const pendingDef = pendingDelete ? kitDef(pendingDelete) : null
	const pendingOwners = pendingDelete ? (owners.get(pendingDelete) ?? []) : []

	return (
		<section className={cn(panelClass, 'gap-2.5')}>
			<div className={rowBetweenClass}>
				<h3 className={panelTitleClass}>Kit catalogue</h3>
				<span className="text-[11.5px] text-muted">
					{`${catalogue.length} kits · ${shared} shared · ${catalogue.length - shared} item only`}
					{removedDefs.length > 0 ? ` · ${removedDefs.length} deleted` : ''}
				</span>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					data-admin-kit-new
					variant="primary" size="sm"
					onClick={startNewKit}
					disabled={createKit.isPending}
				>
					<Plus /> New kit
				</Button>
				<Button
					type="button"
					data-admin-category-new
					size="sm"
					onClick={() => {
						setError(null)
						setNewCategory('')
					}}
					disabled={createCategory.isPending}
				>
					<Plus /> New catalogue
				</Button>
			</div>

			{error ? (
				<p data-admin-kit-error role="alert" className="m-0 text-[12px] text-danger-soft">
					{error}
				</p>
			) : null}

			{newCategory !== null ? (
				<form
					data-admin-category-form
					className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-black/25 p-2"
					onSubmit={(event) => {
						event.preventDefault()
						const label = newCategory.trim()
						if (label === '') {
							setError('A catalogue needs a name.')
							return
						}
						setError(null)
						createCategory.mutate(
							{ label },
							{
								onSuccess: () => setNewCategory(null),
								onError: (cause) => fail(cause, 'Could not create this catalogue.'),
							},
						)
					}}
				>
					<Label htmlFor="admin-category-name" className="min-w-0 flex-1 flex-col items-start gap-1">
						Catalogue name
						<Input
							id="admin-category-name"
							data-admin-category-name
							autoFocus
							maxLength={60}
							value={newCategory}
							onChange={(event) => setNewCategory(event.target.value)}
						/>
					</Label>
					<Button
						type="submit"
						data-admin-category-create
						variant="primary" size="sm"
						disabled={createCategory.isPending}
					>
						<Save /> Create
					</Button>
					<Button
						type="button"
						variant="ghost" size="sm"
						onClick={() => setNewCategory(null)}
					>
						<X /> Cancel
					</Button>
				</form>
			) : null}

			{newKit ? (
				<form
					data-admin-kit-new-form
					className="flex flex-col gap-2 rounded-lg border border-line bg-black/25 p-2.5"
					onSubmit={(event) => {
						event.preventDefault()
						submitNewKit()
					}}
				>
					<div className="flex flex-wrap items-end gap-2">
						{/* 🔴 The mechanic is a picker, not free text: the engine only runs what it knows. */}
						<Label className="min-w-[220px] flex-1 flex-col items-start gap-1">
							Mechanic
							<OptionPicker
								fieldKey="mechanic"
								value={newKit.mechanic}
								options={KIT_DEFS.map((def) => ({ value: def.id, label: toEnglish(def.label) }))}
								onChange={(value) => {
									const mechanic = value as ItemKitId
									const base = kitDef(mechanic)
									setNewKit({
										...newKit,
										mechanic,
										// A new kit starts where its mechanic lives; label and numbers are its own.
										label: newKit.label || `${toEnglish(base.label)} II`,
										categoryId: base.category,
									})
								}}
								data-admin-kit-mechanic
							/>
						</Label>
						<Label htmlFor="admin-kit-label" className="min-w-[200px] flex-1 flex-col items-start gap-1">
							Label
							<Input
								id="admin-kit-label"
								data-admin-kit-label
								autoFocus
								maxLength={80}
								value={newKit.label}
								onChange={(event) => setNewKit({ ...newKit, label: event.target.value })}
							/>
						</Label>
						<Label className="min-w-[180px] flex-1 flex-col items-start gap-1">
							Catalogue
							<OptionPicker
								fieldKey="categoryId"
								value={newKit.categoryId}
								options={categoryOptions}
								onChange={(value) => setNewKit({ ...newKit, categoryId: value })}
								data-admin-kit-category
							/>
						</Label>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="submit"
							data-admin-kit-create
							variant="primary" size="sm"
							disabled={createKit.isPending}
						>
							<Save /> Create kit
						</Button>
						<Button
							type="button"
							variant="ghost" size="sm"
							onClick={() => setNewKit(null)}
						>
							<X /> Cancel
						</Button>
					</div>
				</form>
			) : null}

			<div className="flex flex-col gap-3">
				{byCategory.map(({ category, kits }) => (
					<div key={category.id} data-admin-category={category.id} className="flex flex-col gap-1.5">
						<div className="flex flex-wrap items-center gap-2">
							{renaming === category.id ? (
								<form
									data-admin-category-rename-form={category.id}
									className="flex flex-1 flex-wrap items-center gap-2"
									onSubmit={(event) => {
										event.preventDefault()
										const input = event.currentTarget.elements.namedItem('label') as HTMLInputElement
										const label = input.value.trim()
										if (label === '') {
											setError('A catalogue needs a name.')
											return
										}
										setError(null)
										saveCategory.mutate(
											{ id: category.id, payload: { label } },
											{
												onSuccess: () => setRenaming(null),
												onError: (cause) => fail(cause, 'Could not rename this catalogue.'),
											},
										)
									}}
								>
									<Input
										name="label"
										data-admin-category-rename-input
										defaultValue={category.label}
										autoFocus
										maxLength={60}
										className="max-w-[260px]"
									/>
									<Button
										type="submit"
										data-admin-category-save
										variant="primary" size="sm"
										disabled={saveCategory.isPending}
									>
										<Save /> Save
									</Button>
									<Button
										type="button"
										variant="ghost" size="sm"
										onClick={() => setRenaming(null)}
									>
										<X /> Cancel
									</Button>
								</form>
							) : (
								<>
									<h4 className="m-0 flex items-center gap-2 text-[12px] tracking-[0.06em] text-muted uppercase">
										{toEnglish(category.label)}
										<span className={tagClass}>{kits.length}</span>
									</h4>
									<Button
										type="button"
										data-admin-category-rename={category.id}
										variant="ghost" size="sm" className="text-xs"
										onClick={() => {
											setError(null)
											setRenaming(category.id)
										}}
									>
										Rename
									</Button>
									<Button
										type="button"
										data-admin-category-delete={category.id}
										variant="ghost" size="sm" className="text-xs text-destructive"
										// A catalogue that still holds kits cannot be deleted: its kits would lose their
										// heading and look deleted. Move them first — that is what the picker is for.
										disabled={kits.length > 0 || categories.length <= 1}
										title={
											kits.length > 0
												? `Move the ${kits.length} kit(s) of this catalogue somewhere else first`
												: categories.length <= 1
													? 'The last catalogue cannot be deleted'
													: 'Delete this catalogue'
										}
										onClick={() => setPendingCategory(category.id)}
									>
										<Trash2 /> Delete
									</Button>
								</>
							)}
						</div>

						{kits.length === 0 ? (
							<p className="m-0 text-[12px] text-muted">No kit in this catalogue yet.</p>
						) : null}

						<div className="flex flex-col gap-1">
							{kits.map((def) =>
								editing === def.id ? (
									<KitEditForm
										key={def.id}
										def={def}
										categoryOptions={categoryOptions}
										pending={saveKit.isPending}
										onCancel={() => setEditing(null)}
										onSave={(payload) => {
											setError(null)
											saveKit.mutate(
												{ id: def.id, payload },
												{
													onSuccess: () => setEditing(null),
													onError: (cause) => fail(cause, 'Could not save this kit.'),
												},
											)
										}}
									/>
								) : (
									<KitRow
										key={def.id}
										def={def}
										owners={owners.get(def.id) ?? []}
										onEdit={() => {
											setError(null)
											setEditing(def.id)
										}}
										onDelete={() => setPendingDelete(def.id)}
									/>
								),
							)}
						</div>
					</div>
				))}
			</div>

			{/*
				A deleted kit is out of the game and out of the list above — this strip is the way back.
				The entities it was detached from stay detached: those instances are gone, only the kit
				(label, catalogue, numbers) comes back.
			*/}
			{removedDefs.length > 0 ? (
				<div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
					<h4 className="m-0 flex items-center gap-2 text-[12px] tracking-[0.06em] text-muted uppercase">
						Deleted <span className={tagClass}>{removedDefs.length}</span>
					</h4>
					{removedDefs.map((def) => (
						<div
							key={def.id}
							data-admin-kit-removed={def.id}
							className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-black/25 px-2.5 py-1.5 opacity-70"
						>
							<span className="min-w-0 flex-1 truncate line-through">
								{toEnglish(def.label)}{' '}
								<code className="font-mono text-[11.5px] text-muted">{def.id}</code>
							</span>
							<Button
								type="button"
								data-admin-kit-restore={def.id}
								variant="ghost" size="sm"
								disabled={saveKit.isPending || deleteKit.isPending}
								onClick={() => {
									setError(null)
									// A code kit goes back to its definition by dropping the row; a kit created
									// here has no code to fall back on, so it is un-hidden instead.
									if (isCodeKit(def.id)) {
										deleteKit.mutate(def.id, {
											onError: (cause) => fail(cause, 'Could not restore this kit.'),
										})
										return
									}
									saveKit.mutate(
										{ id: def.id, payload: { removed: false } },
										{ onError: (cause) => fail(cause, 'Could not restore this kit.') },
									)
								}}
							>
								Restore
							</Button>
						</div>
					))}
				</div>
			) : null}

			{pendingDef ? (
				<ConfirmDialog
					title={`Delete ${toEnglish(pendingDef.label)}?`}
					message={deleteMessage(pendingDef.label, pendingOwners)}
					confirmLabel="Delete kit"
					onConfirm={() => {
						const id = pendingDef.id
						setPendingDelete(null)
						setError(null)
						removeKit.mutate(id, { onError: (cause) => fail(cause, 'Could not delete this kit.') })
					}}
					onCancel={() => setPendingDelete(null)}
				/>
			) : null}

			{pendingCategory ? (
				<ConfirmDialog
					title={`Delete the "${toEnglish(
						categories.find((row) => row.id === pendingCategory)?.label ?? pendingCategory,
					)}" catalogue?`}
					message="An empty catalogue can be removed. Kits filed under it have to be moved to another catalogue first."
					confirmLabel="Delete catalogue"
					onConfirm={() => {
						const id = pendingCategory
						setPendingCategory(null)
						setError(null)
						deleteCategory.mutate(id, {
							onError: (cause) => fail(cause, 'Could not delete this catalogue.'),
						})
					}}
					onCancel={() => setPendingCategory(null)}
				/>
			) : null}
		</section>
	)
}

/** One kit as it reads in the list. */
function KitRow({
	def,
	owners,
	onEdit,
	onDelete,
}: {
	def: KitDef
	owners: KitOwner[]
	onEdit: () => void
	onDelete: () => void
}) {
	return (
		<div
			data-admin-kit={def.id}
			className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line bg-black/25 px-2.5 py-2"
		>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-[13.5px] font-semibold">{toEnglish(def.label)}</span>
					<code
						data-admin-kit-id
						className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11.5px] text-paper/85"
					>
						{def.id}
					</code>
					<span className={tagClass}>{def.kind}</span>
					{def.appliesTo === 'item' ? (
						<span className={cn(tagClass, 'border-gold/45 text-gold-soft')}>item only</span>
					) : null}
					{/* A kit created here runs the mechanic in `mechanic`, which is worth seeing. */}
					{def.mechanic && def.mechanic !== def.id ? (
						<span data-admin-kit-mechanic-of className={tagClass}>
							{def.mechanic}
						</span>
					) : null}
				</div>
				<p data-admin-kit-params className="m-0 font-mono text-[11.5px] text-muted tabular-nums">
					{def.params.length === 0
						? '—'
						: def.params.map((param) => `${param.key} ${formatParam(param, kitSeed(param, 0))}`).join(' · ')}
				</p>
				<p data-admin-kit-usage className="m-0 text-[11.5px] text-muted">
					{owners.length === 0 ? 'Used by nobody' : `Used by ${describeOwners(owners)}`}
				</p>
			</div>
			<div className="flex flex-wrap items-center gap-1.5">
				<Button
					type="button"
					data-admin-kit-edit={def.id}
					size="sm"
					onClick={onEdit}
				>
					Edit
				</Button>
				<Button
					type="button"
					data-admin-kit-delete={def.id}
					variant="destructive" size="sm"
					title={`Delete ${toEnglish(def.label)} from the whole game`}
					onClick={onDelete}
				>
					<Trash2 /> Delete
				</Button>
			</div>
		</div>
	)
}

/**
 * Edit one kit: its label, its **catalogue** (this is the move), who may carry it, and the starting
 * numbers of every parameter.
 *
 * ⚠️ The mechanic is shown, not editable: it is what the engine runs, and switching it would silently
 * turn one mechanic into another everywhere the kit is already attached.
 */
function KitEditForm({
	def,
	categoryOptions,
	pending,
	onSave,
	onCancel,
}: {
	def: KitDef
	categoryOptions: { value: string; label: string }[]
	pending: boolean
	onSave: (payload: Record<string, unknown>) => void
	onCancel: () => void
}) {
	const [label, setLabel] = useState(def.label)
	const [categoryId, setCategoryId] = useState(def.category)
	const [appliesTo, setAppliesTo] = useState(def.appliesTo)
	const [formError, setFormError] = useState<string | null>(null)
	const [seeds, setSeeds] = useState<Record<string, string[]>>(() => {
		const draft: Record<string, string[]> = {}
		for (const param of def.params) {
			draft[param.key] = [1, 2, 3, 4, 5].map((_unused, index) => String(kitSeed(param, index)))
		}
		return draft
	})

	return (
		<form
			data-admin-kit-form={def.id}
			className="flex flex-col gap-2 rounded-lg border border-gold/40 bg-black/25 p-2.5"
			onSubmit={(event) => {
				event.preventDefault()
				// The boxes hold **strings** (a controlled number input needs that to allow "0."), the
				// payload needs numbers — the server rejects anything else.
				const params: Record<string, number[]> = {}
				for (const param of def.params) {
					const values = (seeds[param.key] ?? []).map((raw) => Number(raw.trim()))
					if (values.length !== 5 || values.some((value) => !Number.isFinite(value))) {
						setFormError(`"${param.key}" needs a number at every star rank.`)
						return
					}
					params[param.key] = values
				}
				setFormError(null)
				onSave({ label, categoryId, appliesTo, params })
			}}
		>
			<div className="flex flex-wrap items-end gap-2">
				<Label htmlFor={`kit-label-${def.id}`} className="min-w-[200px] flex-1 flex-col items-start gap-1">
					Label
					<Input
						id={`kit-label-${def.id}`}
						data-admin-kit-form-label
						value={label}
						maxLength={80}
						onChange={(event) => setLabel(event.target.value)}
					/>
				</Label>
				<Label className="min-w-[180px] flex-1 flex-col items-start gap-1">
					Catalogue
					<OptionPicker
						fieldKey="categoryId"
						value={categoryId}
						options={categoryOptions}
						onChange={setCategoryId}
						data-admin-kit-form-category
					/>
				</Label>
				<Label className="min-w-[140px] flex-col items-start gap-1">
					Who may carry it
					<OptionPicker
						fieldKey="appliesTo"
						value={appliesTo}
						options={[
							{ value: 'both', label: 'Item + Cutie' },
							{ value: 'item', label: 'Item only' },
						]}
						onChange={(value) => setAppliesTo(value as 'both' | 'item')}
						data-admin-kit-form-applies
					/>
				</Label>
			</div>

			{def.params.length > 0 ? (
				<div className="flex flex-col gap-1">
					{def.params.map((param) => (
						<div key={param.key} className="flex flex-wrap items-center gap-1.5">
							<span className="w-[150px] shrink-0 font-mono text-[11.5px] text-muted">{param.key}</span>
							{[1, 2, 3, 4, 5].map((star, index) => (
								<label key={star} className="flex w-[72px] flex-col gap-0.5">
									<span className="text-[10.5px] text-muted">{star}★</span>
									<Input
										type="number"
										step="any"
										data-admin-kit-seed={param.key}
										data-admin-kit-star={star}
										min={param.min}
										max={param.max}
										value={seeds[param.key]?.[index] ?? ''}
										onChange={(event) =>
											setSeeds((current) => {
												const values = [...(current[param.key] ?? ['', '', '', '', ''])]
												values[index] = event.target.value
												return { ...current, [param.key]: values }
											})
										}
									/>
								</label>
							))}
						</div>
					))}
				</div>
			) : null}

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="submit"
					data-admin-kit-form-save={def.id}
					variant="primary" size="sm"
					disabled={pending}
				>
					<Save /> Save
				</Button>
				<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
					<X /> Cancel
				</Button>
				<code className="ml-auto font-mono text-[11.5px] text-muted">
					{def.id} · {def.mechanic ?? def.id} · {def.kind}
				</code>
			</div>
			{formError ? (
				<p data-admin-kit-form-error role="alert" className="m-0 text-[12px] text-danger-soft">
					{formError}
				</p>
			) : null}
		</form>
	)
}

/** A parameter's seed value, with its scale folded in (`duration` is stored in ms, typed in seconds). */
function formatParam(param: KitParamDef, seed: number): string {
	const scale = param.displayScale ?? 1
	const value = seed / scale
	return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}

/** `Bronze Sword - Fire, Melting Ice (items) · Carlotta (Cutie)` — each name counted once. */
function describeOwners(owners: KitOwner[]): string {
	const items = new Set(owners.filter((owner) => owner.kind === 'item').map((owner) => owner.name))
	const cuties = new Set(owners.filter((owner) => owner.kind === 'cutie').map((owner) => owner.name))
	const parts: string[] = []
	if (items.size > 0) parts.push(`${[...items].join(', ')} (${items.size === 1 ? 'item' : 'items'})`)
	if (cuties.size > 0) parts.push(`${[...cuties].join(', ')} (${cuties.size === 1 ? 'Cutie' : 'Cuties'})`)
	return parts.join(' · ')
}

function deleteMessage(label: string, owners: KitOwner[]): string {
	if (owners.length === 0) {
		return `"${toEnglish(label)}" is not attached to anything, so it will simply stop existing in the game.`
	}
	return `"${toEnglish(label)}" will be removed from ${describeOwners(owners)} and will not exist anywhere in the game. The entities stay — only this kit goes.`
}
