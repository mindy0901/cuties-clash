# Testing & verification

> Verification commands live in [`../AGENTS.md`](../AGENTS.md) §2. This file is **all** the testing
> rules, plus the traps that cost real time.

## 0. What to run before ending a session

```bash
pnpm build && pnpm test && pnpm lint && pnpm test:be
```

All four must be green. `pnpm lint` runs for **both** packages.

## 1. Frontend — Vitest

| | |
| --- | --- |
| Game core | `frontend/src/game/__tests__/` — `node` environment |
| UI | `frontend/src/components/__tests__/` — needs `// @vitest-environment jsdom` on the first line |

### Trap 1 — `renderToString` cannot see store state

Zustand v5 returns the **initial state** for `getServerSnapshot`. A component rendered with
`renderToString` always sees an empty store even though the test just called `setState`. ✅ Always use
`render()` from @testing-library.

### Trap 2 — since the router exists, `renderToString(<App/>)` is unusable too

`RouterProvider` needs a router that has been `load()`ed and needs the DOM, otherwise it throws
`Cannot read properties of undefined (reading 'matches')`. Use the helpers in
**`frontend/src/test/router.tsx`**:

| Helper | Kind | Use when |
| --- | --- | --- |
| `renderInRouter(<PrepScreen/>)` | **synchronous** | You only need the component to have `useNavigate`. Grid/drag-and-drop tests use this one so they do **not** have to switch to `async` |
| `await renderApp('/shop')` | **`async`** | Navigation tests — builds the whole real route tree with browser history |

⚠️ Why `renderInRouter` can be synchronous: it uses `RouterContextProvider` (which only needs the
context), while `renderApp` has to go through `RouterProvider` — which **renders nothing on the first
tick** and only matches the route after `router.load()` completes.

### Trap 3 — navigation is an async transition

After the click, `window.location` may change **one tick later**. ✅ Wait for the DOM first, then
check the URL:

```tsx
fireEvent.click(screen.getByText(/Quay về/))
expect(await screen.findByRole('heading', { name: 'Kho đồ' })).toBeTruthy()
expect(window.location.pathname).toBe('/')
```

### Trap 3b — `history.back()` leaks into the **next** test

`renderApp` uses the real jsdom history, and it is shared by every test in a file. A test that calls
`window.history.back()` leaves a queued `popstate`; if the next test creates its router before that
event is delivered, the router is navigated to the **old** entry mid-test and the screen silently
changes (it cost a real debugging session: a `/shop` URL made the top bar disappear and an admin
button "not exist"). ✅ Drain and reset the URL in `beforeEach`, **before** a router exists:

```ts
beforeEach(async () => {
	await new Promise((resolve) => setTimeout(resolve, 5)) // let the old popstate drain
	window.history.replaceState({}, '', '/')
})
```

### Trap 4 — test files cannot use `node:fs`

`tsconfig.app.json` only declares `types: ["vite/client"]`. To check whether a file exists, use
`import.meta.glob('...')` (it runs through Vite) — see `game/__tests__/art.test.ts`.

### Trap 5 — simulating **drag and drop** in jsdom

Drag and drop is **the only** way to move/swap items (clicking an item opens its details), so grid
tests must reproduce the real event sequence (see `components/__tests__/dragAndDrop.test.tsx`):

```tsx
fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 })
fireEvent.pointerMove(button, { clientX: 300, clientY: 300 })   // must exceed 4px to count as a drag
fireEvent.mouseMove(cellOf(slot), { clientX: 0, clientY: 0 })   // pick the target cell
act(() => document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })))  // release
```

- ⚠️ `pointerup` is listened for on **`document`** (the cursor may be over a different panel), ❌ not
  through `fireEvent` ⇒ you **must wrap it in `act`**, otherwise the state has changed but the DOM has
  not re-rendered.
- ⚠️ `fireEvent.click` does **not** pick an item up: it only opens the details dialog. To pick up you
  must drag.
- ⚠️ **jsdom has no layout**: `getBoundingClientRect()` returns all zeros and
  `document.elementFromPoint` does not exist. Consequence: "is the cursor inside Kho đồ"
  (`PrepScreen.trongKho`) is always true for the point `(0,0)` ⇒ you have to define the Kho đồ rect
  yourself (`stubKhoRect`) and then move the cursor (`pointerMove` on `document`) if you want to
  exercise the "drop on the Trang bị grid" branch.
- For pixel-to-cell drag tracking (when the event target is an item, not a background cell), stub
  the grid board's rect and `clientLeft`/`clientTop`; the hit test accounts for the real cell size,
  gaps, padding, and border instead of scaling the outer rectangle.
- ✅ One invariant worth locking down with a test: **the preview block must match the block that was
  placed** (compare `[data-preview]` with `itemCells(item, width)` after the drop). This invariant
  already caught a bug where rotating mid-drag left the old anchor cell behind.

### Trap 6 — no backend is a valid state

UI tests run when the backend does not exist, so `fetch` fails. That is **not** an error: the game
must still be fully playable anonymously. Do not "fix" it by making tests require a backend.

### Trap 6b — item fixtures come from the overlay, not from the shipped catalogue

`game/items.ts` only holds what a fresh install ships, and the admin page owns the rest — so a test
that needs a 2×3 axe, a jewel with a support kit or a parry gem cannot just `createItemInstance(...)` a
template that is no longer in code. Those shapes live in [`src/test/retiredCatalogue.ts`](../frontend/src/test/retiredCatalogue.ts)
and are registered as a **content overlay**:

```ts
import { installRetiredItems } from '../../test/retiredItems'
beforeEach(() => installRetiredItems())          // ids -> templates, like an admin row
```

`installRetiredItems({ items: {...} })` merges a test's own overrides on top, so a test that changes one
kit does not lose the rest. Never call `applyContentOverrides` directly in a file that needs fixtures —
it **replaces** the whole overlay. And never import the fixture module from app code: nothing in it
ships.

### Trap 7 — PNG images read with `?raw`

The first byte of a PNG (`0x89`) is not valid UTF-8, so it is replaced by a replacement character.
Only check the 3 bytes `PNG`.

### Trap 8 — UI tests default to Vietnamese for legacy assertions

The app defaults to English, but `renderInRouter()` and `renderApp()` set Vietnamese by default so
existing UI tests keep their source-language assertions. Pass `'en'` to `renderApp('/', 'en')` when
testing English UI, and cover new source strings in `frontend/src/i18n.ts`. The language preference
is persisted in local storage; language tests should clear `martial-cutie-language` between cases.

### Trap 9 — battle visuals must consume batched events

Playback can cross several simulation events in one interval tick, especially at ×4/×8. Test slash,
impact, and healing feedback with multiple same-time events; checking only the final event can hide
missed combat visuals.

### Trap 10 — a hover card opens **late**, and dies with its tile

`useItemHoverCard` (`components/useItemHover.ts`) waits `HOVER_DELAY_MS = 350` before the card
(`[data-item-hover-card]`) is drawn — the same hook for the shop, the bag and the arena — so a test must
fire `pointerEnter` and then `await waitFor(...)`; ❌ never assert the card synchronously. Leaving the
tile (`pointerLeave`) closes it, and a card is **not armed while an item is being dragged**.
The other half of the same feature: buying **replaces** the cell button with the sold placeholder, so
the old element never fires `pointerleave`; `navigation.test.tsx` therefore asserts that a click leaves
`shop[i].sold === true` **and no card** on screen. When touching either behaviour, keep both assertions.
`components/__tests__/itemHoverCard.test.tsx` covers the bag and the arena.

## 2. Backend — Vitest

```bash
pnpm test:be           # needs PostgreSQL running: docker compose up -d db
```

**A single database, and no traces left behind.** Each case runs inside
`prisma.$transaction(tx => { …; throw sentinel })` and catches the sentinel outside ⇒ rollback.

The condition for this to work: **every DB access goes through the `db` injected into**
`buildApp({ db, config })`. ❌ Importing `PrismaClient` at module scope breaks it — and the tests
will write into the real DB.

- ❌ Do not create a secondary database, ❌ do not use SQLite, ❌ no `migrate reset` / `DROP` /
  truncate.
- ⚠️ `fileParallelism: false` so that two transactions do not block each other on the unique index of
  `users.email`.
- ⚠️ Sequences do **not** roll back (`users_id_seq` keeps increasing with every test run). Harmless.
- ✅ `tests/setup.ts` installs a `fetch` that **throws** ⇒ every network call escaping outward fails
  immediately. OAuth tests replace `fetch` with a stub returning a real `Response`.
- ✅ Test config passes env **explicitly** into `loadConfig`, ❌ do not depend on the machine's `.env`.

### Verifying that user data was not touched

```bash
docker exec martial-cutie-db-1 psql -U martial -d martial_cutie -t -c \
  "SELECT 'users=' || (SELECT count(*) FROM users) || ' saves=' || (SELECT count(*) FROM game_saves);"
```

Compare the numbers **before and after** running the tests. They must be identical.

## 3. Verifying the UI

### ⚠️ The trap that overwrote a real save

`.env` has `AUTO_LOGIN=true`. Opening `http://localhost:5190` in a **separate browser profile**:

```
new profile, no martial-cutie-save
  → the app auto-signs in to the user's account (AUTO_LOGIN)
  → restore() fails to load the server save (no local progress to compare against)
  → AuthSync pushes an EMPTY run
  → OVERWRITES THE REAL SAVE
```

**This happened once.** The real save could only be rescued because localStorage is the primary
source.

### Two safe ways to verify

**A. Automated tests only** (the default choice): `pnpm test` covers 19 files; no browser is opened
and no extra port is added.

**B. An isolated harness** when you really need to look at the UI:

```powershell
cd frontend
$env:VITE_API_TARGET='http://127.0.0.1:9'   # dead port ⇒ every /api call is a 502
pnpm dev --port <a free port>
```

⇒ **Signing in is impossible, nothing can be written to the user's account.** But:

- ⚠️ You must **say up front** which port you are using (5190 belongs to the `fr` container and is not
  available).
- ⚠️ In the harness the UI will show "Không kết nối được máy chủ đăng nhập" — **that is correct
  behaviour**, not a bug.
- ✅ **Stop the server and close the tab as soon as you are done.** A tab pointing at the harness is
  easily mistaken for a broken game.

**C. To verify for real on 5190**: set `AUTO_LOGIN=false` in `.env`, restart `be`, then open it like a
real user.

### Signing in

Open the **Đăng nhập** dialog in the top bar. If the backend has no OAuth keys yet, the dialog shows
instructions for filling in `.env` — correct behaviour. If the backend **cannot be reached**, the
dialog must say "Không kết nối được máy chủ" with a **Thử lại** button (do not confuse the two
situations).

### Backend quick check

```bash
curl http://localhost:8000/api/health      # {"status":"ok","providers":["google"]}
curl -i http://localhost:8000/api/me       # 401 + x-error-code: unauthorized
```

## 4. Verifying Tailwind CSS

A green build does **not** guarantee the classes are right — Tailwind silently skips misspelled
classes.

1. `pnpm build` then read the real CSS in `frontend/dist/assets/*.css`.
2. For every suspicious class, look for the matching selector string.
3. ⚠️ **Do not simulate Tailwind's escaping rules yourself** — it escapes `[`, `]`, `/`, `.`, `:`,
   `(`, `)`, `,` and even `-` inside arbitrary values (`.max-w-\[1400px\]`), and it minifies numbers
   (`0.02em` → `.02em`). A wrong simulation reports a fake "missing class". ✅ The sure way: extract
   the **class names** found in the CSS (strip the backslashes) into a `Set` and look them up there.
4. ❌ Do not write a Vitest test that calls `vite build` to check the CSS — a build inside Vitest
   produces different output from a CLI build. Run `pnpm build` on the CLI and inspect the CSS file.
