# Changelog

What changed, in the order it was done, with the commit that carries it. Entries describe the
**reason** as much as the code — the rules behind a decision are what a later session needs.

Dates are the day the work was committed. Newest session first.

---

## 2026-10-17 — Admin content editor, art pipeline, Lucide icons

A long session on the **content admin page** (`/admin`) and on how pictures reach the screen.
Twenty-seven commits, from `2bc562c` to `44a7124`.

### Admin page — items

| Change | Commit |
| --- | --- |
| Tiles show the **star rank** instead of the item name (the name stays in the tooltip) | `2bc562c` |
| The description field is gone everywhere — nothing read it | `8ea3d23` |
| The art **extension** fields are gone — every picture is a `.png` | `350a0a7` |
| The emoji input, the `art` flags and the "Ảnh tải lên · …" metadata line are gone | `db2c28e` |
| A new item starts from a minimum row; **＋ Tạo mới** creates it, **🗑 Xoá món** removes it | `8f1d822` |
| Deleting a **code** item writes `removed: true` (restorable with **♻ Hiện lại**); deleting a **created** item deletes its row | `8f1d822` |

`itemCatalogue()` is the **live** item list (code − `removed` + created). Shop rolls, `buildCombatant`
and `sanitizeRun` read it, never `ITEM_TEMPLATES`.

### Item model — types, speed, price, DPM

| Change | Commit |
| --- | --- |
| Six item types: `melee`, `ranged`, `focus`, `jewelry`, `armor`, `potion` | `c4daa61` |
| `speed` = attacks per second, `DEFAULT_SPEED = 0.625`; `swingMs = round(1000 / speed)` | `a149a7d`, `154ee8c` |
| **DPM** shown above the damage boxes, live, each rank in its own star colour | `773da2f`, `c8c8ff9` |
| Price per star = `cost × 2^(star-1)` — a rank is worth the copies it is built from | `7095f5a` |
| Upgraded shop offers are gated on **`clearedStage`** (40 → 0.5 % at 2★, 60 → +0.1 % at 3★) | `ddb5ed4` |
| `interval` / `speed` are **optional** fields, added on demand; every optional field is behind one **＋ Thêm trường** menu (shadcn dropdown) | `d757d5d`, `eaafefe` |
| Damage + speed live in one **Đòn đánh cơ bản** block, and any item can lose its attack (stored as `damage: [0,0,0,0,0]`) | `c2a5998`, `4b42aff` |
| **Lưu** and **↺ Đặt lại như cũ** are disabled until something actually changed | `688234e`, `5e3975c` |

### Pictures

| Change | Commit |
| --- | --- |
| **One tile component** (`ItemTile`) draws every item: bag, shop, detail dialog, admin preview | `c3dcf14` |
| Every view **outside** the bag draws the item's **default** footprint — a turned sword still shows upright | `a18b1b4` |
| A pet picture is cropped **1:1** and the cropper previews **both** destinations (round avatar + battle frame) live | `6ed5fb0` |
| The round avatar clips and covers (`object-cover`) instead of showing the corners of a square | `6ed5fb0` |
| The battle card's picture fills the whole card (`flex-1` + `cover`), not the top half | `493a336` |
| Deleting an uploaded picture asks first, and really deletes the row and its bytes | `c6170a5`, `f621387` |

### Battle screen

| Change | Commit |
| --- | --- |
| The skill slots (pet skill + items with an active effect) moved to the **top bar**, beside that side's shield chip | `caf2881`, `44a7124` |
| The avatar card is only the picture frame — no icon row inside it | `493a336`, `44a7124` |

### UI

| Change | Commit |
| --- | --- |
| **Lucide** icons replace emoji for every control (`components/icons.tsx`, `svg.lucide { 1em }`) | `b6dc778` |
| Content emoji stay: item / pet / stage / status glyphs are the picture fallback (`docs/ASSETS.md`) | `b6dc778` |
| Prep room uses three fluid columns (1 : 2 : 1) | `5eaf78a` |

### Rules that came out of this session

- **Item display**: everywhere except the bag boards, an item is drawn in the shape it was **defined
  with** (in code or on the admin page). The bag and the battle use the player's real rotation.
- **Pet art**: one 1:1 crop, two square-ish frames; both are previewed before saving, because judging
  a crop from a single small square is how "the picture does not fit" happened.
- **Deleting** can never blank a page: `buildCombatant` skips a removed template, `sanitizeRun` drops
  it from the save, and `getTemplate` falls back to the code numbers for a stale bag entry.
- **Admin payloads** send only the fields that differ from code, but re-send previously stored
  overrides — the server replaces the whole row on `PUT`.

### Tests added along the way

`src/game/__tests__/catalogue.test.ts` (created/removed items in the live catalogue),
`src/components/__tests__/avatarCard.test.tsx` (art priority, picture fills the frame, no icon row),
`battlePlayback` (skill slots live outside the avatar card), `adminContent` (create/delete/restore,
pet previews, both cropper destinations), `itemDetailDialog` (default shape, resale value).

Suite at the end of the session: **360 frontend tests / 25 files**, `tsc -b`, `oxlint` (three known
warnings), `vite build`, backend `tsc --noEmit` + 106 tests — all green.
