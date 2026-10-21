# Unity Port — decision, frozen contracts, staged plan

> **Agent-facing.** Read this file before doing anything related to a Unity client for this game.
> It is the only place that records *why* Unity was chosen and *which contracts are frozen*.
> Status: **DECIDED 2026-10-22. No Unity code exists in this repo yet.** Nothing here has been built.
>
> Read also: [`ARCHITECTURE.md`](./ARCHITECTURE.md) (web data flow) · [`GAME-RULES.md`](./GAME-RULES.md)
> (which rule lives where) · [`TESTING.md`](./TESTING.md) (how to verify safely) ·
> [`../AGENTS.md`](../AGENTS.md) (the rules that still apply to every change in this repo).

---

## 0. TL;DR — the twelve things a new agent must know

1. **Engine decision: Unity.** Unreal was rejected because **the web channel must stay** and UE5 has no
   supported web export (HTML5 removed after 4.24).
2. **The web client does NOT get replaced by Unity WebGL.** `frontend/` (React + Vite) remains the web
   product. Unity ships the **Steam/PC + mobile** clients. A Unity WebGL build is *not* an upgrade for
   the browser (10–20 MB download and iOS Safari memory limits against today's near-instant load).
3. **The backend is not ported.** `backend/` (Fastify + Prisma + Postgres + OAuth) is the shared save
   store for every client, unchanged. No game rules on the server, ever.
4. **The content admin page is not ported.** It stays the web admin (`/admin`), writing the same
   overlay the Unity client reads through `GET /api/content`.
5. **Game rules live in one place per client, and both clients must agree.** The TS core is
   `frontend/src/game/` (~6,300 lines). The C# port must be validated against **golden vectors**
   generated from the TS core (§6) — this is the gate before any UI work.
6. **`game/` is ported as a pure C# library with zero `UnityEngine` references** (§8). If core code
   needs a `MonoBehaviour`, it is not core.
7. **Determinism is a contract, not a nicety** (§5.3): same seed ⇒ identical event stream, and **array
   iteration order is part of the contract**.
8. **Save format is frozen** (§5.1): `RunState` JSON, `GAME_SAVE_VERSION = 3`, legacy `pet*` names are
   read-only aliases, and every read goes through `sanitizeRun()`-equivalent or the UI renders nothing.
9. **Save sync rules are frozen** (§5.2): revision lives with the save, `revision_conflict` ⇒ re-PUT
   **your own data** exactly once, never load the server save on conflict, never push before the pull
   finished, debounce + hash guard to avoid the infinite PUT loop.
10. **Cutie, never pet** (§4). `petId` / `pets` / `unlockedPets` may only be *read* as legacy.
11. **Go in stages** (§10). With no prior Unity experience on the team, a single-shot port will be
    abandoned; every stage has an exit criterion that can be checked by a command or a checklist.
12. **This repo's four commands must stay green** (`pnpm build && pnpm test && pnpm lint && pnpm test:be`)
    for any change made *here*. The Unity repo gets its own gate: `dotnet test` + golden vectors.

---

## 1. Decision record

| Option | Verdict | Reason |
| --- | --- | --- |
| **Unity (Unity 6, URP 2D, UI Toolkit)** | ✅ **chosen** | one codebase for Steam/PC + Android/iOS; C# is close to the existing TypeScript; fast iteration; WebGL export exists if it is ever needed as a fallback |
| Unreal Engine 5 | ❌ rejected | no supported web export; heavy for a 2D grid auto-battler whose art is 33 PNGs (0.2 MB); Blueprint cannot express the deterministic simulation cleanly, and C++ rewrite costs ~10× the C# port |
| Stay web only (Capacitor / Tauri wrap) | ⚠️ still valid as **stage 0** | cheapest route to stores, but does not deliver native feel, controller/Steam integration, or native audio/VFX |
| Keep `game/` as a shared web-served sim | ❌ rejected as an architecture | would put game rules behind a network call, break offline/anonymous play, and split a deterministic hot loop across a process boundary |

**Constraints given by the owner (2026-10-22):** target platforms **Steam/PC + Android/iOS**, **web must
keep working**, team has **no prior Unity/UE experience** (work will be done by agents), and the owner
wants *all* of: store release, Steam, better visuals, performance headroom, and long-term skill.

Consequence to respect: **improve visuals within Unity's 2D/URP capability** (sprite animation, shaders,
particle systems). Do **not** start a 3D remake; if a 3D version is ever wanted, it is a *separate PC
product* after the Unity client ships, and it would be Unreal — not a rewrite of this plan.

## 2. Target architecture — three clients, one backend

```
                    ┌──────────────────────────────┐
   browser ────────▶│ frontend/  React + Vite      │──┐
                    │ (UNCHANGED — web product)     │  │
                    └──────────────────────────────┘  │
                                                      │   HTTPS, JSON
                    ┌──────────────────────────────┐  ├──────────────┐
   Steam/PC,        │ unity/  (new repo, C#)       │──┤  backend/    │  Fastify + Prisma
   Android, iOS ───▶│ Core (pure) + Game (Unity)    │  │ (UNCHANGED)  │  Postgres
                    └──────────────────────────────┘  │              │
                                                      │  /api/me/save│  revision-guarded
   admin (browser)─▶ frontend/ admin screens ────────▶│  /api/content│  content overlay
                                                      └──────────────┘
```

Rules that follow from this picture:

- **No game rules on the server.** It authenticates identity and stores/reads `RunState` as raw JSON.
  A port must not "helpfully" validate or migrate saves server-side.
- **Anonymous play must work with no backend at all**, in Unity too: local save file is primary, the
  server is a copy. First launch offline ⇒ play ⇒ later sign-in ⇒ push.
- **Two implementations of the same rules exist after stage 2.** That is the accepted cost of keeping
  web. The golden-vector suite (§6) is what keeps them honest; without it, two divergent games share
  one save format.

---

## 3. What to port, what to leave

| Source | Size | Unity target | Notes |
| --- | --- | --- | --- |
| `frontend/src/game/rng.ts` | 36 | `Core/Rng.cs` | mulberry32 + FNV-1a; exact algorithm in §5.3 |
| `game/types.ts` | 505 | `Core/Model/*.cs` | records/classes mirroring the JSON; keep property names identical to the JSON keys |
| `game/stats.ts` | 67 | `Core/Stats.cs` | `StatSheet` + aura application |
| `game/items.ts` | 224 | `Core/Content/Items.cs` | code defaults only; server overlay is merged on top |
| `game/kits.ts` | 1,019 | `Core/Content/Kits.cs` | the kit catalogue + parameter schema |
| `game/cuties.ts` | 139 | `Core/Content/Cuties.cs` | code defaults |
| `game/stages.ts` | 150 | `Core/Content/Stages.cs` | 60 stages; re-run the balance probe after porting |
| `game/labels.ts` | 28 | `Core/Content/Labels.cs` | Vietnamese labels are the product language — keep them verbatim |
| `game/build.ts` | 881 | `Core/Build.cs` | `Combatant` construction, auras, kits → runtime stats |
| `game/battle.ts` | 949 | `Core/Battle.cs` | `simulateBattle`; the highest-risk port, gate it with golden vectors |
| `game/loadout.ts` | 198 | `Core/Loadout.cs` | equip-grid placement rules |
| `game/storage.ts` | 194 | `Core/Storage.cs` | free-grid storage, merge-only, `sortStorage()` |
| `game/bag.ts` | 518 | `Core/Bag.cs` | footprint/packing helpers |
| `game/economy.ts` | 108 | `Core/Economy.cs` | prices, sell price = 50 % of `paid` |
| `game/training.ts` | 57 | `Core/Training.cs` | practice-dummy battle options |
| `game/survival.ts` | — | `Core/Survival.cs` | **placeholder (0 bytes at the time of writing)** — a survival mode is being added in the working tree; whatever it becomes is part of the simulation and needs golden-vector cases like everything else |
| `game/content.ts` | 454 | `Core/Content/ContentStore.cs` | **merged accessors** (`getCutie`, `cutieList`, `getTemplate`, `itemCatalogue`) + overlay merge |
| `game/sanitize.ts` | 182 | `Core/Save/Sanitize.cs` | must port **first**, byte-for-behaviour |
| `game/migrate.ts` | 71 | `Core/Save/Migrate.cs` | v2→v3 renames; keep accepting legacy names |
| `store/persistedSave.ts` | — | `Core/Save/SaveFile.cs` | version constant, file location, owner tag |
| `api/saveSync.ts` | — | `Game/Sync/SaveSync.cs` | protocol in §5.2 |
| `api/client.ts` | — | `Game/Net/ApiClient.cs` | thin HTTP wrapper, no retry policy beyond §5.2 |
| `components/` (69 `.tsx`) | — | `Game/UI/` (UI Toolkit) | full rebuild; see §9 |
| `routes/` (6 files) | — | `Game/UI/Screens/` | one UXML per screen |
| `public/icons/` (33 PNG, 0.2 MB) | — | `Assets/Art/` | copied as-is; item art is **one file per item id**, never per star rank |
| `backend/`, `AdminContentScreen` | — | **not ported** | shared backend, web admin |

## 4. Rules inherited from `AGENTS.md` that transfer to Unity

These are product rules, not web rules — the Unity client is held to them identically:

- 🔴 **The word is `Cutie`.** Never `pet` in any new type, field, table, asset folder or label. The only
  exception is *reading* a legacy save field (`petId`, `pets`, `unlockedPets`) inside the migrator.
- 🔴 **Content is read through merged accessors**, never a raw array. Rendering `Items.Defaults`
  directly shows names/prices the admin already changed. This has already happened once on web.
- 🔴 **Renaming a save field is a migration**, not a search-and-replace. A build that reads only the new
  name resets the player's Cutie and its level, and save-sync then pushes that reset to the server.
- 🔴 **Every save read goes through the sanitizer.** A missing field must never crash the UI. On web a
  throw inside `render()` shows a blank page; in Unity it is an exception in `Update` with an unchanged
  frozen frame — same outcome for the player. There must be a top-level catch that shows an error
  screen with a "new run" / "restore from server" choice.
- 🔴 **A run belongs to an account, and the tag says which.** Signing out keeps the run (anonymous).
- 🔴 **No instructional hint paragraphs in the UI.** A label, a `%`, a value, a `title` is enough.
- 🔴 **Actions are `Button`-like components with variants** — one control family, one icon set, no ad-hoc
  styling per screen (Unity equivalent in §9).
- 🔴 **Refusals do not use a toast and do not silently no-op**; the control itself says why (disabled +
  tooltip; rejected drop outline). Confirmation dialogs are in-app components, never a native dialog.
- 🔴 **Grid cells are always the same size** (90 px on web). Scaling a grid to fit a panel is a bug.

## 5. Frozen contracts

### 5.1 `RunState` + save file

The save is the `RunState` object as JSON, exactly as the web client writes it — the same shape travels
to `PUT /api/me/save`. C# property names **must** serialize to these keys (camelCase).

```jsonc
{
  "cutieId": "momo",              // active Cutie id
  "cuties": { "momo": 1 },        // Cutie id -> level
  "unlockedCuties": ["momo"],
  "gold": 0,
  "stage": 1,                     // stage being prepared (1..60)
  "clearedStage": 0,
  "equipped": [ ItemInstance ],   // worn gear = the only items that fight; 4 columns, rows grow with level
  "inventory": [ ItemInstance ],  // storage: unlimited, no effect, free 8-column grid
  "seed": 1234,
  "shop": [ { "templateId": "...", "star": 1, "cost": 50, "sold": false } ],
  "rerolls": 0,
  "wins": 0,
  "losses": 0
}
```

```jsonc
// ItemInstance
{
  "uid": "0k3f9a1",     // stable id, from makeUid(seed, label)
  "templateId": "blade",
  "star": 1,            // 1..5
  "slot": 0,            // anchor cell (top-left of footprint) in the bag grid; -1 = waiting tray
  "rotated": false,     // optional; swaps space.w/space.h
  "paid": 50            // gold actually spent -> sell price = 50 %
}
```

- Version constant: **`GAME_SAVE_VERSION = 3`** (`frontend/src/store/persistedSave.ts`). The Unity save
  file carries the same version field. Never write `1`.
- Migration currently implemented: **v2 → v3** renames `petId`→`cutieId`, `pets`→`cuties`,
  `unlockedPets`→`unlockedCuties`. Import of a web save (or an old Unity save) **must** run this.
- Adding a `RunState` field ⇒ sanitizer default + version bump + migration + a golden-vector case that
  loads a save written before the field existed.
- The sanitizer contract: unknown/extra fields are dropped or ignored safely; missing fields get
  defaults; **invalid values never reach the simulation** (no `NaN`, no negative counts, no `slot` out
  of range, no `star` outside 1..5, unknown `cutieId` falls back to the first unlocked Cutie).
- Local storage location: `Application.persistentDataPath/save-v3.json` (write atomically: temp file +
  replace). The **owner tag** is a separate key next to it — see §5.2.

### 5.2 Save sync protocol (must be ported line by line)

Endpoints (already exist, unchanged):

| Call | Response |
| --- | --- |
| `GET /api/me` | `{ id, email, name, isAdmin, providers: [...] }` — 401 when signed out |
| `GET /api/me/save` | `{ run: RunState \| null, revision: number, updated_at: string \| null }`; never synced ⇒ `{ run: null, revision: 0, updated_at: null }` |
| `PUT /api/me/save` body `{ run, revision? }` | `{ run, revision, updated_at }`; first write ⇒ `revision: 1`; mismatch ⇒ **400 `revision_conflict`** |

Rules (each one exists because violating it lost data once):

1. **On `revision_conflict`**: `GET` the new revision, then `PUT` **your own data** again with that
   revision, retry **exactly once**. Never `GET` the server save over yours to "fix" the conflict.
2. **Order inside a pull is fixed**: store the revision **first**, then write the local save, then
   rehydrate the in-memory state. Writing local state first makes the very next push use a stale
   revision ⇒ conflict.
3. **Push guard**: compare a hash of the serialized `RunState` with the last-pushed hash and debounce
   ~1.5 s. Without it every successful PUT changes state ⇒ effect fires again ⇒ infinite PUT loop.
4. **`readyRef`**: never push before the initial pull/decision completed.
5. **Load rules on sign-in**: local save exists and owner tag is **absent or same account** ⇒ local
   wins and is pushed; owner tag is **another account** ⇒ pull that account's save (or start a new run
   when it has none) and **never** push the foreign run into it.
6. **Never tag the run before the pull succeeded.**
7. Owner tag value: `u:<userId>` (web stores it in `localStorage['martial-cutie-save-owner']`); absent =
   anonymous play. In Unity it is a small sidecar file or `PlayerPrefs` key — same semantics.
8. Signed out ⇒ local save only, no error, no data loss.
9. 🔴 **Never test the write API with a real account.** `PUT /api/me/save` cannot be undone. Use the
   documented safe paths in [`TESTING.md`](./TESTING.md).

### 5.3 Battle simulation (the highest-risk port)

```ts
simulateBattle(playerInput: Combatant, enemyInput: Combatant, seed: number, options?: BattleOptions): BattleResult
```

```jsonc
// BattleResult
{ "winner": "player|enemy|draw", "timedOut": false, "events": [BattleEvent],
  "playerPower": 912.4, "enemyPower": 880.1, "duration": 41350 }

// BattleEvent
{ "t": 50, "kind": "attack", "side": "player", "text": "…", "amount": 37,
  "critical": false, "icon": "⚔️", "sourceUid": "<itemUid>#<kitId>|skill",
  "triggerUid": "<itemUid>", "player": SideState, "enemy": SideState }
```

- `kind ∈ start · attack · charged · counter · dot · heal · shield · status · block · death · end`.
- `t` is milliseconds from battle start; `duration` is the final `t`.
- `BattleOptions = { maxTime?, noDeathZone? }`; `noDeathZone` is the training room's switch.
- Constants: `TICK = 50` (ms), `MAX_TIME = 360_000`, `DEATH_ZONE_START = 180_000`,
  `DEATH_ZONE_PCT_PER_SECOND = 1`, `DEATH_ZONE_GROWTH = 0.1`.
- `Combatant` (`game/build.ts:147`) — the sim's *input*, produced by `build.ts`: `side, name, icon, hp,
  maxHp, baseMaxHp, shield, se, maxSe, stats, statuses, immunities, weapons, gridWidth, …`. Port `build.ts`
  faithfully; a wrong `Combatant` looks exactly like a wrong `battle.ts`.
- **Determinism rules**: no `Random`, no `DateTime.Now`/`Time.time`, no `UnityEngine.Random`, no
  physics, no `Dictionary`/`HashSet` iteration order that affects outcomes, no threads. Iterate arrays
  in stored order. The engine clock must not enter `Core`.
- **RNG is mulberry32 with `Math.imul`** (`game/rng.ts`):

  ```
  state = seed >>> 0
  next:  state = (state + 0x6d2b79f5) >>> 0
         t = state; t = imul(t ^ (t >>> 15), t | 1)
         t ^= t + imul(t ^ (t >>> 7), t | 61)
         return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  int(max) = floor(next() * max);  chance(p) = next() < p
  ```

  In C#: `uint` + `unchecked` arithmetic; implement `imul` as `(uint)((int)a * (int)b)` (32-bit wrap,
  low 32 bits, no sign extension leaks). `hashString` is FNV-1a 32 over **UTF-16 code units**
  (`char` in C# matches exactly) and `makeUid` uses JS `Number.prototype.toString(36)` — that formatting
  must be reproduced exactly (test it: for seeds used by the stage table, `seed * 2654435761` stays
  below 2^53, so the value is an exact integer; convert with `ulong`, base-36, zero-padded to 7).
- `BattleEvent.text` is **Vietnamese UI text** and part of the vector comparison. Keep it byte-identical;
  the arena may re-render it, but the sim must produce it.

### 5.4 Content overlay

- `GET /api/content` returns `{ items: {...}, cuties: {...}, kits: { categories: [...], entries: {...} } }`
  with **only the fields the admin changed**. Code defaults stay in `Core/Content/*`; the client merges.
- Art: `GET /api/content/art/:kind/:id?v=<uploadTime>` (`kind` ∈ `item` · `cutie` · `skill` · …). Cache by
  `v`; a re-upload changes the URL. Item art is **one file per item id**, never per star rank.
- 🔴 Components/views read through the merged accessors only. Every screen that draws a name, blurb,
  unlock stage, price or icon must go through `ContentStore`, never through the defaults arrays.
- Admin writes stay in the web admin (`PUT /api/admin/content/...`, `ADMIN_EMAILS` gated). Do not build
  a second admin UI in Unity.

### 5.5 Auth (the only backend change this plan requires)

Existing web flow: `GET /api/auth/:provider/login` → provider → `GET /api/auth/:provider/callback` →
sets the session cookie `COOKIE_NAME` (default `mc_session`) → redirect to `FRONTEND_URL`. Session
tokens carry a `sessionEpoch`; a bumped epoch invalidates old tokens. `GET /api/auth/session` reports
the current user; `POST /api/auth/logout` clears it.

For Unity (native, no cookie jar shared with the system browser):

- Use the **system browser** + a loopback redirect (desktop: `http://127.0.0.1:<port>/callback`) or a
  custom scheme / universal link (mobile). Never embed a webview for Google sign-in.
- The backend needs a small addition: an endpoint that exchanges the login result for a client token the
  desktop app can send as `Authorization: Bearer …` (or set the cookie from the app's own HTTP client and
  persist it). **This is the only server-side change; implement it additively** so web keeps using
  cookies, and keep the epoch check intact.
- 🔴 Do not weaken `sessionEpoch`, do not add a "token never expires" path, do not log tokens.
- `ADMIN_EMAILS` admin screens are web-only; Unity needs at most read-only content, no admin UI.

---

## 6. Golden vectors — the gate before any UI work

Purpose: prove the C# core is the *same game* as the TS core. Produced from the **TS core** (the
reference), consumed by `dotnet test` in the Unity repo.

1. **Generator** — a script in this repo (`frontend/src/game/__tests__/_golden.probe.test.ts` or a
   `scripts/golden.mts`; prefix with `_` and delete it in the same session if it is throwaway — see
   `AGENTS.md` §6) that, for a fixed case list, builds `Combatant`s with `build.ts` and writes:
   - `golden/full/<caseId>.json` — **verbatim** `BattleResult` for ~30 cases (stressful kits, all 5 star
     ranks, both sides, a draw/timed-out case, a no-death-zone case).
   - `golden/hashes.json` — ~500 cases reduced to a **canonical digest** (see below).
   - `golden/saves/*.json` — inputs for the sanitizer/migrator: current v3, legacy v1/v2 with `pet*`
     names, truncated/`null`/wrong-type fields (the sanitizer must not throw and must produce a
     playable run).
2. **Canonical digest** — do not hash the serializer output (JS and .NET format numbers differently).
   Reduce each event to a line of integers:

   ```
   t | kind | side | q(amount) | q(hp.player) | q(hp.enemy) | q(shield.player) | q(shield.enemy) | sourceUid | triggerUid
   q(x) = (long)Math.Round(x * 10000, MidpointRounding.AwayFromZero)
   ```

   Join with `\n`, SHA-256, lowercase hex. Numbers must match **exactly**, no tolerance: a mismatch is a
   real bug in the port, not float noise. (If a genuine last-digit difference appears, reconcile the
   arithmetic in the port — do not add epsilon.)
3. **Acceptance**: `dotnet test` runs every case; a failure prints the case id, the first differing event
   line, and both lines side by side.
4. Vectors are **regenerated deliberately**, never "to make the test pass". A changed vector means the
   game changed; it must be a conscious decision recorded in the changelog, and the web tests must be
   updated in the same change.

---

## 7. C# porting rules

- **`double`, not `float`.** TypeScript numbers are IEEE-754 doubles; `float` changes rounding and will
  break vectors. Use `float` only inside rendering code.
- **`uint` + `unchecked`** for RNG/hash; `/ 4294967296.0` (not integer division).
- **Explicit ordering.** `List<T>` and arrays only inside the sim. If a `Dictionary` is unavoidable, it
  must be a lookup only — never iterate it to decide an outcome.
- **No LINQ inside the sim hot path** when order or lazy evaluation could matter; use indexed `for`.
- **No `DateTime.Now`, no `Time.time`, no `UnityEngine.Random`, no coroutines** in `Core`.
  Provide time as a parameter/field driven by the caller.
- **Culture-invariant formatting** everywhere (`CultureInfo.InvariantCulture`) — the machine may run a
  Vietnamese locale.
- **Names**: keep JSON keys identical to the web (`cutieId`, `unlockedCuties`, `templateId`, …), keep the
  domain word `Cutie`. Use `[JsonPropertyName]` explicitly rather than guessing a naming policy.
- **Nullability**: mirror TS optionals (`rotated?`, `critical?`) as `bool?`/nullable so reading a save
  from web round-trips without adding `false` where web had no key (harmless but noisy in vectors —
  compare parsed objects, not raw text, except in save round-trip tests where it must be exact).
- **One test project per layer**: `Core.Tests` (no Unity), `Game.Tests` (against the Unity test
  framework) only for wiring.

## 8. Unity project layout

```
unity/
  Assets/
    Scripts/
      Core/                 ← NO UnityEngine references (enforced by an .asmdef + a test that greps)
        Rng.cs  Model/  Content/  Save/  Build.cs  Battle.cs  Loadout.cs  Storage.cs  Bag.cs
        Economy.cs  Training.cs  Stats.cs
      Game/                 ← Unity only: scenes, UI Toolkit controllers, audio, VFX
        Sync/SaveSync.cs  Net/ApiClient.cs  UI/Screens/  UI/Components/  Art/
    Art/  (copied from frontend/public/icons — one file per item id)
    UI/   (UXML/USS per screen)
  Packages/  ProjectSettings/
  tests/Core.Tests/         ← runs on plain .NET; consumes golden/*.json
```

- Core assembly must compile **without** the Unity editor: `dotnet test tests/Core.Tests` is the fast
  loop. If a `using UnityEngine;` appears under `Core/`, the port has failed its own architecture.
- ScriptableObjects are **not** the content source of truth. Defaults live in `Core/Content/*` (code),
  the overlay comes from the API. A `.asset` file would drift from the web underlay.
- Input: one abstraction (`IInput`) so the arena works with mouse, touch and gamepad; the drag-and-drop
  contract is the web one (rotate, reject-on-blocked, merge-on-same-type, `Esc` cancels).

## 9. UI parity checklist (UI Toolkit)

Rebuild, do not "improve" while porting. The following are product decisions, verified in the web app:

- [ ] **Grid cell = 90 px, always.** Trang bị, Kho đồ, arena, drag preview, shop tile. A grid that does
      not fit gets a wider container or a scroll view — never smaller cells.
- [ ] **Preparation room: three panels of equal height** (Cuties · Storage · Equipment) that end on the
      same line; storage viewport shows a whole 8×8 by default and scrolls inside the panel when deeper.
- [ ] **Shared action footer** with two panels: modes (`Đấu Trường · Phiêu Lưu · Phòng tập · Bảng Xếp
      Hạng`) and journey (`Nhiệm Vụ · Bộ Sưu Tập`). Fight button + stage progress live **inside the
      Adventure dialog**. Only exception for buttons inside a panel: Equipment floor's **Shop** and
      **Tháo hết**.
- [ ] **One control family**: a `Button` with variants (`primary` gold · `secondary` · `outline` ·
      `ghost` · `destructive` · `link`) and sizes (`sm` · `md` · `lg` · `icon`). Screens never style a
      one-off button.
- [ ] **One icon set** (Lucide, via the shared icon map). No second icon pack, no hand-drawn control
      glyphs, no Unicode characters (`»`, `✓`, `↑`, `★`) standing in for an icon.
- [ ] **Hand cursor / disabled state** on every clickable thing; a refused action shows why on the
      control itself.
- [ ] **Drag & drop**: preview above the item layer, preview must equal the drop result, `Esc` cancels
      the held item *and* the pending release, rotation read at release time, no text selection while
      dragging.
- [ ] **Arena**: reuse the same grid component for both sides; playback is a fixed-step tick loop driven
      by an accumulator (`TICK = 50 ms`), never a per-frame delta that changes event timing; background/
      unfocused windows must still finish the battle (web uses `setInterval` + an elapsed clock for this
      reason).
- [ ] **No hint paragraphs**, no toast system, confirmation via an in-app dialog component.
- [ ] Text is Vietnamese, same wording as web; the Cutie wording rule applies to every label.

## 10. Staged plan with exit criteria

| Stage | Work | Exit criterion (checkable) |
| --- | --- | --- |
| **0. Ship what exists** | Wrap the current web build: Capacitor (Android/iOS), Tauri (Steam). Nothing in-game changes. | Build installs on Android, iOS and launches from Steam; saves sync through the existing backend; **no change** to `frontend/` + `backend/` behaviour |
| **1. Unity spike** | Unity 6 + URP 2D; one arena screen that loads a `BattleResult` JSON produced by the TS core and plays it back with the 90 px grid. No rules. | Plays 5 exported battles to the end with correct events/timings; window resize keeps cell size at 90 |
| **2. Core port (logic only)** | Port §3 rows `rng → economy`; **no Unity dependency**; golden vectors generated first. | `dotnet test`: all `golden/full/*` match verbatim + all `golden/hashes.json` match; sanitizer suite passes (no throw on malformed saves) |
| **3. Real arena** | Drive `simulateBattle` from C# core; UI Toolkit arena; audio hooks. | Same seeds as web produce visually identical outcomes (spot-check 10 cases) |
| **4. Screens** | Preparation room, Storage, Shop, Adventure, Collection, Ranking, Practice. | §9 checklist fully ticked; a full run (stage 1 → 60) can be played without the web app |
| **5. Save + sync** | `SaveFile` (atomic write), owner tag, `SaveSync` (§5.2), pull-on-sign-in decision matrix. | Test matrix passes: same account, other account, anonymous, offline-then-online, conflict-retry-once, kill-app-mid-write |
| **6. Auth native** | System browser + loopback/deep link; additive backend token endpoint. | Sign-in/out on all three platforms; session expiry shows a single clear message; no token in logs |
| **7. Stores** | Steam depot, Android, iOS builds; privacy/age ratings; crash reporting. | Store review submitted; a save created on Unity loads on web and vice versa (round-trip both ways) |

Estimated effort for one person new to Unity: **5–7 months** to a Steam Early Access build, with the web
client shipping in parallel. Faster than that means a stage was skipped.

## 11. What NOT to do

1. ❌ Do not replace the web client with Unity WebGL.
2. ❌ Do not port the backend, and do not move game rules onto it.
3. ❌ Do not build a Unity admin UI.
4. ❌ Do not start with UI. Logic + vectors first; screens after.
5. ❌ Do not use `float` for simulation numbers, `UnityEngine.Random`, `Time.time` or `DateTime.Now`
   inside `Core`.
6. ❌ Do not "fix" a failing golden vector by regenerating it.
7. ❌ Do not rename save fields; migrate them.
8. ❌ Do not add `using UnityEngine;` under `Core/`.
9. ❌ Do not probe `PUT /api/me/save` with a real account.
10. ❌ Do not rebuild the grid at a smaller cell size to fit a panel.
11. ❌ Do not write `pet` in new code, assets, or labels.

## 12. Open decisions (need the owner, not an agent)

- **Visual target**: 2D sprites with richer animation/VFX (recommended, matches the current art), or a
  3D Cutie presentation (would change scope dramatically and, per §1, argue for a *separate* Unreal PC
  product later).
- **Whether Unity WebGL ships at all** as a fallback build for browsers. Default answer: no.
- **Monetization / live-ops** model — affects backend schema and store integration, so decide before
  stage 7.
- **Where the Unity repo lives**: this monorepo (`unity/` folder) or a new repository. Recommended: new
  repository, because Unity's binary assets and `.meta` files make a mixed history painful, and CI is
  different. Either way, `docs/UNITY-PORT.md` stays the shared contract and should be copied/symlinked.

## 13. Verification commands

This repo (web + backend) — must stay green for any change made here:

```bash
pnpm build && pnpm test && pnpm lint && pnpm test:be
```

Unity repo — the fast loop for logic:

```bash
dotnet test tests/Core.Tests        # golden vectors + sanitizer suite, no Unity needed
```

Before any store build: §9 checklist, §5.2 save test matrix, and a save round-trip web ⇄ Unity.
