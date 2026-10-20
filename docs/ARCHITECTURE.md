# Architecture

> Why the system is split the way it is, where data flows, and the spots that have broken before.
> The mandatory rules live in [`../AGENTS.md`](../AGENTS.md) section 4 — this file explains the **why**.

## 1. Three images, three roles

```
          browser
             │  ONE origin only: http://localhost:5190
             ▼
    ┌────────────────┐        /api/*        ┌──────────────────┐
    │  fr (nginx)    │ ───────────────────► │  be (Fastify)    │
    │  Vite's dist/  │                      │  Fastify + Prisma│
    └────────────────┘                      └────────┬─────────┘
                                                     │
                                            ┌────────▼─────────┐
                                            │  db (Postgres)   │
                                            └──────────────────┘
```

| Image | What it contains | Why it is separate |
| --- | --- | --- |
| `db` | PostgreSQL 17 | Durable data, independent of the app's lifecycle |
| `be` | Fastify + Prisma, **no** frontend | Just the API; builds independently of the frontend |
| `fr` | nginx serving `dist/` + proxying `/api` → `be` | **Thanks to the proxy the browser only sees one origin**: the session cookie works normally and no CORS is needed. Splitting into two truly separate origins would make `SameSite` far more complicated |

⚠️ `fr` and the `vite` service (profile `dev`) **both use port 5190** → do not run them at the same time.

### Two Docker modes

| Mode | Command | Reloads when code changes? |
| --- | --- | --- |
| Production | `docker compose up --build -d` | ❌ No — the image is a snapshot from build time, you must rebuild |
| Dev | `docker compose --profile dev up -d db be-dev vite` | ✅ Both sides: `vite` (HMR) and `be-dev` (`nodemon --legacy-watch`) |

Both serve on **5190**, so you have to stop one to run the other.

Three traps actually hit while setting up dev mode — do not "tidy them up again":

1. **Windows bind mounts do NOT emit filesystem events into the container.** `tsx watch` (and
   `node --watch`) use `fs.watch`, so they **silently fail to reload** — you edit the backend and the
   API keeps running the old code. That is why `be-dev` uses `nodemon --legacy-watch` (polling), and
   `vite` enables `VITE_USE_POLLING=1`.
2. **Vite must listen on `0.0.0.0`** inside the container. Passing it through the CLI does not work:
   `pnpm --filter frontend dev -- --host 0.0.0.0` does **not** forward the flag to Vite, and Vite still
   listens only on `127.0.0.1` — while the log still says "ready", so it looks like it is running fine.
   Use the `VITE_DEV_HOST` variable read in `vite.config.ts`.
3. **❌ Do not mount all of `./backend` and then shadow `node_modules` with a named volume.** Docker
   only populates a named volume when it is **empty**, so adding a package to `package.json` leaves the
   volume holding the old install (`nodemon: not found`), and reinstalling inside the container makes
   pnpm demand removing `node_modules` and then abort because there is no TTY
   (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). The right way: mount **each source directory**
   (`src`, `scripts`, `prisma`) and let the container use the install baked into the image; to add a
   package, rebuild the image.

**The OAuth redirect endpoint** is decided by `BE_PUBLIC_URL` (default `http://localhost:5190`) because
that is the address the **browser** uses to open the game, and it must match the URI registered in
Google Console. Change `FR_PORT` ⇒ change `BE_PUBLIC_URL` **and** re-register the URI.

## 2. Layering

```
game/          pure game rules  ─── no React, no DOM, no router/query
                     ▲
store/         game state + actions (zustand, persist localStorage)
                     ▲
components/    display only + call actions  ─── never compute damage/price/merge itself
                     ▲
routes/        one file per screen (TanStack Router)
```

**Why so strict:** all battle determinism lives in `game/battle.ts`. If a component or the store
computes things itself, the battle result starts depending on render order and can no longer be
reproduced.

**The backend contains no game rules.** It only authenticates identity and stores/reads JSON. That is
why the game is **fully playable anonymously** without a backend — this is a requirement, not a side
feature.

🔴 **Attack exists only on the Cutie.** `ItemTemplate` has no `attack` field: an item's damage is a
**multiplier of the owner** — `basic-attack.multiplier` × the Cutie's attack, a burn/poison a share of
its attack per second, shields and heals a share of its max HP,
Sword Energy amounts a share of its max bar. `stats` / `aura` tables are the opposite case: their numbers
are **flat amounts added straight to the owner** (`atk: 30` = +30 attack, `addItemMods` in `build.ts`),
because a designer types the number the Cutie gains. 🔴 **The rhythm is the opposite of both: it is
absolute.** Every kit with `kind: 'attack'` carries its own **`cooldown`** (seconds, one value per star
rank) and `build.ts` turns it straight into `CombatItem.interval` (`attackCooldownMs`). There is no
cutie-wide attack speed, no per-kit delta and nothing to add up: `1.6` means a swing every 1.6 s for
that weapon, on any Cutie, at any level.
`referenceAtk` is therefore the **owner's** attack,
which is what parry counters and `atkScale` effects read. An enemy blueprint owns the swing its items
multiply (`attackDamage` / `attackInterval`), which is why a training dummy needs one to hit back.

**An item mechanic is a kit.** `game/kits.ts` is the catalogue (`KIT_DEFS`, each with a `kind`), the
definitions live in `game/types.ts` (`ItemKit`, `OnHitKit`, `OptionKit`, `ChargeKit`) and **all** of
the interpretation is in `game/build.ts` — one `CombatItem` per attack kit, `Combatant.parry` from the
strongest `parry` kit, stats/auras read **once per item**. A Cutie uses the very same catalogue
(`CutieDef.kits`), so "how does a swing work" has a single answer. Components and the admin page only
draw the numbers; the detail dialog reads them back through the same helpers (`onHitText()`).

**Reaction kits** (the "hòn ngọc" support / defensive option kits) have **no timer**. `build.ts`
resolves their numbers once per item into `Combatant.reactions` and `battle.ts` fires them from the
one place that knows the event happened: damage dealt by a weapon, a heal actually received, a freeze
applied, an attack taken, a bad status landed. ❌ Never give a reaction kit a swing, and ❌ never read
an item template from `battle.ts` — the simulation only sees the resolved combatant.

A **buff** gem (`freeze-haste`, `heal-haste`) also resolves **who it buffs**: `build.ts` walks the
sides via `adjacentUidsByDirection` and stores the swing uids of the ticked sides (`mode:
'directions'`), while `random` stays unresolved and is picked in `battle.ts`. ❌ There is no "the weapon
that struck" mode any more: a gem buffs the ticked sides or one random weapon, nothing else. A support gem never buffs a
non-weapon: `build.ts` only sees the **swings** it built (one per attack kit) and filters them with
`isWeaponClass()`, where `artifact` is one of the **three weapon classes** (`melee`, `ranged`,
`artifact`) — it swings like a blade but leans on debuffs. 🔴 An `artifact` with **no attack kit** (a pure
trinket such as `the-icy-vow`, `freeze-reflect` only) produces no swing at all, so nothing can buff it.
The direction overlay must use the same rule — `directionSidesFor` → `isBuffableWeapon(templateId)`
(weapon class **and** at least one attack kit) — otherwise an arrow turns gold for a neighbour the engine
would never touch.

## 3. Where game state lives

| Thing | Lives in | Notes |
| --- | --- | --- |
| Game progress (`RunState`) | `localStorage['martial-cutie-save']` via zustand persist | **The primary source.** The server is only a copy |
| Screen state (route) | the **URL** (TanStack Router) | ❌ The store does not hold `route` |
| Dialogs that are open | `store/uiStore.ts` | ❌ Not in `gameStore` — that one is persisted |
| Sign-in session, server save | TanStack Query cache | `['session']`, `['save']` |
| The battle currently being watched | `gameStore.battle` | Not persisted |

**TanStack Query boundary:** only data **coming from the server**. ❌ Do not turn game progress into a
server cache — doing that destroys anonymous play.

## 4. Save lifecycle

```
open the game
  └─ zustand persist reads localStorage ──► sanitizeRun()  (anti blank page)
  └─ TanStack Query calls GET /api/auth/session
        ├─ error  ──► play anonymously, blocking NOTHING
        └─ ok & signed in
              └─ machine has NO progress yet?  ──► pullRun(): GET /api/me/save
                    • write the revision into the cache FIRST
                    • write localStorage + rehydrate
              └─ machine ALREADY has progress ──► keep the player's own (localStorage wins)

the player changes Trang bị
  └─ gameStore changes  ──► AuthSync: 1.5 s debounce
        └─ pushedRef compares JSON.stringify(run)  (❌ no guard ⇒ infinite PUT loop)
              └─ pushRun(): PUT /api/me/save with the known revision
                    ├─ 400 revision_conflict ──► GET the new revision ──► PUT MY OWN DATA again
                    │                             (exactly ONCE; ❌ do not overwrite with the server save)
                    └─ ok ──► the new revision comes from the RESPONSE, write it into the cache
```

Rule details and the traps: `AGENTS.md` §4.4. Lessons that were paid for:

- **Infinite PUT loop** — every successful PUT changes the store → the effect runs again → another PUT.
  Logs alternate 200/400. Locked down with `pushedRef` comparing content, not references.
- **Overwriting on conflict** — loses the change just made *and* causes a conflict on the next push.
- **Writing the revision after writing localStorage** — the push immediately after uses the old
  revision ⇒ conflict straight away.
- 🔴 **Overwriting a real save while verifying** — opening `localhost:5190` in a separate browser
  profile while `AUTO_LOGIN=true`: a fresh profile has no save ⇒ the app auto-signs in to the user's
  account ⇒ loading the server save fails ⇒ **pushes an empty run up**. This really happened. Safe ways
  to verify: [`TESTING.md`](TESTING.md).

## 5. API contract

The backend must **not** change anything below without changing the frontend at the same time.

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/auth/session` | `{authenticated, user, available_providers, auto_login}` |
| GET | `/api/auth/google/login` | 307 to Google + signed `state` cookie |
| GET | `/api/auth/google/callback` | Exchange code → profile → session → 303 back to the game |
| POST | `/api/auth/logout` | Increment `session_epoch` (revokes old tokens) + clear the cookie |
| GET | `/api/me` | Current user profile |
| GET | `/api/me/save` | `{run, revision, updated_at}` |
| PUT | `/api/me/save` | Write the save, checking `revision` (optimistic concurrency) |
| GET | `/api/health` | `{status, environment, providers}` |

Conventions:

- Every error: `{"error": "<code>", "message": "<Vietnamese>"}` **plus an `X-Error-Code` header**.
- Error codes used by the frontend: `revision_conflict` · `save_too_large` · `unauthorized` ·
  `unknown_provider` · `provider_not_configured` · `not_found`.
- A `/api/*` path that matches no route → **404 JSON**, ❌ it does not return `index.html`.
- Save limit **200,000 bytes** (`save_too_large`), body limit 4 MB.

⚠️ Back when the backend was FastAPI there was also `/api/docs` (Swagger). Fastify does not have it —
to add it back, see the *Things still worth doing* section in [`../README.md`](../README.md).

## 6. Sign-in flow

```
GET /api/auth/google/login
   → generate a random `state`, sign it with HMAC-SHA256, set cookie mc_oauth_state (path /api/auth, 10 minutes)
   → 307 to accounts.google.com

Google → GET /api/auth/google/callback?code&state
   → compare the `state` in the URL with the cookie using a timing-safe comparison  (❌ never trust the URL)
   → POST token (form-encoded, with `scope`) → GET userinfo
   → upsert the user by (provider, subject); if absent, match by verified email
   → sign JWT HS256 {sub, epoch, iat, exp, jti} → cookie mc_session (httpOnly, SameSite=Lax)
   → 303 to <postLoginUrl>/?login=ok
```

- Every error in the callback must **redirect back to the UI** with `?login=error&message=…` — the
  player must never see a JSON error page. The client reads that outcome in `AuthSync`, logs a failed
  sign-in with `console.warn` and strips the query string (there is **no toast system**: the top bar's
  sign-in state is the player-facing answer).
- Signing out increments `session_epoch`; `currentUser`/`optionalUser` compare the epoch in the token
  against the DB, so old tokens die immediately.
- `AUTO_LOGIN` only turns on when **Google keys are present**, otherwise the frontend would redirect
  into an endpoint that is guaranteed to return 503.

## 7. Backend rules (and why the code looks the way it does)

- ✅ Configuration goes through `loadConfig()` (`../.env` → `backend/.env` → environment variables).
  ❌ Never hardcode a secret. A `JWT_SECRET` equal to the sample value or shorter than 32 characters ⇒
  **throws at startup**, rather than only breaking when a player signs in.
- ✅ Endpoints requiring sign-in use `currentUser`; endpoints allowing anonymous access use
  `optionalUser`.
- ✅ Every error returns `{"error": "<code>", "message": "<Vietnamese>"}` **plus an `X-Error-Code`
  header**, going through **one** `setErrorHandler`.
- ✅ The session cookie is httpOnly + `SameSite=Lax`; enable `COOKIE_SECURE=true` when running behind
  HTTPS.
- ✅ The OAuth `state` must be **signed + compared timing-safely** and then checked against the cookie —
  ❌ never trust the `state` in the URL.
- ✅ Signing out increments `users.session_epoch` to revoke old tokens; a token carrying a mismatched
  epoch is invalid.
- ✅ Only **Google** is supported; any other provider → **400 `unknown_provider`** (there is a test).
  `AUTO_LOGIN` only turns on when the keys are fully configured; the flag returned to the frontend must
  be `config.autoLogin && availableProviders.length > 0`.
- ✅ Schema change → edit `prisma/schema.prisma` + generate a new migration, and the migration must
  **run on a database that already has tables** (idempotent baseline; `scripts/migrate.mjs` baselines
  itself when the schema already has tables but Prisma has no history). ❌ Never edit a production DB by
  hand.

- **The DB is injected into** `buildApp({ db, config })`: that lets tests pass in the client of a
  transaction and then roll it back — **one single database, no secondary DB, no data left behind**.
  ❌ Using a Prisma client at module scope destroys this property.
- **Idempotent baseline migration**: the running database was created by Alembic back when the backend
  was Python. Prisma refuses to apply the first migration to a non-empty schema (**P3005**), so
  `scripts/migrate.mjs` runs `migrate resolve --applied 0_init` itself when it finds that the tables
  exist but `_prisma_migrations` does not. ⚠️ You only see this bug by running inside Docker for real.
- **Run with `tsx`, not `node dist/`**: the source uses extensionless imports (`from './config'`) and
  Node ESM requires a `.js` extension. That is why `build` is a **typecheck** step and produces no
  `dist/`.
- **`node:22-slim` rather than alpine**: Prisma downloads its engine binary by libc/openssl.
- **Fastify returns 400 for a POST with no body but with `Content-Type: application/json`** — exactly
  what `frontend/src/api/client.ts` sends for logout. There is an `onRequest` hook that strips
  `content-type` when the request really has no body, so it behaves like Starlette.
- **Content overrides are whitelisted, never trusted**: `backend/src/content.ts` keeps
  `ATTACK_KIT_IDS` / `ON_HIT_KIT_IDS` / `OPTION_KIT_IDS` / `CHARGE_KIT_IDS` beside the field list, so a
  kit added in `game/kits.ts` must be added there too or the payload is rejected. `kits` is validated
  item by item (`kits[i].charge` for the sub-kit), the removed fields (`damage`, `speed`,
  `attackSpeed` on a pet — the rhythm is `basic-attack.cooldown` now —
  `interval`, `passive`, `aura`) and a top-level `charge-attack` are **rejected** instead of stored,
  and a Cutie's `kits` / `attack` follow the same path.
- 🔴 **Content has a real schema** (`prisma/schema.prisma`): `items` / `item_kits` and `cuties` /
  `cutie_kits`, one row per entity and one row per kit, `content_art` holding the PNG bytes. The old
  `content_overrides` table (one JSON blob per entity) is **gone** — migration `3_content_tables`
  created the tables, copied the rows (dropping the dead `item.attack`, kit `speed` and pet
  `attackSpeed` keys) and dropped it. `GET /api/content` still answers with the same payload shape, so
  the client cannot tell the difference: the API is the contract, the tables are how it is kept.
  A kit's `params` / `stats` / `aura` / `on_hit` / `charge` stay `Json` on purpose — their key sets are
  the kit catalogue in `game/kits.ts`, i.e. game rules, and normalising them would turn every new kit
  parameter into a migration (see [`ADMIN.md`](ADMIN.md) "How it is stored").
- `listContentOverrides()` rebuilds a payload from the columns (`NULL` columns are **omitted**, never
  sent as `null`, because the client merges the payload over its own definition), `saveContentOverride()`
  upserts the row and replaces its kit rows, `deleteContentOverride()` deletes the row — the kits go with
  it through `ON DELETE CASCADE`. ⚠️ Writes are **sequential, not nested transactions**: inside the tests
  `db` is already a `Prisma.TransactionClient`, which has no `$transaction` of its own.
- 🔴 **The kit catalogue is an overlay too** (`kit_categories` + `kit_entries`, migrations `5`/`6`). A
  kit **is** a mechanic of the engine (`game/kits.ts`) — it must ship in code, because the engine runs it
  and the game has to play with no backend — so the database owns only how the mechanics are **filed**:
  the catalogues, and one row per kit that was renamed, moved, retuned, **created** or deleted.
  `GET /api/content` publishes it as `kits: { categories, entries }`; the client merges it into
  `kitCatalogue()` and hands the result to `registerKitCatalogue()` (`game/kits.ts`), so a kit created in
  the admin page resolves through `kitDef()` everywhere, including the engine.
  🔴 **`build.ts` / `battle.ts` must branch on `mechanicOf(kit.id)`, never on `kit.id`**: a created kit
  (`burn-on-hit-2`) has no behaviour of its own, it runs the mechanic it was made from. `removeKit()`
  marks the row and detaches the kit (child rows deleted, `on_hit` / `charge` rewritten without it);
  `DELETE …/kit/:id` drops the row (back to code). See [`ADMIN.md`](ADMIN.md) "The Kits tab".

## 8. UI conventions

**Styling stack: Tailwind CSS v4 + shadcn/ui.** This is the direction from now on — new UI uses Tailwind
utilities and the shadcn components in `components/ui/*`, ❌ not bespoke CSS classes and ❌ not a second
UI kit.

🔴 **The default answer to "how do I build this control?" is: with a shadcn component.** A raw
`<button>`, `<input>`, `<select>` or a hand-made dropdown in new UI is a **bug**, not a shortcut — it is
how one page ended up with a button family of its own (gradients, `rounded-[10px]`) next to real shadcn
buttons, and the admin page could be told apart from the rest of the app at a glance.

| Need | Use |
| --- | --- |
| any action | `Button` (`components/ui/button.tsx`) — `variant` · `size` · `asChild` |
| a boxed group | `Card` + `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` |
| a status chip / counter | `Badge` (`variant`) |
| text input, multi-line text, caption above a control | `Input`, `Textarea`, `Label` |
| a picker (list of choices) | `DropdownMenu` (`components/shadcn/dropdown-menu.tsx`) — ⚠️ ❌ not a Radix `Select`: it needs pointer-event captures jsdom does not implement, and this repo has no global test setup to polyfill them |
| a confirmation | `ConfirmDialog` (`components/ConfirmDialog.tsx`), ❌ never `window.confirm` |
| an icon | `components/icons.tsx` (Lucide only — ❌ no second icon package, ❌ no hand-written `<svg>`, ❌ no `»`/`✓`/`↑` glyph) |
| a row of star ranks | `StarRow` (`components/icons.tsx`) — one filled Lucide star per rank, ❌ never `'★'.repeat(n)` |
| a dialog / sheet / tabs / tooltip / table / … that is missing | **add the shadcn component** — see below |

**Adding a component that is not there yet.** There is no `components.json` and no shadcn CLI in this
repo (the build must not need the network), so a component is added by hand, the way the existing ones
were written:

1. `components/ui/<name>.tsx`, the standard shadcn source (React 19, no `forwardRef` — `ref` is a prop).
2. `cva(...)` for the variants, `VariantProps` for the types, `data-slot="<name>"` on the element.
3. `cn()` from `lib/utils.ts` for the class merge, `@radix-ui/*` (already installed) only where the
   behaviour needs a primitive — ❌ do not re-implement focus trapping, `aria-*` or keyboard handling by
   hand.
4. **Colours, radii and shadows come from the tokens**, never from the stock shadcn palette: the
   semantic roles (`background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted-foreground`,
   `accent`, `destructive`, `border`, `input`, `ring`) are declared in `@theme` in `styles/app.css` and
   point at the game palette, so a component copied from shadcn/ui works untouched and still looks like
   this game.
5. Variants that the game needs (a new button look, a new badge tone) are **added to that component's
   `cva`**, ❌ never patched in at the call site with a pile of utilities that re-creates the old style.

**Tailwind only, tokens only.**

- ✅ Utilities in the component (`flex flex-col gap-2.5 rounded-lg border bg-card p-3.5`).
- ✅ `@theme` tokens for every colour, radius, shadow, font and animation (`bg-ink-800`, `text-gold`,
  `border-line`, `rounded-panel`, `shadow-panel`, `animate-critical-pop`…). Changing `--color-gold`
  repaints every `primary`, every gold ring and every star that uses it.
- ❌ **No arbitrary values for colour** — `border-[#7d2318]`, `bg-[rgb(12_12_12)]`, `text-[#f0b6ac]` are
  tokens that were never written down; add the token instead (there is already a `--color-*` for every
  colour the game uses, including `danger-soft`, `jade`, `steel`, `hp-low`, `violet-soft` and the five
  `rank-*`).
- ❌ **No inline `style={{ color: … }}`**; `style` is only for a computed measurement (a bar's `width`,
  a CSS custom property such as `--floater-life`).
- ❌ **No new bespoke class names in a component.** A pattern that is genuinely shared (a surface, an
  animation, a repeated shape) becomes an `@utility` or a token **in `styles/app.css`**, next to the
  existing `stripes` / `surface-panel` / `surface-item` / `surface-board` / `surface-brand`
  (`--animate-*` for anything that moves — ❌ do not animate with a one-off `style`).
- ❌ **Do not build class names dynamically** (`` `bg-cls-${value}` ``): Tailwind only emits classes it
  can read in the source. Map the value to a **full** class string (`ITEM_BORDER_BY_CLASS`).
- ✅ A `data-*` hook for tests (`data-admin-kit`, `data-confirm-accept`), ❌ a **styling class** as the
  hook: a test that asserts `className` contains `border-danger` breaks the moment the look changes —
  which is exactly what happened when the buttons moved to `Button` (that assertion now checks the
  functional state: `animate-pulse` + `ring-2` on the drop target).

- ⚠️ **`--color-muted` is the *muted text* colour** (`text-muted`), so there is no `bg-muted`: a muted
  surface is `bg-ink-700`, muted text is `text-muted-foreground`.
- ✅ **`cn()` is `clsx` + `tailwind-merge`**, so a later utility beats an earlier one; `components/ui.ts`
  re-exports this one — ❌ do not replace it with plain string concatenation. A plain `join(' ')` kept both
  classes, the stylesheet order decided, and an "active" variant silently lost to its base: the selected
  admin entry kept `border-line` / `bg-ink-700` instead of turning gold. Whenever a component styles a
  variant (`id === active && '…'`), it must go through `cn()`.
- 🔴 **A button is `<Button>` from `components/ui/button.tsx`** — the stock shadcn shape (`rounded-md`,
  a fixed `h-*` per `size`, flat background, `shadow-xs`, a ring on focus), themed with the game's
  tokens: `primary` (gold, the main action), `secondary` (ink), `outline`, `ghost`, `destructive`
  (filled red — the action destroys something), `link`; `size` = `sm` · `md` · `lg` · `icon` ·
  `sm-icon`, and `asChild` for a router `<Link>`.
  ⚠️ The old `btnClass` / `btnGoldClass` / `btnPrimaryClass` / `btnSmClass` strings **no longer exist**:
  their gradients, `rounded-[10px]` and `active:translate-y-px` made one page look like a different
  button family. Every screen — the arena, the prep room, the shop, the dialogs, `/admin` — draws this
  one component. A new look is a new `variant` in `buttonVariants`, ❌ never an inline override that
  re-creates the old gradient.
- 🔴 **One icon library: Lucide.** Lucide is the icon set shadcn/ui ships with — it is the first library
  on <https://www.shadcn.io/icons/libraries> — so a copied shadcn component and a hand-written control
  read as the same design. `components/icons.tsx` re-exports the glyphs the app uses and is the **only**
  module that imports `lucide-react` (the shadcn primitives in `components/shadcn/*` bring their own
  chevrons/checks with them). A screen imports `{ Trash2 } from './icons'`, ❌ never from `lucide-react`.
  - ❌ **No second icon package** — not Heroicons, Phosphor, Tabler, Radix Icons, Font Awesome. Two
    libraries in one app is two stroke widths and two metaphors for the same action.
  - ❌ **No hand-written `<svg>` for a control.** It was done for arrows and chevrons once, and those
    glyphs stopped matching the rest of the app the moment the icon set was themed.
  - ❌ **No Unicode glyph where an icon belongs** — `»` on the shop button, `✓` on the chosen Cutie,
    `↓` on **Sort**, `★` on a star rank (`StarRow`) were all replaced by the Lucide equivalent: a glyph
    changes shape with the system font, cannot be sized by a class and cannot be themed by `currentColor`.
    A glyph stays only where it is **notation inside a label** ("Base price (1★)").
  - ✅ **Pick the glyph by meaning, not by habit**: `ArrowUpDown` for sorting (not `ArrowDown` — a plain
    down arrow reads "collapse"), `ChevronDown` for a picker trigger, `ChevronRight` for "go on", `Check`
    for "this one is chosen", `Trash2` for delete, `Coins` for the gold unit (`Gold`, `Cost`).
  - ✅ Size and colour come from utilities on the icon (`size-3.5`, `text-gold-soft`, `opacity-70`, or the
    `1em` default from `svg.lucide` in `styles/app.css`); ❌ never `style` for size.
  - ⚠️ **Game content is not an icon.** Item / Cutie / status emoji (`items.ts`, `cuties.ts`,
    `labels.ts`) are a picture fallback for art that has not been uploaded yet — see
    [`docs/ASSETS.md`](docs/ASSETS.md). ❌ Never replace one with an outline icon.
- 🔴 **Everything clickable shows the hand (`cursor: pointer`).** The rule is one block in
  `styles/app.css` `@layer base` — every `<button>`, `select`, `summary`, checkbox / radio / range /
  file input, a `label` that **wraps** one of those, and every `role="button" | "menuitem" | "option" |
  "tab" | "switch" | "checkbox"` or `aria-pressed` element. ❌ **Never add `cursor-pointer` at a call
  site**: it was sprinkled on a handful of controls and the rest of the app looked dead, because
  Tailwind v4's preflight leaves a button at the browser default. A control that cannot be used shows
  `not-allowed` (🚫 `button:disabled`, `[aria-disabled="true"]`), and the one deliberate opt-out is
  `cursor-default` on a **non-interactive** board (`LoadoutGrid` `interactive={false}`, i.e. a preview)
  — the hand is a promise that the tile does something. A label on a **text box** keeps the arrow (the
  box itself shows the text caret), and a dimmed dialog backdrop stays `auto`: it is a scrim, not a
  control, clicking it only closes the dialog.
- 🔴 **A grid cell is always 90 px** (`CELL_SIZE`). `LoadoutGrid` / `InventoryGrid` / the arena / the drag
  preview / the shop's equipment column all use it. ❌ Never shrink `cellSize` to fit a panel: a 44 px
  cell makes a 1×3 blade look like a 1×1 and the board no longer matches the preparation room. A grid
  that does not fit gets a wider container or a scroll.
- 🔴 **The storage shows a whole 8×8 by default, and the three preparation-room panels are one
  height.** `STORAGE_MIN_ROWS = 8` already draws 64 cells; the scroll viewport around the board is
  `boardHeight(STORAGE_MIN_ROWS)` (= 762 px) instead of a hand-picked `max-h-[600px]` that cut the last
  row in half. The column row is `items-stretch` and each column holds **one `flex-1` panel**
  (`<CutiePanel className="flex-1" />`, `<CutieLoadoutPanel className="flex-1" />`), so Cuties,
  Storage and Equipment end on the same line — the storage is the tallest one and the other two follow
  it. A deeper stack scrolls inside the viewport (❌ it does not grow the page). The `className` on
  those two panels is for the **page layout only**; a look change still belongs in their own component.
  ⚠️ `boardHeight()` counts gaps, padding **and the 1 px board border** — miss the border and the
  viewport is 2 px short, which is enough for a scrollbar to appear on a board that fits.
- **A shop offer tile is drawn at the real size too** — `ItemGridPreview cellSize={CELL_SIZE}`, so a
  1×3 blade reads 90×270 there exactly as it will in the bag. A card grows to fit its tile; the offers
  grid stretches a row so the buy buttons line up again. Only a **thumbnail** (dialog, admin list) may
  scale down: it shows the shape, not the board footprint.
- 🔴 **A shop cell is a fixed shell**: its height comes from the **tallest footprint in the catalogue**
  (`max(space.h) × CELL_SIZE + 76`, floor 220 px), ❌ never from the offer inside it — a board that
  resizes between rerolls makes every price row jump. A large tile just leaves less empty space.
- 🔴 **A board is not a picture: `LoadoutGrid` without handlers is dead.** Any screen that shows the
  player's own bag must wire the same four props as the preparation room — `onItemClick` (→
  `uiStore.openItem`, the detail dialog is the only place with the economy rows), `onDragStart` +
  `onDragEnd` (→ `useHeldItem` + `dropItem`, rotation read from `held` on release) and `onAnchorSlot`
  (→ anchor cell + blocked flag). The shop page learned this the hard way: its equipment column was
  rendered read-only, so clicking and dragging did nothing. Read-only grids are for the **opponent**
  (`AvatarCard`) only.
- 🔴 **An item's numbers live in one place: `components/itemFacts.ts`.** `itemFacts(template, star)`
  plus `kitParamText()` / `onHitText()` are read by the click-to-open dialog **and** the shop's hover
  card (`ShopOfferCard`). ❌ Never re-derive a kit's numbers in a second view: two copies will drift and
  the game will describe one weapon two ways. Anything *economy* (price, paid, resale) stays in the
  dialog — the hover card answers "should I buy this?", it is not a second details screen.
- ⚠️ **Hover handlers need `aria-disabled`, not `disabled`.** A disabled `<button>` fires no pointer
  events, so an unaffordable-but-inspectable cell would never show its card. Guard the action in
  `onClick` and keep the button focusable.
- ⚠️ **The shop card waits for hover intent (`HOVER_DELAY_MS = 350`) and dies with its offer.** The
  pointer crosses cells on the way anywhere else, so opening on the first pixel of contact made the
  panel flash over the neighbours. And a bought cell is **replaced** by the sold placeholder, so the
  old button never fires `pointerleave`: without an explicit `hideCard()` on the click (plus
  `!offer.sold` in the render guard) the card stayed on screen over an offer that no longer existed.
  One `hoverTimerRef` serves both the delay and the cancel — ❌ no second timer.
- ❌ **Do not** use `requestAnimationFrame` for battle playback — background tabs get throttled. Use
  `setInterval` with `TICK_MS = 60`.
- ✅ Playback follows `elapsedRef` (simulated time) and looks up `events[next].t <= elapsed`;
  ❌ do not assume the index matches the time.
- ✅ `commitBattle()` rewards **once only** (`battle.committed`). Keep this guard.
- ✅ No `setState` during render — use `useEffect` (see `BattleScreen`). Mutations go through store
  actions; ❌ do not modify `run` in place.
- ✅ Colour/spacing tokens are declared in `@theme` in `styles/app.css`; ❌ do not scatter hex codes
  through components.
- ✅ **Controls are shadcn components** (`Button`, `Input`, `Label`, `Textarea`, `Badge`, `Card`,
  `DropdownMenu`…), ❌ never a raw `<button>` / `<input>` / `<select>` built by hand.
- ✅ The remaining shared strings in `components/ui.ts` are **layout, not controls** (`panelClass`,
  `statClass`, `rowClass`, `hintClass`, `tagClass`…): panels, rows and info boxes. A **control** is never
  one of them. The old `btnClass` family is gone — see the button rule above.
- 🔴 **The preparation room's footer is one `<footer>` landmark holding two panels**, and every action
  lives there (under the three panels — *not* inside a panel except Shop / Tháo hết):
  - **panel 1** (`data-action-bar-panel="modes"`) — the four modes, one equal column each
    (`xl:grid-cols-4`, so they split its width at any window size): `Đấu Trường` (a `pvp` duel against a
    rival, the only entry point for that mode) · `Phiêu Lưu` (opens the journey map) · `Phòng tập` (+ the
    **enemy fights back** chip inside its own cell) · `Bảng Xếp Hạng` (**disabled** — no feature yet,
    `title` says so).
  - **panel 2** (`data-action-bar-panel="journey"`) — the journey/next action in a 3-column grid at `xl`
    (`1fr · auto · 1fr`): `Nhiệm Vụ · Bộ Sưu Tập · Bản đồ` | `Đấu Cutie` **exactly in the middle** |
    tiến trình. The fight button stays centred even though the two sides carry different numbers of
    controls; a plain `flex` row only *looked* centred while both sides happened to add up. ❌ Do not put
    the fight button back at the end.
  - Each panel carries its own `rounded-panel border border-line bg-ink-800/80 p-2.5`; the `<footer>`
    itself is a transparent `flex flex-col gap-2.5` (`data-action-bar`).
  - 🔴 **The footer is a sibling of the main content, not a child of it**: `PrepScreen` returns the panels
    block (`div.flex-1`) and `<ActionBar/>` as two siblings of the page column, so "main content" means the
    three panels and nothing else (asked for: "2 div này đang nằm chung section main content" → then "2 div
    này nằm chung 1 div footer"). ❌ Do not nest it back inside the main-content div, and ❌ do not drop the
    `<footer>` wrapper either — it is the landmark (`contentinfo`) that holds both panels.
  - ❌ Do not move a mode into a panel: the panels are for the cutie, the bag and the equipment, the footer
    is for actions (asked for: "thuộc footer chung với các button ở dưới").
- 🔴 **The Shop button lives on the Equipment panel's floor, not in the footer** ("di chuyển nút shop
  lên đặt trong section equipment, fit theo chiều ngang. nút unequip all cũng vậy nhưng đặt ở dưới nút
  shop"). `CutieLoadoutPanel` ends with a `mt-auto flex min-h-0 flex-1 flex-col gap-2.5`: **Shop**
  (`ShopButton`, the red full-width button that opens `/shop`) and **Tháo hết** under it, both
  `w-full flex-1 min-h-11`. The stack **fills the height the 4×5 board leaves** — the panel is as tall as
  the storage, so fixed-height buttons left a dead band of empty panel under the items ("phóng to nút
  shop và unequip để thừa spacing trống"). The item being sold is the one on the board right above the
  button, so "drag down onto Shop" is one short movement. These two are the **only** buttons in a panel;
  the game modes belong to the footer. ⚠️ `ShopButton` keeps `data-shop-drop-target="equipment"` — that
  attribute **is** the sell drop zone (`PrepScreen`'s release handler looks the element up by it), so ❌
  never move or rename it without the handler.
- 🔴 **The footer is the page footer and rides the bottom edge.** `PrepScreen` keeps the panels block
  `flex-1` inside the `min-h-screen` column and renders `<ActionBar/>` right after it, so the footer sits
  against the bottom of the viewport (14 px breathing gap, `pb-3.5`) instead of stopping wherever the
  panels end (asked for: "footer nằm sát xuống phía dưới"). ⚠️ The training chip in the modes panel has
  **no text label** — it is a square chip beside the full-size **Phòng tập** button, and its words live in
  the `title` + `aria-label`, so the button keeps the panel's height (asked for: "sửa lại button training
  room giống button battle và shop"). ⚠️ The **same switch exists inside the practice fight**
  (`data-battle-training-attacks` in `BattleScreen`'s training bar, labelled in full there): a battle is
  simulated up front, so flipping it calls `startBattle('training', { attacks })` again — a fresh session,
  exactly like **Tập lại** — ❌ never try to patch the running log.
- 🔴 **A Cutie stat row is one full-width row: the total, then `base + gear` in brackets.** Like the
  Sword Energy row (label left, number right), each stat shows the **sum** the Cutie actually fights
  with, in **`text-gold-soft`** on `font-semibold`, and — when Trang bị adds anything — a quiet
  `(20 + 1)` one size smaller. The row **label is `text-gold-soft` too** (asked for: "đổi các span title
  thành màu vàng"), so a label and its number read as one gold line rather than a grey label beside a
  bright value. 🔴 **The row and everything in it is `items-center`** — a label, a total and a smaller
  bracket line share one centre line; ❌ never `items-baseline`, which hangs the small bracket text on
  the baseline and leaves the row looking lopsided. 🔴 **The two numbers in the brackets keep two
  colours, because they are two sources**: the Cutie's own value in **`text-white`**, the gear part in
  **`text-jade`** (the same
  colour an item's stat bonus uses in its dialog). `Attack 21 (20 + 1)`, `Damage reduction 0.2% (0% + 0.2%)`.
  ❌ Never print the merged total alone (the player cannot tell where it came from) and ❌ never print
  `(2000 + 0)`: a stat the gear does not touch stays a single number, which is what keeps the panel
  clean. ❌ **There is no Speed row**: with the Cooldown Time living on each kit there is no cutie-wide
  rate to print — the "Đòn đánh thường" line under the stats already prints the real cadence
  (`Damage 14 · every 1.6s`), so a second row would only repeat it.
- ⚠️ **A stat number keeps up to two decimals** (`statNumber()` in `game/stats.ts`): the admin can type
  `0.2` — a jade giving 0.2 % damage reduction — and `Math.round()` printed `+0%`, so the item looked
  like it did nothing. Round **damage and timings**, which are integers, ❌ never a stat.
- ❌ **Do not build class names dynamically** such as `` `bg-cls-${value}` `` — Tailwind only generates
  classes present in the source. Use a lookup table, for example `ITEM_BORDER_BY_CLASS`.
- ⚠️ A wrong class does **not** turn the build red, it only loses styling → you have to check the real
  CSS ([`TESTING.md`](TESTING.md) §4).
- ✅ Shared dialogs live in `store/uiStore.ts`; ❌ do not stuff them into `gameStore` — it is persisted.
- ✅ `routes/__root.tsx` is the shared frame + `<Outlet/>`. During a battle (`battle`/`result`) the
  battle screen **overlays** the `Outlet`. An unknown path → `PrepScreen`.
- ⚠️ **There is no toast / notification system** (`Toasts`, `pushToast`, `toasts` were removed on
  request — ❌ do not bring them back). Feedback has to live where the action is: a refusal leaves the
  state untouched and the UI already says why (the red drop outline, the dimmed `aria-disabled` shop
  cell, the `disabled` upgrade/reroll button), a **feature that does not exist yet is a `disabled`
  button with a `title`** saying "… sẽ có ở bản sau" (Nhiệm Vụ, Bộ Sưu Tập), and the admin page keeps
  its own inline `setMessage` line. ❌ A clickable control that does nothing is the bug this replaced.
  ⚠️ **A state that can never be reached again is `hidden`, not dimmed**: at `MAX_CUTIE_LEVEL` the upgrade
  button is not rendered at all — the `Level 10/10` pill already says why, and a permanently disabled
  "Maximum level reached" bar is noise at the bottom of the panel (asked for: "sau khi max level thì ẩn
  button này"). Keep the dimmed form only for states that **can** change (not enough Gold).
- 🔴 **No instructional hint text in the UI — the admin is the user.** A control explains itself through
  its own shape (a label, a sign such as the `%` in `% Giảm sát thương`, a `title`, a `disabled` state,
  a field showing its own filled-in numbers). ❌ Never add a paragraph under a control saying how to use
  it ("type the 5★ box only — the rest fills in at 20/40/60/80 %", "chỗ này để nhập…", "bấm Lưu để lưu").
  The behaviour is real and it is visible the moment it fires, so the sentence is noise that makes the
  admin card look like a tutorial. Inline text is for **state the data cannot show** (an error, a warm
  message after a save) — never for an instruction. Reference: the stat kit's ladder hint was deleted
  on request ("tôi là admin tôi tự biết … tôi cần UI clean và đẹp mắt").
- Art: the rules for picking/declaring images are in [`ASSETS.md`](ASSETS.md).

### Battle screen — presentation rules

Everything below is **visual only**: it never changes damage, timing or the winner, and it must stay
readable at every playback speed (×0.5 … ×3).

- **Speed** lives in `store/battleSettingsStore.ts` (persisted, `BATTLE_SPEEDS`). The replay clock stays
  `setInterval(TICK_MS)` + `elapsedRef`; a faster speed advances **more simulated ms per tick**, it does
  not shorten the animation loop.
- **Two cursors, one playhead.** Floaters follow `feedbackCursorRef` (their event has landed); comets
  follow `visualCursorRef` and are launched **one flight early** (`event.t − COMET_LEAD_MS` ≈ 300
  simulated ms), so a streak reaches the target on the very tick its event is crossed. That is what
  makes the number, the health bar and the impact land together at ×0.5.
- **The charge overlay is drawn against launch times** (`weaponAttackTimes` stores
  `event.t − COMET_LEAD_MS`), so a weapon reads 100 % exactly when its blade leaves.
- 🔴 **The attacker moves too, exactly like the defender shakes.** When a swing leaves, `playStrikeAnimation()`
  runs a Web Animation on **the source element itself** — the weapon's tile, or the Cutie's portrait holder
  for its own kits: a 10 px lunge toward the target (`translate3d` along the real trajectory), a brief
  `brightness(1.5)` flash, a small recoil, then back to rest. The defender's reaction (`animate-shake` +
  `animate-impact-flash` + the number) is the mirror of it, so both sides of a hit read as one exchange.
  ⚠️ `element.animate()` on purpose: the tile belongs to `LoadoutGrid` / `AvatarCard`, so a class toggle
  would fight React's `className`, and a `motion` wrapper would remount the tile and restart every other
  animation inside it. ❌ Not a drawn overlay (a crescent or ring over the tile): a still glyph on a still
  tile does not read as a swing — that was rejected ("phải có animation giống như lúc bị hit trúng").
  Skipped under `prefers-reduced-motion`.
- 🔴 **A Cutie carries its own charge line.** Its attack kits give it a cadence, so `AvatarCard` draws the
  **same `ChargeOverlay`** a weapon tile uses (`data-battle-cutie-charge`), fed from the `skill` uid's
  cooldown row. ❌ Never a second charge bar component: the portrait and the tiles must read identically.
- **A projectile is a comet**, not a ribbon: `cometShape()` gives a **sharp nose on the origin** (no
  rounded cap, no dot — both were rejected) plus a 260 px tapering tail, translated in a straight line
  with `x`/`y`/`opacity` only. ❌ Never morph a path per frame — that is what read as a rope. It lands
  at `COMET_IMPACT` (0.9) of the flight, which is when the impact sound plays.
- **Melee is the moon with no tail at all.** A `SHOOTER_CLASSES` weapon (`ranged`, `artifact`) throws
  the comet above; every other class throws a **crescent** (`data-combat-effect="moon-slash"`) — the
  flight, lead time and landing tick are identical, only the silhouette changes. `moonShape()` is two
  elliptical arcs between the same two points (tips on the travel axis, `MOON_HEIGHT = 120`,
  `MOON_DEPTH = 96`, `MOON_BELLY = 62`), so the hollow is a deep bite and both tips still come to a
  point. 🔴 `MOON_BELLY` *is* the hollow and must stay ≥ half the height — a shallow inner arc turns the
  slash into a filled half-disc, and a radius under half the chord makes the browser widen the arc and
  flatten the hollow into two hairlines.
- **The blur ghost is the slash.** `data-combat-moon-hit` wraps the visible crescent in
  `scale(MOON_HIT_STRETCH_X = 1.6, MOON_HIT_STRETCH_Y = 0.94)`: scaling about the origin keeps the tips on
  the flight axis and stretches the belly forward, which is the wide swept half-moon the smeared copies
  already had — the hit itself is that shape, crisp white.
- 🔴 **The nose lands on the target, not the tips.** The whole cut sits in `data-combat-moon-body`,
  translated back by `MOON_NOSE = MOON_DEPTH × MOON_HIT_STRETCH_X`, so on `COMET_IMPACT` the **tip of the
  cut** touches the target. Without the offset the belly overshoots and the number pops with the slash
  already past the card.
- **Speed comes from a blurred smear, not from a streak.** Two copies of the moon (`MOON_BLUR`, drawn at
  `MOON_BLUR_SCALE = 1.1` — a smear **10 % wider** than the slash, so it reads as a halo of speed around
  the blade rather than a second slash) are stretched back along the flight and blurred, so it looks fast.
  ❌ No drawn air lines: the four straight wisps were removed on request ("xóa 4 tia gió này"). ❌ No long
  tail, ❌ no spinning crescent: both were rejected earlier.
- **The slash is tinted exactly like the comet**: `moon-tone-<key>` is a `currentColor → white` gradient,
  so `slashTone()` (red on a crit, Sword-Energy blue on a charged hit, white otherwise) colours the whole
  cut and its blur without a second colour rule. ❌ Never hard-code white: a crit would stay white while
  the arrow next to it turned red.
- **It grows on the way in.** `data-combat-moon-scale` wraps the moon *and* its blur and animates
  `scale` from `MOON_START_SCALE` (0.45) to 1, reaching full size at `COMET_IMPACT` — a cut thrown at the
  target instead of a sticker carried across. The scale lives **inside** the travelling group, so the
  flight is still one straight line and the landing tick does not move.
  Flying a crescent only while sliding it would read as a sticker, which is why the smear and the
  streaks exist at all.
- **A Cutie's own swing leaves from its portrait centre**; a weapon's leaves from its loadout tile.
  Weapon tiles are found through the `#<kitId>`-suffixed uid `combatItemUid` builds, not the template id.
- **Damage numbers: one per hit, and never added together.** Two copies of one weapon share a cadence
  and fire on the same tick — that is **two** numbers (in different spots), not one summed number. They
  only live in the **upper part** of the card (`feedbackPosition` rows 14–64 %): a number at the bottom
  edge or under the nameplate reads like a bug. Each one also drifts up while leaning **away from the
  attacker** (`--floater-drift` — player card left, enemy card right). Each number sits at a position
  derived from its own key (`feedbackPosition`) so it never moves when another appears or expires, lives
  `FEEDBACK_LIFE_MS` simulated ms (`/ speed`, floor `FEEDBACK_MIN_LIFE_MS`), and past
  `FEEDBACK_MAX_LIVE` numbers on one side the oldest makes room.
- 🔴 **Everything pops on the same frame.** The health, armour and Sword Energy read-outs, the bars and
  every floating number of one replay tick all change together: no stagger on the numbers
  (`--floater-delay` is always `0s`) and the bars use a **short tween** (`BAR_TRANSITION`), ❌ not a
  spring — a spring kept travelling ~300 ms after the state changed, so a number appeared while its bar
  was still on the way. A stagger read as "the bar dropped, then the numbers arrived".
- **Armour gains get a number too** (`type: 'shield'`), in Sword-Energy blue: the badge would otherwise
  move with nothing to explain it.
- 🔴 **Floaters use a CSS keyframe** (`animate-combat-floater` + `--floater-life` / `--floater-delay`)
  and the avatar holder is **not keyed by the hit**. A `motion` component restarts its keyframes on
  re-render, and a holder keyed by `hitKey` remounts every number inside it — either one makes all the
  numbers already on screen jump whenever a new hit lands. The shake key stays on a wrapper around the
  picture only.
- **The armour badge prints `SideState.shield` directly**: `useSpring(number)` only *seeds* a spring, so
  the badge used to freeze at the starting armour. The Sword Energy bar carries a `current / max`
  read-out (`data-battle-se-value`), one size smaller than the health bar's.
- Skill slots on the battle avatar are **inert placeholders** (`CUTIE_SKILL_SLOTS`, empty seals): no
  skill data is stored or read, so nothing can fire until the skill system exists.
- A **frozen weapon** gets a ❄ badge on its tile (`data-battle-weapon-frozen`), a frost sheet over the
  tile (`data-weapon-freeze-overlay`) and a slowed one a 🐌 badge. A weapon with **temporary cooldown
  reduction** (a `freeze-haste` / `heal-haste` gem) has **no badge** — only the meteor streaks
  (`HasteStreaks`) **inside a green rim** (`data-weapon-boost-border`, z-7 so it
  sits above the frost): nine thin light trails of different length, width, speed and opacity, each
  starting **below** the tile and ending **above** it (`--streak-rise`) with `linear` timing and a negative
  delay, so the loop restart is never visible and the stream does not stutter at an edge.
  Freeze is **live**: `battleWeaponStatuses` computes the remaining ice from `freezeWindows` and
  `playbackTime` and never from the last crossed snapshot. 🔴 A frozen weapon cannot swing, so it cannot
  refresh that snapshot itself — reading `cooldowns[].frozen` made the frost and the ❄ badge outlive the
  ice (until some *other* event arrived) while the charge bar had already resumed. Slow / cdr still use
  the snapshot, where a stale value only means a badge lingers a tick. The bar itself must not move
  either: `battleCharge.ts` turns the
  🧊 status events into `FreezeWindow`s and the charge clock is `playbackTime − frozenShift(windows, …)`,
  with the attack times shifted by the same amount, so a frozen weapon pauses **where it stood** instead
  of crawling on. Without that skip the bar kept filling through the whole freeze — the bug that made
  the overlay necessary in the first place.
- A **blocked charged attack** emits a `block` event and the arena shows the `ĐỠ ĐÒN` popup through
  `AvatarFeedback` — the event carries no damage, so it never adds a number.
- A **critical hit** shows a bigger, blazing **number** and nothing else: 34 px instead of 27, gold
  `#ffd45c` with a fire glow (the comet for the same hit is already `text-red-500`), and a punch-in
  (`animate-critical-pop` on an inner span, so it does not fight the floater's own transform);
  `data-combat-critical-hit` marks the wrapper. ❌ **No `CRITICAL` word** — the player reads the size and
  the colour. ⚠️ Not `data-combat-critical`: that one belongs to the comet (`CombatSlash`) and already
  means "this slash is a crit" — matching it silently hit the comet.
  Flavours are a **table**, not branches: add a row to `FEEDBACK_STYLE` (and a value to
  `AvatarFeedback['type']`) for burn / poison later; the renderer just looks it up.
- Numbers **pop on the back half of the card, above the fighter's chest**: `feedbackPosition(key, side)` keeps
  them in rows `16–46 %` (always above the portrait's centre, even before the float lifts them) and in
  columns **`16/30/44 %` on the player card, `56/70/84 %` on the enemy card** — the half that faces *away*
  from the opponent, so a number never appears "in front of" the fighter it describes.
  `combatFloater` starts at `+4 px` and only ever travels upward (−4 → −16 → −24 px), and the number is
  knocked **backwards** (`--floater-drift`: `−18 px` on the player card, `+18 px` on the enemy card), away
  from the blow that arrived from the opposite side.
- The **death zone** after 3 minutes is simulation, not presentation: it calls `dealDamage` with
  `kind: 'dot'`, so it respects armour reduction and appears in the health bars exactly like a burn.
- `components/combatRibbon.ts` is gone; do not bring a ribbon back.
