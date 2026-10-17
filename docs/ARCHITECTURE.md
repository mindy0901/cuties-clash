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
  player must never see a JSON error page.
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

## 8. UI conventions

- ❌ **Do not** use `requestAnimationFrame` for battle playback — background tabs get throttled. Use
  `setInterval` with `TICK_MS = 60`.
- ✅ Playback follows `elapsedRef` (simulated time) and looks up `events[next].t <= elapsed`;
  ❌ do not assume the index matches the time.
- ✅ `commitBattle()` rewards **once only** (`battle.committed`). Keep this guard.
- ✅ No `setState` during render — use `useEffect` (see `BattleScreen`). Mutations go through store
  actions; ❌ do not modify `run` in place.
- ✅ Colour/spacing tokens are declared in `@theme` in `styles/app.css`; ❌ do not scatter hex codes
  through components.
- ✅ Use the shared class strings in `components/ui.ts` (`panelClass`, `btnClass`, `statClass`…).
- ❌ **Do not build class names dynamically** such as `` `bg-cls-${value}` `` — Tailwind only generates
  classes present in the source. Use a lookup table, for example `ITEM_BORDER_BY_CLASS`.
- ⚠️ A wrong class does **not** turn the build red, it only loses styling → you have to check the real
  CSS ([`TESTING.md`](TESTING.md) §4).
- ✅ Shared dialogs live in `store/uiStore.ts`; ❌ do not stuff them into `gameStore` — it is persisted.
- ✅ `routes/__root.tsx` is the shared frame + `<Outlet/>`. During a battle (`battle`/`result`) the
  battle screen **overlays** the `Outlet`. An unknown path → `PrepScreen`, and buttons that have no
  feature yet must **say** "sẽ có ở bản sau" rather than ❌ staying silent.
- Art: the rules for picking/declaring images are in [`ASSETS.md`](ASSETS.md).
