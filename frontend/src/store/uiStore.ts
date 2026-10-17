import { create } from 'zustand'

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
	 * Whether the **restart confirmation** is open.
	 *
	 * Restarting wipes the run, and the button that starts it lives in two different places (the top
	 * bar and the victory screen), so the state lives here — one dialog instance, one confirmation
	 * message, no way for the two to drift apart.
	 */
	restartOpen: boolean
	/**
	 * Bumped every time the **content overlay** changes (loaded, or an admin just saved).
	 *
	 * ⚠️ WHY THIS EXISTS: `getTemplate`/`getPet` read a module variable in `game/content.ts`, and
	 * React has no idea that variable changed. `__root` uses this number as the `key` of the
	 * content area, so new names and prices show up immediately instead of after a reload.
	 */
	contentVersion: number
	openMap: () => void
	closeMap: () => void
	openLogin: () => void
	closeLogin: () => void
	openItem: (uid: string) => void
	closeItem: () => void
	openRestart: () => void
	closeRestart: () => void
	bumpContent: () => void
}

export const useUiStore = create<UiStore>()((set) => ({
	mapOpen: false,
	loginOpen: false,
	itemUid: null,
	restartOpen: false,
	contentVersion: 0,
	openMap: () => set({ mapOpen: true }),
	closeMap: () => set({ mapOpen: false }),
	openLogin: () => set({ loginOpen: true }),
	closeLogin: () => set({ loginOpen: false }),
	openItem: (uid) => set({ itemUid: uid }),
	closeItem: () => set({ itemUid: null }),
	openRestart: () => set({ restartOpen: true }),
	closeRestart: () => set({ restartOpen: false }),
	bumpContent: () => set((state) => ({ contentVersion: state.contentVersion + 1 })),
}))
