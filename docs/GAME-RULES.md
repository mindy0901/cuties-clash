# Rules already implemented

> Do not break the rules below when changing code. To change a rule, change it **deliberately**,
> together with tests.
> Source: `frontend/src/game/` (pure logic, no React).

## 1. Trang bị

| Mechanic | Details |
| --- | --- |
| Star merge | 2 items with the **same template + same star** → `+1★`, up to **5★**. Different ones **swap positions** |
| Price | `starPrice(cost, star) = cost × star`. Selling back = **50%** of `paid` (the total actually paid) |
| Kho đồ | **Trang bị** (what is carried) is a **4-column** grid, the number of rows follows the pet level: 3→5 (12–20 cells). **Kho đồ** (storage) is also a **free 8-column grid**, **unlimited**: the grid grows taller by itself when items sit lower |
| Where an item lives | Buying in the shop → it is **carried onto Trang bị automatically if there is room**, otherwise it goes into Kho đồ. ❌ **Only items in `run.equipped` take part in battle** (passive, aura, weapon); items in `run.inventory` have no effect |
| Moving items | **Drag and drop** between the two panels and within each panel. **Clicking** an item opens its **details** (❌ clicking does not pick up or place anything). `R` / right click to rotate while **dragging**, `Esc` to drop. The ↑ / ↓ / "Tháo hết" buttons are still there |
| Shape | Every template has `space: {w,h}`; an item occupies a **rectangular block of cells** (sword 1×3, great sabre 2×3, blade shaft 1×4, jade/pill 1×1) |
| Rotation | `R`, right click (while **dragging**), or the ⟳ button → rotates 90°, swapping `w`/`h`. ❌ It only changes when the new orientation **fits** |
| Collision | `fitsIn(slot, size, …)` is the **core predicate** for every operation. Grid bounds are checked against the **anchor cell**, not against a derived list of cells (an item may overflow its row) |
| Anchor cell | The cell under the cursor may not be a valid anchor cell (cell 5 for a 4×1 item in a 4-column grid). **Always go through `anchorFor()`** to clamp the block inside the grid. ❌ Do not call `cellsOf(hoverSlot, …)` directly |
| **The preview must match the result** | The preview block is centred on the cursor, and `GridBoard` reports **that exact anchor cell** up to the parent so the drop reuses it (`onAnchorSlot`). A **yellow** outline = dropping places the item, a **red** outline = it will not place (`blocked`). Red when the block **overflows the usable area** (outside the grid, or over a cell locked by the pet level) **or overlaps another item**; only the **item directly under the cursor** is exempt — and only when that action actually works: a **star merge** (same template + same star) always does, a **swap** only in a grid that allows it (`allowSwap`; Kho đồ does not). A third item falling inside the block is still red, and overflow is **always** red. ⚠️ `resolveDrop` **rejects** when the block overlaps another item — ❌ it does **not** slide to another empty cell: the drop must match the outline the player is seeing. A long item that does not fit into the Trang bị grid (1×4 in a 3-row grid) is rejected too ⇒ the player presses `R` to rotate, the game ❌ does not rotate it for them and place it elsewhere |
| Buying when full | Trang bị has no room left → the item goes into **Kho đồ at the first free spot**, drag it up later |
| Kho đồ is a free grid | Items in Kho đồ sit at **exactly the `slot`/`rotated` the player placed them at** — Kho đồ ❌ **does not arrange things for you** and does not compact items when one is added or removed. `slot`/`rotated` in Kho đồ is **real data**; `slot = -1` is now only a marker of an old save that needs `repairKhoSlots` to lay it out again on load |
| Kho đồ ❌ **does not swap** | Dropping on top of a **differently-typed** item in Kho đồ is **rejected** (red outline), ❌ it does not push the item sitting there somewhere else — Kho đồ is a free grid so there is always a free cell; to change places, drag the other item away first. Dropping onto an **identical** item (same template + same star) still **merges stars** as usual. Unlike **Trang bị**: there, "different ones swap positions" is a game rule |

## 2. Combat

| Mechanic | Details |
| --- | --- |
| Kiếm Thế (SE) | Regenerates `seRegen`/second, **+4 every time you are hit** |
| Chấn Đao | Costs **65 SE** (`COUNTER_COST`), breaks the attack → counter for `referenceAtk × counterPower`, pushes the opponent's attack bar back **350 ms** |
| Trọng kích | Costs **24–40 SE** (depending on weapon speed), damage **×2.2**. Critical hit **×1.8** |
| Statuses | Chậm · Đóng Băng · Độc · Cháy · Hồi phục · Cuồng phong · Giòn |
| Adjacency | The aura is computed from **every cell** of an item (`adjacentUids`), not just the anchor cell. `aura.target`: `adjacent` / `adjacentWeapon` / `adjacentNonWeapon` / `all` |

## 3. Progression

| Mechanic | Details |
| --- | --- |
| Clearing a stage | `clearedStage = max(clearedStage, stage)`, then `stage + 1` (capped at **60**) |
| Pet unlocks | The second pet at **stage 20**, the third at **stage 40** (`unlockStage`) |
| PvP | `makeRivalBlueprint(power, stage, seed)` — **does not** change `stage`/`clearedStage` |
| Maps | 60 stages split across 3 maps (`MAPS`), 20 stages per map |

## 4. Star ranks and item quality

**Star rank** is earned during a run: merge two copies of the same template at the same star and the
result is one rank higher. **5★ is the cap** (`MAX_STAR` in `game/items.ts`).

| Star | Price in the shop | Notes |
| --- | --- | --- |
| 1★ | `cost × 1` | Starting rank, also what the shop mostly offers early |
| 2★–4★ | `cost × star` | Can also be bought directly later (shop star chances by map) |
| 5★ | `cost × 5` | Only reachable by merging two 4★ copies |

Every per-star value in `game/items.ts` is declared as an array with **one entry per star rank**
(`pick(star, [1★, 2★, 3★, 4★, 5★])`), so a missing rank is a type error rather than a silent fallback.
Art ships for star ranks **1–4**; a 5★ item renders the template's emoji (`stars` in `items.ts`).

⚠️ **5★ belongs to the player only.** The shop stops at 4★, and enemy loadouts stop at 4★
(`enemyStar` in `game/stages.ts`) — a 5★ enemy loadout makes the last map unwinnable for every build,
so it is deliberately not used. Measured numbers: `docs/BALANCE.md` §1.

**Quality** (`quality` on `ItemTemplate`, fixed per template — ❌ it does *not* follow the star rank):
it only decides the **colour of the item tile**, so the catalogue reads at a glance. It is data, and
the admin page can edit it.

| Quality | Colour | Colour token | Typical templates |
| --- | --- | --- | --- |
| 1 | Bạc (silver) | `--color-quality-1` | Starter gear: Đao Gỗ, Giáp Da, Lộ Sương, Hồn Ngọc Thôi Sách |
| 2 | Xanh lá (green) | `--color-quality-2` | Thương Lửa, Hồn Ngọc Phẫn Nộ, Đèn Quỷ |
| 3 | Lam (blue) | `--color-quality-3` | Everything from the middle maps (tier 2) |
| 4 | Tím (purple) | `--color-quality-4` | Late-map support: Hồn Ngọc Hộ Thể, Hàn Ngọc Phù, Mảnh Gương, Cờ Lụa, Thuốc Sắt |
| 5 | Vàng cam (gold-orange) | `--color-quality-5` | Late-map power: Phủ Nặng, Song Trảo, Giáp Vệ Binh, Thần Đúc Sư |

⚠️ Colours live in `@theme` in `src/styles/app.css` and are applied through the **lookup tables**
`ITEM_QUALITY_BG` / `ITEM_QUALITY_SWATCH` in `src/components/ui.ts` — ❌ never build a class name
dynamically (``  `bg-quality-${q}`  ``), Tailwind only emits classes it can read in the source.

## 5. Vietnamese in the UI

Every string shown to the player — **including API error messages** — must be Vietnamese. ❌ No English
mixed in (except proper nouns such as *Stormchant*, *Paw Tally*).

Fixed terminology (use exactly these words): Vũ khí · Hộ giáp · Hồn Ngọc · Pháp Bảo · Đan Dược · Kiếm
Thế · Chấn Đao · Trọng kích · Thú cưng · Màn · Bản đồ · Trang bị · Kho đồ · Sức mạnh · Paw Tally.

## 6. Rule → source mapping

| Rule | File |
| --- | --- |
| Star merge, price, selling back, grid collision | `game/bag.ts` |
| Kho đồ is a **free grid**: row count, placement, drag/drop/rotate inside Kho đồ | `game/storage.ts` |
| Splitting Trang bị ↔ Kho đồ | `game/loadout.ts` |
| Item templates, star tiers, **quality band** | `game/items.ts` |
| Quality colours and the shared tile class | `components/ui.ts`, `styles/app.css` |
| Pets, levels, number of grid rows | `game/pets.ts` |
| Stages, maps, PvP blueprint | `game/stages.ts` |
| Merging passive + aura → stats | `game/build.ts` |
| Battle simulation (deterministic) | `game/battle.ts` |
| Shop rolls, reroll, money | `game/economy.ts` |
| Stats, Vietnamese labels | `game/stats.ts` |
| Status effects (label/icon) | `game/labels.ts` |
| Normalising a broken save | `game/sanitize.ts` |
| Upgrading a v1 → v2 save | `game/migrate.ts` |
| Shared deterministic PRNG | `game/rng.ts` |

To **add** an item / pet / stage / mechanic: see `AGENTS.md` §5.
