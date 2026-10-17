/**
 * The **live** item catalogue: code templates + admin overlay.
 *
 * What must hold:
 *   * an item created on the admin page reaches the shop/roll pools (not just the editor);
 *   * an item deleted there stops dropping, but the code template is still there to restore from;
 *   * the code catalogue (`ITEM_TEMPLATES`) is never mutated — tests and docs talk about it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { applyContentOverrides, putLocalOverride } from '../content'
import { ITEM_BY_ID, ITEM_TEMPLATES, getTemplate, itemCatalogue, itemTemplateById, itemTemplatesUpToTier } from '../items'

/** Every test must clear the overlay, otherwise it leaks into the next one (module variable). */
afterEach(() => applyContentOverrides(null))

describe('item catalogue', () => {
	it('is the code templates plus their overrides', () => {
		applyContentOverrides({ items: { 'wooden-blade': { name: 'Kiếm Gỗ Mới', cost: 7 } } })

		const blade = getTemplate('wooden-blade')
		expect(blade.name).toBe('Kiếm Gỗ Mới')
		expect(blade.cost).toBe(7)
		// Same ids, same order — only the edited fields moved.
		expect(itemCatalogue().map((template) => template.id)).toEqual(ITEM_TEMPLATES.map((template) => template.id))
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

	it('drops an item deleted on the admin page', () => {
		applyContentOverrides({ items: { 'wooden-blade': { removed: true } } })

		expect(itemTemplateById('wooden-blade')).toBeUndefined()
		expect(itemCatalogue().map((template) => template.id)).not.toContain('wooden-blade')
		expect(itemTemplatesUpToTier(5).map((template) => template.id)).not.toContain('wooden-blade')
		// The code template is still readable, so the editor can restore the row.
		expect(ITEM_BY_ID['wooden-blade']).toBeDefined()
		// …and a bag entry that still holds the deleted id keeps rendering with the code numbers
		// instead of blanking the page on the first render after the delete.
		expect(getTemplate('wooden-blade').name).toBe(ITEM_BY_ID['wooden-blade']!.name)
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
