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
| **Item** | `name`, `cls` (Loại), `tier`, `quality`, `cost`, `space`, `damage`, `speed`, `interval`, `passive`, `aura` | `icon` (emoji fallback), `art`, `active`, `onHit` |
| **Pet** | `name`, `blurb`, unlock level, health / sword-energy numbers, `skill`, bag grid per level | `icon`, `art`, `skillArt`, `avatar` |

`active` / `onHit` really are functions and JSON cannot carry a function — they stay in
`game/items.ts`. An item has **no description field**: nothing on the shop card or the detail
dialog reads one, so the five text boxes that used to hold it were removed.

### Inputs, field by field

| Field | Control |
| --- | --- |
| `interval`, `passive`, `aura` | **one control per star rank**, in a row with `1★` … `5★` printed above each: a number input for `interval`, a JSON textarea for `passive`/`aura` |
| `damage` + `speed` | one **Đòn đánh cơ bản** block: the DPM line, the damage boxes and the speed boxes together. **Any** item can add it (＋ chip) or drop it (✕) — dropping a weapon's attack stores `damage: 0` at every rank, so the item stops swinging and reads as a passive piece |
| `interval` on an item that lacks it | hidden; the single **＋ Thêm trường** button lists every optional field that is still missing (Đòn đánh cơ bản · Nhịp hiệu lực), so there is **one** add button, not a chip per field. Picking one seeds it with `10` damage / `0.625` speed / `9000` ms. A **✕** on the field takes it away again |
| the ＋ menu itself | a **shadcn/ui `DropdownMenu`** (`components/shadcn/dropdown-menu.tsx`, Radix under the hood), styled with this game's tokens — ❌ no `ui/` folder next to `ui.ts`, no extra icon/animation dependencies |
| `art` flags, emoji | ❌ not in the form: they only declare **which file on disk** to use (`icon` is the emoji fallback for a missing picture). The picture itself is uploaded from this page, so the flags stay in `items.ts`/`pets.ts` |
| `space` | **two number inputs**, `w` (1–4) and `h` (1–5) — ❌ not raw JSON |
| `quality` | a **select** with the five labelled bands, next to a swatch of the colour that band gives an item tile |

⚠️ Why the chips: armour has no basic attack and a plain weapon has no `interval` for a
self-triggering effect. Five **empty** boxes looked like "this item has an empty value" and invited
edits that meant nothing — an absent field now simply is not there.

The form is seeded from the values **currently in effect** (`getTemplate()` = code + override), while
the payload is compared against the **code only** — so what you see is what players get, and a saved
override is never silently dropped by a later edit of another field.

Per-star fields are edited as **5 values (1★ → 5★)**. In code these are functions
(`damage: (star) => …`); the client rebuilds them from the array, so the JSON stored in the database
never contains code. A single box with comma separated values was replaced by one input per star:
with one box, a missing comma shifted every later rank silently.

**`speed`** is an attack rate in **attacks per second**, not a number of milliseconds: `0.625` — what
the ＋ chip seeds — is one swing every 1.6 s, `1.25` is one every 0.8 s. `swingMs()` turns it into the
interval the battle simulation uses (`round(1000 / speed)`), so a design value stays readable and the
players still see seconds in the detail dialog. `interval` is the cadence of a self-triggering passive
(shield, burn, heal…), in ms, and only an item with an `active` effect has one.

An item that deals damage but declares no `speed` swings at `DEFAULT_SPEED`, never at an interval of 0.

**DPM** is printed above the `damage` boxes: `damage × speed × 60` for every star rank, recomputed on
each keystroke, so a damage/speed pair can be judged without starting a battle. It disappears for an
item with no damage (armour, jewellery).

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
picture stored inside it would vanish the next time someone edited `damage`; and **Đặt lại như cũ**
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

## Creating and deleting items

The list on the left is the **live** item catalogue (`itemCatalogue()` in `game/items.ts`), not the
code templates: what the page shows here is exactly what the shop can roll.

- **＋ Tạo mới** — type a code (`a-z`, `0-9`, `-`), and the item is created from the smallest possible
  row: name = the code, `cls` = `focus`, `tier` 1, `quality` 1, `cost` 1, `space` 1×1. Everything else
  (picture, damage/speed, passive, aura) is added from the **＋ Thêm trường** menu or by filling the
  boxes. A code that already exists in the code or in the overlay is refused. The new row is applied to
  the overlay **straight away**, so the item appears in the list and can be edited without a reload.
- **🗑 Xoá món** — asks first, and what happens depends on where the item lives:
  - a **created** item exists only as an override row → the row is `DELETE`d and the item is gone;
  - a **code** item cannot be deleted here → the row is saved with `removed: true` on top of its
    other fields. The item leaves the catalogue (no shop rolls, no bag, no enemy gear) while the code
    template stays untouched in `game/items.ts`.
- **♻ Hiện lại** — only on a deleted code item: the flag is dropped (a `DELETE` when it carried
  nothing but the flag), and the item is back with every field it had.

⚠️ A deleted code item stays selectable, but its picture panel is hidden — there is no tile to
preview it in and no point uploading art for something nobody can roll. Restore it first.

⚠️ Deleting while playing: a `removed` item disappears from `run.equipped` / `run.inventory` on the
next load — `sanitizeRun` drops unknown template ids, so an old save cannot crash on a deleted item.

## How it is stored (fields)

- `GET /api/content` — public overlay for the game client: `{ items: {id: payload}, pets: {…} }`.
- `GET /api/admin/content` — overridden rows plus the author (page only).
- `PUT /api/admin/content/:kind/:id` — save one entity.
- `DELETE /api/admin/content/:kind/:id` — drop the overlay, i.e. back to the code default.

Table: `content_overrides` (id `item:<templateId>` / `pet:<petId>`, JSON payload). Deleting a row
never deletes content, it only removes the override.

⚠️ An id that is **not** in the code is a created item: its row is the whole item, so deleting the
row deletes the item. That is why the page sends `removed: true` for a code item instead — the code
template has to stay for "Hiện lại" to have something to restore.

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
  skipped, never thrown — throwing during render is a blank page), `putLocalOverride` (apply one row
  the editor just saved, so the page does not wait for the refetch).
- `itemCatalogue()` is the **live** item list: code templates minus `removed` ones, plus created ones.
  `getTemplate` / `getPet` return the merged entity; `itemTemplatesUpToTier` and `petList` are the
  override-aware lists used by shop rolls, stage enemies and PvP rivals.
- `ContentSync` fetches on boot; `main.tsx` applies the cached copy **before the first render** so
  the first frame already shows the edited names and prices.

Determinism is untouched: the seed decides rolls, and the lists keep their original order.

## Adding art later

Two ways, and the uploaded one wins:

1. **From the admin page** (no deploy): 🖼️ **Tải ảnh lên** → crop → save. Stored in the database as a
   512×512 PNG and served from `/api/content/art/…` — see [`ADMIN.md`](./ADMIN.md#importing-a-picture-items-and-pets).
2. **As a bundled file**: put `public/icons/items/<id>.png` (one per item) and set `art: true`.
   These flags live in code only — the page no longer shows them, because a picture is uploaded and
   cropped there. The extension is always `.png`, so there is no extension field either.

`itemArtSrc()` / `petArtSrc()` return **uploaded → bundled → `null`** (emoji), so a picture can be
replaced or removed at any time without touching code. `avatarArtSrc()` also falls back to the
uploaded pet picture, so the arena shows a new pet image straight away.
