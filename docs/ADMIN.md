# Content admin (`/quan-tri`)

Edit **items** and **pets** for every player from the browser, without touching code or
redeploying. Built-in defaults stay in `game/items.ts` / `game/pets.ts`; the database only holds
an **overlay** that the client merges on top, so an empty database, a lost network or anonymous
play all keep the game complete.

## Enable it

1. Put the Google email of the account you sign in with into `ADMIN_EMAILS` (comma separated) in
   `.env` at the repo root:

   ```dotenv
   ADMIN_EMAILS=you@example.com
   ```

2. Restart the API (`pnpm dev` inside `backend/`, or `docker compose restart be-dev`).
3. Sign in in the game, then open the **⚙ Quản trị** button in the top bar, or go to
   `/quan-tri`.

⚠️ `ADMIN_EMAILS` empty means **nobody** gets in — the page shows a message instead of the
editor. That is deliberate: forgetting to configure it must never open the page to everyone.

## What can be edited

| Kind | Editable | Code only (read-only in the page) |
| --- | --- | --- |
| **Item** | `name`, `icon`, `cls`, `tier`, `cost`, `space`, `stars`, `artExt`, `desc`, `damage`, `attackInterval`, `interval`, `passive`, `aura` | `active`, `onHit` |
| **Pet** | everything: `name`, `icon`, `blurb`, unlock level, health / sword-energy numbers, `skill`, bag grid per level, art flags and extensions | — |

Per-star fields (`damage`, `attackInterval`, `interval`, `passive`, `aura`, `desc`) are edited as
**4 values (1★ → 4★)**: a comma separated list of numbers, or JSON for the structured ones. In
code these are functions (`damage: (star) => …`); the client rebuilds them from the array, so the
JSON stored in the database never contains code.

`active` / `onHit` really are functions and JSON cannot carry a function — they stay in
`game/items.ts`.

## How it is stored

- `GET /api/content` — public overlay for the game client: `{ items: {id: payload}, pets: {…} }`.
- `GET /api/admin/content` — overridden rows plus the author (page only).
- `PUT /api/admin/content/:kind/:id` — save one entity.
- `DELETE /api/admin/content/:kind/:id` — drop the overlay, i.e. back to the code default.

Table: `content_overrides` (id `item:<templateId>` / `pet:<petId>`, JSON payload). Deleting a row
never deletes content, it only removes the override.

⚠️ The server **validates the shape** of everything it stores (whitelisted keys, types, ranges):
these numbers run inside `simulateBattle` for every player, so a value of the wrong type would
break fights for everyone. It does **not** balance numbers and does **not** contain game rules.

⚠️ The client sends **only the fields that differ from the code default**. Sending every field
would freeze them, and later code changes to untouched fields would silently stop working.

## Where the overlay is applied

- `game/content.ts` — `applyContentOverrides`, `mergeItem`, `mergePet` (defensive: a broken row is
  skipped, never thrown — throwing during render is a blank page).
- `getTemplate` / `getPet` return the merged entity; `itemTemplatesUpToTier` and `petList` are the
  override-aware lists used by shop rolls, stage enemies and PvP rivals.
- `ContentSync` fetches on boot; `main.tsx` applies the cached copy **before the first render** so
  the first frame already shows the edited names and prices.

Determinism is untouched: the seed decides rolls, and the lists keep their original order.

## Adding art later

Item and pet art paths are declared in code (`stars`/`art`/`avatar` flags) and can be toggled from
the page; the actual files go under `public/icons/…` — see [`ASSETS.md`](./ASSETS.md).
