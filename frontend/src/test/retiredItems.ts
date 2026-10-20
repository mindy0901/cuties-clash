import { applyContentOverrides } from '../game/content'
import { RETIRED_ITEM_TEMPLATES } from './retiredCatalogue'

/** Every retired template as a **content-overlay payload** — the shape the admin page saves. */
const RETIRED_PAYLOAD: Record<string, Record<string, unknown>> = Object.fromEntries(
	// `wooden-blade` first: the admin page selects the first id in the catalogue, and the test suite
	// treats that selection as "the editor is ready".
	[...RETIRED_ITEM_TEMPLATES].sort((a, b) => (a.id === 'wooden-blade' ? -1 : b.id === 'wooden-blade' ? 1 : 0)).map((template) => {
		const { id, ...fields } = template
		return [id, fields as Record<string, unknown>]
	}),
)

/**
 * Register the retired items (plus any test-specific overrides) as the content overlay.
 *
 * Use it instead of calling `applyContentOverrides` directly in a test: a test that replaced the whole
 * overlay would drop the fixtures it depends on. `afterEach(() => applyContentOverrides(null))` still
 * cleans up as before.
 */
export function installRetiredItems(
	extra: {
		items?: Record<string, Record<string, unknown>>
		cuties?: Record<string, Record<string, unknown>>
		art?: Record<string, string>
	} = {},
): void {
	applyContentOverrides({ ...extra, items: { ...RETIRED_PAYLOAD, ...(extra.items ?? {}) } })
}
