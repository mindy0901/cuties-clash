# Content admin (`/admin`)

Edit **items** and **cuties** for every player from the browser, without touching code or
redeploying. Built-in defaults stay in `game/items.ts` / `game/cuties.ts`; the database only holds
an **overlay** that the client merges on top, so an empty database, a lost network or anonymous
play all keep the game complete.

## Enable it

1. Put the Google email of the account you sign in with into `ADMIN_EMAILS` (comma separated) in
   `.env` at the repo root:

   ```dotenv
   ADMIN_EMAILS=you@example.com
   ```

2. Restart the API (`pnpm dev` inside `backend/`, or `docker compose restart be-dev`).
3. Sign in in the game, then open the **⚙ Admin** button in the top bar, or go to
   `/admin`. The old `/quan-tri` URL still works — it redirects to `/admin` (same for
   `/cua-hang` → `/shop`), so old bookmarks and open tabs keep working.

⚠️ `ADMIN_EMAILS` empty means **nobody** gets in — the page shows a message instead of the
editor. That is deliberate: forgetting to configure it must never open the page to everyone.

## What can be edited

🔴 **The page reads in English, always.** It is a developer tool, so it does not follow the EN/VI toggle:
`AdminContentScreen` / `ArtImportDialog` write English copy and call `toEnglish()` (exported by
`i18n.ts`) for the shared names — kit labels, parameter labels, stat names — which reuses the one
translation table instead of a second copy. Content names (`name`, `blurb`) are data: they show what
the database holds.

**Fields are grouped and ordered by stat.** `FieldDef.group` puts each control under **Identity**,
**Shop**, **Grid**, **Offence**, **Defence**, **Sword Energy**, and `GROUP_ORDER` decides the sequence,
so `attack` sits next to the Sword Energy pair instead of following the payload order. Adding a field
means picking its `group`.

**Controls are shadcn.** `components/ui/input.tsx` (`Input`), `ui/textarea.tsx`, `ui/label.tsx`, plus
the `shadcn/dropdown-menu.tsx` menu for every picker (`OptionPicker`, data attribute
`data-admin-option="<value>"`). ❌ Not a Radix `Select`: it needs pointer-event captures jsdom does not
implement, and this repo has no global test setup to polyfill them — the menu is the same component set
and the tests already click through it. ❌ No bespoke input classes at the call site.

| Kind | Editable | Code only (read-only in the page) |
| --- | --- | --- |
| **Item** | `name`, `cls` (Type: `melee` · `ranged` · `artifact` · `jade` · `accessory` · `armor` · `potion`), `tier`, `quality`, `cost`, `space`, `kits` | `icon` (emoji fallback), `art`. 🔴 **An item has no `attack`**: its kits only multiply the Cutie's numbers, and their rhythm is their own `cooldown` |

⚠️ **The catalogue is admin-owned.** `game/items.ts` ships a skeleton (a couple of weapons) and every
other item is a row created here. Deleting an item in the admin page sets `removed: true` (it leaves the
shop, the enemy pools and the grids but the row stays so it can be restored); deleting the **row** as
well as the template is a code change — the test suite keeps those shapes in
`src/test/retiredCatalogue.ts`. Enemy loadouts read `ENEMY_POOLS` in `game/stages.ts` filtered to
templates that still exist, and fall back to the whole catalogue for that tier when a map's list is
empty, so a stage never spawns a defenceless enemy.
| **Cutie** | `name`, `blurb`, unlock level, health / sword-energy numbers, `attack` (base attack, one value), `kits` (attack kits with their `cooldown` + their on-hit effects) | `icon`, `art`, `skillArt`, `avatar`. The bag grid is **not** a field: it grows by itself — 3 rows, 4 from level 3, 5 from level 5 |

**`kits` is where an item's combat mechanics live — and it is the only place.** An item may carry
**several main (attack) kits** and any number of **option kits**; an item with no attack kit never
swings, so it deals no direct damage. 🔴 **Attack exists only on the Cutie**: an item carries no
`attack` of its own, only multipliers — `basic-attack.multiplier` × the Cutie's `attack` is the hit,
`basic-attack.cooldown` is the weapon's **own Cooldown Time in seconds**, and every other kit number is a
percentage of the owner's attack, max HP or max Sword Energy (see the kit tables). An item has **no
description field**: nothing on the shop card or the detail dialog reads one.

**A Cutie uses the very same kit block** (`CutieDef.attack` + `CutieDef.kits`),
with two differences: its `attack` is **one number** (a Cutie levels up instead of gaining stars) and
its kit boxes hold
**one value per parameter** — the editor writes that value into all five slots. A Cutie is offered the
**attack kits only**: `stats` / `aura` describe an item's tables and `parry` belongs to a weapon.
Removing its `basic-attack` kit means it **never attacks** — that is a legal choice, not a broken row.

### Kits

**Colour of a kit card** — a **main** kit (a card at the item's top level) is drawn with a **red**
border (`border-danger-soft/60`, `[data-admin-kit]`); a **sub-kit** — the charged hit
(`[data-admin-charge-kit]`) and every on-hit effect (`[data-admin-onhit-kit]`) — with a **green** one
(`border-hp/60`). Nothing else is allowed to look like a kit card, so "is this a swing of its own or
part of another one?" is answered by the frame alone. An on-hit effect therefore carries **no group
heading** of its own: the cards and the "Thêm kit con" menu are enough, and the thin divider above them
only appears when a charged hit sits there too.

**Attack kits (main)** — attached to the item itself. Each kit becomes its **own swing**, with its own
damage, cadence and on-hit rolls, so adding a kit never replaces the one already there:

| Kit id | Label | Parameters (one value per star rank) |
| --- | --- | --- |
| `basic-attack` | Đòn đánh cơ bản | **`multiplier` — Hệ số sát thương (Damage multiplier)** on the Cutie's `attack` (default 1), then **`cooldown` — Hồi chiêu (giây, Cooldown Time)** in **seconds**, `0.1` … `60` (default `1.6`): the only rhythm number in the game, and it is absolute. Damage is listed first, cooldown right under it |
| `charge-attack` | Trọng kích nạp (Charged attack) — **sub-kit of `basic-attack`**, ❌ not a card of its own | `seNeed` **% of max Sword Energy** (default 100 = the whole bar) · `multiplier` on the **Cutie's `attack`**. Once the bar holds that much the **next basic attack becomes the charged attack**: it spends it and lands `attack × multiplier`, which **replaces** the basic damage (❌ never added on top). It has **no cooldown of its own** — the basic attack keeps its Cooldown Time |

Neither has a damage of its own: the charged slam is the **same base attack** multiplied, and it has
**no rhythm of its own** — it simply replaces one basic attack.

⚠️ **Every duration is typed in seconds**, never milliseconds: the `Thời gian (giây)` / `Thời gian
đóng băng (giây)` / `Thời gian buff (giây)` boxes show `3` for 3 s and the detail dialog reads `3s`. The
stored number is still milliseconds — the box converts on the way in and out (`displayScale: 1000` in
`game/kits.ts`), so the simulation and every saved row keep their unit.

**On-hit effects** — optional sub-kits that live **inside one attack kit** (`kit.onHit`), because
they only make sense when that attack lands. Trigger chance is a **percentage (0–100)**:

| Kit id | Label | Parameters (one value per star rank) |
| --- | --- | --- |
| `burn-on-hit` | Cháy khi trúng đòn | `chance` % · `duration` (**seconds**) · `value` **% of the owner's attack per second** |
| `poison-on-hit` | Độc khi trúng đòn | `chance` % · `duration` · `value` **% of the owner's attack per second** |
| `slow-on-hit` | Làm chậm khi trúng đòn | `chance` % · `duration` · `value` % slow |
| `freeze-on-hit` | Đóng băng khi trúng đòn | `chance` % · `duration` (seconds). Freezes **one enemy weapon** at random (not the whole side); it never refreshes a weapon that is already frozen while another one is free |
| `lifesteal-on-hit` | Hút máu khi trúng đòn | `chance` % · `percent` of the hit healed |
| `shield-on-hit` | Tạo khiên khi trúng đòn | `chance` % · `amount` **% of the owner's max HP** as armour |
| `sword-energy-on-hit` | Tích Kiếm Thế khi trúng đòn | `chance` % · `amount` **% of the attacker's max bar** |

⚠️ **There is no `scaling` select any more.** The unit belongs to the kit, so a designer cannot make
a burn read the wrong bar: burn / poison are always a **% of the owner's attack per second**, a
shield or a heal is always a **% of the owner's max HP** (resolved when it fires, `scaledValue` in
`battle.ts`), and every Sword Energy amount is a **% of the owner's max bar**.

**Option kits** — optional; they sit at the item's top level beside the attack kits:

| Kit id | Label | Data (one value per star rank) |
| --- | --- | --- |
| `stats` | Chỉ số cộng thêm | **one stat per kit**, chosen from a **shadcn dropdown** on the card, then **one number box per star rank** — ❌ no JSON to hand-write, ❌ no "add a stat" row inside the card. 🔴 A **percentage** stat keeps its sign in the name (`% Giảm sát thương` / `% Damage reduction`, `% Tỉ lệ chí mạng`, `% Hút máu`, `% Tốc độ đánh`) because the picker shows no value beside it; `atk` / `maxHp` / `shield` carry none. Every number is an **amount added straight to the Cutie** (`atk` `30` = +30 attack, `maxHp` `120` = +120 max HP, `critRate` `5` = +5 % critical chance). 🔴 **A second stat is a second kit**: `stats` is repeatable, and a new copy starts on a stat the item does not grant yet. 🔴 **Only the 5★ box needs typing**: the four lower ranks fill themselves at **20 / 40 / 60 / 80 %** of it (`100` → `20 40 60 80 100`, `1` → `0.2 0.4 0.6 0.8 1`); any other rank still edits on its own, so a deliberately flat or curved ladder survives. ⚠️ `seRegen` is refused here — use `sword-energy` |
| `aura` | Hào khí liền kề | the same one-stat card plus a **target** select — `adjacent`, `adjacentWeapon`, `adjacentNonWeapon`, `all`. Each number is likewise added **straight to the neighbours' stats**, and a second stat is again a second kit |
| `parry` | Chấn Đao | number boxes per star: `chance` % to parry an incoming hit · `cost` **% of max Sword Energy** per parry · `power` counter damage as a % of the owner's basic attack. **A parry exists only through this kit** — no pet, stage or stat carries a hidden counter chance, and the strongest `parry` kit on the loadout wins |
| `freeze-haste` | Hỗ trợ Băng · Giảm hồi chiêu | `target` (who gets the buff, see below) · `directions` (bitmask of the ticked sides) · `boost` % temporary **cooldown reduction** · `duration` (seconds). Triggers when the owner applies a freeze |
| `freeze-heal` | Hỗ trợ Băng · Hồi máu | `amount` **% of max HP**: heals the owner when one of its weapons is frozen |
| `freeze-reflect` | Hỗ trợ Băng · Phản đòn | `chance` % · `duration`: when the owner is hit, freezes one enemy weapon at random |
| `slow-strike` | Hòn ngọc Làm chậm | `chance` % · `value` % slower charge · `duration`. Triggered by **any** of the owner's weapon hits, on one random enemy weapon |
| `rage-on-hit` | Hòn ngọc Cuồng nộ · Sát thương | `value` % damage per stack · `maxStacks`. One stack per weapon hit, for **all** weapons |
| `rage-on-heal` | Hòn ngọc Cuồng nộ · Hồi máu | `value` % damage per stack · `maxStacks`. One stack per heal received |
| `armor-on-heal` | Hòn ngọc Giáp khi hồi máu | `amount` **% of max HP** as armour every time the owner is healed |
| `se-drain` | Hòn ngọc Hút Kiếm Thế | `chance` % · `amount` **% of max Sword Energy** removed from the enemy on a weapon hit |
| `heal-haste` | Hòn ngọc Giảm hồi chiêu | `target` · `directions` · `boost` % temporary **cooldown reduction** · `duration`. Same target rule as `freeze-haste`, triggered by a heal received |
| `damage-reduction` | Giảm sát thương nhận vào | `value` % less damage taken (stacks with the `dr` stat) |
| `starting-shield` | Giáp đầu trận | `amount` **% of max HP** as armour at the start of the battle |
| `healing-boost` | Tăng trị liệu nhận vào | `value` % more healing **and** armour gained |
| `regen` | Hồi máu theo giây | `value` % of max HP healed per second |
| `block-chance` | Đỡ đòn (tỉ lệ) | `chance` % to take **half** damage from one direct hit |
| `debuff-heal` | Hồi máu khi dính hiệu ứng xấu | `amount` **% of max HP**: heals the owner when a bad status lands (freeze included) |
| `block-charged` | Đỡ đòn Trọng kích | `seCost` **% of max Sword Energy**: with enough of it the defender negates a **charged** attack completely (no damage, only the block popup) |

**`target`** is a **select** set once for the whole kit — it says **which weapon the buff lands on**:

| Choice | Meaning |
| --- | --- |
| `Theo hướng liền kề` (0) | Only the weapons on the sides ticked in **`directions`** (default: all four) |
| `Ngẫu nhiên` (1) | One random weapon of the owner (melee / ranged / artifact) |

**`directions`** is not a number box: it draws four toggles — **Lên · Xuống · Trái · Phải** — and each
click adds or removes that side. The ticks are stored as one number (`up` 1, `down` 2, `left` 4,
`right` 8; `15` = all four), copied to all five star entries, so the payload stays a table of numbers.
The picker is hidden while `target` is not `Theo hướng liền kề`.

Removing an attack kit removes **its own** on-hit effects with it. On-hit effects are never stored at
the item's top level — the backend rejects that shape.

A kit is **plain data on the template**, interpreted in `game/build.ts`, so the admin page can add
and remove it without engine changes. To add a new kit: add its id to `ItemKitId` (`OnHitKitId` for
an effect, `OptionKitId` for an option) in `game/types.ts`, describe it in `game/kits.ts`
(`KIT_DEFS`, with `kind: 'attack' | 'onHit' | 'option'`), interpret it in `build.ts`, and add the id
to `ATTACK_KIT_IDS` / `ON_HIT_KIT_IDS` / `OPTION_KIT_IDS` in `backend/src/content.ts`. ❌ Do not add a
one-off template field for a new mechanic — add a kit so every item can use it.

### Inputs, field by field

| Field | Control |
| --- | --- |
| `kits` | a **kit list**: every kit draws one card and every id can be attached **once** — except `stats` / `aura`, which are **repeatable because each copy is one stat**. An attack card shows **one number box per star rank** (`1★` … `5★`), its own **DPM** line and its own **＋ Thêm hiệu ứng** menu for on-hit effects (their own number boxes). The **charged attack** is a **sub-block inside the attack card** (blue outline, added from that card's own **＋ Thêm kit con** menu): its `seNeed` / `multiplier` boxes plus a **Sát thương đòn nạp** readout — ❌ it never appears in the item-level **＋ Thêm kit** menu, and never gets a card or a DPM of its own. Option kits `stats` / `aura` are separate cards: a **stat dropdown** + one box per star (❌ no JSON, ❌ no stat rows to add); `parry` uses number boxes like an attack kit. **＋ Thêm kit** offers every kit that is not attached yet (**`stats` / `aura` always stay in the list**); a **✕** removes that one card. **＋ Thêm kit con** (inside an attack card) offers the charged attack plus the on-hit effects |
| the menus themselves | **shadcn/ui `DropdownMenu`** (`components/shadcn/dropdown-menu.tsx`, Radix under the hood), styled with this game's tokens — ❌ no `ui/` folder next to `ui.ts`, no extra icon/animation dependencies |
| `art` flags, emoji | ❌ not in the form: they only declare **which file on disk** to use (`icon` is the emoji fallback for a missing picture). The picture itself is uploaded from this page, so the flags stay in `items.ts`/`pets.ts` |
| `space` | **two number inputs**, `w` (1–4) and `h` (1–5) — ❌ not raw JSON. no class fixes the shape — a jade, an accessory and a potion are sized by their own row |
| `quality` | a **select** with the five labelled bands, next to a swatch of the colour that band gives an item tile |

**Layout**: one card at the top holds the picture and the base fields — picture, **Tải ảnh lên** /
**Xoá ảnh đã tải** and the row of **1★ … 5★** preview buttons on the left, the base fields (name,
type, tier, quality, price, footprint) beside them. Kits come below that card, then the **＋ Thêm
trường** menu and Save, so the identity of the thing is read first and its mechanics second.


The form is seeded from the values **currently in effect** (`getTemplate()` = code + override), while
the payload is compared against the **code only** — so what you see is what players get, and a saved
override is never silently dropped by a later edit of another field.

Kits are edited as **5 values (1★ → 5★)** on an item, and as **one value** on a Cutie (that value is
copied into all five slots, so the stored shape stays the same). Everything is plain data, so the JSON stored in the
database never contains code; `stats` / `aura` are typed as plain numbers and validated by the server.

🔴 **No hint paragraphs.** Every control on this page is used by the admin who wrote it — a label, a `%`
sign, a `title` and the filled-in numbers are the whole explanation (see
[`ARCHITECTURE.md`](ARCHITECTURE.md) §8). ❌ Do not add "type the 5★ box only…" style help text under a
field: it turns the form into a tutorial and breaks the clean look.

**`attack` exists only on the Cutie.** It is a **single** number that grows to **exactly 2×** by level
10 (≈11.1 % per level, `CUTIE_GROWTH_PER_LEVEL = 1 / (MAX_CUTIE_LEVEL - 1)`), and so does its **Kiếm Thế
regen** (`seRegen`, base **5/s**): 5/s at level 1 → 10/s at level 10.
**There is no attack speed anywhere.** The rhythm of a swing is a kit parameter:
`basic-attack.cooldown` — the **Cooldown Time in seconds** (one box per star rank on an item, one box on
a Cutie), `0.1` … `60`, default `1.6`. It is **absolute**, so the number the editor types is exactly the
seconds between two swings on any Cutie. `attackCooldownMs()` is the only place that turns it into
milliseconds.
**An item gets no `attack` box**: its `basic-attack.multiplier` scales the **Cutie's attack** (a sword
at `1` hits for exactly that number).
The charged attack has **no cooldown of its own**: it rides on the basic attack's Cooldown Time.

**DPM** is printed inside each attack kit card: `attack × multiplier × 60 / cooldown`, for every star
rank, recomputed on each keystroke — so a damage/rhythm pair can be judged without starting a battle.
An item without an attack kit has no DPM line; an item's line is read **per point of the Cutie's
attack** (base 1). Adding an attack kit to an item that had no damage seeds `multiplier` with `1` and
`cooldown` with `1.6`, so the new kit can actually hit.

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

## Importing a picture (items and cuties)

The **🖼️ Tải ảnh lên** button next to the current picture opens a cropper
(`react-easy-crop`): **click** the drop zone (or **drop** a file on the dialog, or **paste** with Ctrl+V),
drag to choose the area, scroll or use the slider to zoom, **rotate freely with the slider** (plus ⟲/⟳ 90°
and *Về 0°*), then **Lưu ảnh**. Everything happens **in the browser** — the cropped picture is turned into
a PNG and that PNG, not the original file, is uploaded.

⚠️ **The crop frame is the item's own grid shape**, ❌ not a square: a 1×3 sword is cropped in a tall
1:3 frame and the file comes out **640×1920** (a 2×3 sabre → 1080×1620, a jade → 1080×1080). The tile in
the game is exactly that footprint, so the picture fills it without being squeezed. The stored picture is
**Full HD portrait**: the long side is `ART_LONG_SIDE` = 1920 px and the short side never exceeds
`ART_SHORT_SIDE` = 1080 px, so an uploaded photo keeps its detail and can be re-cropped later. The crop
container is **exactly the frame** (not a wider box) — otherwise the image is scaled to the container and
the crop silently upscales. Zoom out to **0.5×** when the picture is squarer than the frame; an odd
rotation leaves the corners empty, and the dialog says so.

⚠️ **A pet is always cropped square (1:1, 1080×1080)**: its picture lands in two frames — the round avatar
of the preparation room and the tall frame the battle draws — and both draw it with `object-cover`, so the
frame is filled edge to edge instead of showing the corners of a square. That is why the dialog previews
**both** frames for a pet (see *Previewing*).

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
picture stored inside it would vanish the next time someone edited a kit; and **Đặt lại như cũ**
(deleting the override) must not delete an uploaded image.

Removing a picture (🗑️ **Xoá ảnh đã tải**) **deletes the row and its bytes** from `content_art`, so the
entity goes back to its bundled file, then the emoji. Deleting twice is not an error, and nothing
keeps the deleted bytes alive: the URL is dropped from the public overlay, and a later upload gets a
new `?v=` tag. It asks in `ConfirmDialog` first — the crop is lost, so the picture has to be taken
from the original file again.

⚠️ The server only checks that the bytes really are a **PNG from 8 to 1920 px per side, at most
8 MB** — it holds no image processing and no game rules, and it does **not** require a square
picture (the shape follows the item's footprint). A non-PNG arrives as `400 invalid_art`. The
transport limits sit above that (`BODY_LIMIT_BYTES` 12 MB in `app.ts`, `client_max_body_size 12m` in
`nginx.conf`), otherwise a Full-HD upload would die with `save_too_large`/413 before the art check.

### Previewing

The picture is always shown **where it will appear**, never as a bare thumbnail:

- an **item** → the game's own grid tile (`ItemTile`, the single component the bag, the shop and the
  dialog use): real cell size, the quality background, the class border and the star row (the name is
  only in the tile's tooltip). The board is exactly the item's **footprint** (a 2×3 great sabre → a
  2-column × 3-row board, a 1×3 sword → a 1×3 strip), so the preview shows **the weapon and the cells
  it takes — ❌ no empty cells around it**;
- a **pet** → the **round portrait** it appears as (`PetPortrait`, the ring in the middle of the
  preparation room).

A pet picture has **two** destinations and they are both square, so the crop dialog shows **both at
once, live**: the round avatar (`PetPortrait`) and the frame the battle draws
(`AvatarCard`, name label included). Judging a pet crop from one small square is what led to "the
picture does not fit" after saving.

The row of **1★ … 5★** buttons switches the star rank, so you can check that the art still reads
against every star colour. The crop dialog shows the same preview **live** (debounced) before you
save, so a bad crop is caught without uploading anything.

⚠️ The preview draws through the real components on purpose — a look-alike box hides exactly what can
go wrong (a picture that clashes with the quality tint, stars lost against a bright picture, an item
that does not fit its footprint, a square pet crop whose corners show inside the avatar ring).

## Creating and deleting items

The list on the left is the **live** item catalogue (`itemCatalogue()` in `game/items.ts`), not the
code templates: what the page shows here is exactly what the shop can roll.

- **＋ Tạo mới** — type the **name** the player will see (`Kiếm Sắt`); ❌ there is no id to type. The
  **code** is generated from it the way a new account gets a handle: `itemCodeFromName()` strips the
  Vietnamese tones (`Đao Gỗ` → `dao-go`, `Ưng Vũ` → `ung-vu`) and turns gaps into dashes, then
  `uniqueItemCode()` appends `-2`, `-3`… when that code is already taken. The box shows the generated
  code as a preview under the input, **Enter** submits, and a rejected name (empty, over 80 characters)
  is explained right there. The item is created from the smallest possible row — `cls` = `artifact`,
  `tier` 1, `quality` 1, `cost` 1, `space` 1×1 — and everything else (picture, kits) is added from the
  **＋ Thêm kit** menu or by filling the boxes. A new item starts with **no kit**, so it does not attack
  and has no stats until a kit is added. The new row is applied to the overlay **straight away**, so the
  item appears in the list and can be edited without a reload.
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

## The Kits tab

The third tab (`data-admin-tab="kit"`, `components/KitCatalogueScreen.tsx`) is the **catalogue of the
game**: every kit, filed by **what it is for**, never by the entity carrying it (an item and a Cutie
share the same mechanics, so a list split by owner would show `basic-attack` twice and hide the ones
nothing uses). Nothing here is hard-coded: the catalogues are rows (`kit_categories`) and every kit is a
row once it differs from code (`kit_entries`).

Per row: the label, the **kit id** in mono, `kind` (`attack` / `onHit` / `charge` / `option` — how the
engine runs it), **`item only`** when a Cutie may not carry it, the **mechanic** badge on a kit created
here, the **seed values** of its parameters (`multiplier 1 · cooldown 1.6`), and **who carries it**
(`Used by Bronze Sword - Fire (item) · Carlotta, Aemeath, Hsin (Cuties)` / `Used by nobody`). Usage counts
the kit **wherever** it hangs: top level, inside an attack kit's `onHit`, and the `charge` variant.

**Create a kit** — `New kit` opens three controls: **mechanic**, **label**, **catalogue**. 🔴 The
mechanic is a picker, not free text: `build.ts` runs a kit by comparing its **mechanic** with the ones it
knows, so a kit invented from nothing would attach fine and then do nothing. The server names it
`<mechanic>-2`, `-3`… (the plain id belongs to the code kit), and a kit created this way behaves exactly
like its mechanic — the label, the catalogue and the starting numbers are what the new entry owns.

**Edit** — label, **catalogue (this is the move)**, who may carry it, and the starting numbers of every
parameter, per star rank. The **mechanic is not editable**: switching it would turn one mechanic into
another everywhere the kit is already attached, without touching a single instance (`400
mechanic_immutable`).

**Delete** asks first ("… will not exist anywhere in the game. The entities stay — only this kit goes.")
and then does **three** things server-side (`removeKit` in `backend/src/content.ts`):

1. marks the catalogue row `removed` — 🔴 a kit is a **mechanic in code** (`frontend/src/game/kits.ts`),
   so dropping the row would not delete it: the marker is what stops the code copy from coming back on
   the next read, on another device and offline;
2. deletes its `item_kits` / `cutie_kits` rows — the kit leaves every item and Cutie at once;
3. strips it out of the kits that carried it **nested**: the `onHit` entry and the `charge` sub-kit.

The client honours the marker in **`mergeItem` / `mergeCutie`** (`game/content.ts` → `pruneRemovedKits`),
which is the only reason a **code** kit can disappear: a Cutie with no stored row still lists its kits
from `game/cuties.ts`. `kitCatalogue()` is the same list for the add-kit menus, so a deleted kit is not
offered again anywhere.

**Restore** — a code kit comes back by dropping its row (`DELETE …/kit/:id`); a kit created here has no
code to fall back on, so it is un-hidden instead (`PUT … { removed: false }`). The **instances** detached
in step 2/3 stay detached — bring the kit back, then re-attach it from the item / Cutie editor.

**Catalogues** — `New catalogue` creates a heading (its id is a slug of the name), `Rename` changes the
label, `Delete` removes it. ⚠️ A catalogue that still holds kits cannot be deleted (the button is
`disabled` with a title saying so, and the server answers `400 category_in_use` for the rows it can see):
those kits would lose their heading. **Move them first** — that is what the catalogue picker in the edit
form is for.

⚠️ A kit list saved from the editor **cannot resurrect** a deleted kit: it is no longer in the catalogue,
so validation refuses the payload (`400`) instead of writing it back.

### Endpoints

- `GET /api/content` — public content for the game client: `{ items, cuties, kits, art }`.
  `kits` is the **catalogue**: `{ categories: [{ id, label, position }], entries: { id: payload } }`, where a
  payload carries only the fields that differ from code (`mechanic`, `label`, `categoryId`, `appliesTo`,
  `params`, `position`, `removed`).
- `GET /api/admin/content` — the stored rows plus the author (page only).
- `PUT /api/admin/content/:kind/:id` — save one item / Cutie; its kit list is validated against the
  catalogue, so a kit created on the Kits tab can be attached from the item editor.
- `DELETE /api/admin/content/:kind/:id` — delete the row (the entity falls back to the code definition).
- `POST /api/admin/content/kit` — create a kit from a mechanic (`201`).
- `PUT /api/admin/content/kit/:id` — rename it, **move it to another catalogue**, change its audience or
  its starting numbers, or send `{ removed: false }` to bring it back.
- `POST /api/admin/content/kit/:id/remove` — `{ "removed": true }`: delete the kit from the whole game.
- `DELETE /api/admin/content/kit/:id` — drop the catalogue row (back to the code definition).
- `POST` · `PUT` · `DELETE /api/admin/content/kit-category[/:id]` — create, rename / reorder, delete a catalogue.

🔴 **Real tables, not a JSON blob.** `prisma/schema.prisma`:

| Table | Holds |
| --- | --- |
| `items` | one row per item — `name`, `cls`, `tier`, `quality`, `cost`, `space_w`, `space_h`, `art`, `removed`, `updated_at`, `updated_by` |
| `item_kits` | one row per kit of that item — `kit_id`, `position` (draw order), and the JSON tables `params` / `stats` / `aura` / `on_hit` / `charge` |
| `cuties` | one row per Cutie — `name`, `blurb`, `unlock_stage`, `attack`, `max_hp`, `max_se`, `se_regen`, art flags, `kits_synced` |
| `cutie_kits` | one row per kit of that Cutie, same shape as `item_kits` |
| `kit_categories` | the **catalogues** (headings): `id`, `label`, `position` — created, renamed and deleted from the Kits tab; seeded with the five code catalogues |
| `kit_entries` | one row per kit that **differs from code**: `mechanic` (what the engine runs, ❌ never changed after creation), `label`, `category_id`, `applies_to`, `params` (starting numbers per star), `position`, `removed`. A kit **created** on the Kits tab is a row whose id is not in `game/kits.ts` |
| `content_art` | the uploaded PNG bytes, keyed `item:<id>` / `cutie:<id>` |

Why the kit tables stay `Json`: the **keys** of a kit's parameter tables are the kit catalogue
(`frontend/src/game/kits.ts`) — they change with the game, not with the content. Normalising them
would put game rules in SQL and turn every new kit parameter into a migration; the *shape* is still
checked on write (`validateContentPayload`).

⚠️ **`items` columns are NOT NULL, `cuties` columns are nullable** — on purpose. Items live only in the
database (`ITEM_TEMPLATES` is empty on the client), while a Cutie still ships in code because the game
must be playable with no backend at all. For a Cutie a `NULL` column means *keep the code value*, so
the payload only carries the fields the admin really changed.

⚠️ **`cuties.kits_synced`** separates "the admin never touched the kit list" from "the admin removed
every kit". An empty child list means both otherwise, and a Cutie that must **not** attack would
quietly grow its code kit back on the next read.

⚠️ Deleting a row never deletes an uploaded picture: `content_art` is its own table, so a restore or a
field edit cannot lose the art.

⚠️ The `removed` flag survives for the API contract (an old client can hide a row without deleting it),
but the admin page no longer sends it — **Delete** removes the row.

⚠️ The server **validates the shape** of everything it stores (whitelisted keys, types, ranges):
these numbers run inside `simulateBattle` for every player, so a value of the wrong type would
break fights for everyone. It does **not** balance numbers and does **not** contain game rules.

⚠️ A **per-star** field must arrive as an array of **exactly 5 entries** in `1★ → 5★` order — a
shorter array is rejected, otherwise a star rank would silently disappear. `quality` is a whole
number from **1 to 5**.

⚠️ The client sends **only the fields that differ from the code default** for a Cutie (and the whole
row for an item, which has no code default). Sending every field would freeze them, and later code
changes to untouched fields would silently stop working. A per-star field is compared as a **whole
array**, so editing one rank sends all five — the server stores the field as a single array and a
partial one would lose the other ranks.

## Where the overlay is applied

- `game/content.ts` — `applyContentOverrides`, `mergeItem`, `mergeCutie` (defensive: a broken row is
  skipped, never thrown — throwing during render is a blank page), `putLocalOverride` (apply one row
  the editor just saved, so the page does not wait for the refetch), `pruneRemovedKits` / `kitCatalogue`
  (kits deleted from the game, including the ones that come from code).
- 🔴 **A field the page can edit must be handled in `mergeCutie` / `mergeItem`.** The server accepts and
  stores it either way, so a missing branch saves happily and then **never reaches the game** — that is
  exactly what happened to a Cutie's `attackSpeed`: the row held `0.3`, the panel and the fight kept the
  code value `0.625`. Adding an editable field is therefore **two** changes: the `FieldDef` and the merge
  branch (plus a test that reads the merged value back). The reverse case now has a guard too: a stored
  key that no longer exists (the retired `attackSpeed`) is **skipped** by `mergeCutie`, so an old row
  cannot resurrect a field the game stopped reading.
- `itemCatalogue()` is the **live** item list: code templates minus `removed` ones, plus created ones.
  `getTemplate` / `getCutie` return the merged entity; `itemTemplatesUpToTier` and `cutieList` are the
  override-aware lists used by shop rolls, stage enemies and PvP rivals.
- 🔴 **A view reads the merged accessor, never the raw array.** `CUTIES` / `ITEM_TEMPLATES` are the code
  defaults the overlay merges over; a component that renders them shows the value the admin already
  replaced. The Cutie picker did exactly that — `CUTIES.map(…)` for the labels, `getCutie()` for the portrait
  inside the same row — so a renamed Cutie displayed **both** names at once and the whole overlay looked
  fake. Use `cutieList()` / `itemCatalogue()` for a list and `getCutie()` / `getTemplate()` for one entity.
- `ContentSync` fetches on boot; `main.tsx` applies the cached copy **before the first render** so
  the first frame already shows the edited names and prices.

Determinism is untouched: the seed decides rolls, and the lists keep their original order.

## Adding art later

Two ways, and the uploaded one wins:

1. **From the admin page** (no deploy): 🖼️ **Tải ảnh lên** → crop → save. Stored in the database as a
   Full-HD portrait PNG (long side 1920 px) and served from `/api/content/art/…` — see [`ADMIN.md`](./ADMIN.md#importing-a-picture-items-and-cuties).
2. **As a bundled file**: put `public/icons/items/<id>.png` (one per item) and set `art: true`.
   These flags live in code only — the page no longer shows them, because a picture is uploaded and
   cropped there. The extension is always `.png`, so there is no extension field either.

`itemArtSrc()` / `petArtSrc()` return **uploaded → bundled → `null`** (emoji), so a picture can be
replaced or removed at any time without touching code. `avatarArtSrc()` also falls back to the
uploaded pet picture, so the arena shows a new pet image straight away.
