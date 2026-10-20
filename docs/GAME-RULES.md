# Rules already implemented

> Do not break the rules below when changing code. To change a rule, change it **deliberately**,
> together with tests.
> Source: `frontend/src/game/` (pure logic, no React).

## 1. Trang bị

| Mechanic | Details |
| --- | --- |
| Star merge | 2 items with the **same template + same star** → `+1★`, up to **5★**. Different ones **swap positions** |
| Price | `starPrice(cost, star) = cost × 2^(star-1)` — a rank costs as much as the copies it is made of. Selling back = **50%** of `paid` (the total actually paid); drag an item onto a Shop button to sell it |
| Kho đồ | **Trang bị** (what is carried) is a **4-column** grid whose rows follow the Cutie level **automatically**: 3 rows at level 1–2, 4 at level 3–4, 5 from level 5 (12–20 cells). ❌ Nobody configures the grid per pet — `petBag()` in `game/pets.ts` is the only rule. **Kho đồ** (storage) is also a **free 8-column grid**, **unlimited**: the grid grows taller by itself when items sit lower. Every board uses a **90 px** cell (`CELL_SIZE`), the arena included |
| Where an item lives | Buying in the shop → **it merges with an identical copy first** (same template + same star): a worn copy on Trang bị wins over a stored one, and only when there is no twin does it get a tile of its own — **carried onto Trang bị automatically if there is room**, otherwise into Kho đồ. ❌ **Only items in `run.equipped` take part in battle** (passive, aura, weapon); items in `run.inventory` have no effect |
| **A shop offer that would merge** | Its cell shows a **dashed golden ring** around the tile and an `↑ N★` badge (top-left) as soon as a twin of it — same item, same star — sits in Trang bị or Kho đồ. It is a hint only: the price and the click are unchanged, and buying it then merges as usual. Rule: `mergeUpStar()` in `game/bag.ts` |
| Buying merges first | `acquireItem()` checks in this order: **worn twin → stored twin → free cell on Trang bị → Kho đồ**. A merge consumes the bought copy, gives `+1★` to the copy that stays (**same `uid`, same cell**), sums `paid` (so selling it back still returns 50% of everything spent) and stops at **5★** — a 5★ copy is **not** mergeable (`isMergeable`), so a bought 5★ takes its own cell |
| Buying also tidies the bag | Every purchase then runs `mergeDuplicates()` over **Trang bị and Kho đồ separately**: any two identical copies that never met are collapsed, **cascading** (`2+2 → 3`, then `3+3 → 4`) until nothing is mergeable. Same `uid`/cell/`paid` rules; ❌ it never merges across star ranks (a 1★ and a 2★ are different items), and it only happens on a purchase — ❌ the bag never re-arranges itself at any other time |
| Moving items | **Drag and drop** between the two panels and within each panel. **Clicking** an item opens its **details** (❌ clicking does not pick up or place anything) — in the **arena too**, on both sides: the opponent's gear can be inspected while the fight runs (its preview is not in the run, so the shop/sell rows are left out). `R` / right click to rotate while **dragging**, `Esc` to cancel. Drag an item onto a **Shop button** to sell it for the usual 50% refund — in the preparation room that is the **"Mua Vật Phẩm"** button on the **floor of the Trang bị panel** (full width, under the equipment grid, with **Tháo hết** right below it), on the shop page it is the **"Kéo món vào đây để bán"** zone under the equipment grid. The ↑ / ↓ / "Tháo hết" buttons are still there |
| Shape | Every template has `space: {w,h}`; an item occupies a **rectangular block of cells** (sword 1×3, great sabre 2×3, blade shaft 1×4, jade/pill 1×1) |
| Tile plate | The tile background comes from the item's **quality** (`data-item-quality` → `.surface-item` in `styles/app.css`): a deep gradient plate with a glow behind the picture, a **cloud engraving** (spiral curls + flowing waves, carved light-under-dark) and a warm gold hairline frame inside the class-coloured border. ❌ Never a flat tint — that is what made the old tiles look like coloured boxes |
| Where the shape is drawn from | **Everywhere except the two bag boards** (shop card, item dialog, admin preview) the item is drawn in the shape it was **defined with** — in code or on the admin page. A turned item still shows upright there; only Trang bị, Kho đồ and the battle view use the player's real rotation |
| Rotation | `R` or right click (while **dragging**) → rotates 90°, swapping `w`/`h`. ❌ It only changes when the new orientation **fits** |
| Picture rotation | In Trang bị and Kho đồ, rotate the item's picture with its footprint too; fit the rotated artwork inside the new rectangular tile. Standalone previews and detail/shop cards keep the item's defined orientation |
| Collision | `fitsIn(slot, size, …)` is the **core predicate** for every operation. Grid bounds are checked against the **anchor cell**, not against a derived list of cells (an item may overflow its row) |
| Anchor cell | The cell under the cursor may not be a valid anchor cell (cell 5 for a 4×1 item in a 4-column grid). **Always go through `anchorFor()`** to clamp the block inside the grid. ❌ Do not call `cellsOf(hoverSlot, …)` directly |
| **The preview must match the result** | The preview block is centred on the cursor, and `GridBoard` reports **that exact anchor cell** up to the parent so the drop reuses it (`onAnchorSlot`). A **yellow** outline = dropping places the item, a **red** outline = it will not place (`blocked`). Red when the block **overflows the usable area** (outside the grid, or over a cell locked by the pet level) **or overlaps another item**; only the **item directly under the cursor** is exempt — and only when that action actually works: a **star merge** (same template + same star) always does, a **swap** only in a grid that allows it (`allowSwap`; Kho đồ does not). A third item falling inside the block is still red, and overflow is **always** red. ⚠️ `resolveDrop` **rejects** when the block overlaps another item — ❌ it does **not** slide to another empty cell: the drop must match the outline the player is seeing. A long item that does not fit into the Trang bị grid (1×4 in a 3-row grid) is rejected too ⇒ the player presses `R` to rotate, the game ❌ does not rotate it for them and place it elsewhere |
| Buying when full | Trang bị has no room left **and no twin anywhere** → the item goes into **Kho đồ at the first free spot**, drag it up later |
| Kho đồ is a free grid | Items in Kho đồ sit at **exactly the `slot`/`rotated` the player placed them at** — Kho đồ ❌ **does not arrange things for you** and does not compact items when one is added or removed. `slot`/`rotated` in Kho đồ is **real data**; `slot = -1` is now only a marker of an old save that needs `repairKhoSlots` to lay it out again on load |
| **Sắp xếp** (sort) | The **only** way the storage gets repacked, and only when the player presses the button in the Kho đồ header (`data-storage-sort`, `sortStorage()` in `game/storage.ts`): items are ordered **strongest first** (star rank → footprint → template id → uid) and laid out from the top-left corner with no gaps. ❌ It never runs by itself, and a drop still never slides an item out of the way |
| Kho đồ ❌ **does not swap** | Dropping on top of a **differently-typed** item in Kho đồ is **rejected** (red outline), ❌ it does not push the item sitting there somewhere else — Kho đồ is a free grid so there is always a free cell; to change places, drag the other item away first. Dropping onto an **identical** item (same template + same star) still **merges stars** as usual. Unlike **Trang bị**: there, "different ones swap positions" is a game rule |

## 2. Combat

| Mechanic | Details |
| --- | --- |
| Kiếm Thế (SE) | Regenerates `seRegen`/second, **+4 every time you are hit**. It is spent **only** by a `parry` kit (its `cost`) and by a charged attack (`seNeed`). ⚠️ **Only the `sword-energy` kit may change `seRegen`** — a `stats` / `aura` table that tries to set it is rejected by the server. Every other SE number in a kit (charge threshold, parry cost, charged block, drain, gain) is a **percentage of the owner's max bar** |
| Giáp (shield) | The shield is **virtual HP**: a hit drains it first and only the overflow reaches HP (`dealDamage`), so a full shield turns a hit into 0 health loss. It never regenerates on its own — only a kit effect adds more |
| Chấn Đao | A **kit** (`parry`) on the item, never a global stat: with `chance`% and enough Sword Energy it spends the kit's `cost`, breaks the attack → counters for `referenceAtk × power`, and pushes the opponent's attack bar back **350 ms**. One parry produces one damage event (not a separate announcement plus a duplicate hit) |
| Cutie critical stats | Each Cutie starts with **5% critical chance** and **+80% critical damage** (×1.8 total); equipped item modifiers add to those stats |
| Projectile colors | Critical hits are red; normal attacks are white; charged attacks are blue |
| Cutie levels | A Cutie goes from **level 1 to 10** (`MAX_CUTIE_LEVEL`); a level adds **1/(MAX_PET_LEVEL−1) ≈ 11.1 %** of the level-1 max HP, base attack **and Kiếm Thế regen** (`PET_GROWTH_PER_LEVEL`), so a **level-10 Cutie holds exactly 2×** the level-1 numbers. Base regen is **5/s**, so the bar refills **10/s** at level 10. The bag gains its extra rows at level 3 and level 5 |
| Cutie kits | A Cutie has **kits like an item** (`CutieDef.kits`) and a single **base attack** (`CutieDef.attack`, no star ranks) that those kits scale. It ships with `basic-attack`; remove that kit and the Cutie **never swings**. Only attack kits (plus their on-hit effects) are offered — `stats` / `aura` describe an item's tables and `parry` belongs to a weapon |
| Cutie skills | A Cutie has **2 skill slots** (`CUTIE_SKILL_SLOTS`), drawn on the battle avatar. They are **empty and inert**: no skill data is stored, nothing in `build.ts` / `battle.ts` reads one, so **no skill can activate**. Filling them is a later feature — keep the slots empty until then |
| Item kits | Every item mechanic is a **kit**. An item may carry **several main (attack) kits**, each swinging on **its own timer** with its own cadence and on-hit rolls, so a second kit never replaces the first. 🔴 **An item has no attack of its own**: damage is a **multiplier of the Cutie** — `basic-attack.multiplier` × the Cutie's attack is the hit (a sword at `1` hits for exactly the Cutie's attack). 🔴 **Every attack kit carries its own Cooldown Time** (`cooldown`, in **seconds**, one value per star rank — `1.6` = a swing every 1.6 s). It is **absolute**: there is no attack speed, no cutie-wide rate and no delta to add to anything, so the same weapon swings at the same cadence on every Cutie. Every kit is `0.1 s` … `60 s`; a stored value is clamped to that range, so an interval can never be 0. Without a main kit the item deals no direct damage and has no on-hit effects.
| Charged attack | A **sub-kit of `basic-attack`** (`kit.charge`), ❌ never a swing or a timer of its own. Once the owner holds the sub-kit's `seNeed` (**% of its max bar**, default 100 = the whole bar), the **next basic attack becomes the charged attack**: that swing spends it and lands `Cutie attack × multiplier` — the charged number **replaces** the basic damage and is never added to it. No cooldown of its own: the basic attack keeps its Cooldown Time, so the charged hit simply replaces one of its swings |
| On-hit effects | **Sub-kits inside one main kit**, with a **percentage trigger chance (0–100)**, rolled after a hit lands. 🔴 Their numbers are **owner-relative**, never fixed points: burn / poison drain a **% of the Cutie's attack per second**, a `shield-on-hit` grants a **% of its max HP**, and `sword-energy-on-hit` adds a **% of its max bar**. There is no `scaling` select any more — the unit is part of the kit |
| Option kits | Sit beside the main kits and are read **once per item** however many swings it has: `stats` (bonus stats), `aura` (adjacency aura), `parry`, `damage-boost`, `sword-energy`, and the reaction / defensive kits listed below. 🔴 One `stats` / `aura` kit grants **one stat**, so three stats are three kits — the only kits an item may carry more than once. Its numbers are **flat amounts added straight onto the owner's stats** — `{ maxHp: 120 }` is +120 max HP, `{ shield: 8 }` is +8 armour, `{ atk: 30 }` is +30 attack — and nothing is scaled by a percentage. 🔴 **`atk` raises the number every swing multiplies**: the owner's attack is `its own + the placed tables`, read before the swings are built, so a `+30` jade hits harder with every weapon *and* with the Cutie's own attack. `critRate` / `critDamage` / `lifesteal` / `dr` / `cdr` / `atkPct` stay percentage points |
| Tăng sát thương (`damage-boost`) | One kit for **any** item, giving `value` % extra damage to the swings it points at: `Đòn của chính món này` (its own swings) or `Vũ khí theo hướng liền kề` (the weapons on the ticked sides). `trigger` decides when it runs — **Liên tục** is folded into the weapon's damage at build time, **Khi trúng đòn / Khi hồi máu / Khi bị đóng băng** start a boost lasting `duration` (typed in **seconds**). A boost never stacks: the higher percentage wins |
| Kiếm Thế kit (`sword-energy`) | The **only** way an item changes Sword Energy: `regen` is a **percentage of the Cutie's own regeneration** (positive refills faster, negative slows it). It is applied once per item, like `stats` |
| Damage numbers | **One number per hit — nothing is ever added together**: two copies of one weapon fire on the same tick and show **two** numbers, 90 ms apart and in different spots. Numbers only occupy the **upper part** of the avatar card (never the bottom edge / nameplate) and drift up while leaning **away from the attacker** (`--floater-drift`: the player card leans left, the enemy card right). Hits crossed by the same replay tick are shown **90 ms apart** (in the order they landed), each keeps a **fixed spot** (its position comes from its own event, so nothing jumps when another one fades), and lives **700 simulated ms** (`700 / speed` real, never under 480 ms); past **5** numbers on one side the oldest makes room. Presentation only — it never changes damage or timing |
| Projectile shape and playback | Everything in this row is presentation-only — it never changes attack timing or damage. Each hit is a **blade-shaped comet**: a **sharp nose** (a point — ❌ no rounded cap or dot) with a **long tapering tail** (`COMET_TAIL = 260 px`, `COMET_BODY = 10 px` at the head → a 20 px-wide body) that flies in a **straight line** from the **centre of the weapon that threw it** to the target (a Cutie's own swing leaves from its portrait centre), plus a **muzzle flash** (`data-combat-muzzle`) on that point at launch. ❌ Do not stretch a ribbon along the whole path — it reads as a rope strung between weapon and target; only `x`/`y`/`opacity` animate, so the flight stays smooth at ×3. It is launched **one flight early**, so it reaches the target on the very tick its event is crossed — the damage number, the health bar and the impact sound then land **together**, at every playback speed (❌ launching on the event tick made the number appear before the animation at ×0.5). It lands at `COMET_IMPACT = 0.9` of the animation (that is when the impact sound plays) and fades out. Projectiles fly 50% faster in every battle mode (PvE and PvP) and scale with battle playback speed |
| Weapon charge | A weapon tile shows its charge as one **bright horizontal hairline** rising from the bottom edge to the top (`data-weapon-charge-overlay`, `bottom` = `calc(<percent>% - 2px)`, `height` = 3 px) — the bar's lower edge is tucked **inside** the wash so line and wash never show a gap. Its light is the bar's own **multi-layer downward `box-shadow`** — the glow is part of the line, so there is nothing to misalign: ❌ no separate glow band, ❌ no gap under the bar, ❌ no rectangle edge. A translucent wash (`data-weapon-charge-fill`, brightest at the line) makes the area already covered read at a glance — the picture must still show through, ❌ never an opaque fill over the whole item. The bar reaches the top (100 %) exactly when the blade leaves; after the swing the next charge is a **new bar** starting at the bottom (`weaponChargeState().cycle` → the element's `key`) — ❌ never the same bar sliding back down |
| Weapon charge display | Weapons show a blue overlay driven by their simulated attack events. It fills from 0 %, reaches **full exactly when the comet leaves** (the launch sits `COMET_LEAD_MS` = 300 simulated ms before the hit lands, and the bar is drawn against the launch), briefly holds, resets to 0 %, then starts the next cycle — ❌ the streak must never leave at ~50 % or ~90 %. Presentation-only |
| Battle sound | A short procedural sword-sweep plays on projectile launch and an impact sound on hit; browser audio is unlocked from the start-battle click. Sound is presentation-only |
| Statuses | Chậm · Đóng Băng · Độc · Cháy · Hồi phục · Cuồng phong · Giòn. **Cháy** also applies a **deep wound**: every heal **and** every armour gain on the target is halved while it burns (`BURN_WOUND_FACTOR` in `battle.ts`). **Độc** drains a **% of the owner's attack** every tick (`scale: 'atk'`, recomputed as the bar changes) instead of freezing a fixed number at the moment it lands |
| Freeze is per weapon | `freeze-on-hit` no longer freezes the whole side: it freezes **one enemy weapon 1/1/1/2/2 s by star rank**, preferring a weapon that is **not frozen yet** (if everything is frozen it does nothing). A frozen weapon cannot swing, its charge **pauses exactly where it is** and continues when the freeze ends (`weaponFrozen` / `SideState.cooldowns[].frozen`). On screen that pause is real: the tile goes frost-white (`data-weapon-freeze-overlay`) and the charge bar stops moving until the thaw; the frost and the ❄ badge are computed from the freeze windows and the playback clock, **not** from the last event snapshot (a frozen weapon cannot refresh a snapshot). The side-wide `freeze` **status** still exists for other sources |
| Slow is per weapon | The **Hòn ngọc Làm chậm** (`slow-strike`) picks **one enemy weapon at random** when one of the owner's weapons deals damage and makes its charge run `10/20/30/40/50 %` slower for the kit's duration (`weaponSlow`). The old `slow-on-hit` sub-kit still slows the **whole side** — it is a different mechanic |
| Blocking a charged attack | The **Đỡ đòn Trọng kích** kit (`block-charged`) only reacts to a **charged** attack: with at least `seCost` Sword Energy the defender spends it, takes **no damage**, and the arena shows a **block popup** (`block` event). It never blocks a basic attack, a counter or a dot |
| Death zone | A fight that is still undecided after **3 minutes** enters the death zone: both sides take **1 % of their own max HP per second**, and that damage grows **+10 % for every further minute** (`DEATH_ZONE_START`, `DEATH_ZONE_PCT_PER_SECOND`, `DEATH_ZONE_GROWTH`). The zone guarantees a result before the **6-minute** hard stop (`MAX_TIME`) |
| Reaction kits (hòn ngọc) | Option kits that never swing: **Hỗ trợ Băng · Giảm hồi chiêu** (applying a freeze cuts weapon cooldowns by `50/60/70/80/100 %` for a few seconds), **Hỗ trợ Băng · Hồi máu** (heal when frozen), **Hỗ trợ Băng · Phản đòn** (chance to freeze a random enemy weapon when hit), **Hòn ngọc Hút Kiếm Thế**, **Hòn ngọc Giáp khi hồi máu**, **Hòn ngọc Giảm hồi chiêu** (receiving a heal cuts weapon cooldowns exactly like the freeze gem), and **Hồi máu khi dính hiệu ứng xấu** (any bad status, freeze included, heals the owner once per activation) |
| Support-gem target | A **buff** gem (`freeze-haste`, `heal-haste`) chooses **who it buffs** in its own kit (`target`): `Theo hướng liền kề` = only the sides ticked in `directions` (up / down / left / right, any mix, stored as one bitmask — `15` = all four, the default), `Ngẫu nhiên` = one random weapon of the owner (**no** third mode: the gem never follows "the weapon that caused the trigger"). A gem set to `Theo hướng` draws **no RNG**. A neighbouring side only counts — and only turns its arrow **gold** — when that neighbour actually **swings**: `isBuffableWeapon()` = a weapon class **with an attack kit**, so an `artifact` trinket that has no attack (e.g. `the-icy-vow`, which only reflects freeze) stays silver |
| Cooldown reduction does not stack | One weapon's temporary cooldown reduction is **a single value: the highest**. When a second support gem fires on a weapon that is already buffed, `boostWeapons()` takes `Math.max` of the two values (and the **longer** remaining duration) — never the sum, so two `freeze-haste` gems of 40 % and 100 % give **100 %**, not 140 %. `slow` is a **separate**, per-weapon penalty; the permanent `cdr` **stat** is cutie-wide. The tick factor is `(1 + slow / 100) / (cooldownFactor × (1 − buff / 100))`, floored at `0.1`. The **meteor streaks** are the only read-out of that single number |
| Direction overlay (presentation) | A gem whose kit uses `directions` draws one arrow per selected side on its tile (`DirectionOverlay`), in **both** grids and — while dragging — on the **preview block**, read at the cell it is hovering over. An arrow is **gold** when a **weapon** (melee / ranged / artifact) sits on that side (`occupiedSides()` — the same edge walk the buff uses) and **silver** when that side is empty or holds a non-weapon. Two gems' masks are OR-ed (`buffDirectionMask`); a gem set to random/attack draws no arrows. ❌ Presentation only: it never changes the buff |
| Cooldown-reduction effect (presentation) | A weapon with temporary cooldown reduction (`SideState.cooldowns[].cdr`) shows **nine meteor streaks** climbing the tile (`data-weapon-boost-fx`, `components/HasteStreaks.tsx`, `--animate-boost-streak`) **inside a green rim** (`data-weapon-boost-border`: 2 px `rgb(126 255 168 / 82%)` frame + inset green glow + a top wash, above the frost so a frozen-and-buffed tile still reads as boosted). The streaks are thin light trails — long and short, bright and faint, heal-green with a bright head and a dissolving tail — so "this weapon swings faster" is visible without reading numbers. Each streak starts **below** the tile and stops **above** it (`--streak-rise` = tile height + its own length) with `linear` timing and a **negative** delay, so the loop restart is off-screen and the stream never stutters at an edge. The table (`STREAKS`) is deliberately irregular: even lengths and even timing read as a comb, not as light. ❌ No `⚡ +N%` badge: it sat on the artwork and the number lives in the hover detail anyway. The element exists **only while the buff lasts**. Presentation only |
| Rage stacks | **Hòn ngọc Cuồng nộ · Sát thương** gains one stack per weapon hit, **Hòn ngọc Cuồng nộ · Hồi máu** one per heal received; each stack adds its `value` % to **every weapon's damage**, capped at the kit's `maxStacks` (**10** by default). Both kits feed the same damage bonus but keep **separate** stack counters |
| Armour kits | Six independent option kits, so any item can carry only what it needs: **Giảm sát thương nhận vào** (`damage-reduction`, stacks with `stats.dr`), **Giáp đầu trận** (`starting-shield`), **Tăng trị liệu nhận vào** (`healing-boost`, applies to heals **and** armour gains), **Hồi máu theo giây** (`regen`, % max HP per second), **Đỡ đòn (tỉ lệ)** (`block-chance`, halves one direct hit) and **Hồi máu khi dính hiệu ứng xấu** (`debuff-heal`) |
| Sword Energy on hit | `sword-energy-on-hit` is an on-hit sub-kit: a landed swing adds its `amount` to the attacker's bar (still capped at `maxSe`) |
| Adjacency | The aura is computed from **every cell** of an item (`adjacentUids`), not just the anchor cell. `aura.target`: `adjacent` / `adjacentWeapon` / `adjacentNonWeapon` / `all`. The support gems use `adjacentUidsByDirection`, which is **edge-adjacent only** (up / down / left / right) — exactly the "4 hướng" rule |

## 3. Progression

| Mechanic | Details |
| --- | --- |
| Clearing a stage | `clearedStage = max(clearedStage, stage)`, then `stage + 1` (capped at **60**) |
| Shop roll | **6 offers per roll** (`SHOP_SIZE`), one per cell of the 2×3 board. A reroll (`2` gold) replaces **all six**; a bought slot is marked `sold`, not refilled. If no item exists at the stage's tier the shop is empty and says so — ❌ the board is never padded with empty cells |
| Cutie unlocks | The second Cutie at **stage 20**, the third at **stage 40** (`unlockStage`) |
| PvP | `makeRivalBlueprint(power, stage, seed)` — **does not** change `stage`/`clearedStage`. Started from the footer's **Đấu Trường** button (`startBattle('pvp')`), which pays Gold (`12 + min(45, power/85)`) |
| Training room | `makeTrainingBlueprint()` in `game/training.ts`; started as `startBattle('training', { attacks })` from the footer's **Phòng tập** button (`Đấu Trường · Phiêu Lưu · Phòng tập · Bảng Xếp Hạng` row); pays nothing (see §2) |
| Maps | 60 stages split across 3 maps (`MAPS`), 20 stages per map; the PvE journey is shown as a winding node path with cleared, next, locked, and boss states. Region tabs unlock as progression reaches them. |
| Enemy presentation | The regions theme enemies as monsters, evil spirits, and zombies. Names and icons are presentation-only; enemy stats and progression rules are unchanged. |
| Stage selection | During preparation, a player may replay any cleared stage or enter the next stage (`clearedStage + 1`). Future stages stay locked. Selecting a different stage refreshes the shop for that stage; the displayed power estimate is informational only and never gates entry. |
| **Phá đảo (victory)** | Clearing **stage 60 for the first time** (`clearedStage` becomes `FINAL_STAGE` while it was below) shows the victory screen (`phase: 'victory'`, `VictoryScreen`). It offers **two** choices: **"Tiếp tục chơi"** (`continueRun()` → `phase: 'prep'`) which **keeps the whole finished run** — every item, all Vàng, all 60 stages cleared, so the player can re-fight any cleared stage for gold or try another Cutie — and **"Chơi lại từ đầu"**, which is the usual restart behind the confirmation dialog. 🔴 ❌ Never leave Start Over as the only button: finishing the campaign must not force a wipe. ⚠️ A **replay** of stage 60 after the campaign is already cleared is an ordinary win → `phase: 'result'`, not another celebration (`firstFullClear` in `commitBattle`) |
| **Restart ("Chơi lại")** | A **brand-new run** (`createRun`): currency back to `STARTING_CURRENCY`, `stage 1`, `clearedStage 0`, empty loadout and storage, Cuties at level 1 with only the first unlocked, new seed, shop re-rolled with `clearedStage = 0` — so the 2★/3★ shop odds start at zero again. ❌ **Nothing is carried over on purpose**: there is **no high-water mark** and no bonus for a milestone reached in a previous run. Do not "fix" this by keeping `clearedStage` |
| **Phòng tập (training room)** | A practice fight against **Bù Nhìn Tập Luyện**. 🔴 **Both sides are immortal**: `Combatant.immortal` keeps the dummy's bar full (`dealDamage` reports the number but refills the bar) **and the store builds the player the same way** (`{ ...playerCombatantFor(run), immortal: true }`), so a practice session is a numbers read-out, never a fight for survival — the player's HP bar stays at `max` while the damage numbers still pop. The dummy carries **exactly one weapon** (`makeTrainingBlueprint()`), and the `Kẻ địch phản đòn` switch decides whether that weapon ever swings (`noSwings` — the item stays on the board, no timer runs). 🔴 **That switch is reachable both before and during the fight**: it sits in the footer's modes panel *and* in the practice bar inside the arena (`data-battle-training-attacks`); because the fight is simulated up front, flipping it mid-session **starts a fresh practice session** with the new flag (`startBattle('training', { attacks })` + `resetPlayback()`) — there is no way to un-swing a pre-computed log. 🔴 **A practice session has NO time limit**: `simulateBattle` is asked for `noDeathZone: true` (the clock never burns either side) and `maxTime = TRAINING_HORIZON_MS` is only **how much log is pre-computed** (20 min, ≈ 200 events per simulated minute); when that log runs out the replay simply holds its last frame — no outcome, no commit, `phase` stays `battle`. The screen therefore has **no Tạm dừng / Bỏ qua** buttons and instead keeps **Rời phòng tập** at the bottom, with **Nhật ký trận đấu** beside it (the log lists only the newest 250 events). ❌ It pays **nothing** and changes **nothing**: `commitBattle` for `mode: 'training'` touches no currency, wins/losses, stage or cleared stage |

## 4. Star ranks and item quality

**Star rank** is earned during a run: merge two copies of the same template at the same star and the
result is one rank higher. **5★ is the cap** (`MAX_STAR` in `game/items.ts`).

| Star | Price in the shop | Notes |
| --- | --- | --- |
| 1★ | `cost × 1` | Starting rank, what the shop almost always offers |
| 2★ | `cost × 2` | Two copies' worth. Shop: **0.5%** per offer once **màn 40** is cleared |
| 3★ | `cost × 4` | Four copies' worth. Shop: **0.1%** per offer, only once **màn 60** (the whole ladder) is cleared |
| 4★ | `cost × 8` | Merging only — ❌ never sold |
| 5★ | `cost × 16` | Merging only (two 4★ copies) |

⚠️ The gate is the **cleared** stage, not the map currently open: an upgraded offer is a reward for
progress, and a shop item above 3★ would be sold for a fraction of the copies it is made of.

Those percentages are not written in the UI by hand: the shop's info toggle shows `shopStarOdds(clearedStage)`
(`game/economy.ts`), which reads the very `starChances()` that `rollShop()` rolls. Changing a chance in one
place therefore changes the panel too — one source, no drift.

**Which item** comes out is a **quality** roll, on top of the tier gate: `QUALITY_WEIGHTS` in
`game/economy.ts` (`1 → 100, 2 → 45, 3 → 18, 4 → 6, 5 → 1.5`) weights the pick inside the tier pool, so a
gold-orange item is offered far less often than a silver one of the same tier. ⚠️ The weights are
**relative**, not percentages — the real chance of a band is `band weight ÷ total pool weight`, which is
exactly what `shopQualityOdds(stage)` computes and what the info panel prints under `Phẩm`.

Every per-star value in `game/items.ts` is declared as an array with **one entry per star rank**
(`pick(star, [1★, 2★, 3★, 4★, 5★])`), so a missing rank is a type error rather than a silent fallback.

⚠️ **A star upgrade shows only two things: one more star, and a different star colour.** ❌ It does
not change the item's picture — there is **one art per item** (`public/icons/items/<id>.png`,
`art: true`), ❌ not one file per star rank. Upgrading also draws no glow or extra frame. See
`docs/ASSETS.md`.

The rank is drawn as **one lucide `Star` icon per rank** (`12 px`, `fill="currentColor"`, 8 px above
the tile's bottom edge) — ❌ not the `★` character: a text glyph is set in the body font, so its size and
baseline drifted and it read as a smudge at 10 px.

| Star | Star colour | Token |
| --- | --- | --- |
| 1★ | Bạc (silver) | `--color-rank-1` |
| 2★ | Xanh lá (green) | `--color-rank-2` |
| 3★ | Lam (blue) | `--color-rank-3` |
| 4★ | Tím (purple) | `--color-rank-4` |
| 5★ | Vàng cam (gold-orange) | `--color-rank-5` |

⚠️ **5★ belongs to the player only.** The shop stops at 4★, and enemy loadouts stop at 4★
(`enemyStar` in `game/stages.ts`) — a 5★ enemy loadout makes the last map unwinnable for every build,
so it is deliberately not used. Measured numbers: `docs/BALANCE.md` §1.

**Quality** (`quality` on `ItemTemplate`, fixed per template — ❌ it does *not* follow the star rank):
it only decides the **colour of the item tile**, so the catalogue reads at a glance. It is data, and
the admin page can edit it. It uses the **same five-step palette** as the star colour.

| Quality | Colour | Colour token | Typical templates |
| --- | --- | --- | --- |
| 1 | Bạc (silver) | `--color-rank-1` | Starter gear: Đao Gỗ, Giáp Da, Lộ Sương, Hồn Ngọc Thôi Sách |
| 2 | Xanh lá (green) | `--color-rank-2` | Thương Lửa, Hồn Ngọc Phẫn Nộ, Đèn Quỷ |
| 3 | Lam (blue) | `--color-rank-3` | Everything from the middle maps (tier 2) |
| 4 | Tím (purple) | `--color-rank-4` | Late-map support: Hồn Ngọc Hộ Thể, Hàn Ngọc Phù, Mảnh Gương, Cờ Lụa, Thuốc Sắt |
| 5 | Vàng cam (gold-orange) | `--color-rank-5` | Late-map power: Phủ Nặng, Song Trảo, Giáp Vệ Binh, Thần Đúc Sư |

⚠️ Colours live in `@theme` in `src/styles/app.css` (one palette, `--color-rank-1…5`) and are applied
through the **lookup tables** `ITEM_QUALITY_BG` / `ITEM_QUALITY_SWATCH` (tile background) and
`ITEM_STAR_TEXT` (star colour) in `src/components/ui.ts` — ❌ never build a class name dynamically
(``  `bg-rank-${n}`  ``), Tailwind only emits classes it can read in the source.

## 5. Vietnamese in the UI

Every string shown to the player — **including API error messages** — must be Vietnamese. ❌ No English
mixed in (except proper nouns such as *Stormchant*, *Gold*). The currency is **Vàng** in Vietnamese text and **Gold** in English — ❌ never "Paw Tally" or a bare coin glyph.

Fixed terminology (use exactly these words): Vũ khí cận chiến · Vũ khí tầm xa · Pháp khí (= artifact,
the third weapon type) · Ngọc (= jade) · Phụ kiện (= accessory) · Giáp · Đan dược · Kiếm Thế · Chấn Đao ·
Trọng kích · Cutie · Màn · Bản đồ · Trang bị · Kho đồ · Sức mạnh · Gold.

🔴 **`Cutie` is also the name in the code, the database and the API** — it is a proper noun of this game,
never translated and never spelled `pet`. `CutieDef`, `CUTIES`, `getCutie`, `cutieList`, `run.cutieId`,
`run.cuties`, `run.unlockedCuties`, `CutiePanel`, `public/icons/cuties/`, tables `cuties` / `cutie_kits`,
`ContentKind = 'cutie'`, art key `cutie:<id>`. `pet` survives only inside the **migration** that reads an
older save (`petId` / `pets` / `unlockedPets` — see `game/sanitize.ts`, `game/migrate.ts`).

An item's **type** is one of those seven (`ItemClass` in `game/types.ts`, labels in `CLASS_LABELS`), so a
new item can be given stats that suit its kind. There are **three weapon types** — `melee`, `ranged`
and `artifact` (pháp khí: it swings, but its job is debuffs such as freeze / slow / poison / drain, not
raw damage). All three count as a weapon for the `adjacentWeapon` aura and for the support gems — always
ask `isWeaponClass()`, ❌ never compare against `'weapon'`.

**No class owns its footprint**: `space` is plain data on every template (`CLASS_SPACE` / `classSpace`
are gone), so a jade, an accessory, a potion or a weapon is sized by its own row, the admin boxes stay
editable for every class, and `mergeItem` never rewrites the shape.

**Old class names are folded, never re-added**: `focus` → `artifact` (the pre-`artifact` weapon name) and
`jewelry` → `jade` (renamed when `accessory` was added). `normalizeItemClass()` does it on the frontend
and the backend stores the new name from then on.

## 6. Kit categories

Every kit carries **two** words, and they answer different questions:

- **`kind`** — *how the engine runs it*: `attack` (a swing of its own), `onHit` / `charge` (lives **inside**
  one attack kit), `option` (sits beside the swings). Nothing else keys off anything.
- **`category`** — *what the kit is for*, the designer's word, used only to file the catalogue
  (`/admin` → Kits, and the headings of the add-kit menu). The five that ship in code are **Attack** ·
  **Control** (burn, poison, slow, freeze, slow-strike, Sword Energy drain) · **Support** (adjacency aura,
  the freeze / heal gem buffs, regen, healing boost) · **Defense** (shields, damage reduction, parry,
  block, reflect, lifesteal) · **Stats & resources** (`stats`, `aura`, Sword Energy kits). They are
  **data** (`kit_categories`): an admin renames them, adds more and moves kits between them.

A kit is **shared** between items and Cuties by default (`appliesTo: 'both'`); the **option** kits are
`item only` (`stats`, `aura`, `parry`, the reaction gems) because they describe an item's own tables and
adjacency — that is exactly the set the backend refuses on a Cutie (`asKits(..., allowOptions: false)`).

🔴 **A kit can be created, renamed, moved and deleted from `/admin` → Kits.** The catalogue is data
(`kit_categories` + `kit_entries`), but the 30 mechanics are code and must stay complete for offline play:
a kit **created** there is a new id on top of an existing `mechanic`, and the engine resolves it back to
that mechanic (`mechanicOf(kit.id)`) before any rule runs. Deleting is not a row delete either — it marks
the entry and detaches the kit from every item and Cutie, out of every `onHit` / `charge` (see
[`ADMIN.md`](ADMIN.md#the-kits-tab)).

## 7. Rule → source mapping

| Rule | File |
| --- | --- |
| Star merge, price, selling back, grid collision | `game/bag.ts` |
| Kho đồ is a **free grid**: row count, placement, drag/drop/rotate inside Kho đồ | `game/storage.ts` |
| Splitting Trang bị ↔ Kho đồ | `game/loadout.ts` |
| Item templates, star tiers, **quality band** | `game/items.ts` |
| Quality colours, star colours and the shared tile class | `components/ui.ts`, `styles/app.css` |
| Cuties, levels, number of grid rows | `game/cuties.ts` |
| Stages, maps, PvP blueprint | `game/stages.ts` |
| Training dummy blueprint + session horizon | `game/training.ts` |
| Kit catalogue in code (ids, labels, parameters, per-star seeds, **category** + **who may carry it**) | `game/kits.ts` |
| Kit catalogue in play (catalogues, renames, moves, created kits, deletions) | `game/content.ts` (`kitCatalogue`, `kitCategories`, `pruneRemovedKits`), `backend/src/content.ts` (`saveKitEntry`, `createKit`, `removeKit`) |
| Deleting a kit from the game (marker, detaching from entities, add-menu filtering) | `game/content.ts` (`pruneRemovedKits`, `kitCatalogue`), `backend/src/content.ts` (`removeKit`) |
| Merging `stats` + `aura` + reaction kits → stats / triggers | `game/build.ts` |
| Battle simulation (deterministic) | `game/battle.ts` |
| Shop rolls, reroll, money | `game/economy.ts` (tier pool · `QUALITY_WEIGHTS` pick · `starChances` upgrade · `REROLL_COST`) |
| Stats, Vietnamese labels | `game/stats.ts` |
| Status effects (label/icon) | `game/labels.ts` |
| Normalising a broken save | `game/sanitize.ts` |
| Upgrading a v1 → v2 save | `game/migrate.ts` |
| Shared deterministic PRNG | `game/rng.ts` |

To **add** an item / Cutie / stage / mechanic: see `AGENTS.md` §5.
