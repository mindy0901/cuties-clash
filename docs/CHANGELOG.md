# Changelog

What changed, in the order it was done, with the commit that carries it. Entries describe the
**reason** as much as the code — the rules behind a decision are what a later session needs.

Dates are the day the work was completed. Commit references are included when available.
Newest session first.

---

## 2026-10-20 — The practice-room switch is also reachable from inside the fight

- **Asked**: "tôi muốn bật tắt auto attack của enemy trong training room khi battle" — the
  `Kẻ địch phản đòn` switch only existed on the preparation footer, so a practice session started with the
  wrong setting had to be quit and re-entered.
- `BattleScreen`'s practice bar now carries the same switch (`data-battle-training-attacks`, with its text
  label — the bar has the room, unlike the footer chip) next to **Rời phòng tập** and **Nhật ký trận đấu**.
  It reads `battle.trainingAttacks`, and flipping it **starts a fresh practice session**:
  `setTrainingAttacks(next)` (remembered for the next session too) → `resetPlayback()` →
  `startBattle('training', { attacks: next })`.
- ⚠️ Why a restart and not a live change: `simulateBattle` runs **once**, up front, and `noSwings` is an
  input to it, so the events for the swings simply do not exist in the running log. Editing a simulation
  mid-replay would break the "same seed ⇒ same battle" contract; asking for a new session is the honest
  move and it is exactly what **Tập lại** already does. A practice fight has nothing at stake, so restarting
  costs the player nothing.
- `battlePlayback.test.tsx` grew a test that flips the switch both ways inside the arena and checks the new
  `battle.trainingAttacks`, the store value and the rendered checkbox.

---

## 2026-10-20 — Four modes join the shared footer (Arena · Adventure · Training Room · Leader Board)

- **Asked**: "vẫn còn khoảng trống. thêm vào các button: Arena - Adventure - Training Room - Leader
  Board. các button fit đều khoảng còn trống", then the correction that settled it: "ý tôi là đặt nó nằm
  ở phía dưới div này. thuộc footer chung với các button ở dưới" — the modes belong to the **shared footer
  under the three panels**, not inside the Equipment panel.
- `ActionBar` is now **two rows in one bordered block**:
  - **row 1 — the four modes, `xl:grid-cols-4`** so they split the bar evenly at any width:
    **Đấu Trường** (`startBattle('pvp')` — the rival duel that already existed in the store with a gold
    reward but had **no entry point**), **Phiêu Lưu** (opens the journey map), **Phòng tập** (its "enemy
    fights back" chip moved back inside its own cell), **Bảng Xếp Hạng** (disabled — no ranking exists
    yet, `title` says "sẽ có ở bản sau").
  - **row 2 — the original journey bar**: `Nhiệm Vụ · Bộ Sưu Tập · Bản đồ | Đấu Cutie | tiến trình`,
    still a 3-column grid so the fight button stays exactly centred.
- Then the two rows became **two separate panels**, and were **lifted out of the main-content block**, and
  finally grouped into **one `<footer>`** ("tách 2 section ra khỏi div nằm chung" → "2 div này đang nằm
  chung section main content" → "2 div này nằm chung 1 div footer"). `PrepScreen` returns the panels block
  (`div.flex-1`) and `<ActionBar/>` as two **siblings of the page column**, and `ActionBar` renders a real
  `<footer data-action-bar>` (a transparent `flex flex-col gap-2.5`, a `contentinfo` landmark) holding the two
  panels `data-action-bar-panel="modes"` (58 px) and `data-action-bar-panel="journey"` (66 px), each with its
  own border/background/radius. The page column's own `gap-3.5` spaces main content from the footer and
  `flex-1` on main content pushes the footer down. Measured: main content 98–1090, footer 1104–1238 (10 px
  between its panels), viewport 1252 — the footer stays on the bottom edge.
- The Equipment panel's floor went **back to two buttons** — Shop + Tháo hết, `flex-1 min-h-11`, filling
  the band under the 4×5 board. Six buttons there was the wrong reading: a panel holds the items, the
  footer holds the actions.
- New i18n keys: `'Đấu Trường' → Arena`, `'Phiêu Lưu' → Adventure`, `'Bảng Xếp Hạng' → Leader Board`,
  plus the Arena tooltip. `data-action-bar` is the footer's test hook; `bagLayout.test.tsx` now asserts the
  four mode labels in order, the disabled Leader Board, the pvp battle and the map opening.
- 🔴 Rule written into [`AGENTS.md`](AGENTS.md) §4.6 and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  §8: **actions live in the shared footer**, the only buttons inside a panel are Shop + Tháo hết.

---

## 2026-10-20 — The Shop button moves under the items it sells

- **Asked**: "di chuyển nút shop lên đặt trong section equipment, fit theo chiều ngang. nút unequip all
  cũng vậy nhưng đặt ở dưới nút shop".
- The **Shop** button left the bottom bar and now sits on the **floor of the Trang bị panel**, full width,
  with **Tháo hết** directly under it (both `w-full`, in one `mt-auto flex flex-col gap-2`, so they stay on
  the panel's bottom edge). It is the same red `destructive` button, still with `ChevronRight`, and still
  the **sell drop zone**: the item being sold sits on the board right above it, so "drag down onto Shop"
  is one short movement instead of a trip to the footer.
- `ShopButton` is its own component (`components/ShopButton.tsx`) because it is the only button that both
  navigates **and** is a drop target; `CutieLoadoutPanel` takes `onShopClick` / `shopDropActive` /
  `isDraggingItem` / `onShopHover` and passes them through. `ActionBar` lost the button and those four
  props (it is now just `Nhiệm Vụ · Bộ Sưu Tập · Bản đồ · Đấu Cutie · Phòng tập · tiến trình`), its
  `useNavigate` import and its `ChevronRight` / `ShoppingCart` / `ShopDropTarget` imports.
- **Then the two buttons were grown to fill the dead band** ("phóng to nút shop và unequip để thừa
  spacing trống"): the stack is `mt-auto flex min-h-0 flex-1 flex-col` and each button `flex-1 min-h-11`,
  so they split the ~280 px the 4×5 board leaves instead of sitting as two 36 px strips on the floor —
  measured 135 px each, bottom flush with the panel's padding. Icons went to `size-5` and the Shop label
  to `text-base font-semibold` so the bigger shape still reads as a button.
- ⚠️ `data-shop-drop-target` moved from `"action-bar"` to **`"equipment"`** (`ShopDropTarget` in
  `components/ui.ts`). The attribute — not the component — is what `PrepScreen`'s release handler and
  `ShopScreen`'s sell zone look up, so the drag-to-sell tests kept passing untouched.
- 🔴 Docs corrected: `AGENTS.md` / `docs/ARCHITECTURE.md` §8 now say the bar is `Nhiệm Vụ · Bộ Sưu Tập ·
  Bản đồ · Đấu Cutie · Phòng tập · tiến trình` and the Shop button belongs to the Equipment panel;
  `docs/GAME-RULES.md` no longer claims "there is no second Shop button inside the Trang bị panel" (the
  reverse is true now); `README.md`'s component map follows.

---

## 2026-10-20 — Storage shows its whole 8×8, and the three panels end on one line

- **Asked**: "mặc định show 8x8 cho storage. kéo dài 2 section detail cutie và equipment cho cao ngang
  storage".
- **The storage was already 8 columns × 8 rows of data** (`STORAGE_MIN_ROWS = 8` = 64 cells) — the
  panel just could not show them: the scroll viewport was `max-h-[600px]` while 8 rows of `CELL_SIZE`
  need **762 px**, so the last row and a half sat under a scrollbar. The viewport is now
  `boardHeight(STORAGE_MIN_ROWS)` — a measurement built from `CELL_SIZE`, the board gap, the board
  padding and its 1 px border (`components/GridBoard.tsx`), ❌ not a hand-picked number. A stack deeper
  than 8 rows still scrolls inside the panel.
- **The Cuties and Equipment panels now stretch to the storage's height.** The column row is
  `items-stretch`, but a panel inside a `flex-col` only fills it with `flex-1` — so `CutiePanel` and
  `CutieLoadoutPanel` take a `className` (page layout only) and `PrepScreen` passes `flex-1`. The
  Equipment panel's **Tháo hết** row gets `mt-auto`, so the button stays on the panel's floor instead
  of floating in the middle of the new space.
- Measured on `/`: three panels **834 px** each, board viewport 762 = board 762 (no scrollbar), page
  1118 px = viewport 1118 (still no page scroll, action bar still on the bottom edge).
- 🔴 Rule written into [`AGENTS.md`](AGENTS.md) §4.6 and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
  §8: the three panels are **one height**, the storage viewport is `boardHeight(STORAGE_MIN_ROWS)`,
  and `boardHeight()` must keep counting the 1 px border (2 px short ⇒ a scrollbar on a board that
  fits). `bagLayout.test.tsx` now guards the measurement.

---

## 2026-10-20 — One icon library (Lucide), and the Storage header loses its counter

- **Asked**: "xoá chú thích item - unlimited. đổi icon sort cho hợp lý với
  https://www.shadcn.io/icons/libraries. xoá lib icon cũ. từ giờ chỉ dùng thư viện icon của shadcn cho
  đồng bộ. lưu vào rules và docs luôn dùng icon từ thư viện này".
- **The counter is gone.** `0 món · không giới hạn` sat in the Storage header and said nothing the
  player could act on: the board already grows and scrolls, the Bag-slots row is gone, and "unlimited"
  is a fact about the design, not a state. The header is now `Kho đồ` + the **Sắp xếp** button, and the
  two i18n keys (`'không giới hạn'`, `'Không giới hạn'`) went with it.
- **The Sort icon is `ArrowUpDown`.** The button drew a plain `ArrowDown`, which reads "collapse", not
  "put these in order" — `ArrowUpDown` is the glyph the shadcn tables use for a sort control.
- **Lucide is now stated as the only icon library** — it is what shadcn/ui ships with and the first
  entry on shadcn.io's icon-library page, so ✅ a copied shadcn component and a hand-written control look
  like one design. The leftovers of the old habit are gone with it:
  - `»` on the shop button → `ChevronRight`; `« Quay về` → `ChevronLeft` + `Quay về`; `✓` beside the
    chosen Cutie → `Check`;
  - the picker chevrons in `AdminPickers` / the admin stat picker were `ArrowDown` → `ChevronDown`
    (a down arrow is not a dropdown affordance);
  - the `↑ 2★` badge on a mergeable shop offer → `ArrowUp` + `Star` (it was the last rank drawn as the
    `★` character);
  - `'★'.repeat(star)` in the shop offer card and the shop's odds list → the new **`StarRow`**, which
    draws `n` filled Lucide stars exactly like `ItemTile` does on a board, so a 3★ reads the same
    everywhere. One `Gold`-style helper instead of a text glyph repeated in two screens.
- 🔴 Written into [`AGENTS.md`](AGENTS.md) §4.6 and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §8:
  **one icon library**, `components/icons.tsx` is the only module importing `lucide-react`, ❌ no second
  package, ❌ no hand-written `<svg>` for a control, ❌ no `»`/`✓`/`↑`/`★` glyph where an icon belongs,
  pick by meaning (`ArrowUpDown` for sort, `ChevronDown` for a picker), and **game content emoji is not
  an icon** (it stays, see `docs/ASSETS.md`).
- `components/icons.tsx` now also imports `cn()` so wrappers (`Gold`, `Cost`, `StarRow`) can take a
  `className` without a second style helper.

---

## 2026-10-20 — The next-opponent panel is gone from the preparation room

- **Asked**: "xoá section thừa" — pointing at the **right column's second panel** on `/`: the boss plate
  (`Boss · Zombie · Faceless Swordmaster` / `Stage 60 · 6 items · reward 83`) with an
  `Enemy Health` / `Damage` box underneath.
- Everything in it is already on screen: the **top bar** carries `Stage 60/60 · Stormchant`, the middle
  **Bản đồ** dialog lists every stage with its full enemy stat sheet (name, HP, attack, items, reward), and
  the panel repeated the reward icon a second time. The right column is now **just the Equipment panel**.
- `PrepScreen` lost the `<section>` together with its `StatRow` helper and the now-unused
  `getStage` / `Gold` / `translateEnemyName` / `cn` / `panelClass` / `translate` imports — ❌ no dead code
  left behind. Nothing else used them (the stage dialog keeps its own rows).
- ✅ Same 14 px rhythm, no scroll: the three panels stay top-aligned and the action bar keeps riding the
  bottom edge.

---

## 2026-10-20 — The shop breathes like the home screen

- **Reported**: "sửa lại spacing top bottom cho giống trang home" — the shop alone used `py-10` (40 px
  each side, left over from when it was a scrolling page), so its panel started lower and ended higher
  than the same panel on home. `__root.tsx` now gives the `bare` branch the shared
  `pt-3.5 pb-3.5` (14 px) and keeps `h-[100svh] gap-0`, so **every screen has the same 14 px top/bottom
  rhythm** and the shop still fills the viewport without the page scrolling.

---

## 2026-10-20 — The UI rule: shadcn components, Tailwind tokens, nothing by hand

- **Asked**: "thêm vào rules và docs để các phiên sau nhớ và làm theo. ưu tiên sử dụng tất cả component
  của shadcn, theme của tailwind và css với tailwind khi làm UI".
- `docs/ARCHITECTURE.md` §8 now opens with a **table of which shadcn component to reach for** (`Button` ·
  `Card` · `Badge` · `Input` · `Label` · `Textarea` · `DropdownMenu` · `ConfirmDialog`, and why a picker
  is the Radix **menu** and not `Select`), the recipe for **adding a missing one by hand** (no
  `components.json`/CLI, no network at build time: `components/ui/<name>.tsx`, `cva` variants,
  `data-slot`, `cn()`, `@radix-ui/*` only where the behaviour needs it, colours from the semantic
  tokens), and the "Tailwind only, tokens only" list: ✅ utilities + `@theme` tokens, ❌ arbitrary
  colours (`border-[#7d2318]`), ❌ inline `style` for colour, ❌ new bespoke classes (a shared pattern is
  an `@utility`/token in `styles/app.css`), ❌ dynamic class names, and **`data-*` hooks for tests**
  instead of asserting on `className` — the exact trap this session hit when the buttons changed.
- `AGENTS.md` §4.6 (reloaded every session) carries the short version of the same two rules, plus the
  `Button` rule and the `data-*`-not-class hook rule, so a new session cannot miss it.

---

## 2026-10-20 — Buttons are the real shadcn `Button`

- **Reported**: "bạn đã dùng shadcn component chưa vì tôi thấy button của bạn khác và xấu hơn
  https://ui.shadcn.com/docs/components/base/button" — honest answer: no. `components/ui/button.tsx`
  existed (and `ShopScreen` used it) but every other screen piled up `btnClass` / `btnGoldClass` /
  `btnSmClass` strings: a **gradient**, `rounded-[10px]`, `active:translate-y-px`, `hover:border-white` —
  a button family of its own, nothing like the shadcn one.
- `ui/button.tsx` is now the **stock shadcn shape**, themed with the game tokens only: `rounded-md`, a
  fixed `h-8/h-9/h-10` per `size`, flat `bg-*`, `shadow-xs`, `focus-visible:ring-[3px] ring-ring/50`,
  `disabled:opacity-50`, `[&_svg]:size-4`. Variants: `primary` (gold, main action) · `default` (same) ·
  `secondary` (ink) · `outline` · `ghost` · **`destructive` filled red** · `link`; sizes `sm` · `md` ·
  `lg` · `icon` · `sm-icon`.
- **Migrated the whole app**, not just the page that was reported: `/admin`
  (`AdminContentScreen`, `KitCatalogueScreen`, `ConfirmDialog`, `ArtImportDialog`), the arena
  (`BattleScreen`, `VictoryScreen`), the prep room (`ActionBar`, `CutiePanel`, `CutieLoadoutPanel`,
  `InventoryPanel`, `ItemDetailDialog`, `StageMapDialog`, `AccountChip`, `TopBar`, `LoginDialog`) and the
  shop's drop target. The legacy `btnClass` / `btnGoldClass` / `btnPrimaryClass` / `btnGhostClass` /
  `btnSmClass` / `btnBlockClass` **and `shopButtonClass` are deleted** — one button in the app now.
  `asChild` covers the router `<Link>` (the top bar's "Back to the game" and the login provider rows).
- Verified in the browser (5190): 32 px tabs, 36→40 px actions, 8 px radius, flat red `destructive` and
  flat gold `primary`, no gradient anywhere; shop / map / prep / arena all render. One test asserted the
  old shop-drop classes (`border-danger`) and now checks the pulse + ring. 543 frontend / 128 backend
  green.

---

## 2026-10-20 — The kit catalogue is data: create, rename, **move**, delete

- **Asked**: "thêm schema kit catalogue. tôi có thể tạo, thêm, sửa, xoá. di chuyển kit trong catalog tới
  catalog khác" — until now a kit existed only as a code mechanic plus a "removed" marker, so a designer
  could not file kits the way they think about them.
- **Two real tables** (migration `6_kit_catalogue`, `kit_removals` folded in): `kit_categories` — the
  headings, seeded with the five code ones — and `kit_entries` — one row per kit that differs from code
  (`mechanic`, `label`, `category_id`, `applies_to`, `params`, `position`, `removed`). `GET /api/content`
  publishes `kits: { categories, entries }`; the client merges it into `kitCatalogue()` and registers the
  result, so a created kit resolves through `kitDef()` everywhere.
- 🔴 **A kit is still a mechanic of the engine** (`game/kits.ts` must ship for offline play), so "create"
  means **a new id on top of an existing mechanic** — `<mechanic>-2`, `-3`… — with its own label,
  catalogue and starting numbers. `build.ts` now branches on **`mechanicOf(kit.id)`** instead of the raw
  id: without that a created kit would have attached fine and done nothing at all.
- The Kits tab is an editor: `New kit` (mechanic + label + catalogue), `Edit` (label, **catalogue — the
  move**, audience, per-star default numbers), `Delete` (confirm → detached from every item and Cutie, the
  entry marked `removed`), `Restore`, plus `New catalogue` / `Rename` / `Delete` per heading — a catalogue
  that still holds kits cannot be deleted (disabled with the reason; `400 category_in_use` server-side).
- Validation follows the catalogue (`kitRuntime`), so a created kit is attachable exactly where its
  mechanic is; the mechanic of an existing kit is immutable (`400 mechanic_immutable`), and a stale kit
  list carrying a deleted kit is now **refused** instead of silently trimmed.
- Real bugs caught in the browser: the edit form sent its parameter boxes as **strings** (`400
  params.amount[0] must be a number`), and the container's Prisma client had to be regenerated. Verified
  end to end on 5190 — created "Burn II" (`basic-attack-2`, mechanic badge, offered in the item editor),
  moved a kit into a new catalogue and back, deleted the empty catalogue, then removed every trace
  (`kits.entries` back to `{}`). 543 frontend / 128 backend green.

---

## 2026-10-20 — A page to check every kit, and to delete one from the game

- **Asked**: "cho tôi thêm trang để check tất cả kit và xoá kit nếu cần" — the kit catalogue could only be
  read one item at a time, and a kit could only be taken off **one** entity at a time, from that entity's
  editor.
- **Third tab of `/admin`** (`components/KitCatalogueScreen.tsx`, `data-admin-tab="kit"`): all 30 kits,
  **filed by what they are for** (Attack · Control · Support · Defense · Stats & resources) — never by
  item vs Cutie, because the two share the same mechanics. Each row shows the id, `kind`, `item only`,
  the parameter seed values and **who carries it** (`Used by Bronze Sword - Fire (item) · Carlotta,
  Aemeath, Hsin (Cuties)` / `Used by nobody`), counting the kit wherever it hangs: top level, `onHit`,
  or `charge`.
- **`category` + `appliesTo`** added to every `KitDef` (`game/kits.ts`). `kind` stays the engine's word
  (how it runs); `category` is the designer's word (what it is for) and is now the single taxonomy for
  both this page and the add-kit menu.
- 🔴 **Deleting a kit is not a row delete**: the catalogue is **code** (the game must work with no
  backend), so a deleted row would be handed straight back. `kit_removals` (migration `5_kit_removals`)
  records the id, and `removeKit()` detaches the kit first: its `item_kits` / `cutie_kits` rows go, and
  the `on_hit` / `charge` JSON of the kits that carried it is rewritten without it. The client applies
  the marker in `mergeItem` / `mergeCutie` (`pruneRemovedKits`), which is the only reason a **code** kit
  can disappear, and `kitCatalogue()` keeps it out of the add-kit menus. `DELETE …/kit/:id` restores the
  definition (the detached instances stay detached), and `saveContentOverride()` filters removed ids so
  an old editor draft cannot resurrect one.
- `PUT /api/admin/content/kit/:id` accepts **only** `{ "removed": true }` — `{ removed: false }` is a
  400 instead of a silent delete. 6 backend tests + 4 UI tests + 2 overlay tests; verified in the browser
  at 5190 (5 headings / 30 rows, real usage lines, confirm dialog opens and Cancel sends nothing).
  538 frontend / 123 backend green.

---

## 2026-10-20 — A dropdown can no longer run off the screen

- **Reported**: "drop down list quá dài tràn màn hình" — the admin **Add kit** menu lists every kit in the
  game (22 entries) and `DropdownMenuContent` had no height limit, so on a short window the last items
  were drawn past the bottom edge and were unreachable: the list scrolled nowhere because nothing
  overflowed.
- **Shared fix** in `components/shadcn/dropdown-menu.tsx`: the content caps itself to
  `max-h-[var(--radix-dropdown-menu-content-available-height)]` with `overflow-y-auto` +
  `overscroll-contain`, plus `collisionPadding={8}`. Radix measures the free space only when the CSS asks
  for that variable — without it a menu may flip but never shrink. Every menu in the app inherits this.
- The kit menu is **grouped** as well (`Attack` / `Support / stats`, kit kind order) and widened to
  `min(300px, 100vw - 16px)`, so 22 unlabeled rows no longer have to be read top to bottom to find one.
- Verified in the browser at 5190: at 620 px viewport height the menu flips above the trigger, top 8 px /
  bottom 492 px, `scrolls: true`, 22 items in 3 labeled groups. 532 frontend / 117 backend green.

---

## 2026-10-20 — The admin's item list gives the name the whole row

- **Reported**: "div quá nhỏ che tên của item" — the entry button in the left list was one line with the
  name and the item's type side by side (`Beginer's Bow` + `Ranged weapon` in a 210 px row), so a long
  name was cut to `Beginer's ...`: the one thing that tells two entries apart lost to a label that only
  says what kind of thing it is.
- **Two lines now**: the **name** takes the full width (`truncate` + `title`, so nothing is ever hidden
  without a tooltip) and the type sits under it, one size smaller and muted. The sidebar column grew
  `240px → 268px` to match. A deleted entry follows the same shape with its `deleted` tag underneath.
- Verified in the browser at 5190: every name reads in full (`Bronze Sword - Fire`, `Beginer's Bow`,
  `The Icy Vow`) with its type below. 532 frontend / 117 backend green.

---

## 2026-10-20 — `pet` is dead, long live **Cutie** (and the save survived the rename)

- **Reported**: "đã thống nhất là dùng cutie thay cho pet rồi mà? bạn không đọc doc hay là docs thiếu?" —
  both: the rule existed only in the UI (every string says *Cuties*), was written down nowhere, and the
  new schema had just been created with `pets` / `pet_kits` / `pet_id`.
- **Renamed in every layer** — 705 identifiers across 52 files plus the database:
  - code: `CutieDef`, `CUTIES`, `CUTIE_BY_ID`, `getCutie`, `cutieList`, `cutieLevelStats`, `cutieBag`,
    `cutieUpgradeCost`, `cutieOwnerStats`, `cutieArtSrc`, `cutieOverride`, `mergeCutie`, `selectCutie`,
    `upgradeCutie`, `MAX_CUTIE_LEVEL`, `CUTIE_SKILL_SLOTS`, `CUTIE_GROWTH_PER_LEVEL`;
  - files: `game/pets.ts` → `game/cuties.ts`, `PetPanel` / `PetTile` / `PetPortrait` /
    `PetLoadoutPanel` → `CutiePanel` / `CutieTile` / `CutiePortrait` / `CutieLoadoutPanel`,
    `public/icons/pets/` → `public/icons/cuties/` (`git mv`, so the art is not lost);
  - data: `RunState.cutieId` / `cuties` / `unlockedCuties`, `ContentKind = 'cutie'`, payload key
    `cuties`, routes `/api/admin/content/cutie/:id`, art key `cutie:<id>`, tables `cuties` /
    `cutie_kits` / `cutie_id`;
  - migration `4_cutie_naming` copies a database created with the old names over and drops the legacy
    tables (a fresh database never sees them — migration 3 now creates the final names).
- 🔴 **The rename cost a save, and that is now guarded.** A build that had the new field names but not yet
  the legacy reader hydrated the open page from `pets`, wrote `cuties: { 'fire-pup': 1 }`, and save-sync
  pushed that reset to the server (Carlotta fell from level 10 to 1). The values were restored from the
  screen's own history (level 10/10, all three Cuties unlocked at `clearedStage 60`) and pushed back;
  `game/sanitize.ts` now reads **both** spellings, `migrateV2ToV3` renames the three fields (persist
  version **3**), and two regression tests pin it down (`sanitize.test.ts`, `migrate.test.ts`) — a save
  that still says `petId` keeps its Cutie, its level and its unlocks.
- **The rule is now written down** so it cannot drift again: `AGENTS.md` §4.2 (🔴 the word, and that a
  field rename is a migration) and `GAME-RULES.md` §5 (terminology).

---

## 2026-10-20 — Items and Cuties get a real schema (the JSON blob is gone)

- **Reported**: "tôi không thấy bạn thiết kế schema cho cuties và item?" — correct: both entities lived
  in `content_overrides(id 'item:wooden-blade', kind, payload TEXT)`, one **JSON string** per entity. No
  column for `name`/`tier`/`cost`/`space`/`attack`/`max_hp`, no kit table, no FK: `select count(*) from
  items where tier = 3` was impossible and a kit was a string inside a string.
- **`prisma/schema.prisma` now has** `items` / `item_kits` and `cuties` / `cutie_kits` (`content_art` stays,
  it already held the PNG bytes):
  - `items` — `name`, `icon`, `cls`, `tier`, `quality`, `cost`, `space_w`, `space_h`, `art`, `removed`,
    `created_at`, `updated_at`, `updated_by`;
  - `item_kits` / `cutie_kits` — `kit_id`, `position`, plus `params` / `stats` / `aura` / `on_hit` /
    `charge` as JSON tables, `ON DELETE CASCADE` from the parent;
  - `cuties` — `name`, `blurb`, `unlock_stage`, `attack`, `max_hp`, `max_se`, `se_regen`, the art flags and
    `kits_synced`.
- **Why the kit tables stay JSON**: the *keys* of a kit's parameter tables are the kit catalogue
  (`game/kits.ts`). Normalising them would put game rules in SQL and make every new kit parameter a
  migration; `validateContentPayload` still checks the shape on write. The chosen option was "tables for
  the entity, JSON for the kit tables", not "one `kit_param_value` row per star".
- **`items` NOT NULL vs `cuties` nullable**: items exist only in the database (`ITEM_TEMPLATES` is empty),
  while a Cutie still ships in code because the game must be playable with **no backend at all** — so a
  `NULL` pet column means "keep the code value" and the payload only carries what the admin changed.
- **`cuties.kits_synced`**: an empty kit list is a legal choice ("this Cutie never swings") and would
  otherwise be indistinguishable from "no override", so `mergePet`'s old behaviour was reproduced exactly.
- **Migration `3_content_tables`** creates the tables, copies the 9 rows, **drops the dead keys**
  (`item.attack`, kit `speed`, pet `attackSpeed`) and drops `content_overrides`. Idempotent, because
  `AUTO_CREATE_TABLES=true` runs it on every startup.
- **The API did not change**: `GET /api/content` still returns `{ items: {id: payload}, pets, art }`, so
  the client is untouched — verified end-to-end by re-saving the same item and Cutie through the real API
  and reading back byte-identical payloads.
- Two new backend tests pin the schema down: an item's columns are queryable and its kits cascade on
  delete; a Cutie with every kit removed stays that way (`kits_synced`) and a column the payload never
  mentioned stays `NULL`. 529 frontend / 117 backend green.

---

## 2026-10-20 — A renamed Cutie reaches every list (the overlay is not a coat of paint)

- **Reported**: "tôi đổi tên cuties nhưng ui vẫn hiển thị tên cũ. có thật là data đã thống nhất và phụ
  thuộc hoàn toàn vào backend chưa hay bạn đang lừa tôi?"
- **The lie, found and killed**: `PetPanel`'s Cutie picker built its menu from **`PETS.map(…)`** — the code
  array — while the portrait inside each row went through `getPet()`, which merges the admin overlay. With
  `spirit-cat` renamed to *Hsin* the menu read `Linh Miêu` next to an image whose alt text said `Hsin`:
  both names on one line. `VictoryScreen` listed unlocked Cuties the same way.
- Fix: both use **`petList()`**. The data really is DB-first — `GET /api/content` had the new names the
  whole time (`fire-pup: Carlotta`, `white-rabbit: Aemeath`, `spirit-cat: Hsin`) and `getPet` merges on
  **every call** with no cache — but a view that reads the raw array never sees it.
- Guarded by a test: `petPanel.test.tsx` renames two Cuties through `applyContentOverrides` and asserts the
  picker lists the saved names **and none of the code defaults**. Documented as a rule in `AGENTS.md` §4.2
  and [`ADMIN.md`](ADMIN.md): a view reads `getPet()` / `petList()` / `getTemplate()` / `itemCatalogue()`,
  ❌ never `PETS` / `ITEM_TEMPLATES`, which are only what the overlay is merged *over*.
- Deliberate exceptions, unchanged: the **admin page** reads the code arrays to diff the form against the
  defaults, and `sanitizeRun()` runs before the overlay is applied, so it validates ids against code.

---

## 2026-10-20 — The UI stops explaining itself

- **Asked for**: "xoá các chú thích thừa" — pointing at `<p>No effect yet — the hit only deals damage.</p>`
  in a kit card, then "dọn đi" for the two player-facing ones offered afterwards.
- **Deleted, all of them on the admin page** (the rule from `AGENTS.md` §4.6, finally applied): the intro
  paragraph under the title ("Changes here affect every player. Only fields that differ…"), the empty
  hit card's *No effect yet*, both empty kit boxes' *This item has no kit…* / *This cutie has no kit…*,
  the deleted-item *restore it first* sentence (the whole art row is simply hidden now, instead of
  leaving a box with a sentence in it), the *click to toggle a side* line beside the direction buttons,
  and the *Drag to choose the region, scroll to zoom…* half of the upload dialog's paragraph — the file
  still says what size it is saved at, which is the only number there that is data.
- **Deleted on the player side too**: the item dialog's *Only items in Equipment are active — storage
  items do not count* sentence (the storage grid is visibly a different board) and the journey map's
  *Power is a guide only and does not restrict entry* (the Enter button already shows whether the stage
  can be played).
- **Kept**: the loading line, the `no admin rights` message, the entry counters, save/delete results and
  the crop warning for an odd rotation — those are state, not explanation. A `label`, a `title` and the
  filled-in numbers are the whole story of a control.
- Tests that asserted the removed sentences now assert what the UI actually shows (no kit cards in an
  empty box), and the dead `i18n.ts` keys went with them — including the long shop tutorial paragraph
  nothing rendered any more. 528 frontend / 115 backend green.

---

## 2026-10-20 — Every clickable control shows the hand (one CSS rule, not a class per button)

- **Asked for**: "thêm luật: khi hover trên button hoặc các clickable thì phải là mouse pointer. thêm luật
  và chỉnh sửa ngay app."
- 🔴 **The bug: Tailwind v4's preflight leaves a `button` at the browser default (`cursor: default`)**, so
  almost the whole app looked dead — only a handful of call sites had ever been given a
  `cursor-pointer` class (`ActionBar`, `InventoryGrid`, the art drop zone…), which is exactly how a
  convention rots: the two controls someone happened to touch got the hand, the other forty did not.
- **One rule in `styles/app.css` `@layer base`**: `cursor: pointer` for every `button`, `select`,
  `summary`, checkbox / radio / range / file input, any `label` that **wraps** one of those, and every
  `role="button" | "menuitem" | "menuitemcheckbox" | "option" | "tab" | "switch" | "checkbox"` or
  `aria-pressed` element. The whole list is wrapped in `:where()`, so the block has **zero specificity**:
  the `not-allowed` rule (`:disabled`, `[aria-disabled="true"]`) always wins over it, and a `cursor-*`
  utility at a call site still wins over both.
- **The deliberate exceptions**, both written into the code:
  - a **non-interactive board** keeps the arrow — `LoadoutGrid` now says
    `interactive ? 'cursor-pointer' : 'cursor-default'`, so the admin art preview and a shop-card tile do
    not promise a click they cannot deliver;
  - a **label on a text box** keeps the arrow (the box itself shows the text caret) — `label:has(input)`
    was the first attempt and turned `Name` / `Base price` into hands;
  - a dialog's dimmed backdrop stays `auto`: it is a scrim, not a control.
- **Cleanup**: the now-redundant `cursor-pointer` / `cursor-help` classes were deleted from
  `ActionBar`, `AppErrorBoundary`, `InventoryGrid`, `ArtImportDialog`, `ShopScreen` (the ⓘ drop-rate
  button used to show a `?`) and the shadcn menu item, so there is one place to look.
- Verified in the real browser (jsdom cannot see CSS): 27 of 28 enabled buttons read `pointer`, the one
  exception being the non-interactive preview tile; `button[disabled]` reads `not-allowed`; a text box
  reads `text`; the dialog overlay reads `auto`. Rule written down in `AGENTS.md` §4.6 and
  [`ARCHITECTURE.md`](ARCHITECTURE.md) §8.

---

## 2026-10-20 — Speed is gone; every item and skill owns a **Cooldown Time**

- **Asked for**: "sửa lại cơ chế tính speed. xoá hẳn speed khỏi game. từ giờ mỗi item và kĩ năng (ko
  phải bị động) đều có Cooldown Time. tôi chỉ cần edit cooldown time là được — đơn giản hơn."
- 🔴 **One rhythm number, and it is absolute.** Every kit with `kind: 'attack'` now carries
  **`cooldown` in seconds** (one value per star rank on an item, one value on a Cutie) and
  `build.ts` turns it straight into `CombatItem.interval` through `attackCooldownMs()`. The old model —
  a cutie-wide `PetDef.attackSpeed` *plus* a per-kit `speed` **delta** added to it — is deleted from
  `types.ts`, the admin page, the backend whitelist and every doc. `1.6` means "a swing every 1.6 s" on
  any Cutie, at any level, and nothing has to be added to anything.
- **Why it is simpler**: two numbers could disagree (the panel printed `0.30/s` while the fight used
  `0.625`), a delta meant a weapon read differently on every Cutie, and "make this blade heavier" needed
  arithmetic the editor could not see. Now the editor types the seconds between two swings and the face
  of every item, of the shop card, of the detail dialog and of the Cuties panel prints exactly that.
- **Clamped, never 0**: `kitValue()` holds the parameter inside `0.1` … `60`, so an interval can never be
  `0` — a 0 ms swing would fire on every single tick of the simulation. The default is `1.6`.
- **Speed effects became cooldown modifiers.** The `haste` stat is now **`cdr` — Giảm hồi chiêu**
  (`StatKey`, `StatusKey`, labels, icon ⏱️), `freeze-haste` / `heal-haste` are **Giảm hồi chiêu** gems
  and their `boost` % is a temporary cooldown reduction (still "highest wins", never a stack).
  `battle.ts` reads a weapon's cooldown as
  `cooldownFactor = clamp(1 + (slow − cdr)/100, 0.25)` and the per-tick factor is
  `(1 + slow/100) / (cooldownFactor × (1 − buff/100))`, still clamped to `0.1 … 10`, so a slowed weapon
  takes longer and a buffed one sweeps sooner. The battle log now says
  `N vũ khí giảm hồi chiêu X%` instead of `tăng tốc charge`.
- **Removed**: `PetDef.attackSpeed`, `DEFAULT_SPEED` / `swingMs()` (replaced by `DEFAULT_COOLDOWN` /
  `cooldownMs()`), `attackKitInterval()` (→ `attackCooldownMs()`), `HasteBuff` (→ `CooldownBuff`),
  `Combatant.haste` (→ `Combatant.cdr`), the admin's `attackSpeed` field, and the same key from
  `backend/src/content.ts`'s whitelist. A stored row that still carries `attackSpeed` is **skipped** by
  `mergePet` rather than resurrecting a field nothing reads.
- **UI**: the Cuties panel loses its **Speed** row (the "Đòn đánh thường · Sát thương 14 · mỗi 1.6s"
  line already prints the real cadence), the item dialog and the shop hover card print one **Hồi chiêu**
  row instead of rate *and* interval, and the admin DPM line is now
  `attack × multiplier × 60 / cooldown`.
- New balance: fire-pup 1.6 s, white-rabbit 1.15 s, spirit-cat 1.45 s — the same cadence the old
  `0.625 / 0.87 / 0.69` attacks-per-second produced. 528 frontend / 115 backend green.

---

## 2026-10-20 — The admin page is English, grouped by stat, and built from shadcn controls

- **Asked for**: "sửa lại trang cho full eng. và sắp xếp cho hợp lý theo tên stat. dùng shadcn component."
- 🔴 **English, whatever the language toggle says.** `AdminContentScreen` and `ArtImportDialog` now hold
  English copy directly (it is a developer tool, not player UI) and call a new `toEnglish()` exported
  from `i18n.ts` for the shared names — kit labels, parameter labels, stat names, item classes — so the
  page reuses the existing translation table instead of a second copy of every string. Content names
  (`name`, `blurb`) stay as the data says.
- **Fields grouped and ordered by stat.** `FieldDef.group` + `GROUP_ORDER` render **Identity**, **Shop**,
  **Grid** on an item and **Identity**, **Offence**, **Defence**, **Sword Energy** on a cutie, with a
  small uppercase heading per group — `Attack` sits next to `Attack speed`, `Max Sword Energy` next to
  its regen, instead of following payload order.
- **shadcn controls everywhere**: new `ui/input.tsx`, `ui/textarea.tsx`, `ui/label.tsx`, and every
  dropdown (Type, Quality, Aura target) is now an `OptionPicker` built on the existing
  `shadcn/dropdown-menu.tsx`. ❌ Not a Radix `Select`: it needs pointer-event captures jsdom does not
  implement and this repo has no global test setup to polyfill them, so the admin tests could no longer
  drive it. `@radix-ui/react-label` / `-select` were installed, found unnecessary, and removed again —
  the container has its own `node_modules`, so a new dependency would block the page until a rebuild.
- Tests updated to the English copy and the new interaction (`fireEvent.keyDown` to open a menu, then
  `[data-admin-option="…"]`). 528 frontend / 115 backend green.

---

## 2026-10-20 — A Cutie's speed finally obeys the admin page

- **Asked for**: "speed của cutie phải do tôi custom được." The field was already on `/admin`
  (`data-admin-field="attackSpeed"`), the backend already stored it (`attackSpeed: asNumber(0.05, 20)`)
  and the row in the database really held `0.3` — yet the panel and the fight kept showing `0.63/s`.
- 🔴 **Cause: `mergePet()` had no `attackSpeed` branch.** The payload is diffed against code and sent
  only when it differs, so the save looked successful while `getPet()` quietly kept the code value. Every
  read (`PetPanel`, `buildPlayerCombatant`, the battle cadence) comes from `getPet`, so one missing
  branch silently disabled the whole field. Fixed by merging `attackSpeed` when it is a finite number
  `> 0` (a zero rate would freeze the cutie forever).
- The same check keeps `attack` at `>= 0` — 0 attack is legal, unlike 0 speed.
- Verified live: `Tốc độ` now reads **0.30/s**, `Basic attack · every 3.3s`, Power 795 → 763 — the stored
  `0.3` at last reaches the game.
- Test: `contentOverrides.test.ts` overrides `attackSpeed: 2`, asserts `getPet` returns it **and** that
  the cutie's own swing interval shrinks, then clears the overlay.
- Docs: `ADMIN.md` now states the rule — an editable field needs **both** a `FieldDef` and a merge
  branch, otherwise it saves and never applies.

---

## 2026-10-20 — Melee throws a moon slash instead of a comet

- **Asked for**: "thêm hiệu ứng tia bắn ra dành riêng cho vũ khí cận chiến: dạng moon slash… hiệu ứng tia
  bắn ra hiện tại sẽ dành riêng cho vũ khí tầm xa." The flight was never in question — a melee hit has to
  reach the target the same way it always did — only the silhouette.
- `data-combat-effect` is `moon-slash` for every class except `SHOOTER_CLASSES` (`ranged`, `artifact`),
  which keep the old comet. Both fly in the same `motion.g` with the same lead, easing and
  `COMET_IMPACT` landing tick, so **damage, sound and timing are untouched**.
- 🔴 **The moon is the whole projectile — no tail.** `moonShape()` is two elliptical arcs between the same
  two points: tips on the travel axis, `MOON_HEIGHT = 100`, `MOON_DEPTH = 46`, `MOON_BELLY = 12`. That is a
  **broad half-moon with a slight point at each end** ("bán nguyệt nhưng có 1 chút nhọn"), matching the
  motion-blur ghost the art was chosen from. ❌ Two *circular* arcs with a smaller inner radius collapse into
  hairlines (the browser widens the arc below half the chord), ❌ a round-capped stroke leaves blunt ends,
  and ❌ a slim band reads as a drawn outline — all three were rejected.
- **Speed is the smear, not a streak of light.** Two stretched, blurred copies of the moon (`MOON_BLUR`)
  trail it. Four rejections shaped this: a long comet tail ("phình to ở giữa"), three rotating crescents
  ("quá xấu"), wisps fanning outside the moon ("giống con sứa"), and — finally — the four straight air
  streaks themselves ("xóa 4 tia gió này"); the smear is all that is left, and it is now drawn at **110 %**
  of the slash ("bóng mờ rộng hơn slash 10%").
- **The slash grows as it flies** ("tăng size từ bé đến lớn cho tới khi chạm đất, bóng mờ cũng thế"):
  `data-combat-moon-scale` scales the moon *and* its blur from `MOON_START_SCALE` (0.45) to 1 by
  `COMET_IMPACT`. Scaling inside the travelling group keeps the flight path and the landing tick intact.
- **The blur ghost became the hit** ("lấy phần bóng mờ làm hit chính"): `data-combat-moon-hit` applies
  `scale(1.6 0.94)` to the crescent — the same stretch the smeared copies had — so the wide, swept
  half-moon is now the slash itself. It also made the shape overshoot, so `data-combat-moon-body`
  translates the whole cut back by `MOON_NOSE` and the **nose**, not the tips, is what touches the card
  ("vị trí va chạm chưa đúng phần mũi của slash"). The hollow was deepened at the same time
  (`MOON_BELLY` 26 → 62, "phần lõm ko đủ"), with the note that it must stay ≥ half `MOON_HEIGHT`.
- **The hollow is a parameter, not a tweak.** `MOON_BELLY` (how far the inner edge caves in from the line
  through the tips) has been raised twice on request — 26 → 62, then 62 → **74** ("slash lõm thêm 20%") —
  each time with `MOON_DEPTH = 96`, `MOON_HEIGHT = 120`. It must stay ≥ half the height, otherwise the
  browser silently widens the arc and the hollow flattens.
- **The slash takes the attack's own colour** ("bổ sung màu hit effect cho giống với arrow làm lúc trước
  khi crit"): the band and its blur fill from `currentColor` via the `moon-tone-<key>` gradient, so
  `slashTone()` tints it — **red on a crit**, Sword-Energy blue when charged, white otherwise — and the
  crescent's nose fades to white like the comet's hot sliver. A hard-coded white band would have stayed
  white on crits.
- Tests: `battlePlayback.test.tsx` asserts five melee sources draw a moon with **no** comet tail/head, the
  band is ≥4× longer than thick with both arcs sharing their endpoints, the wind group and the two blur
  ghosts are present, and a `frost-fan` still draws the comet and no moon at all.

---


- **Asked for**: "thêm hiệu ứng khi item/cutie tấn công", then — after a first attempt drew a crescent
  over the tile — "phải có animation giống như lúc bị hit trúng để tạo cảm giác chứ ko phải như cách bạn
  làm". So the effect is a **movement**, not a glyph.
- 🔴 **`playStrikeAnimation()` animates the attacker's own element** through the Web Animations API: the
  weapon tile (or the Cutie's portrait holder for its own kits) throws itself 10 px toward the target
  along the real trajectory, flashes `brightness(1.5)`, recoils slightly and settles — the mirror of the
  `animate-shake` + `animate-impact-flash` the *defender* already played. Only one transient per swing,
  skipped under `prefers-reduced-motion`.
  - ⚠️ Why `element.animate()`: the tile belongs to `LoadoutGrid` / `AvatarCard`, so a class toggle would
    fight React's `className`, and a `motion` wrapper inside the grid would remount the tile (and every
    animation in it). The overlay attempt was deleted with it.
- 🔴 **The Cutie now has a charge line like an item** ("thêm charge line giống item cho cutie"): its
  attack kits give it a cadence, so `AvatarCard` draws the **same** markup via a new
  `components/ChargeOverlay.tsx` — extracted out of `ItemTile`, used by both. `BattleScreen.cutieChargeFor()`
  feeds it from the `skill` uid's cooldown row (`skill#<kitId>` for extra kits), so the bar rises and
  reaches the top exactly when the Cutie swings; a Cutie with no attack kit has no bar.
- Tests: `battlePlayback.test.tsx` stubs `HTMLElement.prototype.animate` and asserts the weapon tile is
  lunged **toward the enemy** with `brightness(1.5)` and returns to rest, plus a new case for the
  portrait's charge line (thin 9 px bar, rising `bottom`, wash tracking it). 526 frontend / 115 backend
  tests green.

---

## 2026-10-20 — Max level hides the upgrade button

- **Asked for**: "sau khi max level thì ẩn button này." The panel no longer draws the dimmed
  **Maximum level reached** bar at `MAX_PET_LEVEL` — the `Level 10/10` pill above already says it, and a
  button that can never be enabled is noise. Gold-short stays a **dimmed** button, because that state
  can change (rule in `ARCHITECTURE.md` §8: hide what can never happen again, dim what can).
- Test: `petPanel.test.tsx` sets the pet to `MAX_PET_LEVEL` and asserts no upgrade button, no
  "Maximum level reached" text, and the 10/10 pill present.
- **And the drag-and-drop hint under it is gone** ("ẩn p"): the `<p>` in `PetLoadoutPanel` that spelled
  out "click and drag an item… R or right-click to rotate, Esc to cancel" was the last instructional
  paragraph on the page — exactly what the no-hint rule forbids. Its four i18n keys were deleted with
  it, so the Equipment card now ends at the **Shop »** / **Tháo hết** buttons.
- **The Shop button inside the Trang bị panel is deleted too** ("xoá nút shop này"): it duplicated the
  action bar's **Mua Vật Phẩm** and was a second sell drop-zone nobody needed. `PetLoadoutPanel` lost
  that button and the `onShopClick` / `shopDropActive` / `onShopHover` props, `ShopDropTarget` is now
  just `'action-bar'`, and the panel's only button is **Tháo hết**. Drag-to-sell still works — on the
  action-bar button, and on the shop page's zone.
- **The action bar now ends with the shop and centres the fight** ("đặt button này vào giữa, thay thế vị
  trí hiện tại bằng nút shop"): order is `Nhiệm Vụ · Bộ Sưu Tập · Bản đồ · **Đấu Cutie** · Phòng tập ·
  tiến trình · Mua Vật Phẩm`, and the shop inherits the right-hand slot the fight button used to close
  the row with — still the same `data-shop-drop-target` sell zone.
- **Centring is structural now**: the bar is `xl:grid` with `minmax(0,1fr) auto minmax(0,1fr)`, so the
  fight button sits at **offset 0** from the bar's centre (measured in the live page) instead of only
  looking centred while both flex sides happened to match.
- **The training button became a full-size sibling** ("sửa lại button training room giống button battle
  và shop", then "same_row"): it used to be a small `btnSmClass` button inside its own bordered box, with
  the "Kẻ địch phản đòn" caption under it, so it read as secondary and lost a row of height. Now it is a
  `btnClass` button the same height as Mua Vật Phẩm / Đấu Cutie (43.9 px on the live page), with
  the toggle as a square chip beside it; the toggle's words moved to `title` + `aria-label`.
- **The bar is the page footer** ("footer nằm sát xuống phía dưới"): `PrepScreen` is `flex-1` inside the
  `min-h-screen` column, the bar is wrapped in `mt-auto`, and the page padding went from `pb-10` to
  `pb-3.5`, so it now ends **14 px** above the viewport bottom instead of 40 px plus wherever the panels
  stopped.

---

## 2026-10-20 — Stat rows: one per line, total + `(base + gear)`

- **Asked for**: "đổi hiển thị stat thành 1 hàng giống sword energy hiện tại … có thêm phần trong ngoặc
  hiển thị chi tiết. Nhớ thay đổi text color number cho dễ nhìn."
- **The two-column grid is gone**: the panel is now **one full-width row per stat**, exactly like the
  Sword Energy row — label left, number right.
- **Each row shows the total, then the breakdown in brackets** when Trang bị adds anything:
  `Attack 21 (20 + 1)`, `Damage reduction 0.2% (0% + 0.2%)`. The total is `text-gold-soft` on
  `font-semibold`, one size smaller for the brackets, and the **two numbers inside them keep two
  colours** — the Cutie's own value `text-white`, the gear part `text-jade` — because they come from two
  different places (asked for: "phần trong ngoặc 2 nguồn số khác nhau thì text color có 2 màu khác
  nhau", then "đổi basic number của cutie thành màu trắng"). `breakdown()` returns `undefined` at 0, so
  an unequipped row is one clean number (`Health 2000`) instead of `(2000 + 0)`.
- **The row label is gold too** (`text-gold-soft`, "đổi các span title thành màu vàng"): label and total
  now read as one gold line, with only the two-source brackets staying white / jade.
- 🔴 **`atk` from an item table never reached a swing — fixed.** `buildCombatant()` built every swing
  with `baseAttack` and only later folded `stats.atk` in (so it moved `referenceAtk` and the unused
  `baseWeapon`, nothing else). The panel now prints that bonus, so it had to be real: a small pre-pass
  reads `atk` from the placed `stats` / `aura` tables (`itemAttackBonus`, using the extracted
  `auraApplies()`), and `attackStat = ownAttack + itemAttackBonus` feeds both the item swings and the
  Cutie's own kits. An Attack jade now hits harder everywhere — `Power 804 → 809` on the live save, and
  `Basic attack · Damage 21`.
- Tests: `petPanel.test.tsx` asserts `240` + `(0 + 240)` and the 0.2 % case as `(0% + 0.2%)`, no
  brackets on an untouched `Attack 14`; `battle.test.ts` pins "a +10 attack jade adds 10 to the Cutie's
  own swing". Rule written down in `ARCHITECTURE.md` §8, `GAME-RULES.md`, README screen table.

---

## 2026-10-20 — A stat read-out keeps its decimals

- **Reported**: "tôi set Defense I trong admin 1 star là 0.2% nhưng ngoài home lại thấy là 0%."
- 🔴 **Nothing rounds a stat any more.** `formatStat()` and the panel's own formatters called
  `Math.round()`, so any value under `0.5` collapsed to `0` — a jade set to `0.2` % damage reduction
  read `+0%` in the item dialog *and* its bonus vanished from the Cuties panel (`bonusText()` tested the
  rounded number and returned "no bonus").
- **`statNumber()`** (`game/stats.ts`) is now the one formatter: `Number(value.toFixed(2))`, so `0.2`,
  `12.5` and `30` all print as themselves and a whole number keeps no decimal tail. Damage and timings
  still round — those really are integers.
- `petPanel.bonusText()` tests the **raw** amount for zero, so a `0.2 %` bonus is shown instead of being
  swallowed, and `formatStat` / `ItemDetailDialog` / `ShopOfferCard` inherit the fix through it.
- Tests: new `game/__tests__/stats.test.ts` pins `+0.2%` / `+12.5%` / `+30`, and `petPanel.test.tsx`
  equips a jade whose `dr` is `0.2` to assert `+0.2%` (and that `+0%` never appears).

---

## 2026-10-20 — A Cutie stat row reads `base + gear`

- **Asked for**: "sửa lại cơ chế hiển thị stat của cutie: hiển thị sẽ dạng stat cơ bản + với tổng từ
  equipment, ví dụ: attack 20 + 5."
- **Every numeric row prints two numbers now**: the Cutie's own value (`petLevelStats().attack`,
  `PetDef.critRate` / `critDamage`, `levelStats.maxHp`), then — in gold, one size smaller — the total the
  **equipped items** add (`Combatant.stats` minus that base). `Attack 20 +1`, `Armor 0 +240`,
  `Crit 5% +3%`.
- **`bonusText()` returns `undefined` for 0**, so nothing the gear does not touch grows a `+0`; the row
  stays a single clean number, which is what keeps the panel tidy.
- **Speed keeps no bonus**: its row is the Cutie's fixed root rate the admin sets, and a weapon's `+0.1`
  delta already reads in the **Basic attack** line right below (`Damage 20 · every 1.1s`) — printing it
  twice invited the reader to add them.
- **Sword Energy stays one bar**: `maxSe` has no item source and the regen is a percentage of the base,
  so the row keeps reading `300 (10/s)`.
- `Stat` gained a `bonus` slot (value + small gold number), and `petPanel.test.tsx` equips the
  `chain-mail` fixture (armour + DR) to assert `+240` / `+3%`, no `+0`, and an untouched `Attack 14`.
  519 frontend / 115 backend tests green. Rule written down in `ARCHITECTURE.md` §8, README screen table.

---

## 2026-10-20 — A stat kit *is* its stat (shadcn dropdown, one stat per kit)

- **Asked for**: "kit bonus stat khi chọn phải có dropdown của shadcn component cho chọn stat mong muốn.
  Xoá dropdown `add a stat` — nếu muốn thêm stat thì phải thêm kit."
- **The card is a stat picker now**: the `stats` / `aura` kit draws a **shadcn `DropdownMenu`**
  (`components/shadcn/dropdown-menu.tsx`, the same one the kit menus use — ❌ no new dependency, the repo
  has no Radix `Select`) showing the stat it grants with a ✓ on the current one, then the five number
  boxes. The **＋ Thêm chỉ số** select and the per-row ✕ are **deleted**: a stat kit can no longer quietly
  hold a second number nobody chose.
- 🔴 **`stats` / `aura` are the only repeatable kits** (`REPEATABLE_OPTION_KITS` in `game/kits.ts`,
  `REPEATABLE_KIT_IDS` on the server, which otherwise still refuses a duplicate kit). A new copy starts on
  the first stat the item does not grant yet (`freeStatKey`), so "Bonus stats" twice never produces two
  Attack rows.
- **Kit edits are addressed by position** (`setKitParam(kitIndex, …)`, `removeKit(kitIndex)`,
  `setKitJson(kitIndex, …)`, `addCharge(kitIndex)`, …). With two `stats` cards on screen, matching by
  `kit.id` would have edited — and the ✕ would have deleted — both of them; `data-admin-kit-index` keeps
  them distinguishable.
- `normalizeKits()` keeps both copies instead of de-duplicating, and `build.ts` already reads every kit of
  the item, so two Attack jades are two tables that both apply.
- **`atk` reads `Tấn công` / `Attack`** (`STAT_LABELS`) instead of "Sát thương cộng thêm / Bonus damage" —
  it adds attack, so it is the stat a "+Attack jade" picks. New UI labels are translated (`Chỉ số`,
  `Chọn chỉ số cho kit này`); the retired ones (`＋ Thêm chỉ số`, `Bỏ chỉ số {stat}`) are gone.
- **A percentage stat keeps its `%` in the name**: the picker prints `% Giảm sát thương` / `% Damage
  reduction` instead of `Giảm sát thương` (asked for: "các stat như này phải có kí hiệu %. Ví dụ % Dmg
  Reduction"). `adminStatLabel()` prefixes `isPercentStat()` keys only, because there is no value beside
  the label to carry the unit; `atk` / `maxHp` / `shield` stay bare.
- **The stat menu reads as rows, not stacks**: the shared `DropdownMenuItem` is `flex-col` (it was built
  for the kit menus, where an item holds one line), so the ✓ landed **under** the name in a 13 px box.
  The stat items pass `flex-row items-center gap-2 py-2`, the ✓ is `size-4 shrink-0`, the menu is
  `min-w-[240px]` and the trigger column is one step wider (`w-44`) so "% Damage reduction" never clips.
- **The 5★ box types the whole ladder**: filled as `20 % 40 % 60 % 80 % 100 %` of the 5★ amount
  (asked for: "tôi chỉ cần điền 5 star input thì các ô khác sẽ tự thông minh đặt theo chỉ số ở 5 star …
  dạng 20 % 40 % 60 % 80 % 100 %"). `starLadder(base)` in `AdminContentScreen` writes ranks 1–4 as
  `base × n / 5` (two decimals, so `1` gives `0.2` and not `0.199…`) and rank 5 keeps exactly what was
  typed; editing **any other** rank touches only that rank, so a hand-set curve is never overwritten.
  The card carries a one-line hint, and `adminContent.test.tsx` asserts `30 → 6/12/18/24/30` plus a
  manual 1★ override that leaves the rest alone.
- **That hint line was deleted** — "xoá text gợi ý, tôi là admin tôi tự biết … tôi cần UI clean và đẹp
  mắt". The behaviour speaks for itself once you type, and the rule is now written down:
  **no instructional hint text in the UI** ([`ARCHITECTURE.md`](ARCHITECTURE.md) §8, repeated in
  `ADMIN.md`). Inline text is for **state** the data cannot show (an error, a save message), never for
  telling the user what a control does.
- Tests: `adminContent.test.tsx` adds two stat kits through the dropdown and checks both tables reach the
  payload, `contentOverrides.test.ts` keeps two `stats` kits apart, and the backend accepts a repeated
  `stats` while still rejecting a repeated `basic-attack`. 518 frontend / 115 backend tests green.

---

## 2026-10-20 — A stat table is plain numbers, added straight to the Cutie

- **Asked for**: "kit bonus stat bạn làm ko tốt. Tôi muốn tạo 1 jade Attack — cộng thẳng attack cho cutie,
  tôi muốn chỉ cần điền số vào trong kit là được. Bạn ghi kiểu code quá rắc rối."
- 🔴 **`stats` / `aura` add flat amounts again.** `addItemMods` is now an alias of `addMods`: `atk: 30`
  is **+30 attack**, `maxHp: 120` is **+120 max HP**, `critRate: 5` is **+5 % critical chance** — nothing
  is multiplied by the owner's own numbers. The earlier "a share of the owner's stat" model is gone, so
  the number a designer types is the number the Cutie gains.
- **The five JSON text areas are gone.** `KitStatTableInputs` draws **one row per stat, one number box per
  star rank**, with **＋ Thêm chỉ số** to add a stat, a **✕** to drop one and — for `aura` — the **target**
  select on top. It exists so adding "+Attack" means typing `30`, ❌ not hand-writing `{ "atk": 30 }`
  five times. ⚠️ Both of those controls were replaced by the stat dropdown in the entry above.
- ⚠️ **One write per edit**: `setKitJson()` takes **all five** star strings at once. Writing them one by
  one started from a stale `kits` snapshot, so only the last rank survived; the editor now maps over the
  rows and saves the whole list in a single update.
- `seRegen` is still refused in a stat table (only `sword-energy` moves Sword Energy), and the rows offer
  the same key list the server whitelists.
- **`atk` now reads `Tấn công` / `Attack`** (`STAT_LABELS`) instead of "Sát thương cộng thêm / Bonus
  damage": it adds attack, so it must say so — that is the row a "+Attack jade" fills in. The label the
  new editor needed (`Hào khí cần gì bên cạnh`) was missing from `i18n.ts` and leaked Vietnamese into the
  English UI; it is translated now.
- **Docs**: `ADMIN.md` and `GAME-RULES.md` re-worded (flat amounts, number rows, durations in seconds),
  tests in `adminContent.test.tsx` drive the new boxes. 517 frontend / 114 backend tests green.

---

## 2026-10-20 — Attack belongs to the Cutie; an item only carries multipliers

- **Asked for**: "Attack chỉ có trên cutie. Các item sẽ có stat multiplier với stat chính của cutie —
  ví dụ vũ khí kiếm giờ chỉ có dmg multiplier là 1, nghĩa là nếu cutie có attack 30 thì vũ khí đó sẽ gây
  30 dmg. Áp dụng cho cả speed và mọi kit khác trong item."
- 🔴 **`ItemTemplate.attack` is gone.** `shop`, the admin page, the overlay and the server no longer
  accept it (`not editable`), and the old "lift `params.damage` onto the item" migration was removed
  with it: a stored damage number inside a kit is now simply dropped.
- **Swings are `Cutie attack × kit multiplier`**, and the rhythm is `Cutie attackSpeed × kit speed`.
  `attackKitInterval(kit, star, speed)` takes the owner's rate, `kitSwings()` takes the owner's attack,
  and `referenceAtk` (parry counters, `atkScale`) is now the **owner's** attack instead of a weapon's.
- **The direction arrows sit outside the tile**: the four glyphs on a support gem are pushed a full
  glyph out (was `1/3`), so the arrow's base lands on the tile border instead of inside it — at the
  bottom edge the old position covered the **star rank**. Presentation only; the sides, their gold /
  silver colour and the engine are unchanged.
- **No class owns its footprint any more**: `CLASS_SPACE` / `classSpace()` were removed, `mergeItem`
  stopped rewriting `space`, the server's own copy and its rewrite went with it, and the admin boxes stay
  editable for `jade`, `accessory` and `potion` exactly like for a weapon. Size is plain data on every
  row again.
- **"The weapon that struck" is gone.** A support gem (`freeze-haste` / `heal-haste`) now offers only
  **Theo hướng liền kề** or **Ngẫu nhiên** — the third target, its `attacker` mode in `BuffTargetMode`,
  the `triggerUid` plumbing through `buffTargets` / `boostWeapons` / `triggerHeal` / `freezeRandomWeapon`
  and its translation were deleted, so a gem never chases the swing that caused its trigger.
- **Durations are seconds, never milliseconds**: the admin boxes read `Thời gian (giây)` /
  `Thời gian đóng băng (giây)` / `Thời gian buff (giây)` and show `3` for 3 s. `KitParamDef.displayScale`
  converts on the way in and out, so the stored payload and the simulation keep milliseconds.
- **A weapon's two numbers read in order and by name**: **Hệ số sát thương (Damage multiplier)**
  first, **Tốc độ cộng thêm (Speed bonus)** right under it — the same words in EN and VI.
- 🔴 **Speed is a stat now, not a rate.** The Cutie owns one fixed **base speed** the admin sets
  (`PetDef.attackSpeed`, attacks per second — `0.3` = 0.3 attacks a second, and the Cuties panel prints
  exactly that number instead of reading back a kit's cadence). Every weapon — **including the Cutie's
  own basic attack, which is simply its weapon** — carries a **`speed` delta** that is **added** to it:
  `0` swings at the Cutie's cadence, `+0.1` turns 0.3 into 0.4, a heavy blade carries `-0.1` (0.2), and
  a delta that reaches 0 or below means the weapon never swings. `attackKitInterval()` is the only place
  that adds them; the item dialog and the admin DPM line read the same sum.
- **`PetDef.attackSpeed`** is new (0.625 / 0.87 / 0.69 attacks per second) and every Cutie kit ships at
  `speed: 1`, so its own basic attack keeps the cadence it always had. The admin page gained a
  **Tốc độ đánh gốc (đòn/giây)** box for a Cutie, and the pet catalogue stores it like any other row.
- **Every other item number is owner-relative too.** `stats` / `aura` tables are percentages of the
  owner's own numbers (`addItemMods`: `maxHp` / `shield` → share of max HP, `atk` → share of attack,
  `seRegen` → share of regeneration), burn / poison are a **% of attack per second**, a shield or a heal
  is a **% of max HP**, and every Sword Energy number (charge threshold, parry cost, charged block, drain,
  on-hit gain) is a **% of max HP's bar** — `sePercent()` converts it once at build time.
- **The `scaling` select is gone** from every on-hit kit: the unit belongs to the kit now, so a designer
  cannot point a burn at the wrong bar. Kit defaults were re-expressed in percent (e.g. a shield is
  `8 % of max HP`, a burn `20 % of ATK/s`), and the retired test fixtures were re-tuned the same way.
- **Two new kits** (the "kit tăng chỉ số" asked for earlier, now expressed in this model):
  - **`damage-boost` — Tăng sát thương**: `value` % extra damage for the swings it points at — the
    item's **own** swings, or the **weapons on the ticked sides**. `trigger` decides when it runs:
    **Liên tục** is folded into the weapon's damage at build time, while **Khi trúng đòn / Khi hồi máu /
    Khi bị đóng băng** start a `duration` ms boost (`Runtime.weaponDamage`, never stacking — the higher
    percentage wins).
  - **`sword-energy` — Kiếm Thế**: the **only** kit allowed to move SE, `regen` as a **% of the Cutie's
    own regeneration** (negative slows it). `stats` / `aura` now reject `seRegen` with a message that
    points here, and the server whitelist finally accepts **`critDamage`** (it was missing, so "Critical
    damage" could never be raised).
- **A training dummy needs an owner swing too**: `makeTrainingBlueprint()` now owns a slow, weak attack
  (12 damage / 1.5 s) that its one weapon multiplies.
- Tests: `battle.test.ts`, `contentOverrides.test.ts`, `training.test.ts`, `store.test.ts`,
  `itemDetailDialog.test.tsx`, `adminContent.test.tsx` and `petPanel.test.tsx` were re-expressed in the
  new units; `kits.test.ts` gained six cases covering the multiplier model and both new kits; the
  backend refuses a per-star `attack` and `seRegen` inside a stat table. 511 frontend / 114 backend
  tests green.
- ⚠️ **Stored rows need a re-tune**: the database still holds the old absolute numbers (`attack`,
  `speed` like `0.6667`, `shield: 180`). They are read in the new units now, so a weapon saved earlier
  swings at `0.67 ×` the Cutie's rate; open the admin page and re-enter the multipliers (a sword is `1`).

---

## 2026-10-20 — The Cutie panel reads like a character sheet

- **Asked for**: "Power chiếm 1 hàng… phía dưới power là level… các stat còn lại chia 50-50 theo 2 cột",
  with short labels Health / Armor / Attack / Speed / Crit / Critical damage, and **no bag slot** row.
- **Power and the level share one row, at the two corners**: Power on the left (`Power 1,245`), the
  level on the right (`★ Level 10/10`). Both are drawn by **one `Pill` helper** — same gold border,
  gradient fill, inset highlight, **11 px** font, `gold-soft` text and sentence case — so neither can
  drift from the other. Power is still `estimatePower(combatant)`, i.e. the whole loadout (Cutie
  **and** the items in Trang bị).
- **A level is worth 1/9 of the base, so level 10 is exactly double level 1**: `PET_GROWTH_PER_LEVEL`
  became `1 / (MAX_PET_LEVEL - 1)` (≈11.1 %, was 0.1 which left the cap at 1.9×). Max HP, base attack
  and **Kiếm Thế regen** all follow it; every Cutie's base regen is **5/s**, so it reads **10/s** at
  level 10 (it used to be a flat +1 per level from a per-Cutie 8 / 11 / 9).
- **A two-column table** (`grid-cols-2`, always 50/50) holds Health (max HP), Armor (starting armour),
  **Attack** (`petLevelStats().attack`, i.e. the Cutie's own base attack that its kits scale — the number
  was not surfaced anywhere before), **Speed** (the basic swing's rate, `1000 / interval` as `…/s`, so it
  agrees with the "every 3.3s" line below), Crit and Critical damage, then **Lifesteal** and **Damage
  reduction**. **Sword Energy** closes the table on a full-width row.
- **The three dead rows are gone**: Bonus damage (`atk`) and Damage (`atkPct`) only ever feed
  `referenceAtk` (parry counters, `atkScale`), never a swing's damage, and Attack speed (`haste`) is a
  charge-speed multiplier with no read-out of its own — listing them implied the numbers meant something
  in the bag. The stat keys themselves stay in `game/stats.ts`; only the panel stopped advertising them.
- **A zero is a value now**: the old `if (!value) return null` hid every un-buffed stat, so an empty build
  looked like a shorter list. Each row always renders, printing `0` / `0%` when the stat is flat.
- **Bag slots is gone** — the grid grows on its own by Cutie level, so the row only repeated a rule the
  player cannot act on.
- Tests: `components/__tests__/petPanel.test.tsx` asserts the level line, the six short labels, `Attack 14`
  and `Speed 0.63/s` for a level-1 Cẩu Hỏa Sài, that **Bag slots / Bonus damage / Damage / Attack speed are
  absent**, and that a flat stat prints `0%`. Verified in the browser on the real save (EN): Power 1,245 ·
  Level 10/10 · Attack 20 · Speed 0.30/s · Lifesteal and Damage reduction reading 0.

---

## 2026-10-19 — Finishing the campaign no longer forces a wipe

- **The bug**: "khi hết màn chỉ có duy nhất 1 lựa chọn là start over là sai!". `VictoryScreen`
  (`phase: 'victory'`, on top of everything) carried a single button — "Chơi lại từ đầu" — so the only
  way past the celebration was to erase the run that had just beaten all 60 stages. Farming, trying
  another Cutie, or simply looking at the finished save was impossible.
- **Two choices now**: **"Tiếp tục chơi"** (`data-victory-continue`, gold/primary) calls the new store
  action `continueRun()` → `phase: 'prep'` and **keeps the run exactly as it is** (nothing is written to
  `run`; `phase` is transient, it is not in `partialize`). **"Chơi lại từ đầu"** stays on the right in
  danger red and still goes through the existing `ConfirmDialog`, so the destructive path keeps its
  guard. A muted line explains that nothing is lost.
- **A replay is not a second celebration**: `commitBattle` now sets `phase: 'victory'` only on the
  **first** full clear (`clearedStage >= FINAL_STAGE && run.clearedStage < FINAL_STAGE`); winning stage
  60 again afterwards lands on the normal result panel instead of forcing the player to dismiss the
  victory screen after every gold run.
- Tests: new `components/__tests__/victoryScreen.test.tsx` (both buttons present; "Tiếp tục chơi" closes
  the dialog, `phase === 'prep'`, gold and `clearedStage` untouched) and a store test covering
  first-clear → `victory`, `continueRun()` → `prep` with `run` deep-equal, `continueRun()` as a no-op
  elsewhere, replay → `result`. Verified in the browser on the real finished save: dialog shows both
  buttons, "Keep Playing" closed it with gold 1789 / clearedStage 60 intact (nothing was bought).
- Docs: [`GAME-RULES.md`](GAME-RULES.md) gained the **Phá đảo (victory)** row next to Restart.

---

## 2026-10-19 — The shop's hover card waits, and dies with the offer it describes

- **The bug**: "khi đã mua item nhưng popup hover detail vẫn hiển thị". Buying replaces the offer's
  `<button data-shop-offer>` with the sold placeholder (`<span data-shop-sold>`), so the **old button
  never fires `pointerleave`** — `hovered` kept its index and the card hung over a cell that no longer
  had anything in it. The click now drops the card (`hideCard()` before `buyOffer`), and the render
  guard is `run.shop[hovered.index] && !…sold`, so any other path that empties a cell is covered too.
- **Hover intent**: the card no longer opens on the first pixel of contact. `HOVER_DELAY_MS = 350` with
  a single `hoverTimerRef`; leave / blur / scroll / unmount clear it. Moving between cells restarts the
  wait, which is the usual "deliberate stop" behaviour. Keyboard focus still opens it immediately — a
  focused cell is already deliberate.
- Tests: `navigation.test.tsx` asserts the card is **null right after `pointerover`**, appears inside
  `waitFor`, and that a click on the cell leaves `shop[0].sold === true` with **no card** on screen.
  Verified the new test fails without the fix (reverted the two lines, saw it red, restored).
  508 frontend tests green.

---

## 2026-10-19 — The toast notifications are gone

- **Requested**: "xoá toaster thông báo, tôi không cần chức năng này". The floating message stack in the root
  layout (`components/Toasts.tsx`, `fixed right-[18px] bottom-[18px] z-40`) is deleted, together with its
  plumbing: the `Toast` type, `toasts` state, `pushToast`/`dismissToast` and the `--animate-slide-in` /
  `slideIn` keyframes that only it used.
- **Every `pushToast(...)` call site went with it** — `gameStore` (buy / sell / reroll / merge / sort / rotate
  / equip refusals, PvP and stage outcomes, pet unlocks), `PrepScreen`, `ShopScreen`, `AdminContentScreen`,
  `AuthSync` and `ActionBar`. The **refusals themselves are untouched**: a blocked drop, an unaffordable
  upgrade or a locked cell still does nothing, the caller simply gets no message about it.
- Where a toast was the only explanation of a *state* change, the information moved into the UI that already
  reports it: the admin page keeps its own `setMessage` line, `AuthSync`'s sign-in failure goes to
  `console.warn`, **Nhiệm Vụ / Bộ Sưu Tập are now `disabled` buttons with a `title`** ("… sẽ có ở bản
  sau") instead of clickable buttons that popped a message, and the **Nâng cấp Cutie** button is
  `disabled` when the purse is short (it used to answer a click with "Cần N gold") — the shop's
  `aria-disabled` cell and the dimmed Reroll button already worked that way.
- Tests: the four store assertions in `store.test.ts` now check the **effect** (`buyOffer` wears the item
  instead of stashing it; the cap and the empty purse leave `gold`/`pets` untouched), `dragAndDrop` and
  `storageGrid` rely on the red hint outline plus "the item stayed where it was", and `navigation.test.ts`
  asserts the disabled button and its tooltip. 507 frontend tests stay green.

---

## 2026-10-19 — The art importer: a picker that opens, free rotation, an exact frame, Full HD

- **The picker did not open.** The drop zone was a `<label>` wrapping an `sr-only` file input; forwarding a
  label click into a clipped input silently does nothing in some browsers. The input is now `hidden` and
  opened **programmatically** (`input.click()` from a real `<button data-art-pick>`), and there are two more
  ways in: **drag & drop** anywhere on the dialog and **Ctrl+V** (paste an image). All three call one
  `onPick`.
- **Rotation is free**: a `-180°…180°` slider (1° steps, live read-out) next to the ⟲/⟳ 90° buttons and a
  *Về 0°* reset. An odd angle leaves the frame corners empty, and the dialog says so instead of shipping a
  surprise.
- **The frame is exact — no distortion**: the crop container is now **exactly** `frame.width × frame.height`
  (`cropSize` passed explicitly). Before, the container was the full dialog width, so the image was scaled to
  cover *it* and the square crop box captured only 645 source px of a 1080-wide photo — the saved 1080×1080
  was a silent upscale. `objectFit` also moved `contain → cover` so 100 % zoom never includes transparent
  padding. The rule-of-thirds grid, the checkerboard behind transparency and a live
  `crop W×H px` read-out make alignment predictable, and a warning appears when the crop is smaller than the
  stored picture.
- **Full HD portrait**: `ART_SIZE` (512) became `ART_LONG_SIDE = 1920` / `ART_SHORT_SIDE = 1080`, so
  `artOutputSize` gives 1×3 → **640×1920**, 2×3 → 1080×1620, 1×1 → 1080×1080 (`cropImage.test.ts` pins both
  bounds and the aspect). The backend ceiling rose to `ART_MAX_SIDE = 1920` and `ART_MAX_BYTES = 8 MB`, with
  the transport limits lifted to match — `BODY_LIMIT_BYTES` 4 → 12 MB and `client_max_body_size 12m` in
  `nginx.conf`, otherwise a large PNG died with `save_too_large`/413 before the art check.
- **Quality**: `croppedPng` now **halves in steps** (`drawScaled`) when the source is more than 2× the output
  instead of one big `drawImage`, which is what left jaggies on 1080→640 reductions.
- Verified in the browser with a generated 1080×1920 PNG: the dialog reports `1080×1920 px · crop 1086×1086
  px`, the frame measures 380×380 for a 1×1 item, the rotation slider reads `37°`, and the crop preview shows
  the rotated image under the grid. Nothing was saved to the real content DB.

---

## 2026-10-19 — Damage numbers never pop in front of the fighter

- "Vẫn có tình trạng dmg nhảy ra phía trước": the columns were `22 / 50 / 78 %` for **both** sides, so half
  the numbers landed on the side the blow came from (the `22 %` slot on the enemy card sits in front of it,
  toward the player). The band was also rows `20–55 %`, i.e. the lower slots started *below* the portrait's
  centre.
- `feedbackPosition(key, side)` is now side-aware: columns **`16 / 30 / 44 %`** on the player card and
  **`56 / 70 / 84 %`** on the enemy card — always the half facing away from the opponent — and rows
  **`16–46 %`**, all above the centre.
- Measured live (228 × 445 holder): enemy floater at `dx +13, dy −104`, player at `dx −45, dy −51` — on the
  back side and above the fighter in both cases.
- Test: the floater case now renders both cards and asserts the top band (`14–48 %`) **and** the side of the
  columns (`≤ 44 %` player, `≥ 56 %` enemy), plus the drift sign for each.

---

## 2026-10-19 — Damage numbers sit on the target instead of over it

- After the previous pass the numbers floated **too high** ("quá cao so với nơi nhận dmg"): the band was
  rows `4–39 %` of the portrait and the float travelled up to `−40 px`, so a 445 px card put a number up to
  ~220 px above the fighter's centre — over empty background.
- Now `feedbackPosition` uses rows **`20–55 %`** (over the head and chest) and `combatFloater` travels
  `+4 → −4 → −16 → −24 px`. Measured live on the enemy card (445 px portrait): numbers land **20–82 px**
  above the picture's centre, i.e. right beside the hit but still above it — never below, never over the
  arena.
- Tests: the floater case now asserts the band is inside `18–56 %` (not just "somewhere up there").

---

## 2026-10-19 — A direction arrow lights only for a neighbour that really swings

- Reported: the buff-direction arrow turned gold pointing at an item that is **not a weapon**. The
  neighbour was `the-icy-vow`, an `artifact` with a single `freeze-reflect` kit — an artifact counts as a
  weapon class, so `directionSidesFor` lit the side, but `build.ts` only ever looks at the **swings** it
  built (one per attack kit) and a trinket has none: the engine could never have buffed that item.
- New `game/items.ts` → `isBuffableWeapon(templateId)` = weapon class **and** at least one attack kit,
  used by `directionSidesFor` (so the overlay and the simulation agree). Silver/gold logic in
  `DirectionOverlay` is untouched.
- ⚠️ Test trap found on the way: `applyContentOverrides({ items: … })` **replaces** the catalogue, so a
  test that overrides one item silently blanks all the others (they became blank `artifact` templates with
  no kits). `directionOverlay.test.tsx` now uses `installRetiredItems({ items: … })`, which keeps the
  fixtures, and `HASTE_GEM` is shared so a second override does not drop the gem's kit.
- Verified live: the gem's arrows now read `up:empty, down:empty, left:empty, right:weapon`
  (`rgb(185,190,199)` vs gold `rgb(240,205,122)`); a new test pins the trinket case as all-silver while a
  real weapon still lights its side.

---

## 2026-10-19 — Critical shows in the number only; numbers stop popping below the target

- Feedback: "khi crit chỉ cần text số thay đổi là ok" — the `CRITICAL` line is gone (and its i18n key).
  A critical now differs **only** in the number: 34 px, fire-gold `#ffd45c`, punch-in. Cleaner over the
  artwork and no second word competing with the health bars.
- "text damage popup không được nằm phía dưới vị trí nhận sát thương và ngược về phía nhận sát thương":
  - `feedbackPosition` moved from rows `12–52 %` to **`4–39 %`**, so a number always sits above the
    portrait instead of beside or below the fighter;
  - `combatFloater` used to start at `+12 px` (i.e. **below** the anchor) and rise to `−24 px`; it now
    starts at `+6 px` and climbs `−8 → −30 → −40 px`, so the popup never appears under the hit;
  - the drift is the receiver's own recoil: the number is knocked **backwards behind the fighter who took
    the hit** (`--floater-drift` `−18 px` on the player card, `+18 px` on the enemy card), away from the
    blow that came from the opposite side. (First pass had it the other way round — the user's wording
    "ngược về phía nhận sát thương" meant *behind the recipient*, not *toward the attacker*.)
- Verified live: floater tops read `4 % / 11 % / 25 % / 32 % / 39 %`, drift `18px` on the player card and
  `−18px` on the enemy card, text just `−50`.
- Tests: the critical case now asserts `textContent === '−120'` and that no label element exists; a new
  case pins the top band (≤ 40 %) and the drift sign per side.

---

## 2026-10-19 — Haste gains its green rim, and the streaks get quicker and wider

- The reference tiles are **framed in green** while buffed; ours only had moving light, so a tile between
  two streaks looked untouched. `LoadoutGrid` now draws a `data-weapon-boost-border` sheet: a 2 px
  `rgb(126 255 168 / 82%)` frame, an inset `0 0 16px` green glow, a crisp inner edge
  (`inset 0 0 3px`) and a light wash over the top 46 % of the tile, plus a `0 0 12px` outer bleed.
  It is `z-[7]` — deliberately **above** the frost sheet (`z-[6]`), so a weapon that is both frozen and
  boosted still reads as boosted.
- The streaks were re-toned to the **heal green** family (`#46b39a` → `rgb(168 240 190)` → `#eafff2` head)
  so the trails and the rim belong to one colour, and every one of them is **30 % wider**
  (`width × 1.3`, i.e. up to 3.4 px at a 90 px cell) because 1–2 px lines vanished against the artwork.
- **Faster**: durations went from `0.87–1.42 s` to `0.55–0.89 s` (~35 % quicker) — the travel is the same,
  so the light simply moves like speed instead of drifting.
- Tests: the haste case now also asserts the rim exists with a border and an inset shadow, that the widest
  trail is over 3 px, and that every streak climbs in under 0.9 s.

---

## 2026-10-19 — Critical hits get their own popup

- A critical hit used to look like any other hit: same size, same red, only the flying comet knew
  (`event.critical` → `text-red-500`). `feedbackOf` now forwards `critical` and `AvatarCard` draws it
  differently —
  - **34 px instead of 27** (one clear step up), gold `#ffd45c` text with a `0 0 12px` orange glow,
  - a **`CRITICAL`** line under the number (13 px, 900 weight, `0.18em` tracking, fire-red),
  - a punch-in (`criticalPop`: `scale(1.55) rotate(-3deg)` → `0.96` → `1`) on an **inner** span, because
    the floater's own animation owns the outer `transform` (drift) and two animations on one element
    would cancel each other,
  - `data-combat-critical-hit` on the wrapper for tests/CSS.
- For the planned burn / poison: `AvatarFeedback['type']` plus one row in the new **`FEEDBACK_STYLE`**
  table (`tone`, `sign`, `label`, `shake`) is all a flavour needs — the renderer is a lookup, so neither
  the markup nor the animation changes.
- ⚠️ First attempt used `data-combat-critical`, which the **comet** (`CombatSlash`) already owns
  (`="false"`), so a DOM check matched a slash instead of a number. Renamed to `data-combat-critical-hit`.
- Verified live: the floater reads `−90CRITICAL`, `font-size: 34px`, `color: rgb(255, 212, 92)`, with
  `animate-critical-pop` present. Tests: `avatarCard.test.tsx` compares a critical against a normal
  number side by side; `battlePlayback.test.tsx` drives a critical event through the real replay.

---

## 2026-10-19 — Haste is a meteor stream, not arrows

- The SVG-arrow pass still read as objects *drawn* on the tile, and their keyframes started and stopped
  inside the tile, so the loop visibly **stuttered**. The Naraka reference is not an arrow at all: it is a
  bundle of thin vertical light trails — falling stars seen from below.
- `components/HasteStreaks.tsx` (replaces `HasteArrowGlyph.tsx`, deleted) draws **nine streaks**: a
  rounded 1–2.6 px column with a `linear-gradient` that is bright at the head and dissolves into nothing
  at the tail, a white dot as the head, and a soft `box-shadow` glow. No `svg`, no text glyph.
- Why it no longer stutters: each streak is placed at `bottom: -length` and travels
  `--streak-rise = tileHeight + length` with `linear` timing, so it **enters from below the tile and leaves
  above it** — the animation's start and restart both happen outside the clipped area, so there is no
  pop-in at the bottom edge and no stall at the top. `--animate-boost-streak` has **no ease** on purpose.
- The table stays irregular (lengths 9–44 % of the tile, widths, speeds 0.87–1.42 s, opacity 0.45–1) and
  every streak uses a **negative** delay, so the first frame is already a full stream.
- Measured live: per 70 ms frame every streak advances 15–20 px at a constant rate (e.g. 128 → 147 → 167 →
  187) and wraps to negative offsets **below** the tile, i.e. out of sight.

---

## 2026-10-19 — The battle timer is bigger and ticks on the clock

- The timer under the versus badge was an `11px` muted `35.0s`. It is now **16px, semibold, paper/85**
  with a soft text shadow (`data-battle-clock`), so it can be read at a glance next to two health bars.
- It also stopped **jerking**: `VersusBadge` was fed `current.t` — the timestamp of the last *crossed
  event* — so the digits jumped by whatever gap the event log happened to have (0.3 s here, 0.9 s there,
  then nothing for a second). It now gets `playbackTime`, the replay clock, which advances by
  `TICK_MS × speed` every tick (60 ms at ×1, 180 ms at ×3), so the tenths step evenly: measured live,
  `331.2 → 331.4 → 331.6 → 331.8 …`. The bars still follow the event snapshots — only the clock moved.
- Test: a synthetic log whose next event is 3 s away, at ×1: after 240 ms the clock reads `0.2s` and
  after 480 ms `0.5s` (an event-driven timer would still read `0.0s`).

---

## 2026-10-19 — Haste arrows are neon speed streaks, not glowing triangles

- The FX was six `▲` **text glyphs** with a drop shadow. At tile size a triangle of the body font has no
  tail and no core, so it read as a green blob stuck on the artwork — nothing like the reference image of
  neon arrows with motion trails.
- `components/HasteArrowGlyph.tsx` (new) draws one arrow as **SVG**: a wide chevron head with a
  light-to-dark gradient, a narrow tail that dissolves downward, and a bright core line along the tail,
  all under `drop-shadow(0 0 3px)`. Gradients use `useId()` (colons stripped) so every tile has its own
  ids — duplicates would make all arrows inherit the first one's colours.
- The layout stays the deliberately irregular `HASTE_ARROWS` table (own x, negative delay, duration,
  scale, start lift, opacity), the width went `0.20 → 0.24 × cellSize` so the arrow reads at 90 px, and
  `boostArrow` now stretches (`scale(0.7,0.8) → (1.02,1.18)` around `transform-origin: center bottom`)
  instead of ballooning, which is what makes it look like speed rather than a growing icon.
- Verified in the browser: 6 `<svg>` per tile, 17.6 × 53.3 px each, arrows with visible heads and fading
  tails climbing the tile.

---

## 2026-10-19 — Practice heals the player by never letting them be hurt

- Reported: "trong training room, máu của người chơi không được giảm giống npc". Only the dummy carried
  `immortal`, so a fighting dummy could grind the player's bar down while the dummy's stayed full — the
  session read as a fight the player was losing instead of a numbers read-out.
- `startBattle` now builds the practice player as `{ ...playerCombatantFor(run), immortal: true }`
  (`dealDamage` reports the number and refills the bar), so **both** sides are immortal in `training`
  only. Real fights are untouched.
- Verified live with the dummy striking back: 80 samples over 12 s, the player's panel read
  **1800 / 1800** in every frame (only Sword Energy moved) while damage numbers still popped.
- Tests: `store.test.ts` asserts the player's `hp` is one value across the whole training log and that a
  stage battle still sees it drop; the rules-level test for a lethal dummy is kept and re-labelled as a
  simulation capability, not something practice builds.

---

## 2026-10-19 — A stream of haste arrows, and frost that ends **with** the ice

### Haste arrows: density instead of three fat chevrons

- Three 24 px arrows with `0 / 0.34 / 0.68 s` delays meant the tile was empty for a beat and every
  re-trigger of the buff (a new node → the FX remounts) made all three crawl off the bottom edge again:
  the effect visibly **stuttered** and jumped.
- Now **six 13–19 px arrows** (`HASTE_ARROWS`), each mounted with a **negative** `animation-delay`, so
  the first frame is already a full stream and a re-trigger changes nothing visible. Travel is unchanged
  (`--boost-rise`, 74 % of the tile height), the cycle is slightly faster (0.78–1.14 s per arrow) and the
  climb eased (`cubic-bezier(0.3, 0.45, 0.45, 1)`) with a scale ramp.
- ⚠️ Then "quá đều theo thứ tự": six arrows with evenly spaced x offsets **and** evenly spaced delays drew
  a clean diagonal line up the tile, which read as a machine drawing a ladder. The table is now
  **deliberately irregular** — each arrow has its own `x` (−0.34…0.31 cell), `delay` (0.04…0.87 s),
  `duration` (0.78…1.14 s), `scale` (0.76…1.1) and start `lift` (4…40 px at a 90 px cell), plus its own
  wrapper opacity — so heights, widths and speeds all differ and no line forms.
- Measured live: x = 526 / 530 / 543 / 563 / 577 / 585 inside a tile spanning 512…602, heights spread
  47…250 px above the bottom, six distinct delays and six distinct durations.

### Frost outlived the freeze by up to a second

- Reported: "hiệu ứng freeze overlay chưa mất nhưng line charge đã bắt đầu chạy". Reproduced by polling
  the live tile every 100 ms: the ❄ badge read "❄ 1s" while the charge went 5 → 11 → 21 → 31 → 45.
- Cause: the frost sheet and the ❄ badge were read from `cooldowns[].frozen` of the **last crossed
  event**, and a frozen weapon never swings — so it never pushes an event that would clear its own
  status. The snapshot only refreshed when *something else* happened (the player's next attack), i.e. a
  few hundred ms after the thaw, while the charge bar had already resumed.
- Fix: `battleWeaponStatuses` now derives `frozen` from `freezeWindows` + `playbackTime`
  (`liveFreezeMs`), the same clock that pauses the bar, and unions the uids of the windows with the
  snapshot's cooldowns so a fresh freeze shows even before an event has carried it. Slow / boost stay on
  the snapshot. Re-polled live: 400 samples, 45 frosted, **0** samples where the bar moved under the ice.
- Regression test: the freeze playback test now also asserts the frost is gone **and** the bar moved once
  the 5 s window ends (its selector was fixed too — `data-battle-weapon-charge` holds the percentage, not
  the uid, so the old query was silently comparing `undefined` with `undefined`).

---

## 2026-10-19 — Practice has no time limit any more

- The training room used to end at **60 s of simulated time** ("Hết giờ tập"): `TRAINING_MS` was a cap and
  the run then committed as `winner: 'draw'` + `timedOut`. That is wrong for a room whose whole point is
  "watch your build for as long as you like", so the constant is now `TRAINING_HORIZON_MS` = **20 min**
  and it only says **how much log is pre-computed** (measured: ~150 events per minute, 2 976 events and
  15 ms of simulation for 20 min with a 6-item 4★ build). When the log runs out the replay holds its last
  frame: no outcome overlay, no `commitBattle`, `phase` stays `battle`.
- The **death zone is off in practice** (`BattleOptions.noDeathZone`): past three minutes the arena would
  have started burning both sides, so an idle player in front of a dummy that never swings died to the
  clock — a time limit by another name. `MAX_TIME` (6 min) is now only the **default** limit, which
  `options.maxTime` can exceed, so the longer horizon actually runs.
- The training header keeps only the speed buttons — ❌ **no Tạm dừng, no Bỏ qua**: neither has a meaning
  in a session with no end. Instead a bar at the bottom always shows **Rời phòng tập** (`data-battle-quit-
  training`) and **Nhật ký trận đấu**; the log dialog now also opens during a practice run and lists only
  the newest **250** events (a 20-minute log would have rendered thousands of rows and locked the dialog).
- Verify live: clock ran to **91.5 s** and kept counting, no outcome overlay, no pause/skip buttons, quit
  returned to the preparation room.
- Tests: `training.test.ts` (death zone would hand the dummy the win, `noDeathZone` does not, log > 1000
  events) and a new playback test driving the real screen past the old 60 s cap.

---

## 2026-10-19 — Haste arrows centred, taller — and the `⚡ +N%` badge is gone

- The arrows started at `bottom-0` at `22 / 50 / 78 %` and only travelled `-90 %` of their own glyph
  height (~16 px), so on a 3-cell weapon they piled up at the bottom edge, slightly right of centre, and
  read as a smudge next to the star plate.
- Now the wrapper of each arrow is `left-1/2 -translate-x-1/2` with a `±32 % cellSize` offset (measured
  live: tile centre 557, arrow centres 528 / 557 / 586), the start line is `16 % cellSize` above the
  bottom, the glyph is `27 % cellSize` (24 px at a 90 px cell) and the travel is `--boost-rise` =
  `74 %` of the tile height in pixels (200 px on a 3-cell weapon) — set per tile, so the animation is
  the same long climb on any footprint. The wrapper carries the position, the inner glyph carries the
  `transform`, so neither fights the other.
- ❌ The `⚡ +60%` pill is **removed** (`data-battle-weapon-boost` no longer rendered): it covered the
  artwork and repeated a number the hover detail already shows. `directionOverlay.test.tsx` now asserts
  it is absent and checks the arrows' start line / `--boost-rise`.
- Verified in the live battle: no badge in the DOM, three centred arrows climbing 200 px on the frozen
  Bronze Sword tile.

---

## 2026-10-19 — A frozen weapon looks frozen **and** stops charging

- The charge bar kept filling through a freeze. The bar is derived from the real attack events, and a
  frozen weapon does not attack — so on screen there was a line crawling forward while the ❄ badge said
  "frozen". `components/battleCharge.ts` now exports `FreezeWindow`, `frozenShift(windows, time)` and
  `pausedAttackTimes(times, windows)`: the 🧊 status events (`kind: 'status'`, `icon: '🧊'`, `sourceUid`,
  `amount` = duration) become windows per `side:uid`, the weapon's clock becomes
  `playbackTime − frozenShift(...)` and the attack times move by the same shift. The bar therefore stands
  still where it was and continues after the thaw, instead of jumping or crawling.
- The tile also shows the ice: a **frost sheet** over the whole tile (`data-weapon-freeze-overlay`),
  above the artwork and below the ❄ badge, never taking pointer events so the tile stays clickable.
  `backdropFilter: saturate(0.55) brightness(0.92)` plus a light diagonal sheen reads as frost without
  hiding which item is frozen.
- Tests: `battleCharge.test.ts` covers the shift / paused times, `directionOverlay.test.tsx` the sheet,
  and `battlePlayback.test.tsx` plays a synthetic log with one 5 s freeze and asserts the bar's
  `data-battle-weapon-charge` value does **not** change over 500 ms of playback.
- ⚠️ Still unobservable in normal play: the live catalogue only holds `melting-ice` (freeze-haste, no
  freeze of its own) and `wooden-blade` (no freeze kit), so nothing in the DB can freeze a weapon yet.

---

## 2026-10-19 — Rank markers are icon stars, bigger and lifted

- The star rank on an item tile was the **`★` character** at 10 px with `-1px` tracking. A text glyph is
  set in the body font, so its size and baseline followed the font stack and it read as a tiny smudge
  next to the artwork. `ItemTile` now draws **one lucide `Star` per rank** (`fill="currentColor"`,
  `strokeWidth 1.5`), `12 px` each (scaled with `sizeScale`), with a 1 px gap.
- It also sits **higher**: `bottom` went 4 → 7 px (and the container is an `items-center` row), because a
  12 px icon on the old edge clipped against the tile's inner border.
- Rank colours are unchanged (`ITEM_STAR_TEXT` → `text-rank-1…5`), so a 4★ is still four icons in the
  rank-4 purple.
- Tests that asserted the glyph text now count the icons (`storageGrid`, `adminContent`).

---

## 2026-10-19 — The selected admin entry finally looks selected

- Root cause: `components/ui.ts` exported its **own** `cn()` as a plain `join(' ')`, so `btnClass`
  (`border-line bg-ink-700`) and the variant (`border-gold bg-ink-600`) both reached the DOM and the
  **stylesheet order** picked the winner — the base won, and the entry being edited looked like every
  other one. `cn` is now **re-exported from `lib/utils`** (`clsx` + `tailwind-merge`), which is what the
  repo rule always said it was.
- The active state is also stronger: `ACTIVE_ENTRY_CLASS` = gold frame + `bg-gold/15` wash +
  `font-semibold` + a 3 px gold bar down the left edge (`inset` shadow), applied to both the live and the
  deleted lists. Verified in the browser: the selected row computes `rgb(217,162,39)` border,
  600 weight and the inset bar, while its neighbours stay `border-line` / 400.

---

## 2026-10-19 — Damage numbers, bars and read-outs change on the same frame

- **No stagger on the floating numbers.** Hits crossed by one replay tick used to be nudged
  `FEEDBACK_STAGGER_MS` (90 ms) apart, so the health bar dropped first and the numbers arrived after —
  reported as "not even". Every number of a tick now starts on that frame (`--floater-delay: 0s`), each
  in its own spot (`feedbackPosition`), and nothing is summed.
- **Bars use a short tween, not a spring.** `BAR_TRANSITION` moved for ~300 ms after the state changed,
  so the bar was still travelling while its number had already popped. `{ type: 'tween', duration: 0.12 }`
  makes the drop/refill land with the number, the armour badge and the Sword Energy read-out.
- **Armour gains now have a number** (`AvatarFeedback.type: 'shield'`, in Sword-Energy blue) — the badge
  used to move with nothing to explain it. `shield` events therefore feed the same floater pipeline as
  damage / heal / block.

---

## 2026-10-19 — Shop cells keep one fixed size

- A cell used to grow with the offer inside it (`min-h-[220px]` + a real-size tile), so a reroll that
  swapped a 1×1 gem for a 1×3 blade made the **whole board jump** and pushed every price row down.
  Every shop cell — including the empty slot left by a purchase — now has **one inline height**
  (`data-shop-cell-height`), computed from the **tallest footprint the whole catalogue can contain**
  (`max(space.h) × CELL_SIZE + 76`), floored at 220 px. A big tile simply leaves less empty space in
  its cell; the shell never resizes. ⚠️ It is the **catalogue**, not the current roll — otherwise the
  board would still change size between rolls.

---

## 2026-10-19 — The shop rolls on **quality**, not only on tier and star

- `rollShop()` picked a template **uniformly** from the tier pool, so a 5★ quality item was as likely as
  a 1★ one as soon as they shared a tier. It is now a **weighted** pick:
  `QUALITY_WEIGHTS` (`game/economy.ts`) = `1: 100, 2: 45, 3: 18, 4: 6, 5: 1.5`, applied by
  `pickWeighted()`. ⚠️ A weight is **relative to the pool**, not a percentage.
- The pick still consumes exactly **one** `rng.next()`, so every existing seed replays the same shop
  shape — only the distribution changed (`'is deterministic for the same seed'` still green).
- `shopQualityOdds(stage)` derives the **real** per-band chance from the live pool
  (`band weight ÷ total weight`), and the shop's info tooltip now shows it under `Phẩm` — `Bạc 69%`,
  `Xanh lá 31%`, … — with a colour dot per band. ❌ The numbers are never typed into the UI: the panel and
  the roll share one table, so they cannot drift.
- ⚠️ Quality is still a **fixed property of the template** (it drives the tile colours); what changed is
  only **how often each band is offered**. Stars remain a separate roll on top (`starChances`).

---

## 2026-10-19 — Shop board follows the reference: click the cell, price only

- The offers are no longer cards with a "Buy" button. They form a **bordered board** — no gaps, 1 px gold
  dividers, rounded frame — with a bar on top (`Cửa hàng` · `Cấp cửa hàng 2` + the drop-rate toggle),
  like the reference screenshot.
- Each cell is **the buy button itself**: `<button data-shop-offer>` wrapping the whole area, so clicking
  the item buys it. ❌ No `Buy · N` button inside any more; the bottom of a cell shows **only the price**
  (`15` + coin) — red when the player cannot afford it, struck through once bought.
- Every cell carries its **footprint** in the top-right corner (`▦ 2×3`), drawn with `Grid2x2`.
- Cells are `auto-rows-fr`, so every row is the same height, and the board is a **full 2×3**: `SHOP_SIZE`
  went **5 → 6**, one offer per cell. Padding the grid with an empty sixth cell looked like a broken
  slot that never refilled on reroll, so the offer count now matches the board instead — ❌ never pad
  the grid with empty cells again, and ❌ do not draw a cell whose offer has no template (an item the
  admin deleted is skipped, not left as a hole).
- The tile keeps its real `CELL_SIZE = 90`, so a 1×3 blade is 90×270 inside a much larger cell.
- **The price is pinned to the bottom edge** of every cell: the tile box is the flexible `flex-1` child and
  the price is `mt-auto`, so cells of different heights still line their prices up. ❌ Do not go back to
  centring the column — that drifts the price up and down per cell.
- **The cells have no background of their own** (the section dropped `bg-card shadow-panel`): only the
  1 px dividers and the hover tint draw the board, exactly like the reference, where the art sits on the
  page rather than on cards.
- **The reroll moved out of the board** into the bottom action card, to the **right of Back**: a full-width
  row of `[« Quay về] · Lần đổi: N · [🎲 Đổi danh sách · 2 🪙]`. ❌ The shop has no second refresh strip.
- **The global top bar is not drawn on `/shop`** (`__root.tsx` checks the pathname): the shop carries its
  own header (portrait, level, power, stage, gold), so two headers would just fight for the same space.
  Everything else the top bar owns (dialogs, toasts, `AuthSync`/`ContentSync`) still renders there.
- **The shop owns the whole viewport height**: on `/shop` the shell drops the page padding down to a
  fixed breathing gap (`h-[100svh] gap-0 py-10` = 40 px top and bottom), so the profile card sits
  **40 px below the top edge** and the action card **40 px above the bottom edge**, while the board +
  equipment column takes the leftover height and is **centred** in it (`flex-1` + `min-h-full items-center`).
  The wrapper scrolls instead of clipping when the board is taller than the screen — ❌ do not centre with
  `justify-center` on a scroll container, it cuts the top of the board off.
- **The shop's equipment column is fully interactive again** — it had been rendered as a bare
  `<LoadoutGrid width items />`, i.e. a **picture**: no dialog, no drag. It now gets the preparation
  room's wiring (`useHeldItem` + `dropItem`): click → item details (with the sell value), drag → move on
  the board, `R` / right click → rotate, `Esc` → cancel (`dragUidRef` must be forgotten too, or the
  release still drops the item), and a cursor ghost while dragging. `shopEquipment.test.tsx` pins all
  three gestures. ❌ Do not hand `LoadoutGrid` an item list without handlers again — see
  [`ARCHITECTURE.md`](ARCHITECTURE.md) §8.
- **The merge badge uses a real icon**: `↑ 2★` was the `↑` **character** next to the `★` character, and the
  two sat on different baselines in different fonts — the badge looked uneven and tilted. It is now the
  **lucide `ArrowUp`** (`strokeWidth={3}`, `size-3`) with the number and `★` as `leading-none` spans in an
  `items-center` row. ⚠️ For a UI glyph use the lucide icon, ❌ not a Unicode arrow.
- **Every shop tile wears a dashed frame** (`data-shop-tile-frame`, `border-paper/35`, 6 px outside the
  tile's own border) — that outline is what makes a tile read as **buyable**, like the reference art.
  The frame hugs the tile (1×3 stays 1×3), never the cell. A **merge suggestion adds to it, it never
  replaces it**: the same dashed line turns gold (`border-gold/70`) and the tile gains a **pulsing golden
  glow** (`data-shop-merge-ring`). ⚠️ The glow needs **both** an outer and an **inset** shadow
  (`shadow-[0_0_26px_…,inset_0_0_20px_…]`): an outer `box-shadow` is painted only outside the border box,
  so the 6 px gap between the tile and the dashed line stayed plain black — the inset half fills that gap
  and bleeds onto the tile's edge, so the light reads as coming from the item.
  🔴 An item you can merge is still an item you can buy — ❌ never drop the dashed outline to show a
  suggestion, and ❌ never stack a second ring on it.
- **The shop suggests a merge**: when an offer's **twin** (same item + same star) is already in Trang bị
  or Kho đồ, the cell marks itself — the **dashed frame turns gold and pulses** (hugging the tile's real
  shape, so a 1×3 stays 1×3) plus an `↑ N★` badge in the top-left corner. Buying it then cascades the
  merge as usual, so the suggestion is "this gold buys a star, not a copy". The rule lives in
  `mergeUpStar(bag, offer)` (`game/bag.ts`), shared with `isMergeable`; ❌ other shop tiles never count
  as a twin (two offers never meet in a bag). The badge sits top-left on purpose: the bottom of a cell
  belongs to the price alone.
- **Hovering an offer opens its details card beside the tile** (`ShopOfferCard`, `data-shop-offer-card`),
  the way the shop in the reference works: the name, class and star on a header bar, then only the
  **numbers that are not already on the board** — the swing (`Nhịp đánh` with a clock, damage, dps), the
  passive stats / aura, the charged attack and the on-hit effects, and the support gem's parameter table.
  It opens on `pointerenter` (and `focus`, so the keyboard gets it), closes on leave / blur / board scroll.
  - ❌ **No price** (the cell right below the tile already states it), ❌ **no merge hint** (the tile's own
    `↑ N★` badge says it), and ❌ **no `target` / `directions` param rows**: a direction bitmask only means
    something as the arrows drawn on the item in the bag, and both were reported as noise.
  - **Text only** — ❌ no item picture: the tile is right there on the board, and repeating the art only
    eats the room the numbers need.
  - **Anchored to the tile, not the cell** (258 px wide, 10 px gap) and opened **to the right of the
    item** first, like the reference: a cell is far wider than its item, so anchoring to the cell pushed
    the card over the next column's item and half the empty cell. It flips to the left of the tile **only
    when the right side would run off the window** — the one hard rule is that it never covers the item
    being inspected; covering a neighbouring tile is accepted.
  - `position: fixed` with the rect measured on enter, height capped to the window (the body scrolls).
  ⚠️ The offer button is now `aria-disabled` instead of `disabled`: a disabled button fires no pointer
  events, and the **unaffordable** offers are exactly the ones you want to inspect.
- **One source for an item's numbers**: `components/itemFacts.ts` (`itemFacts()`, `kitParamText()`,
  `onHitText()`) was extracted out of `ItemDetailDialog`, and both the dialog and the hover card read
  it — ❌ never re-derive a kit's numbers in a second component.
- **A bought offer disappears**: the cell becomes an **empty slot** (`data-shop-sold`) instead of the
  item staying as a dimmed, struck-through ghost. The board keeps its shape (a reflow would shuffle
  every other offer), but nothing is drawn inside the bought cell — ❌ never leave a faded copy of an
  item that is no longer for sale.
- **The equipment column matches the board**: the wrapper is `items-stretch` and the sell zone is
  `flex-1` over a 96 px floor, so the card is exactly as tall as the shop board and both columns end on
  the same line. A drop target that grows with the leftover height is also easier to hit.
- **Drop to sell is back on the shop page**: a permanent dashed **sell zone** under the equipment grid
  (`data-shop-sell-zone`, also `data-shop-drop-target` so it is the same hook the preparation room
  uses). It is **tall on purpose** (`min-h-24` = 96 px, thick `border-2` outline, 13 px label) because
  the target is hit-tested by pointer position — a 35 px strip was genuinely hard to hit mid-drag.
  It is muted when idle, pulses red while an item is in hand ("Thả để bán Melting Ice · +20"), and
  turns solid red when the pointer is over it. `onDragEnd` now takes `releasePosition` and checks
  this zone **before** the board cell — otherwise releasing outside the grid would be read as "put the
  item back on the last hovered cell". Selling pays the usual **50%** (store `sell`, with its toast).
- `navigation.test.tsx` follows: the shop is reached by its `Cửa hàng` heading, and buying is
  `click([data-shop-offer])` instead of clicking a `Mua ·` label. Its `beforeEach` now drains a queued
  `popstate` and resets the URL — see "Trap 3b" in [`TESTING.md`](TESTING.md), that leak made this test
  fail intermittently.
- **The shop bar no longer shows `4/5`**: how many offers are left says nothing a player can act on, and
  it competed with the shop level. In its place is an **info icon** (`Info`) whose **hover tooltip**
  lists the **drop rates of the current shop** — `★ 100%`, `★★ 0%`, `★★★ 0%`, the item-pool size, and
  when the 2★ upgrade unlocks. ❌ It is **not** a click toggle: the rates are a glance, not a panel, so
  the tooltip opens on `group-hover` (and `group-focus-within` for the keyboard) with no state at all.
  The numbers come from `shopStarOdds(clearedStage)` in `economy.ts`, which reads the same
  `starChances()` that `rollShop()` rolls, so the panel **cannot drift** from the real odds. The
  tooltip is drawn **inside** the section: the board is `overflow-hidden`, a portal-less dropdown
  below it would be clipped.

---

## 2026-10-19 — Currency is **gold**, a readable GoldPill, and a real shop header

### From "Paw Tally" to gold

- Every user-facing string says **Vàng** (vi) / **Gold** (en): the i18n pairs were rewritten, and the unit
  icon is a **coin** (`Gold`, lucide `Coins`) instead of a paw print. `icons.tsx` exports `Gold` and `Cost`.
- **The stored field was renamed too**: `RunState.currency` → `RunState.gold` (types, store, loadout, every
  caller). `sanitizeRun()` reads `gold ?? currency`, so an existing save — local or on the server — **keeps
  its money**; only the new name is written back. Covered by a test.

### GoldPill

- New `components/GoldPill.tsx` — the only place an amount is drawn. A coin in a dark disc, a gold gradient
  pill and **16 px (md) / 20 px (lg) tabular figures**, instead of a 13 px number that was the smallest
  thing on a shop screen. `aria-label` carries the unit ("80 gold").

### Shop header

- The single line of small muted text became a **profile strip**: the cutie's portrait (`PetPortrait`,
  64 px), its name with a `Level 9/10` badge, then **Power**, **Stage 23/60** and the gold pill — each a
  labelled block, all on one row and wrapping cleanly when it has to.

---

## 2026-10-19 — Items live in the database only (no hardcoded catalogue)

`game/items.ts` shipped a default item list and the database was an overlay on top of it: deleting an
item only flagged it (`removed: true`), so it kept showing up as "deleted", and every field the admin
left untouched fell back to code. The app is online-only, so the list is gone:

- **`ITEM_TEMPLATES` is empty.** `itemCatalogue()` builds the catalogue **from the stored rows only**;
  a leftover `removed` row is skipped (it can never come back). Code keeps the *types* and the kit
  definitions, nothing content-specific.
- **Saving an item sends the whole row** (no "diff against the code default"): the stored row is the
  item. Pets still diff, because their defaults are still in code.
- **Deleting = `DELETE` the row.** The `removed` flag, the "Hiện lại" button and the strikethrough
  "đã xoá" list are gone — no soft delete, no tombstone.
- **Nothing in the engine points at an item id.** `rollShop()` returns an empty shop instead of throwing
  when a tier has no items yet; `makeRivalBlueprint()` copes with an empty pool; the training dummy takes
  *any* weapon the catalogue has (or none), instead of `'wooden-blade'` hardcoded.
- `wooden-blade` was written into the database first (full row), so removing the code copy lost nothing.
- **Tests** no longer borrow a shipped catalogue: the retired shapes live in
  `src/test/retiredCatalogue.ts` and are registered through the content overlay
  (`installRetiredItems()`), i.e. exactly like a row the admin created. `catalogue.test.ts` now asserts
  the catalogue is *exactly* the stored ids, and the admin tests seed rows in their API stub.

---

## 2026-10-19 — Admin editor: no "overridden" badge, no "Reset to Defaults"

The page used to present every row as an *override over a code default*: a gold badge said "đang ghi
đè", a dot marked the list entries that had one, and **Đặt lại như cũ** deleted the row so the entity
fell back to `items.ts` / `pets.ts`. Items are owned by the database now, so that framing is gone:

- the **"đang ghi đè" badge** and the dot in the list are removed — a stored row *is* the item, there is
  nothing to distinguish;
- the **"Đặt lại như cũ" button** (and `onReset`) is removed, together with the "nothing differs → drop
  the row" branch in `onSave`: an empty payload now just reports "Chưa có gì khác mặc định để lưu";
- the unused `overridden` map / `hasOverride` / `CircleDot` / `RotateCcw` imports went with them.
- `adminContent.test.tsx` follows: the Save button is still disabled until the form changes, and a row
  that has stored values is simply listed (the test that asserted the mark now asserts its absence).

---

## 2026-10-19 — The shipped catalogue drops to what the admin keeps (25 items retired)

The admin page had 25 of its 28 items marked **deleted** (`removed: true`) — the whole first catalogue,
built before the item rework. They are now gone for real instead of hidden:

- **`game/items.ts` keeps only what ships**: `wooden-blade`, `fire-spear` (pets are untouched). The 25
  retired templates were removed there, and their `content_overrides` rows were deleted, so nothing
  comes back and the admin list no longer shows "deleted" ghosts. `statsKit` / `auraKit` went with them —
  they only existed to build those templates.
- **Enemy loadouts no longer depend on those ids.** `ENEMY_POOLS` keeps its lists, but `enemyItems()`
  now **filters** them to templates that still exist and, when a map's list is empty (map 3 was), falls
  back to every template the catalogue has for that stage tier. Without this, deleting the items would
  have sent map-3 enemies into battle with **no gear at all**. The same fallback means an item the admin
  re-creates with an old id automatically rejoins its old pool.
- **Tests stopped depending on shipped content.** The retired templates live on as
  `src/test/retiredCatalogue.ts` (test-only data), registered through the **content overlay** with
  `installRetiredItems()` — exactly like an item the admin created, so the grid/kit/aura/parry fixtures
  keep their real shapes while nothing ships. Files updated: `bag`, `battle`, `kits`, `store`, `training`,
  `art`, `itemDetailDialog`, `storageGrid`, `battlePlayback`, `adminContent`.
- Catalogue-wide assertions were narrowed to what they can still mean on an admin-owned catalogue: every
  shipped template has a class label / a quality band / a growing attack table, **not** "the catalogue
  spans every class". `art.test.ts` still refuses orphan art, but a file for a **retired** id is allowed
  (a re-created item usually reuses its picture).
- ⚠️ The balance numbers in `docs/BALANCE.md` were measured with the old catalogue and need a re-probe
  once the new items and their shop pools exist.

---

## 2026-10-19 — Kit cards read at a glance: red = main kit, green = sub-kit

- A **main** kit card in the admin editor now has a **red** border (`border-danger-soft/60`), and every
  **sub-kit** — the charged hit and the on-hit effects nested inside an attack — a **green** one
  (`border-hp/60`). Before this, every card used the same neutral `border-line/70`, so a nested effect
  looked like a kit of its own.
- The on-hit section has **no heading at all** now (`[data-admin-onhit]` holds only the green cards and
  the "Thêm kit con" button). It used to print "Hiệu ứng khi trúng đòn" above the cards, which made the
  effects look like a different kind of thing than the charged hit — an on-hit effect **is** a sub-kit
  card, so it is drawn exactly like one. The label still exists inside the "Add sub-kit" menu, where it
  really is a group heading. The thin divider above the section is drawn **only when the attack also has
  a charged hit**, so it separates two cards instead of floating over the first one.

---

## 2026-10-19 — `jewelry` → `jade`, new `accessory` class with fixed footprints

- `ItemClass` is now `melee · ranged · artifact · jade · accessory · armor · potion`. The old
  `jewelry` name is **folded into `jade`** by `normalizeItemClass()` (frontend) and
  `LEGACY_ITEM_CLASSES` (backend), exactly like `focus` → `artifact`: an existing row keeps its class
  and does not fall back to "unknown", which would have thrown it out of the weapon/aura rules.
- **Footprints moved into the class** for two of them: `CLASS_SPACE` in `game/types.ts` pins `jade`
  to **1×1** and `accessory` to **2×2**, and `classSpace()` applies it in three places — `mergeItem()`
  (so a stored row cannot contradict its class), the admin payload (`buildPayload`), and the size boxes
  (switching the class to Ngọc / Phụ kiện rewrites w/h immediately). Every other class still uses the
  `space` its template declares.
- `CLASS_SPACE` lives in `types.ts`, not `items.ts`, on purpose: `items.ts` imports `content.ts`, so a
  helper in `items.ts` imported back by `content.ts` would close a cycle.
- `ui.ts` lost its stale `focus` border key (now `artifact`), and the en dictionary gained
  `Phụ kiện → Accessory`.
- Tests: `content.test.ts` pins the class list, the two fixed footprints, and both legacy folds;
  `content.spec.ts` (backend) accepts `jade` / `accessory` and stores `jewelry` as `jade`.

---

## 2026-10-19 — Direction overlay on support gems, haste arrows in battle

Two presentation-only additions; neither touches damage or timing.

### Direction overlay

- A gem whose kit uses `directions` now draws **one arrow per selected side** on its tile — in
  Trang bị, in Kho đồ, and **on the drag preview** (read at the cell it is hovering over, so the answer
  is about where it is *about* to land).
- An arrow is **gold** when a **weapon** (melee / ranged / artifact) sits on that side, **silver** when
  it is empty or holds a non-weapon. The check is `occupiedSides()` — the same edge walk the buff
  itself uses, so the overlay cannot promise a neighbour the engine would not take.
- `buffDirectionMask()` reads the mask from the kits: two buff gems on one item are **OR-ed**, and a gem
  set to random / attack draws nothing.
- The drag preview keeps the item's own old cells out of the count (`exceptUid`), so a gem does not
  "see" itself while it is being moved.

### Haste effect

- A weapon whose charge boost is active shows **three staggered arrows racing up the tile**
  (`--animate-boost-arrow`, `data-weapon-boost-fx`) next to its `⚡ +N%` badge — the buff reads at a
  glance instead of only as a number. The element exists only while the boost lasts, so nothing
  animates once it expires.
- Confirmed and pinned by a test: haste **never stacks**. Two support gems buffing the same weapon give
  the **highest** value (`Math.max`) and the longer duration, so 40 % + 100 % = **100 %**, not 140 %.
  `slow` stays a separate penalty, multiplied against the boost (`factor` is floored at `0.1`).
- Tests: `directionOverlay.test.tsx` (four arrows, gold only on the weapon side, mask subsets, no
  overlay for a random target, the boost arrows appear only while boosted), `kits.test.ts` for the
  mask helper and for two gems not stacking their boost.

---

## 2026-10-19 — "I bought it but it is not in storage": a purchase now says where it went

The item was never lost: a purchase with room on **Trang bị** is **worn** (that is the documented
order), and only Kho đồ gets the "went to storage" toast — so a worn purchase made no noise at all
while the player was looking at the storage panel.

- `buyOffer` now always reports the result: `Đã mua {name} — đang mang` for the worn case, next to the
  existing merged / compacted / went-to-storage messages.
- Hardening found while investigating: `sanitizeRun` dropped items whose template was not in the
  catalogue, and the store rehydrates **during module import**, before `/api/content` can answer — so a
  created item (`melting-ice`) looked like a *deleted* one on every reload and a save round-trip could
  push the pruned run. Now:
  - `sanitizeRun(..., { keepUnknownTemplates })` keeps such items until `contentResolved()`;
  - `getTemplate` returns a neutral ❔ placeholder for an id that exists nowhere instead of throwing
    (another blank-page guard);
  - `ContentSync` marks the overlay resolved after a **successful** fetch and calls the new
    `pruneUnknownItems()`, which is what finally drops a genuinely deleted item.
  - ⚠️ Only a successful fetch resolves it: a network failure keeps the items instead of eating them.
- Tests: a purchase toast names the item, an unknown template survives the rehydrate window, the
  placeholder renders, and `pruneUnknownItems` removes the item only after the overlay says it is gone.

---

## 2026-10-19 — Fix: Bỏ qua played the whole skipped fight as one loud roar

Pressing **Bỏ qua** (or skipping the tail of a training session) produced one very loud, clipped noise
burst. The playhead jump made the visual effect create a **comet for every remaining hit at once**, and
each comet called `playBattleSlashSound()` — plus scheduled an impact sound — so hundreds of buffer
sources started on the same frame.

- **A jump is not playback**: `jumpedRef` is set by the Skip button, and both the floaters and the
  visual effect consume it — no comets, no sounds, no stale numbers for the tail. The arena goes
  straight to the outcome.
- **Audio budget**: `battleAudio.ts` refuses a second sound of the same kind within **50 ms**
  (`MIN_SOUND_GAP_MS`), separately for slash and impact (an impact lands a few hundred ms after its
  slash, so a shared watchdog would swallow it). Any future burst — a stack of weapons at ×3, a
  backgrounded tab catching up — is capped instead of stacking.
- Test: `battlePlayback.test.tsx` presses Bỏ qua and asserts **no comet, no slash sound, no impact
  sound** and no leftover damage numbers, while the battle still commits.

---

## 2026-10-19 — Training room with an immortal dummy

A place to **read your own numbers**: a fight that never ends in a death the player did not cause, so
equipment changes can be compared without burning a stage attempt.

- New battle mode `training` (next to `stage` / `pvp`), started from the preparation bar:
  **Phòng tập** + the `Kẻ địch phản đòn` toggle (persisted in `battleSettingsStore`).
- `Combatant.immortal` — `dealDamage` computes and reports the number as usual but **refills the bar**,
  so the dummy never dies and the death zone has nothing to decide. The arena shows `Immortal` under
  its name and its health bar stays full while the damage numbers float.
- The dummy carries **exactly one weapon** (`makeTrainingBlueprint()`, `game/training.ts`) and has no
  innate attack (`attackInterval: 0`). The toggle only decides whether that weapon swings:
  `buildEnemyCombatant(blueprint, { noSwings })` drops the timers while the item **stays on the board**,
  so the arena still shows the weapon it is holding. If the admin deletes `wooden-blade`, the dummy
  falls back to the first weapon left in the catalogue.
- A session is capped at `TRAINING_MS` = **60 s** simulated (`simulateBattle(..., { maxTime })`), and the
  result is `winner: 'draw'` + `timedOut`, shown as **"Hết giờ tập"**. Normal fights keep the old rule:
  no `maxTime` ⇒ health-ratio comparison after 6 minutes.
- Training pays **nothing**: `commitBattle` with `mode: 'training'` returns without touching currency,
  wins/losses, `stage` or `clearedStage`. The player can still lose it if the dummy kills them; "Đánh
  lại" becomes **"Tập lại"** and repeats the same toggle.
- Tests: `game/__tests__/training.test.ts` (one weapon, no innate attack, bar never moves, no death
  zone, the dummy can still kill the player, a normal fight is unchanged), `store.test.ts` (training
  pays nothing, the toggle reaches the combatant) and `appShell.test.tsx` (the bar starts a session).

---

## 2026-10-19 — Support gems choose their target; `focus` becomes `artifact`

### `artifact` replaces `focus` as the third weapon class

- `ItemClass` is now `melee · ranged · artifact · jewelry · armor · potion`. `artifact` **is a
  weapon**: `isWeaponClass()` returns true for it, so it still receives a support gem's buff and still
  satisfies an `adjacentWeapon` aura — it simply leans on debuffs (freeze / slow / poison / drain)
  instead of raw damage.
- All ten pháp khí templates moved from `cls: 'focus'` to `cls: 'artifact'`; the admin select, the
  create payload and the backend whitelist follow.
- Backwards compatibility, both sides: `normalizeItemClass()` in `game/content.ts` folds a stored
  `cls: 'focus'` into `artifact` when an old row is merged (the dev database really does hold one —
  `item:melting-ice`), and the backend accepts `focus` and stores `artifact`. An unknown class is
  dropped instead of copied onto the template.

### A support gem picks who it buffs

- `freeze-haste` and `heal-haste` gained two `single` parameters: `target` (0 = the ticked sides,
  1 = one random weapon, 2 = the weapon that caused the trigger) and `directions`.
- `directions` is a **bitmask** (`up` 1, `down` 2, `left` 4, `right` 8; `15` = all four, the default
  an item without the parameter reads), drawn in the admin as four clickable toggles. The picker is
  hidden while `target` is not "adjacent sides".
- `build.ts` resolves the ticked sides through the new `adjacentUidsByDirection()` (the same
  edge-only walk `adjacentUids` uses) and stores the swing uids; `random` / `attacker` are resolved in
  `battle.ts`, where the swing that caused the trigger is known. `attacker` falls back to random for a
  trigger with no weapon behind it (a regen tick, a reflect). A gem set to `directions` draws **no
  RNG**, so it cannot shift the deterministic stream.
- The item detail dialog prints `target` by its label and `directions` as `Lên · Xuống · …` instead of
  raw numbers.
- Tests: `kits.test.ts` covers a one-side mask, the two runtime modes and the `attacker` boost landing
  on the freezing weapon only; `adminContent.test.tsx` adds the kit, toggles a side (15 → 7), checks
  the picker disappears for `random`, and saves the mask.

---

## 2026-10-19 — Admin: create an item by naming it, the id is generated

The create box asked for an **id** (`kiem-sat`) instead of a name, which is backwards: nobody thinks in
slugs, and the code is only ever an internal key (art filenames, override rows).

- `itemCodeFromName()` / `uniqueItemCode()` in `game/items.ts`: the Vietnamese name is folded to ASCII
  — including **đ / ơ / ư**, which Unicode does **not** decompose, so `NFD` alone would have produced an
  empty slug — gaps become dashes, and a taken code gets `-2`, `-3`… A name with no Latin letters falls
  back to `mon`. The code template ids are asked **and** the live catalogue, so two items named the same
  never overwrite each other.
- The box is now **Tên món**: the admin types `Kiếm Sắt`, sees `Mã tự sinh: kiem-sat` under the input,
  and the row is created with `name: 'Kiếm Sắt'` and the generated code. It is a `<form>`, so **Enter**
  creates the item; the success toast shows both the name and the code.
- Validation is now about the **name** (empty → "Nhập tên món trước đã.", over 80 characters) and the
  reason still appears under the input as an alert, not in the editor panel on the right.
- Tests: `catalogue.test.ts` covers the slug (tones, đ/ơ/ư, parentheses, a non-Latin name) and the
  `-2` suffix; `adminContent.test.tsx` creates an item from a name, checks the generated id, the
  duplicate-name suffix, the rejected-name alert and the Enter path.

---

## 2026-10-19 — Admin: a rejected item code is explained next to the box

"Cannot create an item — nothing happens." The create request itself worked; what failed silently was
the **validation**. Every create error (empty code, a bad character, an id that already exists, a
server rejection) was written into `message`, which the editor panel draws **at its bottom on the
right**, far from the `Tạo mới` box on the left — so a refused click looked exactly like a dead button.

- The create box now owns its own `createError`: the reason is printed **under the input** as a
  `role="alert"` (`[data-admin-create-error]`), the input is marked `aria-invalid` and points at it
  with `aria-describedby`, and the error clears as soon as the admin types.
- Server-side rejections land in the same place instead of the editor panel.
- The box is a real `<form>`, so **Enter** in the code box creates the item (it did nothing before),
  the input takes focus when the box opens, and the button reads `Đang tạo…` while the request runs.
- The success toast is now translated (`Đã tạo "{id}" …` was printed in Vietnamese in English mode).
- Tests: a rejected code shows the alert inside the form and clears on typing; a form submit (what
  Enter does) sends the PUT.

---

## 2026-10-18 — Item reaction kits, per-weapon freeze, charged block, death zone

The item ideas for the next balance pass: the freeze / slow gems, the support gems, the stacking
damage gems, the armour kit family and a way to end a stalemate. These are **kits**, so every item
(and the admin page) can carry them without a one-off template field.

### Freeze and slow now target one weapon

- `freeze-on-hit` freezes **one enemy weapon 1/1/1/2/2 s by star rank** instead of the whole side,
  and never refreshes a frozen weapon while another one is free. The frozen weapon keeps its charge
  (`Runtime.weaponFrozen`) and resumes exactly where it stopped; the side-wide `freeze` status still
  exists for other sources.
- The new `slow-strike` gem slows **one random enemy weapon** by 10/20/30/40/50 % when any of the
  owner's weapons lands a damaging hit. `slow-on-hit` stays the old side-wide slow.
- `SideState.cooldowns[]` carries `frozen` / `slow` / `boost`, drawn as ❄ / 🐌 / ⚡ badges on the
  arena tiles.

### New option kits

- Freeze support: `freeze-haste` (applying a freeze speeds up the **edge-adjacent** weapons / focus
  items by 50/60/70/80/100 % for a few seconds), `freeze-heal` (heal when frozen), `freeze-reflect`
  (chance to freeze a random enemy weapon when hit).
- Damage / sustain: `rage-on-hit` and `rage-on-heal` (one damage stack per weapon hit / heal, max 10,
  applied to every weapon), `armor-on-heal`, `se-drain`, `heal-haste`.
- Armour family, split so an item takes only what it needs: `damage-reduction`, `starting-shield`,
  `healing-boost`, `regen`, `block-chance`, `debuff-heal`.
- `sword-energy-on-hit` is a new on-hit sub-kit. `block-charged` negates a **charged** attack when the
  defender holds `seCost` Sword Energy, emits a `block` event and draws a `ĐỠ ĐÒN` popup.
- `scaling = 5` (`enemyHpCurrent`) keeps a dot's raw percentage and drains the target's **current** HP
  every tick, which is what poison needs.
- Burn is now a **deep wound**: every heal and armour gain on a burning target is halved.

### Death zone

- Past **3 minutes** both sides take 1 % of their own max HP per second, **+10 % for every further
  minute**, until someone dies. The hard stop moved from 90 s to **360 s** so the zone always
  produces a result instead of a health-ratio comparison.

### Tooling

- `KitParamDef.defaults` seeds a **per-star** default (the 1/1/1/2/2 freeze, the 10→50 % slow…), so
  `defaultKit()` and a missing param read the designer's table instead of one flat number.
- The admin `parseKit()` used to treat every option kit that was not `parry` / `stats` as `aura`;
  it now returns a plain parameter table for the reaction kits and only parses JSON for `aura`.
- Tests: `game/__tests__/kits.test.ts` covers the freeze target / pause / resume, slow, charged
  block, burn healing, poison scaling, rage cap and the death zone.

---

## 2026-10-18 — Battle UI, combat feedback, and localization

Consolidated the battle-screen and game-presentation work from this session. These changes are in the
current worktree; no commit reference was supplied.

### Battle presentation

- Refined the arena layout: removed the arena-wide decorative frame/background, redundant loadout
  labels and center divider; kept the two teams aligned to opposing sides, with a small gap between
  each Cutie card and its equipment grid.
- Reworked battle Cutie cards with an original navy-and-brass frame, the existing Cutie art, name
  plate and seal row. Opponent teams stay flush to the right on wide screens.
- Increased battle loadout cells to 90px (150% of the 60px preparation/storage cells), increased
  the battle HP and Sword Energy bar heights to 24px and 12px, and retained the arena's available
  viewport height without stretching the fighter row.
- Kept battle playback on the existing interval clock and added a persisted ×0.5 / ×1 / ×2 / ×3
  speed preference.

### Skills paused

- **Cutie skills are paused**: a Cutie only performs its basic attack (shown as "Đòn thường" /
  "Basic attack") plus equipped weapon swings. The base attack keeps the numbers from `pet.skill`
  (`interval`, `damage`), but the skill name/description no longer appear in the pet panel, the
  preparation screen, the avatar seals or the battle log.
- **Item active effects were removed** from the templates and the simulation: `active`/`interval`
  are gone from `ItemTemplate`, and `Combatant.actives`/`skills` plus the top-bar skill chips were
  deleted with `SkillSlots`. Potion/curio templates that relied on an active pulse are inert until
  the skill system returns.
- The battle avatar keeps **two empty skill slots** (`data-skill-slot`) as placeholders.
- The admin item form no longer offers the `interval` field; a stored override that still contains
  it is ignored defensively.

### Item kits

- Every item mechanic is now a **kit** on the template (`ItemTemplate.kits`, catalogue in
  `game/kits.ts`), interpreted in `build.ts`. `damage` / `speed` / `onHit` were removed from the
  template: the **basic-attack** kit is what makes an item swing, and its on-hit effects
  (burn/poison/slow/freeze/lifesteal/shield) live in `kits[0].onHit` and produce independent
  `OnHitTrigger` rolls. **An item without an attack kit never attacks**; on-hit effects at the
  top level are folded into the attack (older payloads) or rejected by the backend.
- On-hit trigger chance is now a **percentage (0–100)** in the data; the simulation divides it by
  100 when rolling. The admin boxes therefore read `30` for 30%.
- **`passive` and `aura` were removed from the item template** and became the **option kits** `stats`
  and `aura`, stored beside the main kit with one JSON table per star. Every armour/jewellery/curio
  template was migrated to those kits with its existing numbers, so stats and auras are unchanged.
  The backend rejects the old top-level fields and validates the kit arrays.
- Added the **charge-attack** main kit: the item attacks normally, and when the owner's Sword Energy
  bar is **full** the swing spends the whole bar and lands `damage × multiplier`.
- The six weapon templates were migrated to kits with their existing numbers, so balance is
  unchanged.
- The admin page shows a **kit block** for every item: a "＋ Thêm kit" menu (attack kits plus option
  kits), one card per attached kit, one number box per star rank (JSON boxes for `stats`/`aura`), and
  a remove button. Every attack card keeps its own DPM line and hosts its own on-hit sub-kits.
- The backend whitelists `kits` and validates kit ids/parameter arrays; `damage`, `speed`,
  `interval`, `passive` and `aura` are no longer editable item fields.
- New kit checklist: `ItemKitId` / `OnHitKitId` / `OptionKitId` in `game/types.ts` → `KIT_DEFS` in
  `game/kits.ts` (with its `kind`) → interpretation in `build.ts` → `ATTACK_KIT_IDS` /
  `ON_HIT_KIT_IDS` / `OPTION_KIT_IDS` in `backend/src/content.ts`.
- The admin form now opens with **one card holding the picture and the base fields**: picture,
  **Tải ảnh lên** / **Xoá ảnh đã tải** and the **1★ … 5★** preview buttons on the left, name /
  type / tier / quality / price / footprint beside them. The kit block follows, so an item's identity
  reads before its mechanics.
- **An item may carry several attack kits.** `normalizeKits` used to keep only the first one, so
  adding `charge-attack` to a weapon that already had `basic-attack` replaced it — losing the numbers
  the designer had typed. Now every distinct attack kit is kept (duplicates by id are still dropped)
  and `build.ts` turns **each of them into its own `CombatItem`**: its own damage, cadence, on-hit
  rolls and (for `charge-attack`) the full-bar rule, with uid `itemUid#<kitId>` for the extra ones.
  Stats/aura kits are still read **once per item**, never once per swing, so a second attack kit
  cannot double a bonus stat. In the admin page "＋ Thêm kit" lists every kit that is not attached yet
  and simply appends it.
- The explanatory hint sentences were dropped from the kit block (section, card, on-hit and menu
  hints, plus `KitDef.hint` and its translations). Only the state messages stay — "no kit yet" and
  "no on-hit effect yet" — because they say what the item currently does.
- **Every inline hint in the admin form is gone**: `FieldDef.hint` and `KitParamDef.hint` were deleted
  together with their rendering (field label rows, the optional-field menu and the per-star kit rows),
  so a label now stands alone — `Shop tier`, `Quality`, `Cell footprint`, `Base attack`, `Speed`,
  `Damage multiplier`, `Trigger chance (%)`. The API keeps what the hint was explaining (`min`/`max`,
  the unit in the label, the field's own state message).
- **Damage moved out of the kits and onto the weapon.** `ItemTemplate.attack` (one value per star)
  is now the shared base attack; `basic-attack` keeps only `speed` + `multiplier` (default 1) and
  `charge-attack` only `cooldown` (seconds) + `multiplier`. Both kits on one item therefore hit from
  the same base number, and the charged slam is a cooldown-based hit rather than a faster attack.
  `attackKitInterval()` in `build.ts` is the only place that turns a kit's rhythm into milliseconds.
  The backend validates `attack` as five integers, an older payload that still stored `params.damage`
  has that number lifted onto the item (so a tuned value is not silently replaced by the code
  default), and adding an attack kit to an item with no damage seeds `attack = 10` at every star.
- **On-hit damage and shields can scale.** `burn-on-hit`, `poison-on-hit` and `shield-on-hit` gained a
  `scaling` parameter, rendered as **one select for the whole kit** (`single` — it describes the
  mechanic, not its strength) and stored as a number `0…4` copied to all five star entries, so the
  payload stays a table of numbers. Choices: fixed points, % of the owner's attack, % of the owner's
  max HP, % of the target's max HP. A **shield / self-heal only offers fixed, % of own max HP or
  % of own current HP** — its own bar is all it can read. `CombatEffect.scale` carries the choice and
  `scaledValue()` in `battle.ts` resolves the percentage at trigger time, so a burn built from the
  enemy's HP follows whichever enemy it lands on. Slow (a %) and lifesteal (a share of the hit) keep
  fixed semantics.
- **The outcome footer has a "fight again" button.** `data-battle-again` (Đánh lại / Đánh màn tiếp)
  calls `startBattle(battle.mode)` right in the arena — no trip back to the prep room — after rewinding
  the playhead (`resetPlayback()`, shared with **Phát lại**). A stage win has already advanced
  `run.stage`, so the label becomes **Đánh màn tiếp**; after a loss (or in PvP) it stays **Đánh lại**.
  It never double-commits: the new fight has its own `committed` flag and commits once when it ends.
- **The charged attack is now a sub-kit of the basic attack.** `charge-attack` used to be a second
  attack kit with its own `cooldown`, its own timer and its own card in the admin page — so a weapon
  with both kits swung twice. It is now `ItemKit.charge` **inside** an attack kit (`kind: 'charge'`):
  once the owner holds `seNeed` Sword Energy the **next basic attack becomes the charged attack**,
  spends that much and lands `attack × multiplier`. The charged number **replaces** the basic damage
  (`CombatItem.charge.damage`, `attack × multiplier`) — ❌ it is never added on top — and the kit has
  **no cooldown** any more, because the basic attack keeps its own speed. On the admin page the charged
  variant is a sub-block inside the attack card (with a `Sát thương đòn nạp` readout) and the add-kit
  menu only offers it while the basic attack has none; the backend validates it at
  `kits[i].charge` and rejects a top-level `charge-attack`. An old payload is folded automatically by
  `normalizeKits`, dropping the obsolete `cooldown`.
- **The weapon charge bar is full when the blade leaves.** Once the comet started launching one flight
  early, its own charge overlay (drawn against the *event* time) still read ~50–90 % at that moment.
  `weaponAttackTimes` now stores **launch** times (`event.t − COMET_LEAD_MS`), so the bar tops out at
  100 % exactly when the streak fires and only then starts the next cycle.
- **A comet now lands on the same tick as its damage number.** The playback used to spawn the streak
  when its event was crossed, so at ×0.5 the number and the bar jumped roughly half a second before the
  blade arrived. Comets are now launched **one flight early** (`event.t - 300` simulated ms), so the
  number, the bar and the impact land exactly with the animation at every speed; the floaters keep their
  own cursor (`feedbackCursorRef`) and the launch has its own (`visualCursorRef`).
- **Battle projectiles are comets now.** Three attempts landed here; this is the one that reads right.
  The old visual morphed a **ribbon** along the path — first half-length (the visible part popped up
  mid-air), then full-length (a rope between weapon and target), then a 35 % stroke that still morphed
  every frame. Now each hit is a **blade-shaped comet**: a **sharp nose** (a point — ❌ no rounded cap,
  no dot at the front, which was rejected), a 260 px tapering tail and a hot sliver inside, all drawn
  from one `cometShape()` silhouette. It **translates in a straight line** from the centre of the
  weapon tile to the target, with a muzzle
  flash on the origin (`data-combat-muzzle`). Only `x`/`y`/`opacity` animate, so it stays smooth at ×3;
  it lands at 90 % of the flight (`data-combat-impact-at`), which is when the impact sound fires.
  `components/combatRibbon.ts` and its test were deleted with the old shape. A Cutie's own swing
  leaves from its portrait centre.
- **Cutie skill slots are reserved but inert.** `PET_SKILL_SLOTS = 2` is the single place that says a
  Cutie has two skills; the battle avatar draws both as **empty** seals (`data-skill-slot`,
  `battle-cutie-seal-empty`) and no skill data is stored or read, so nothing can activate. The slots
  are ready for the skill system that comes later.
- **A Cutie has kits, 10 levels and a bag that grows by itself.** `PetDef.skill` (the JSON
  `{ name, interval, damage, desc }` box) and `PetDef.bags` (a hand-tuned grid per level) are gone
  from the type, the admin page, the overrides and the backend whitelist. The Cutie now carries
  `attack` (one number, no stars) plus `kits` — the same catalogue items use, `basic-attack`
  included — so the admin page can add or drop its swing like any other kit; a Cutie with no
  attack kit deals no damage. `MAX_PET_LEVEL` is **10** (12 % HP / 12 % attack / +1 SE regen per
  level, `sanitizeRun` clamps to it) and the carried grid comes from `petBag()`: 3 rows, 4 from
  level 3, 5 from level 5. The detail panel lists each of the Cutie's own swings from the built
  combatant instead of reading `pet.skill`.
- **Chấn Đao is an item kit, not a hidden mechanic.** New option kit `parry` (`parry` / `Chấn Đao`)
  with per-star `chance` %, `cost` Sword Energy and `power` % of the owner's basic attack. It is the
  **only** source: `PetDef.counterChance`, `EnemyBlueprint.counterChance`, the `counterChance` /
  `counterPower` stat keys, `COUNTER_COST` and the admin/pet/prep-screen fields were deleted, and
  `Combatant.parry` is read from the strongest `parry` kit on the loadout. `Hồn Ngọc Kiếm Thế`
  (`jade-sword`) now carries the kit (5/8/12/18/27 %, 65 SE, 100/110/120/135/155 % counter).
- **Sword Energy is no longer spent at random.** Every weapon without a charge kit used to gamble
  24–40 SE (45 % chance per swing) on a hidden `×2.2` heavy hit, so the bar could never climb to a
  `charge-attack`'s `seNeed` — the reason a charge kit "never fired". The gamble is gone: SE is
  spent **only** by Chấn Đao (65) and by a charge swing (`seNeed`). `CHARGED_MULTIPLIER` and
  `chargedCost()` were deleted with it.
- **The armour badge follows the real shield.** `useSpring(number)` only seeds the spring, so the
  number stayed at the starting armour for the whole fight while the real shield was being spent
  and re-granted; it now prints `state.shield` directly (like health). The Sword Energy bar also
  carries a `current / max` read-out (`data-battle-se-value`), one size smaller than the health
  bar's, because the bar itself is only 12 px tall.
- The `charge-attack` kit is now called **`Charged attack`** (label `Trọng kích nạp`) and gained a
  **`seNeed`** parameter: the Sword Energy the owner must hold for the swing to become the heavy hit
  (default `100` = the whole bar), which is exactly how much the swing then spends. Before this the
  threshold was hard-wired to `maxSe`, so a weapon with a long cooldown almost never fired it.
- **The item detail dialog shows every kit, one block each.** Both attack kits are printed with
  their own numbers — `Đòn đánh cơ bản` (damage per hit, attacks/second, interval, DPS) and
  `Trọng kích nạp` / Charged attack (damage per hit, cooldown, Sword Energy needed, charged
  multiplier, charged damage) — and
  each block lists **its own** on-hit effects as `label · chance%` plus the real number
  (`14/s · 3s`, `+30`, `+30% × máu tối đa`). The adjacency aura follows with its requirement and
  mods, so a value saved on the admin page is visible in game instead of only in the editor.
  `onHitText()` reads the same kit data the battle does.
- **A `charge-attack` multiplier is applied once, on the charged hit.** `attackDamage()` used to
  scale a charge kit's plain swing as well, so a full bar multiplied twice (`attack × multiplier²`).
  A plain swing now hits for the base attack and only the charged hit multiplies — matching both the
  detail dialog and the admin DPM line.

### Combat feedback and stats

- Added Cutie critical chance and bonus critical damage to the stat sheet, UI and battle calculation.
  Current defaults are 5% critical chance and +80% critical damage (×1.8 total); critical metadata
  is recorded on battle events so replay preserves the hit color.
- Projectile colors: critical red, normal white, charged blue. Weapon attacks originate at the
  equipped item's tile; basic attacks and counters originate at the Cutie.
- Added per-weapon blue charge overlays driven by the simulated attack event times. The overlay
  reaches full at the attack, stays full briefly, resets to 0%, then charges toward the next
  attack. It is visual-only.
- Reworked projectile trails as short (50%-trajectory) animated comet streaks: a very thin tail
  widens into the body and ends in a broader, shallow point; glow and white core share that shape.
  The trail pauses briefly on impact before fading. Hit and heal floaters use separate positions,
  while damage/audio/UI effects do not alter battle outcomes.
- Added procedural Web Audio sword-sweep and impact effects, unlocked from the start-battle click;
  no external sound files were added.

### Storage sort

- **Kho đồ has a `Sắp xếp` button** (`data-storage-sort` in the panel header, next to the item count).
  It is the **only** thing that repacks the storage — the grid itself still never arranges items for
  the player, and a drop is still rejected rather than slid out of the way.
- `sortStorage()` in `game/storage.ts` orders by **star rank → footprint area → template id → uid**
  (strongest, biggest first, deterministic) and lays each item out with `findFreePlacement` from the
  top-left corner, so the result is gap-free and one screen tall. It never changes what an item is
  (no merging, no star changes) — only `slot`/`rotated`.
- The store action pushes its toast **before** `set` (pushing inside a `set` updater wipes it, the
  `upgradePet` lesson).
- Tests: `game/__tests__/storage.test.ts` — packs without gaps in priority order, and a lone item still
  lands in the first cell.

### Shop tip wording

- The **Shopping Tips** paragraph said "buy two identical items and stack them in the inventory to
  merge" — wrong since buying merges by itself. It now says a duplicate (same item, same star) merges
  on the spot, a worn copy winning over a stored one.

### Item details from the arena

- **Both grids on the battle screen open the item detail dialog** — clicking a tile mid-fight inspects
  it, exactly like the bag; the player's side already passed `onItemClick`, the **opponent's** now does
  too. The enemy's gear lives in `battle.opponentItems`, not in `run`, so `uiStore` carries an optional
  `itemPreview` (`openItem(uid, preview)`) and `ItemDetailDialog` reads it as a **fallback only**: a
  bag item always wins, which keeps the "sold while the dialog is open → closes itself" behaviour.
- An item that is not ours shows no **shop price / paid / sell value** rows (`owned` flag).
- `overlayClass` moved from `z-30` to `z-[45]`: the battle screen's outcome panel is a full-screen
  `z-40` button, so a dialog opened while the result is on screen used to end up underneath it.
- Test: `battlePlayback.test.tsx` — "opens the detail dialog for an item of either side" (stage 22,
  because the opponent only carries gear from stage 8 on).

### Weapon charge is a rising bar

- The charge read-out on a weapon tile is no longer a translucent **fill over the whole item** — it is
  one bright **horizontal hairline** (`data-weapon-charge-overlay`) that climbs from the bottom edge to
  the top: `height` is a fixed 3 px (scaled with the cell) and `bottom` is `calc(<percent>% - 2px)`, so
  the bar's lower 2 px sit **inside** the wash and the two can never separate. ⚠️ An earlier version
  floated the bar above the wash edge with `-translate-y-1/2`; the half-height offset left a visible
  dark hairline — a "gap" — between line and wash at every percentage. The picture stays fully readable
  while the bar charges.
- Tests updated: the overlay is read through `style.bottom` (percentage) and `style.height` is asserted
  to be the thin `3px`, so a full-tile fill cannot come back unnoticed.
- **A finished charge is replaced by a new bar, not dragged back down.** `weaponChargeState()` now
  returns `{ percent, cycle }`; `cycle` advances **the instant the bar leaves 100 %** (one pulse after
  the swing — the frame where the percentage drops to zero), and `ItemTile` uses it as the bar's `key`.
  Each cycle therefore mounts a **fresh** element that starts at the bottom, instead of one element
  transitioning from 100 % down to 0 %. ⚠️ Advancing the cycle only at the next cycle's *start* left the
  old key in place while the percentage was already 0 — the full line then slid back down, which is
  exactly what "still animating downward" meant. Exposed as `data-weapon-charge-cycle`; a live trace of
  the arena now shows **zero** frames where a cycle's percentage decreases.
- **A wash fills the space the line has covered** — strong enough to read at a glance.
  `data-weapon-charge-fill` is a second element whose height follows the same percentage: a translucent
  gradient, brightest just under the line, plus an inner glow so the covered part is obviously "charged"
  while the picture still shows through (❌ never an opaque fill).
- **Line and light are one object.** The glow is the bar's own `box-shadow` — several downward-offset
  layers — so line and light merge by
  construction. The drifting **texture** layer was dropped on the player's call: any extra element under
  the bar reads as a second shape no matter how it is masked. ⚠️ A glow painted as its own band always
  shows a seam or a gap; keep the light on the bar.
  Earlier attempts, kept as a warning: positioned by `bottom` the band sat *above* the line (looked like
  it covered the bar), at 4–30 % alpha it could not be seen at all, and as a separate masked rectangle
  it never blended when overlapping the bar.

### Item plate: quality background with cloud engraving

- The tile is no longer a flat `bg-rank-N/22` tint. `styles/app.css` paints a **deep plate** from the
  tile's `data-item-quality`, layer by layer: a lit lip along the top edge, a corner highlight, a
  quality-coloured glow behind the picture, a **cloud engraving**, and a three-stop gradient (top lit →
  mid → sunk). Inset shadows on all four sides give the slab its depth.
- The cloud motif is an inline SVG (`url("data:image/svg+xml,…")`) of **spiral curls plus long flowing
  waves** — the curls come from two shrinking arcs each, so they read as 云纹 scrolls rather than
  circles. It is painted **twice**: a light copy one pixel under a dark one, which turns the lines into
  a carved groove instead of a painted stroke.
- Frame: the class colour stays as the outer border (weapon/armour/…), and `.surface-item::before` adds
  the **warm gold hairline** of the reference tiles, with a thin gold band inside it.
- `ITEM_QUALITY_BG` and its `bg-rank-N/22` classes are **gone** (`itemTileClass()` now only picks the
  class border) — ⚠️ putting a flat tint back would flatten the plate. The admin swatch
  (`ITEM_QUALITY_SWATCH`) keeps its solid colours, it is only a legend.
- ⚠️ When editing the motif: the SVG is a **data URI**, so it must be percent-encoded and every `<path>`
  needs its own entry — a single joined string silently renders one `<path>` per character and nothing
  visible at all (that is how the first attempt looked empty).
- Tests updated: the tile is asserted by `data-item-quality` + `surface-item` instead of a colour class
  (jsdom cannot resolve CSS gradients).

### Cutie level growth, and a quieter Cutie panel

- The hint paragraph under **Nâng cấp** ("Mỗi cấp tăng 12% máu…") is gone — the numbers are visible in
  the stat sheet above it, and the sentence went stale the moment the growth changed. Its i18n entry
  was deleted with it.
- **The Cutie name sits right after the avatar.** The change affordance is a small round **swap badge** on
  the avatar's bottom-right corner (`data-change-cutie`) instead of a sibling button with a label, so the
  row reads avatar → name → blurb. The trigger button keeps its `aria-label="Đổi Cutie: <name>"`.
- **"Đổi Cutie" is an icon now** (`ArrowLeftRight`, exported from `components/icons.tsx`) beside the round
  avatar — the button already carried `aria-label="Đổi Cutie: <name>"`, so the label text was only
  noise next to the picture.
- **The Cutie avatar is a round badge now.** `PetTile` gained a `round` shape: the square cell keeps its
  14 px corner and padding (admin preview, lists), while the Cuties panel draws a **96 px circle** with
  no padding, a 2 px gold rim and `object-cover`, so the picture reaches the rim instead of sitting in
  a small box. `PetIcon` passes `fit` through to `ArtIcon` for that.
- **The stage banner is gone from the preparation room.** The middle column is now just the storage: the
  Cutie portrait + name + "Huo Luo · Stage 29" panel repeated what the left panel and the top bar
  already say. `PetPortrait`, its `surface-stage` utility and the unused `pet`/`map` lookups were
  removed with it.
- **The Equipment header shows only its title.** The "3 items · 9/20 slots · Power …" counter is gone
  (the same numbers live in the Cuties panel), together with the code that computed it. Locked cells
  are still dimmed on the board, which is the only cue left — and the tests now assert that instead of
  the removed label.
- **The Basic attack block now sits under the stat grid** in the Cuties panel (header → cutie → stats →
  basic attack → level-up button). The stat sheet answers "how strong is this cutie", the swing answers
  "what does it hit for", so the order reads top-down.
- **Each level now adds 10% max HP and 10% base attack** instead of 12%, in one constant
  (`PET_GROWTH_PER_LEVEL` in `game/pets.ts`) so the number lives in a single place. Sword Energy regen
  still grows **flat** (+1 per level — a rate, not a pool).
- Docs updated where the figure was quoted: `GAME-RULES.md`, `ADMIN.md`, the `PetDef.attack` comment.

### Grid cells are 90 px

- `CELL_SIZE` in `components/GridBoard.tsx` is **90**, so Trang bị, Kho đồ **and** the arena use the same
  cell — an item looks the same size on every board. Gap/padding scale from it (4 px / 6 px at 1:1).
- Consequences kept in mind: the 8-column Kho đồ board is 762 px, so `PrepScreen` gives the middle column
  `lg:flex-[2.25]` and the loadout column `lg:flex-[1.2]`, the app frame is `max-w-[1640px]`, and
  `InventoryGrid` scrolls with `overflow-auto` (`-y` clipped the board on narrower screens).
- `ItemGridPreview`/`ArtPreview` keep a **60 px** preview cell (`PREVIEW_CELL_SIZE`): a dialog/admin
  preview sits beside text and only has to show the tile's **shape**.

### Damage numbers

- 🔴 **The "numbers jump again on every hit" bug had a structural cause, not a timing one.** The avatar
  holder was `<div key={hitKey}>`, so every landed hit **remounted the whole frame — including every
  floating number inside it**, restarting all of their animations. The numbers also animated through
  `motion`, which replays its keyframes on re-render. Fixed by keying **only a wrapper around the
  picture** (that is all the shake needs) and animating the numbers with a **CSS** keyframe
  (`animate-combat-floater` + `--floater-life` / `--floater-delay`).
- Each number's spot is a **pure function of its key** (`feedbackPosition` in `AvatarCard`): the old
  shared 18-slot packer re-assigned positions whenever the live set changed, so older numbers
  teleported mid-flight while new ones appeared.
- **One number per hit** — an intermediate version merged a burst into a single number, which hid real
  damage ("sometimes a number appears, mostly none"). Hits crossed by the same replay tick are now
  staggered by `FEEDBACK_STAGGER_MS` (90 ms of real time) so a burst reads in the order it landed.
- **Two hits on the exact same tick are still two numbers.** Two copies of one weapon have the same
  cadence, so they fire together; summing them made two 4★ weapons look like a single weapon, so the
  tie-break is presentation only: 90 ms apart, in two different spots.
- Lifetime is **700 simulated ms** (`700 / speed` real, floor 480 ms) and at most `FEEDBACK_MAX_LIVE`
  (5) numbers per side — past that the oldest makes room instead of covering the frame.
- Tests: every hit of a burst gets its own number, half-second lifetime at ×2, and "a number keeps its
  spot while the others come and go".

### Economy and shop

- **Buying an item now merges it with an identical copy first** (`acquireItem()` in
  `game/loadout.ts`): a **worn twin** on Trang bị wins over a **stored twin** in Kho đồ, and only
  when there is no twin does the purchase take a cell of its own (Trang bị when it fits, otherwise
  Kho đồ). A duplicate is worth more as a star up than as a second tile, and a merge needs no
  space at all.
- The merge keeps the surviving copy's `uid`, cell and rotation, adds `+1★`, and **sums `paid`** so
  selling the merged item back still returns 50% of everything that went into it. It is refused at
  **5★** (`isMergeable`) — a bought 5★ takes its own cell.
- `acquireItem()` now also returns `merged`/`compacted`, so the buy toast reports what happened.
- **A purchase now settles the whole bag.** `acquireItem()` (renamed internally to `placePurchase()` +
  a tidy-up pass) runs `mergeDuplicates()` over **Trang bị** and **Kho đồ separately** right after the
  purchase, so duplicate copies that had never met — bought in an earlier shop roll, or from before
  the rule existed — are collapsed too, **cascading** until nothing is mergeable (`2+2 → 3`, `3+3 → 4`).
  The first copy in list order survives (same `uid`, cell, rotation), `paid` is summed, and a merge
  never crosses star ranks. This is the reason a bag full of 2× 4★ and 3× 2★ of one sword ends up tidy
  as soon as the player buys anything; ❌ the bag still never re-arranges itself without a purchase.
- Tests: `game/__tests__/store.test.ts` — buying collapses 4★+4★/2★+2★ left over in Equipment, four
  2★ in Kho đồ cascade into one 4★, and a 1★ next to a 2★ stays untouched. Frontend suite: **438 passed**.
- Tests in `game/__tests__/store.test.ts`: merges into a worn copy without dragging, merges into
  Kho đồ when there is no worn twin, and refuses to merge onto a 5★ copy. The "grid full → storage"
  test now buys **different star ranks** on purpose, because identical ones would merge instead of
  taking a cell. Frontend suite: **429 tests passed**.

### Navigation and language

- Added a return-home action on the Admin page.
- The Admin action leaves an active battle/result without granting a pending reward before opening
  `/admin`, preventing the route from being hidden by the battle screen.
- Added English-first / Vietnamese-secondary UI localization and the Roboto/sans font stack.

### Verification at the end of the battle-visual work

- Frontend suite: **395 tests passed across 30 files**.
- Frontend production build and TypeScript build passed.
- Frontend lint passed with the existing warnings in `routes/__root.tsx` and `GridBoard.tsx`.
- Build continues to report the existing large JavaScript chunk warning (>500 kB).

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

### Open / deliberately not done

| Item | Decision |
| --- | --- |
| Three items still default to a **horizontal** footprint (Phiến Băng, Song Trảo, Cờ Lụa — 2×1) | The owner reviews each one in the admin editor ("Kích thước ô"); no code change |
| "Chơi lại" resetting `clearedStage` (and with it the 2★/3★ shop odds) | **Intended** — a restart is a brand-new run with nothing carried over, no high-water mark (see `docs/GAME-RULES.md` §3) |
| A shop rolled by an older build can still hold a 2★ offer before stage 40 | Deferred until the balance pass: re-rolling/downgrading offers that the current rules would not produce |
