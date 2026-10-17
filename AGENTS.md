# AGENTS.md — Martial Cutie (Đấu Trường Thú Cưng)

> Instructions for an AI agent working in this repo. Read before changing anything.
>
> ⚠️ This file is **deliberately very short**: it keeps only the rules whose violation causes **loss of
> player data** or **a blank page**. Every other convention lives in `docs/` — **look it up in §0 before
> changing anything, do not guess.** Keep this file short when adding content: it is reloaded every session.
>
> Last updated: **2026-10-17**.

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

### 4.3 Navigation

✅ **The URL is the source of truth** — ❌ the store does not hold `route` (it once did, and the two sources
diverged). Adding a screen = adding a file in `frontend/src/routes/`; ❌ do not edit `routeTree.gen.ts` (it is
generated). The SPA fallback must exist on **both sides** — `frontend/nginx.conf` **and** the `spaFallback`
plugin in `vite.config.ts`; without one of the two, F5 on `/cua-hang` 404s.

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

## 5. Adding a feature — where to change things

| To add | Change | Do not forget |
| --- | --- | --- |
| **An item** | `game/items.ts` | art `public/icons/items/<id>-<star>.png`; `content.test.ts` counts them |
| **A pet** | `game/pets.ts` | art in `pets/` + `skills/`; `unlockStage` is currently 20/40 |
| **A stage / map** | `game/stages.ts` | re-run the balance probe ([`docs/BALANCE.md`](docs/BALANCE.md)) |
| **An effect / aura** | `game/stats.ts` + `game/build.ts` | if you add a random branch in `battle.ts` you must add a determinism test |
| **A screen** | a new file in `src/routes/` | `routeTree.gen.ts` is generated; remember the SPA fallback (§4.3) |
| **A dialog / shared UI** | `store/uiStore.ts` | ❌ not `gameStore` (it is persisted) |
| **A field in `RunState`** | `types.ts` → `sanitize.ts` → bump `version` → `migrate.ts` | missing `sanitize` ⇒ **blank page** (§4.5) |
| **How items are arranged/stored in Kho đồ** | `game/storage.ts` | Kho đồ is a **free grid** — ❌ do not arrange things for the player; when an item is in the way, **reject** rather than ❌ sliding to another cell; dropping onto a **differently-typed** item is **rejected** too (❌ Kho đồ does not swap, it only merges stars); tests `game/__tests__/storage.test.ts` + `components/__tests__/storageGrid.test.tsx` |
| **The drop preview** | `components/GridBoard.tsx` | the preview cells + dashed outline must sit **above the item layer** (`z-10`), ❌ otherwise an item drawn later **covers** the preview; the preview must match the drop result (`blocked` ⇄ `resolveDrop`); the grid must set `select-none` — ❌ otherwise holding the mouse on an empty cell makes the browser **text-select**, and the cursor becomes 🚫 as if that cell could not be used |
| **Drag and drop: cancelling and mouse release** | `useHeldItem.ts` + `PrepScreen.tsx` | `Esc` must cancel **`keoRef` as well** (through `onCancel`), ❌ clearing only `held` means the **next mouse release still places** the item on the last cell the cursor passed over; the rotation orientation is read from `held` **at release time**, not captured when the drag starts |
| **The arena (battle UI)** | `components/BattleScreen.tsx` + `components/AvatarCard.tsx` | reuse **`LoadoutGrid`/`GridBoard`** for both sides (❌ do not build a separate grid); the avatar frame is a **holder** for images added later — see "Pet avatar art" in [`docs/ASSETS.md`](docs/ASSETS.md); playback timing is still `setInterval(TICK_MS)` + `elapsedRef` — ❌ no `requestAnimationFrame` (background tabs get throttled) |
| **Content admin (items/pets)** | `backend/src/content.ts` + `components/AdminContentScreen.tsx` | overlay only, defaults stay in code; server whitelists keys and sends back **only changed fields**; access via `ADMIN_EMAILS` (empty = nobody) — see [`docs/ADMIN.md`](docs/ADMIN.md) |
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
