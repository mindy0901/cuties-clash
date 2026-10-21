# AGENTS.md — Martial Cutie (Đấu Trường Thú Cưng)

> Instructions for an AI agent working in this repo. Read before changing anything.
>
> ⚠️ This file is **deliberately very short**: it keeps only the rules whose violation causes **loss of
> player data**, **a blank page**, or **a task that costs ten times what it should** (§7). Every other
> convention lives in `docs/` — **look it up in §0 before changing anything, do not guess.** Keep this file
> short when adding content: it is reloaded every session.
>
> Last updated: **2026-10-21**.

## 0. What to read where — look it up before changing anything

| You need to know | Read |
| --- | --- |
| Data flow · save lifecycle · API contract · OAuth flow | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| **UI conventions** (React, state, Tailwind) · **backend rules** | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7–§8 |
| Rules already implemented · Vietnamese terminology · rule → file mapping | [`docs/GAME-RULES.md`](docs/GAME-RULES.md) |
| How to write tests · jsdom/router traps · **how to verify the UI safely** | [`docs/TESTING.md`](docs/TESTING.md) |
| Balancing 60 stages · performance numbers | [`docs/BALANCE.md`](docs/BALANCE.md) |
| Art: sources, licences, rules for adding images | [`docs/ASSETS.md`](docs/ASSETS.md) |
| Google OAuth: getting keys, error table | [`docs/OAUTH-SETUP.md`](docs/OAUTH-SETUP.md) |
| What changed in previous sessions, and why | [`docs/CHANGELOG.md`](docs/CHANGELOG.md) |
| **Porting to a Unity client** (decision, frozen contracts, staged plan) | [`docs/UNITY-PORT.md`](docs/UNITY-PORT.md) |
| Things still worth doing | [`README.md`](README.md) |

## 1. The project

A browser pet-raising auto-battler, inspired by the **Martial Cutie (武林萌主)** event in *NARAKA: BLADEPOINT*.

🔴 **Only re-implement rules from public descriptions, written from scratch.** ❌ Do not copy source code,
images, audio, fonts or text from NetEase.

A **pnpm workspace** with two packages: `frontend/` (React 19 · Vite 8 · TS 6 · TanStack Router + Query ·
Tailwind v4 · Zustand) and `backend/` (Fastify 5 · PostgreSQL · Prisma). Google sign-in — ❌
Facebook was removed, do not add it back. `localStorage` is the **primary source** of progress, the server
is only a copy; **anonymous play without a backend must always work fully**.

## 2. Commands — run from the repo root

```bash
pnpm install

pnpm dev                                                 # game: http://localhost:5190
pnpm build && pnpm test && pnpm lint                     # frontend

docker compose up -d db && pnpm db:migrate && pnpm dev:be # backend: port 8000
pnpm build:be && pnpm test:be                             # backend
```

✅ **Before ending a session all four must be green** —
`pnpm build && pnpm test && pnpm lint && pnpm test:be`.

Three easy ways to fall over:

1. **Port 5190 is held by one of two services**: `fr` (the production image) or `vite` (dev). ❌ Do not run
   both. In Docker there is only **one** mode at a time — whichever one is running is what 5190 reflects
   (see §4.4 about opening a browser).
2. **`pnpm build` runs `vite build` BEFORE `tsc -b`** (deliberately): the TanStack Router plugin generates
   `routeTree.gen.ts` during the Vite build. ❌ Do not swap the order back.
3. **`pnpm-workspace.yaml` must keep the `allowBuilds` block** — pnpm 11 blocks the install scripts of
   Prisma/esbuild; without it every `pnpm install`/`pnpm run` fails with `ERR_PNPM_IGNORED_BUILDS`.
   And `BE_PUBLIC_URL` decides the OAuth redirect URI — changing the port means changing that too **and**
   Google Console.

**Two Docker modes** (after editing code you need to know which mode you are in):

```bash
docker compose up --build -d                        # production: images, does NOT reload by itself
docker compose --profile dev up -d db be-dev vite    # dev: editing code reloads both sides by itself
```

⚠️ In dev mode `nodemon --legacy-watch` and `VITE_USE_POLLING=1` are used: Windows bind mounts do not emit
filesystem events into the container, so a normal watcher (including `tsx watch`) silently does not run.
Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §1.

## 3. Layout

```
frontend/src/  game/ (the game CORE, pure logic) · api/ · store/ · routes/ (one file per screen)
               components/ · test/ (helpers for tests)
frontend/      public/icons/ (art) · Dockerfile + nginx.conf        → image `fr`
backend/src/   config · db · security · oauth · services · deps · errors · baseline
               app.ts (buildApp) · main.ts · routes/{auth,saves}.ts
backend/       prisma/ (schema + migrations) · tests/ · scripts/    → image `be`
```

## 4. Key rules

### 4.1 Determinism (`game/battle.ts`)

`simulateBattle()` must produce identical results for the same seed.

❌ `Math.random()` (use `sim.rng`) · ❌ `Date.now()` / `performance.now()` inside `game/` ·
✅ **the order in which arrays are iterated is part of the contract** (changing the order changes the battle
result) · keep the `'is deterministic for a given seed'` test green.

### 4.2 Layering

Game rules live in `game/`. Components **only display + call store actions** — ❌ they never compute
damage / merge / price themselves. `game/` ❌ does not import React/router/query and does not touch the DOM.
The backend ❌ contains no game rules: it only authenticates identity and stores/reads `RunState` as raw JSON.

🔴 **The word is `Cutie` — never `pet`, in any layer.** It is the product's own word (the UI has said
"Cuties" since the preparation room was built) and it is what the database, the API, the types and the
save fields are named: `CutieDef`, `CUTIES`, `getCutie`, `cutieList`, `run.cutieId`, `run.cuties`,
`run.unlockedCuties`, `CutiePanel`, `public/icons/cuties/`, tables `cuties` / `cutie_kits`,
`ContentKind = 'cutie'` and the art key `cutie:<id>`. `pet` may only survive as a **legacy spelling being
read**: `game/sanitize.ts` and `game/migrate.ts` accept the old `petId` / `pets` / `unlockedPets`.
Renaming a save field is a **migration** (§4.5), not a search-and-replace — a build that reads only the new
name resets a player's Cutie and its level, and save-sync then pushes that reset to the server. That has
happened once.

🔴 **Content is read through the merged accessors, never the raw arrays.** A component asks
`getCutie(id)` / `cutieList()` / `getTemplate(id)` / `itemCatalogue()`; `CUTIES`, `CUTIE_BY_ID`,
`ITEM_TEMPLATES` and `ITEM_BY_ID` are only the **code defaults the admin overlay is merged over**
(`game/content.ts`), so rendering them directly shows names, blurbs, unlock stages and prices the admin
already changed. This has happened: the Cutie picker listed `CUTIES` while the portrait beside it used
`getCutie()`, so one menu showed the old name and the new one at the same time and the overlay looked fake.

### 4.3 Navigation

✅ **The URL is the source of truth** — ❌ the store does not hold `route` (it once did, and the two sources
diverged). Adding a screen = adding a file in `frontend/src/routes/`; ❌ do not edit `routeTree.gen.ts` (it is
generated). The SPA fallback must exist on **both sides** — `frontend/nginx.conf` **and** the `spaFallback`
plugin in `vite.config.ts`; without one of the two, F5 on `/shop` 404s.

### 4.4 Save sync 🔴 this is where data gets lost

The rules live in `frontend/src/api/saveSync.ts` (`pushRun`/`pullRun`); the revision lives in the TanStack
Query cache (`['save']`) — ❌ do not build a second store to hold it.

- ❌ **Never load the server save over yours on conflict.** When `PUT /api/me/save` returns **400
  `revision_conflict`**: `GET` the new revision → `PUT` **your own data** again → retry **exactly once**.
  Overwriting ⇒ loses the change just made *and* conflicts again on the next push.
- ❌ **Do not push on every render** — `pushedRef` compares `JSON.stringify(run)` + a 1.5 s debounce.
  Without that guard ⇒ every successful PUT changes the store → the effect runs again → an **infinite PUT
  loop** (it really happened, logs alternating 200/400).
- `pullRun` writes the revision **BEFORE** writing localStorage + `rehydrate`, and only loads the server
  save when this machine has **no** progress yet (`hasLocalRun()`).
- 🔴 **A run belongs to an account, and the tag says which.** `localStorage` is per **browser**, and
  signing out keeps the run (anonymous play). So `martial-cutie-save-owner` (`u:<users.id>`, absent =
  anonymous play) decides on sign-in: **same account or no tag** ⇒ the local run wins and is pushed;
  **another account's run** ⇒ `pullRun()` loads that account's save (or `newRun()` when it has none) and
  the foreign run is **never** pushed into it. ❌ Never push while `readyRef` is false, and ❌ never tag
  the run before the pull succeeded. `writeLocalRun` must write `GAME_SAVE_VERSION`, never `1` — the
  v1→v2 migration would empty Trang bị.
- 🔴 **Do not open `http://localhost:5190` in a separate browser profile while `AUTO_LOGIN=true`.**
  A new profile has no save ⇒ the app auto-signs in to the user's account ⇒ loading the server save fails ⇒
  **pushes an empty run up, overwriting the real save**. This **has happened once**. Safe ways to verify:
  [`docs/TESTING.md`](docs/TESTING.md).
- 🔴 **Do not probe the write API with a real account** — `PUT /api/me/save` cannot be undone.
- On the backend, the same class of risk: **the DB is always INJECTED** into `buildApp({ db, config })` and
  tests run inside a **rolling-back transaction on a single database**. ❌ Do not use a Prisma client at
  module scope (tests can no longer roll back and **write into the real DB**), ❌ no secondary DB, ❌ no
  SQLite, ❌ no `migrate reset`/`DROP`/truncate.

### 4.5 Saves and the anti blank-page guard 🔴

Every `RunState` read from a save **must** go through `sanitizeRun()` (`game/sanitize.ts`), wired into the
`merge` of the zustand persist — ❌ do not use `persisted.run` directly.

Without this step: a save missing a field ⇒ `render()` throws ⇒ React **shows nothing at all** ⇒ blank page,
and the player has nothing left to click. Adding a field to `RunState` = sanitize + bump `version` +
`migrate`. `AppErrorBoundary` wraps `App` in `main.tsx` — ❌ never leave a blank page.

### 4.6 UI — Tailwind + shadcn only, the hand on everything clickable, and a grid cell is **always 90 px** 🔴

New UI is written with **Tailwind utilities + `components/ui/*`** (shadcn/ui components themed with the
tokens in `styles/app.css`). ❌ Do not add bespoke CSS classes for a component and ❌ do not import a
second UI kit — one design system.

🔴 **Reach for a shadcn component first, for everything.** `Button` · `Card` · `Badge` · `Input` ·
`Label` · `Textarea` · `DropdownMenu` · `ConfirmDialog` already exist; a raw `<button>` / `<input>` /
`<select>` or a hand-made dropdown in new UI is a **bug**. Missing one (dialog, tabs, tooltip, table…)?
Add it the shadcn way into `components/ui/<name>.tsx` (`cva` variants, `data-slot`, `cn()`, `@radix-ui/*`
where the behaviour needs it) — ❌ no shadcn CLI, no network at build time.

🔴 **Colours and shapes come from `@theme` tokens** (`bg-card`, `text-muted-foreground`, `border-border`,
`bg-ink-800`, `text-gold`, `rounded-panel`, `shadow-panel`, `animate-*`…) and everything else is a
Tailwind utility. ❌ No `bg-[#7d2318]`-style arbitrary values, ❌ no inline `style` for colour, ❌ no new
class name in a component — a shared pattern becomes an `@utility`/token in `styles/app.css`, and a rule
**only** the arena uses (the portrait frame, the floating combat number) goes in `styles/battle.css`,
imported from `app.css`. A new look for an existing control is a new **variant** in its `cva`, ❌ never an
inline override. ⚠️ An animation that reads a per-element `--*` variable must be an `@utility`, ❌ not a
`--animate-*` token (a token resolves it on `:root` and silently uses the fallback). Details:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8.

**Every item grid uses `CELL_SIZE = 90`** (`components/GridBoard.tsx`) — Trang bị, Kho đồ, the arena, the
drag preview, the shop's equipment column **and the tile on a shop offer card**. ❌ **Never pass a smaller
`cellSize` to `LoadoutGrid` / `InventoryGrid` / `ItemGridPreview` to make something "fit" a panel**: a
44 px cell silently changes how the board reads (a 1×3 blade looks like a 1×1 stub) and the player can no
longer match what they arranged in the preparation room against what they see elsewhere. A grid that does
not fit its container gets a **wider container** or a **horizontal scroll**, never smaller cells. A shop
card grows to fit its 90 px tile, and the offers grid stretches the row so the buy buttons line up.

🔴 **The preparation room's three panels are one height, and the storage shows a whole 8×8 by default.**
The columns are `items-stretch` and each holds **one `flex-1` panel** (`CutiePanel` /
`CutieLoadoutPanel` take a `className` for this, layout only) — Cuties, Storage and Equipment must end on
the same line. The storage's scroll viewport is `boardHeight(STORAGE_MIN_ROWS)` from
`components/GridBoard.tsx` (= 762 px for 8 rows), ❌ never a hand-picked `max-h-[600px]` that cuts the
last row in half; a stack deeper than 8 rows scrolls inside the panel, ❌ it does not grow the page.
Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8.

🔴 **Actions live in the shared footer; panels hold the cutie, the bag and the equipment.** `ActionBar` renders
**one `<footer>` landmark** (`data-action-bar`, a transparent `flex flex-col gap-2.5`) holding **two panels**,
each with its own `rounded-panel border border-line bg-ink-800/80`: `data-action-bar-panel="modes"` (the four
modes, one equal column each: `Đấu Trường · Phiêu Lưu · Phòng tập · Bảng Xếp Hạng`) and
`data-action-bar-panel="journey"` (`Nhiệm Vụ · Bộ Sưu Tập` — ⚠️ the **fight button and the stage
progress bar live inside the Adventure dialog**, not here). The footer is a
**sibling of the main-content block** in the page column (`PrepScreen` returns panels + `<ActionBar/>`), ❌ never
nested back inside the main-content `div.flex-1` — "main content" is the three panels, nothing else; and ❌ do
not drop the `<footer>` wrapper either ("2 div này nằm chung 1 div footer"). ❌ Do not move a mode into a panel
(asked for: "thuộc footer chung với các button ở dưới"). The **only** buttons inside a panel are the Equipment
floor's **Shop** + **Tháo hết**, because they act on the items right above them.

🔴 **A button is `<Button>`** (`components/ui/button.tsx`, the stock shadcn shape: `rounded-md`, fixed
`h-*`, flat background, ring on focus) with `variant` = `primary` (gold, main action) / `secondary` /
`outline` / `ghost` / `destructive` (filled red) / `link`, `size` = `sm` · `md` · `lg` · `icon` ·
`sm-icon`, and `asChild` for a `<Link>`. ❌ There is no second button in this app: the old `btnClass` /
`btnGoldClass` / `btnSmClass` strings are **gone** (their gradients and `rounded-[10px]` made one page
look like another button family). Need a different look → add a `variant` to `buttonVariants`, ❌ never
inline overrides that re-create the old style.

`cn()` must stay the `clsx` + `tailwind-merge` version (`lib/utils.ts`) so a later utility actually
overrides an earlier one. Hooks for tests are `data-*` attributes, ❌ never a styling class: an assertion
on `className` breaks the moment the look changes.

🔴 **One icon library: Lucide** — the one shadcn/ui ships with and lists first on
<https://www.shadcn.io/icons/libraries>. Take every glyph from `components/icons.tsx` (it re-exports
Lucide and is the **only** file importing `lucide-react` outside `components/shadcn/*`); a new icon is
one more name in that list or a wrapper beside `Gold` / `StarRow`. ❌ No second icon package (Heroicons,
Phosphor, Tabler, Radix Icons…), ❌ no hand-written `<svg>` for a control (map art is not a control), ❌
no Unicode glyph where an icon belongs (`»`, `✓`, `↑`, `★` drawn as a rank are all gone — a glyph
changes shape with the system font and cannot be sized/themed). ❌ Do not import `lucide-react` directly
in a screen. Colour is `currentColor` + a `text-*` token, size is the `1em` default or `size-3`/`size-4`.
Game content emoji (`items.ts`, `cuties.ts`, `labels.ts`) is **not** an icon — it stays
([`docs/ASSETS.md`](docs/ASSETS.md)). Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8.

🔴 **Every clickable thing shows the hand, and it is one rule, not a class per call site.** `styles/app.css`
`@layer base` gives `cursor: pointer` to every button / `select` / `summary` / a `label` wrapping one /
checkbox / file input and every `role="button"` (and menuitem, option, tab, switch, checkbox,
`aria-pressed`); a control that cannot be used gets `not-allowed` (`:disabled`, `aria-disabled`), and a
**non-interactive** board (`LoadoutGrid` `interactive={false}`, a preview) opts out with `cursor-default`.
❌ Never write `cursor-pointer` on a component: it was on a handful of controls and the rest of the app
looked dead — Tailwind v4's preflight leaves a button at the browser default. Details in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8.

🔴 **No instructional hint text in the UI** — the admin is the user. A label, a `%` sign, a `title` and
the filled-in numbers explain a control; ❌ never a paragraph under it ("type the 5★ box only…", "bấm Lưu
để lưu"). Inline text is only for state the data cannot show (an error, a save message). Details in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8.

## 5. Adding a feature — where to change things

| To add | Change | Do not forget |
| --- | --- | --- |
| **An item** | `game/items.ts` (stats) + `game/kits.ts` (mechanics) | art is **one file per item**: `public/icons/items/<id>.png` + `art: true` (❌ never per star rank); `content.test.ts` counts them. A new **mechanic** = a kit, not a new template field |
| **A picture for an item/pet** | admin page → **Tải ảnh lên** (`components/ArtImportDialog.tsx` + `cropImage.ts`) | cropped **in the browser** to the item's own aspect ratio at Full HD (long side 1920 px), stored in Postgres (`content_art`) and served from `/api/content/art/…?v=<upload time>`; the upload is **not** part of the override payload, so editing fields or "Về mặc định" cannot drop it — see [`docs/ADMIN.md`](docs/ADMIN.md) |
| **A Cutie** | `game/cuties.ts` | art in `public/icons/cuties/` + `skills/`; `unlockStage` is currently 20/40 |
| **A stage / map** | `game/stages.ts` | re-run the balance probe ([`docs/BALANCE.md`](docs/BALANCE.md)) |
| **An effect / aura** | `game/stats.ts` + `game/build.ts` | if you add a random branch in `battle.ts` you must add a determinism test |
| **A screen** | a new file in `src/routes/` | `routeTree.gen.ts` is generated; remember the SPA fallback (§4.3) |
| **A dialog / shared UI** | `store/uiStore.ts` + a shadcn component in `components/ui/` | ❌ not `gameStore` (it is persisted); a control is a **shadcn component** (`Button`, `Input`, `DropdownMenu`…), ❌ never a raw `<button>`; an **icon** comes from `components/icons.tsx` (Lucide only — ❌ no second icon package, ❌ no hand-written `<svg>`, ❌ no Unicode glyph like `»`/`✓`/`↑`); for a **confirmation** use `components/ConfirmDialog.tsx` — ❌ never `window.confirm` (drawn by the browser, untranslatable, blocks the page, and Playwright would have to accept a browser dialog instead of clicking a button); the restart confirm is one instance in `__root` reached from both restart buttons |
| **A field in `RunState`** | `types.ts` → `sanitize.ts` → bump `version` → `migrate.ts` | missing `sanitize` ⇒ **blank page** (§4.5) |
| **Feedback when an action is refused** | the UI that owns the action | there is **no toast system** (removed on request — ❌ do not reintroduce `pushToast`/`Toasts`): a refusal leaves `run` untouched and the control says why (red drop outline, `aria-disabled` shop cell, `disabled` **Nâng cấp**/**Đổi danh sách**), and a feature that does not exist yet is a `disabled` button with a `title` — ❌ never a clickable button that does nothing |
| **How items are arranged/stored in Kho đồ** | `game/storage.ts` | Kho đồ is a **free grid** — ❌ do not arrange things for the player; when an item is in the way, **reject** rather than ❌ sliding to another cell; dropping onto a **differently-typed** item is **rejected** too (❌ Kho đồ does not swap, it only merges stars). The **one** exception is the explicit **Sắp xếp** button in the Kho đồ header (`sortStorage()`: strongest first, no gaps) — ❌ never repack on its own; tests `game/__tests__/storage.test.ts` + `components/__tests__/storageGrid.test.tsx` |
| **The drop preview** | `components/GridBoard.tsx` | the preview cells + dashed outline must sit **above the item layer** (`z-10`), ❌ otherwise an item drawn later **covers** the preview; the preview must match the drop result (`blocked` ⇄ `resolveDrop`); the grid must set `select-none` — ❌ otherwise holding the mouse on an empty cell makes the browser **text-select**, and the cursor becomes 🚫 as if that cell could not be used |
| **Drag and drop: cancelling and mouse release** | `useHeldItem.ts` + `PrepScreen.tsx` | `Esc` must cancel **`keoRef` as well** (through `onCancel`), ❌ clearing only `held` means the **next mouse release still places** the item on the last cell the cursor passed over; the rotation orientation is read from `held` **at release time**, not captured when the drag starts |
| **The arena (battle UI)** | `components/BattleScreen.tsx` + `components/AvatarCard.tsx` | reuse **`LoadoutGrid`/`GridBoard`** for both sides (❌ do not build a separate grid); the avatar frame is a **holder** for images added later — see "Pet avatar art" in [`docs/ASSETS.md`](docs/ASSETS.md); playback timing is still `setInterval(TICK_MS)` + `elapsedRef` — ❌ no `requestAnimationFrame` (background tabs get throttled) |
| **Content admin (items/cuties)** | `backend/src/content.ts` + `components/AdminContentScreen.tsx` | overlay only, defaults stay in code; server whitelists keys and sends back **only changed fields**; access via `ADMIN_EMAILS` (empty = nobody) — see [`docs/ADMIN.md`](docs/ADMIN.md) |
| **A kit mechanic** | `game/kits.ts` | mandatory on every def: **`kind`** (how the engine runs it), **`category`** (only the *default* catalogue now — catalogues are data), **`appliesTo`** (`both` / `item`); add the id to the whitelists in `backend/src/content.ts`; a new mechanic is a kit, ❌ never a new template field |
| **Editing the catalogue** (create / rename / move / delete a kit, add a catalogue) | admin page → **Kits** tab, `kit_categories` + `kit_entries` | a kit created there is a new id on top of a **`mechanic`** — 🔴 `build.ts` must branch on `mechanicOf(kit.id)`, ❌ never on `kit.id`, or the new kit does nothing; deleting is a **marker** (`removed`) + detaching everywhere, ❌ never a row delete |
| **An API endpoint** | `backend/src/routes/` | errors go through `ApiError`; add tests in `backend/tests/` |
| **A DB table / column** | `prisma/schema.prisma` + migration | the migration must run on a database that already has tables |

Game rules must **not** live inside a component: `game/` first, `gameStore` next, UI last.

## 6. Cleanup

❌ Do not leave temporary files behind — prefix them with `_` (`_preview.tsx`, `_balance.probe.test.ts`) and
then **delete them in the same session**. ⚠️ If you edit `.gitignore`: **never leave a rule starting with
`_` without an exception** — `_*` also matches `__tests__/` and `routes/__root.tsx`; this **has really
happened** (16 test files + 1 route file vanished from git, and a fresh clone failed to build). Check with
`git status --short --ignored`: only `.env`, `node_modules/` and `dist/` may show up. ❌ Do not commit a real
`.env`; ⚠️ but `frontend/src/routeTree.gen.ts` **must** be committed — it is generated, yet `tsc` needs it.

## 7. Cost — one task, one pass 🔴

This file is reloaded every session, so a rule that must always be obeyed lives here. **A task must cost one
read pass, one edit pass, one verification pass, one reply.** Most of the waste is re-reading and re-running,
not the change itself:

- **Read narrow.** `grep`/`rg` for the symbol → `view` with `view_range`. ❌ Never read a whole file "to be
  safe", and ❌ never re-read a file or a `docs/` page you already saw — it is still in context.
- **Look a thing up once.** §0's table answers most questions; do not re-open a doc to "make sure".
- **Edit in place.** `edit` with the smallest unique `old_str`; batch the edits of one file in one response.
  ❌ No `create` over an existing file, ❌ no rewriting a file to change three lines.
- **Verify twice, not constantly.** Targeted file first
  (`pnpm --filter frontend test src/components/__tests__/<name>.test.tsx`), then the full
  `pnpm build && pnpm test && pnpm lint && pnpm test:be` **once** before the final reply. ❌ Not after every
  edit; ❌ no full build/test run for a `docs/`-only change; ❌ never the same command twice.
- **One browser check per visual change.** `runPlaywrightCode` + `innerText` answers "is it there?"; a
  screenshot only when the question is *layout*. ❌ No screenshot loops and no clicking around to explore.
- **Ask once.** Every related question in **one** `ask_user` form; ❌ no one question per paragraph.
- **Stop when it is green.** No unrequested polish, no "while I'm here" cleanups, no second opinion on a
  decision already made.
- **Reply short.** What changed, in which file, and the check result. ❌ No replay of the diff, ❌ no recap of
  the plan, ❌ no restating these rules.
