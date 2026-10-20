/**
 * The **live** item catalogue: code templates + admin overlay.
 *
 * What must hold:
 *   * an item created on the admin page reaches the shop/roll pools (not just the editor);
 *   * an item deleted there stops dropping, but the code template is still there to restore from;
 *   * the code catalogue (`ITEM_TEMPLATES`) is never mutated — tests and docs talk about it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installRetiredItems } from '../../test/retiredItems'
import { RETIRED_ITEM_TEMPLATES } from '../../test/retiredCatalogue'

beforeEach(() => installRetiredItems())
import { applyContentOverrides, putLocalOverride } from '../content'
import {
	ITEM_BY_ID,
	getTemplate,
	itemCatalogue,
	itemCodeFromName,
	itemTemplateById,
	itemTemplatesUpToTier,
	uniqueItemCode,
} from '../items'

/** Every test must clear the overlay, otherwise it leaks into the next one (module variable). */
afterEach(() => applyContentOverrides(null))

describe('item catalogue', () => {
	it('is built purely from the stored rows', () => {
		installRetiredItems({ items: { 'wooden-blade': { name: 'Kiếm Gỗ Mới', cost: 7 } } })

		const blade = getTemplate('wooden-blade')
		expect(blade.name).toBe('Kiếm Gỗ Mới')
		expect(blade.cost).toBe(7)
		// Nothing ships in code any more: the catalogue is exactly the stored ids.
		expect(itemCatalogue().map((template) => template.id).sort()).toEqual(
			Object.keys(RETIRED_ITEM_TEMPLATES.reduce<Record<string, true>>((all, template) => {
				all[template.id] = true
				return all
			}, {})).sort(),
		)
	})

	it('generates the code of a new item from its name', () => {
		// The admin types a name, never an id: every Vietnamese letter (including the ones Unicode does
		// not decompose — đ, ơ, ư) is folded to ASCII and the gaps become dashes.
		expect(itemCodeFromName('Kiếm Sắt')).toBe('kiem-sat')
		expect(itemCodeFromName('Đao Gỗ')).toBe('dao-go')
		expect(itemCodeFromName('Ưng Vũ')).toBe('ung-vu')
		expect(itemCodeFromName('  Găng   tay 2  ')).toBe('gang-tay-2')
		expect(itemCodeFromName('Kiếm (cấp 3)')).toBe('kiem-cap-3')
		// Nothing to slug: the caller falls back to `mon`.
		expect(itemCodeFromName('剑')).toBe('')
		expect(uniqueItemCode('剑')).toBe('mon')
	})

	it('never reuses an id that is already taken', () => {
		expect(uniqueItemCode('Kiếm Sắt')).toBe('kiem-sat')
		// `wooden-blade` already exists in the catalogue, so the same name gets the next free code.
		expect(uniqueItemCode('Wooden Blade')).toBe('wooden-blade-2')

		installRetiredItems({ items: { 'kiem-sat': { name: 'Kiếm Sắt' } } })
		expect(uniqueItemCode('Kiếm Sắt')).toBe('kiem-sat-2')
	})

	it('adds an item created on the admin page', () => {
		applyContentOverrides({
			items: { 'kiem-sat': { name: 'Kiếm Sắt', cls: 'melee', tier: 2, cost: 4, space: { w: 1, h: 2 } } },
		})

		const created = itemTemplateById('kiem-sat')
		expect(created?.name).toBe('Kiếm Sắt')
		expect(created?.cls).toBe('melee')
		expect(created?.space).toEqual({ w: 1, h: 2 })
		expect(itemTemplatesUpToTier(2).map((template) => template.id)).toContain('kiem-sat')
		// A created item only exists in the overlay: the code catalogue is untouched.
		expect(ITEM_BY_ID['kiem-sat']).toBeUndefined()
	})

	it('drops an item as soon as its row is gone', () => {
		// Deleting is deleting the row — there is no code template to fall back to.
		installRetiredItems({ items: { 'wooden-blade': { removed: true } } })

		expect(itemTemplateById('wooden-blade')).toBeUndefined()
		expect(itemCatalogue().map((template) => template.id)).not.toContain('wooden-blade')
		expect(itemTemplatesUpToTier(5).map((template) => template.id)).not.toContain('wooden-blade')
		// A bag entry that still holds the id keeps rendering a placeholder, never a blank page.
		expect(getTemplate('wooden-blade').kits).toBeUndefined()
	})

	it('takes a deleted item back as soon as the flag goes away', () => {
		applyContentOverrides({ items: { 'wooden-blade': { removed: true, name: 'Đao Gỗ Cũ' } } })
		expect(itemTemplateById('wooden-blade')).toBeUndefined()

		applyContentOverrides({ items: { 'wooden-blade': { name: 'Đao Gỗ Cũ' } } })
		expect(itemTemplateById('wooden-blade')?.name).toBe('Đao Gỗ Cũ')
	})

	it('applies one row without touching the others', () => {
		applyContentOverrides({ items: { 'wooden-blade': { cost: 3 } } })
		putLocalOverride('item', 'kiem-sat', { name: 'Kiếm Sắt' })
		expect(itemTemplateById('kiem-sat')?.name).toBe('Kiếm Sắt')
		expect(itemTemplateById('wooden-blade')?.cost).toBe(3)

		putLocalOverride('item', 'kiem-sat', null)
		expect(itemTemplateById('kiem-sat')).toBeUndefined()
		expect(itemTemplateById('wooden-blade')?.cost).toBe(3)
	})
})
