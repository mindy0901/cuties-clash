# Content admin (`/admin`)

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
   `/admin`. The old `/quan-tri` URL still works — it redirects to `/admin` (same for
   `/cua-hang` → `/shop`), so old bookmarks and open tabs keep working.

⚠️ `ADMIN_EMAILS` empty means **nobody** gets in — the page shows a message instead of the
editor. That is deliberate: forgetting to configure it must never open the page to everyone.

## What can be edited

| Kind | Editable | Code only (read-only in the page) |
| --- | --- | --- |
| **Item** | `name`, `icon`, `cls`, `tier`, `quality`, `cost`, `space`, `art`, `artExt`, `damage`, `attackInterval`, `interval`, `passive`, `aura` | `active`, `onHit` |
| **Pet** | everything: `name`, `icon`, `blurb`, unlock level, health / sword-energy numbers, `skill`, bag grid per level, art flags and extensions | — |

`active` / `onHit` really are functions and JSON cannot carry a function — they stay in
`game/items.ts`. An item has **no description field**: nothing on the shop card or the detail
dialog reads one, so the five text boxes that used to hold it were removed.

### Inputs, field by field

| Field | Control |
| --- | --- |
| `damage`, `attackInterval`, `interval`, `passive`, `aura` | **one control per star rank**, in a row with `1★` … `5★` printed above each: a number input for the numeric ones, a JSON textarea for `passive`/`aura` |
| `art` (one picture per item) | a **có/không select** — the file is `public/icons/items/<id>.<ext>`, ❌ art is not per star rank |
| `space` | **two number inputs**, `w` (1–4) and `h` (1–5) — ❌ not raw JSON |
| `quality` | a **select** with the five labelled bands, next to a swatch of the colour that band gives an item tile |

Per-star fields are edited as **5 values (1★ → 5★)**. In code these are functions
(`damage: (star) => …`); the client rebuilds them from the array, so the JSON stored in the database
never contains code. A single box with comma separated values was replaced by one input per star:
with one box, a missing comma shifted every later rank silently.

**Quality** is a fixed property of the template (❌ independent of the item's star rank) that only
decides the **tile colour**. The star rank uses the **same palette** for the star glyphs, so one
five-step scale covers both:

| Rank / quality | Colour | Token |
| --- | --- | --- |
| 1 | Bạc | `--color-rank-1` |
| 2 | Xanh lá | `--color-rank-2` |
| 3 | Lam | `--color-rank-3` |
| 4 | Tím | `--color-rank-4` |
| 5 | Vàng cam | `--color-rank-5` |

The coloured background follows the item everywhere it is drawn — Trang bị, Kho đồ, the shop list,
the detail dialog and the enemy grid in battle — through the shared `itemTileClass()` in
`src/components/ui.ts`. The palette lives in `@theme` in `src/styles/app.css`.

## Importing a picture (items and pets)

The **🖼️ Tải ảnh lên** button next to the current picture opens a cropper
(`react-easy-crop`): drag to choose the area, scroll or use the slider to zoom, ⟲/⟳ to rotate, then
**Lưu ảnh**. Everything happens **in the browser** — the cropped picture is turned into a PNG and
that PNG, not the original file, is uploaded.

⚠️ **The crop frame is the item's own grid shape**, ❌ not a square: a 1×3 sword is cropped in a tall
1:3 frame and the file comes out **171×512** (a 2×3 sabre → 341×512, a jade → 512×512). The tile in
the game is exactly that footprint, so the picture fills it without being squeezed. `ART_SIZE` (512) is
the **longest** side: every grid cell gets at least 128 px, which stays sharp on a 2× screen — a
smaller size made imported pictures look soft. Zoom out to **0.5×** when the picture is squarer than
the frame. Pets are square cells (`1×1`).

| Piece | Where |
| --- | --- |
| Cropper dialog | `components/ArtImportDialog.tsx` |
| Crop → PNG in the item's shape | `components/cropImage.ts` (`croppedPng`, `artOutputSize`) |
| Storage | **Postgres**, table `content_art` — one row per entity, `bytes` as `bytea` |
| Public read | `GET /api/content/art/:kind/:id?v=<upload time in ms>` |
| Upload / delete | `PUT` / `DELETE /api/admin/content/:kind/:id/art` |

⚠️ **Why the database and not a file on disk:** the container has no writable volume for user
content, so a file would disappear on every rebuild. An icon is a few tens of KB.

⚠️ **Why the tag in the URL:** it is the **upload time in ms** (not an upload counter), so every
upload — including one that replaces a deleted picture — is a *different* URL and the response can be
cached **forever** (`immutable`): players never see a stale picture and never re-download one.

⚠️ It must **not** be a counter: the counter restarts at 1 after "Xoá ảnh đã tải", so a re-upload would
restore an already cached URL and the browser would keep showing the **deleted** picture. That really
happened (an uploaded axe kept showing after it was replaced by a sword), and
`backend/tests/content.spec.ts` now has a regression test for it.

⚠️ The uploaded picture is **separate from the override payload** (it travels in the overlay's
`art` map, not in the per-entity JSON). A payload replaces the whole field set on save, so a
picture stored inside it would vanish the next time someone edited `damage`; and **Về mặc định**
(deleting the override) must not delete an uploaded image.

Removing a picture (🗑️ **Xoá ảnh đã tải**) **deletes the row and its bytes** from `content_art`, so the
entity goes back to its bundled file, then the emoji. Deleting twice is not an error, and nothing
keeps the deleted bytes alive: the URL is dropped from the public overlay, and a later upload gets a
new `?v=` tag. It asks in `ConfirmDialog` first — the crop is lost, so the picture has to be taken
from the original file again.

⚠️ The server only checks that the bytes really are a **PNG from 8 to 512 px per side, at most
2 MB** — it holds no image processing and no game rules, and it does **not** require a square
picture (the shape follows the item's footprint). A non-PNG arrives as `400 invalid_art`.

### Previewing

The picture is always shown **where it will appear**, never as a bare thumbnail:

- an **item** → the game's own grid tile (`ArtPreview` → `LoadoutGrid`): real cell size, the quality
  background, the class border and the star row (the name is only in the tile's tooltip). The board is
  exactly the item's **footprint** (a 2×3 great sabre → a 2-column × 3-row board, a 1×3 sword → a 1×3
  strip), so the preview shows **the weapon and the cells it takes — ❌ no empty cells around it**;
- a **pet** → the square pet cell used by the pet panel (`PetTile`).

The row **Xem ở 1★ … 5★** switches the star rank, so you can check that the art still reads against
every star colour. The crop dialog shows the same preview **live** (debounced) before you save, so a
bad crop is caught without uploading anything.

⚠️ The preview draws through the real components on purpose — a look-alike box hides exactly what can
go wrong (a picture that clashes with the quality tint, stars lost against a bright picture, an item
that does not fit its footprint).

## How it is stored (fields)

- `GET /api/content` — public overlay for the game client: `{ items: {id: payload}, pets: {…} }`.
- `GET /api/admin/content` — overridden rows plus the author (page only).
- `PUT /api/admin/content/:kind/:id` — save one entity.
- `DELETE /api/admin/content/:kind/:id` — drop the overlay, i.e. back to the code default.

Table: `content_overrides` (id `item:<templateId>` / `pet:<petId>`, JSON payload). Deleting a row
never deletes content, it only removes the override.

⚠️ The server **validates the shape** of everything it stores (whitelisted keys, types, ranges):
these numbers run inside `simulateBattle` for every player, so a value of the wrong type would
break fights for everyone. It does **not** balance numbers and does **not** contain game rules.

⚠️ A **per-star** field must arrive as an array of **exactly 5 entries** in `1★ → 5★` order — a
shorter array is rejected, otherwise a star rank would silently disappear. `quality` is a whole
number from **1 to 5**.

⚠️ The client sends **only the fields that differ from the code default**. Sending every field
would freeze them, and later code changes to untouched fields would silently stop working. A
per-star field is compared as a **whole array**, so editing one rank sends all five — the server
stores the field as a single array and a partial one would lose the other ranks.

## Where the overlay is applied

- `game/content.ts` — `applyContentOverrides`, `mergeItem`, `mergePet` (defensive: a broken row is
  skipped, never thrown — throwing during render is a blank page).
- `getTemplate` / `getPet` return the merged entity; `itemTemplatesUpToTier` and `petList` are the
  override-aware lists used by shop rolls, stage enemies and PvP rivals.
- `ContentSync` fetches on boot; `main.tsx` applies the cached copy **before the first render** so
  the first frame already shows the edited names and prices.

Determinism is untouched: the seed decides rolls, and the lists keep their original order.

## Adding art later

Two ways, and the uploaded one wins:

1. **From the admin page** (no deploy): 🖼️ **Tải ảnh lên** → crop → save. Stored in the database as a
   512×512 PNG and served from `/api/content/art/…` — see [`ADMIN.md`](./ADMIN.md#importing-a-picture-items-and-pets).
2. **As a bundled file**: put `public/icons/items/<id>.png` (one per item) and set `art: true`.
   `art`/`artExt`, `skillArt` and `avatar` flags are also editable from the page.

`itemArtSrc()` / `petArtSrc()` return **uploaded → bundled → `null`** (emoji), so a picture can be
replaced or removed at any time without touching code. `avatarArtSrc()` also falls back to the
uploaded pet picture, so the arena shows a new pet image straight away.
