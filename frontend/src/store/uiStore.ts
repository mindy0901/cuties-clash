import { create } from 'zustand'
import type { ItemInstance } from '../game/types'

/** The three tabs of `/admin`: the two editable kinds, and the kit catalogue. */
export type AdminTab = 'item' | 'cutie' | 'kit'

/**
 * UI state shared between the top bar and the screens.
 *
 * Why not keep it inside a component: `TopBar` sits in the root layout while the button that
 * opens the stage map lives deep inside `ActionBar` in the preparation room. With the router those
 * two no longer share a parent component to pass props through, so the open/closed state of the
 * dialogs lives here.
 */
interface UiStore {
	mapOpen: boolean
	loginOpen: boolean
	/** `uid` of the item whose **detail dialog** is open; `null` means closed. */
	itemUid: string | null
	/**
	 * The item itself, for a tile that is **not in `run`** — the opponent's gear on the arena.
	 *
	 * ⚠️ WHY: `ItemDetailDialog` normally looks the `uid` up in the player's bag, and that is what
	 * makes it close itself when the item is sold. An enemy item never appears there, so the battle
	 * passes the instance along instead; the bag still wins whenever it has the item.
	 */
	itemPreview: ItemInstance | null
	/**
	 * Whether the **restart confirmation** is open.
	 *
	 * Restarting wipes the run, and the button that starts it lives in two different places (the top
	 * bar and the victory screen), so the state lives here — one dialog instance, one confirmation
	 * message, no way for the two to drift apart.
	 */
	restartOpen: boolean
	/**
	 * Which tab the **content admin page** shows: an entity kind, or the **kit catalogue**.
	 *
	 * ⚠️ WHY IN THE STORE: saving anything bumps `contentVersion`, and `__root` uses it as the `key`
	 * of the content area, so the whole admin page remounts. With local state the panel silently
	 * jumped back to the first item after every save.
	 *
	 * ⚠️ `'kit'` has no `adminId`: a kit is not an entity with a row to edit, the tab shows the whole
	 * catalogue (see `KitCatalogueScreen`).
	 */
	adminKind: AdminTab
	adminId: string
	/**
	 * Bumped every time the **content overlay** changes (loaded, or an admin just saved).
	 *
	 * ⚠️ WHY THIS EXISTS: `getTemplate`/`getCutie` read a module variable in `game/content.ts`, and
	 * React has no idea that variable changed. `__root` uses this number as the `key` of the
	 * content area, so new names and prices show up immediately instead of after a reload.
	 */
	contentVersion: number
	openMap: () => void
	closeMap: () => void
	openLogin: () => void
	closeLogin: () => void
	openItem: (uid: string, preview?: ItemInstance) => void
	closeItem: () => void
	openRestart: () => void
	closeRestart: () => void
	setAdminSelection: (kind: AdminTab, id: string) => void
	bumpContent: () => void
}

export const useUiStore = create<UiStore>()((set) => ({
	mapOpen: false,
	loginOpen: false,
	itemUid: null,
	itemPreview: null,
	restartOpen: false,
	adminKind: 'item',
	adminId: '',
	contentVersion: 0,
	openMap: () => set({ mapOpen: true }),
	closeMap: () => set({ mapOpen: false }),
	openLogin: () => set({ loginOpen: true }),
	closeLogin: () => set({ loginOpen: false }),
	openItem: (uid, preview) => set({ itemUid: uid, itemPreview: preview ?? null }),
	closeItem: () => set({ itemUid: null, itemPreview: null }),
	openRestart: () => set({ restartOpen: true }),
	closeRestart: () => set({ restartOpen: false }),
	setAdminSelection: (adminKind, adminId) => set({ adminKind, adminId }),
	bumpContent: () => set((state) => ({ contentVersion: state.contentVersion + 1 })),
}))
