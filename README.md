# Martial Cutie — Đấu Trường Thú Cưng

A browser pet-raising auto-battler (**React 19 + Vite + TypeScript + Tailwind CSS v4**, routed with **TanStack Router**, server data with **TanStack Query**), with a **Fastify + Prisma backend** for Google sign-in and progress sync. The repo is a **pnpm workspace** with two packages, `frontend/` and `backend/`. Inspired by the **Martial Cutie (武林萌主) event** in *NARAKA: BLADEPOINT*.

This project **rewrites every game rule from scratch** based on the event's public description — it copies no assets, source code, images, audio or text from NetEase. Item/pet art is **CC0 icons from [ORHstudio](https://itch.io/c/7530014/wuxia-icon-series)** (see [`docs/ASSETS.md`](docs/ASSETS.md)); emoji are kept as the fallback. Item/pet names and all copy are original content.

## Quick start

### Option 1 — Docker production: 3 separate images (recommended for playing)

```bash
cp .env.example .env      # fill in JWT_SECRET, and the Google keys if you want sign-in
docker compose up --build -d   # open http://localhost:5190
```

⚠️ An image is a **snapshot from build time**. After changing code you have to run `docker compose up --build -d`
again before 5190 shows the new code. If you want to see edits immediately, use **Option 1b** below.

Three independent images, each with one role:

| Image | Role | Port |
| ----- | ---- | ---- |
| `db`  | PostgreSQL 17 | 5432 |
| `be`  | Fastify + Prisma (**no** frontend) | 8000 |
| `fr`  | nginx serving the Vite build + proxying `/api` → `be` | **5190** → 80 |

Open **http://localhost:5190**. `fr` forwards `/api/*` to `be`, so the browser only sees one origin — the sign-in session cookie works correctly and no CORS is needed.

### Option 1b — Docker dev: edits reload by themselves (hot reload on both sides)

```bash
docker compose --profile dev up -d db be-dev vite   # open http://localhost:5190
```

| Service | Role | Host port |
| ------- | ---- | --------- |
| `vite`   | Vite dev server + HMR (`/api` proxy → `be-dev`) | **5190** |
| `be-dev` | Fastify running under `nodemon --legacy-watch` — editing a file restarts the API | 8001 |

Edit a file in `frontend/` or `backend/` → the container reloads by itself, **no image rebuild needed**.

⚠️ `vite` and `fr` **compete for port 5190** — running one means stopping the other:

```bash
docker compose stop fr be                            # switch to dev mode
docker compose --profile dev up -d db be-dev vite
# … and back to production:
docker compose --profile dev stop && docker compose up --build -d
```

⚠️ Why `be-dev` uses `nodemon --legacy-watch` and not `tsx watch`: Windows bind mounts
**do not emit filesystem events** into the container, and `tsx watch` has no polling mode → after editing a
file the API keeps running the old code. `--legacy-watch` is polling, so it works on any kind of filesystem.
Likewise, `vite` sets `VITE_USE_POLLING=1` (read in `frontend/vite.config.ts`).

```bash
docker compose up -d db                       # database only
docker compose down                           # stop (keep the data)
docker compose down -v                        # stop and DELETE the data
```

### Option 2 — Local dev (fastest hot reload)

```bash
# Terminal 1: only PostgreSQL inside Docker
docker compose up -d db

# Terminal 2: backend (Fastify, port 8000)
pnpm install              # once, at the repo root (installs both packages)
pnpm db:migrate           # prisma migrate deploy
pnpm dev:be

# Terminal 3: frontend
pnpm dev                  # http://localhost:5190
```

Vite proxies `/api` to `http://localhost:8000`, so once again the browser only ever talks to one origin. The OAuth redirect port is 5190 in both ways of running, too — no extra URI to register.

### Option 3 — Frontend only (no backend needed)

```bash
pnpm install
pnpm dev                  # the game is fully playable, progress is stored in localStorage
```

Without a backend the **Đăng nhập** button is still shown but the dialog reports that it is not configured — every gameplay feature keeps working normally.

## Commands

| Command                         | What it does                                |
| ------------------------------- | ------------------------------------------- |
| `pnpm dev`                      | Dev server at http://localhost:5190 (HMR)   |
| `pnpm build`                    | Production build into `frontend/dist/` + typecheck |
| `pnpm test`                     | Run the frontend tests (Vitest)             |
| `pnpm lint`                     | Lint both packages (oxlint)                 |
| `pnpm dev:be`                   | Run the Fastify backend on port 8000        |
| `pnpm build:be`                 | `prisma generate` + typecheck the backend   |
| `pnpm test:be`                  | Run the backend tests (Vitest)              |
| `pnpm db:migrate`               | Run migrations (`prisma migrate deploy`)    |

## Google sign-in

The backend uses the **OAuth 2.0 authorization code** flow. The redirect URI has to be registered with Google exactly:

| Where you create the keys | Redirect URI to register |
| ------------ | ------------------------------------------------- |
| https://console.cloud.google.com/auth/clients | `http://localhost:5190/api/auth/google/callback` |

**Both ways of running use port 5190** (Docker: nginx `fr`; dev: Vite), so only **one** URI has to be registered — no extra URI for port 8000.

Fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env` — you need **both**; with either one missing the sign-in button is not shown.

> 📖 **Step-by-step instructions for getting the keys, forced sign-in mode, and a table of common errors: [`docs/OAUTH-SETUP.md`](docs/OAUTH-SETUP.md)**

### Requiring sign-in before playing?

By default players **enter the game immediately** (anonymous play) and click **Đăng nhập** when they want to sync. Setting `AUTO_LOGIN=true` in `.env` sends visitors who are not signed in straight to Google. This flag **has no effect when the Google keys are not configured**, so turning it on by mistake does not kill the game.

After signing in, progress is synced to the server (`PUT /api/me/save`) — `localStorage` is still the primary source, the server only keeps a copy so you can continue on another machine.

## Gameplay loop

The game has **two screens**, navigated with real paths (the browser Back button works):

| Screen | Path | Contents |
| -------- | --------- | -------- |
| **Phòng chuẩn bị** | `/` | Pet + stat panel (Sức mạnh, Máu, Lịch sử đấu) · pet stage · **Kho đồ** (storage) · **Trang bị** (what is carried) · action button bar |
| **Cửa hàng** | `/shop` | Buy items with Paw Tally, reroll the shop list. Opened from the **Mua Vật Phẩm »** button |

### How Trang bị and Kho đồ differ

| | **Trang bị** | **Kho đồ** |
| --- | --- | --- |
| What it is | Items the pet is **carrying** | **Stored** items, not in use |
| Capacity | **4-column** grid, rows grow with pet level (12–20 cells) | **8-column** grid, **unlimited** (grows taller by itself) |
| Locked cells | Yes — cells above the pet level are dimmed and cannot be used | No — every cell is usable |
| Takes part in battle? | ✅ Yes — passive, aura and weapon all count | ❌ No, sitting unused does nothing |
| When items land here | Buying in the shop while Trang bị **has room** | Buying while Trang bị is **full**, or when you unequip |
| Placement | You place them yourself — items sit in the exact cell | **The same** — items sit in the exact cell, Kho đồ does not arrange for you |
| Dropping onto a differently-typed item | **Swap positions** of the two items | ❌ **Rejected** (red outline) — the item already there is not pushed away |

Moving items between the two: **hold the mouse button and drag** an item to another cell, then release. Only **drag and drop** moves items —
**clicking** an item shows its **details** (name, stats, effect, price and sell-back price).
While dragging, press **R** or **right click** to rotate 90°, **Esc** to cancel.
**Both panels are free grids**: drop where you want and the item stays there, drag inside Kho đồ to rearrange it freely.
Drag down into **Kho đồ** to store it; drag up from Kho đồ onto the grid to carry it. The **↑** and **↓ Tháo hết** buttons are still available.

1. **Buy items** on the Cửa hàng screen with **Paw Tally (萌主币)** earned from each stage — items go onto Trang bị automatically if there is room.
2. **Arrange Trang bị**: each item occupies a **rectangular block of cells** (sword 1×3, great sabre 2×3, blade shaft 1×4, jade/pill 1×1).
3. **Rotate 90°** with **right click** or the **⟳** button when space is tight — **even while holding the mouse button and dragging**. Rotation only works when the new orientation fits. A long item (**1×4**) that does not fit the open Trang bị grid **must be rotated** before it can be dropped — the game does not rotate it for you.
4. **Merge 2 identical items** (drop one on top of the other) → `+1★` (up to **5★**). Selling back returns **50%** of the Paw Tally.
5. **Đấu Thú Cưng** — pets fight automatically. Replay the whole sequence at ×1/×2/×4/×8 speed.
6. **60 stages / 3 maps** (Tụ Khốt Châu → Hỏa La Quốc → Stormchant), stages 10/20/30… are **bosses**.
7. **PvP friendly matches** against a rival generated from your own power (does not affect stage progression).

Progress is saved automatically into `localStorage` (key `martial-cutie-save`) and synced to the server once signed in. The **Nhiệm Vụ** and **Bộ Sưu Tập** buttons already have a place in the layout but no content yet — clicking them reports "sẽ có ở bản sau".

## Combat mechanics

Simulated in 50 ms steps, **fully deterministic** by seed → the same battle always plays out identically and can be replayed.

- **Máu (HP)** + **starting shield** absorb damage first.
- **Kiếm Thế (Sword Energy)**: regenerates over time, and **+4 every time you are hit**.
    - **Chấn Đao (Counter)** — costs **65 Kiếm Thế**, chance based on `counterChance`: breaks the attack, counters with `referenceAtk × counterPower` and **pushes the opponent's attack bar back 350 ms**.
    - **Trọng kích (Charged Attack)** — costs **24–40 Kiếm Thế** (depending on weapon speed), damage **×2.2**.
- **Status effects**: Chậm, Đóng Băng, Độc, Cháy, Hồi phục, Cuồng phong, Giòn.
- **Adjacency**: an aura such as *Trống Trận* only triggers when there is an **adjacent weapon**; *Cờ Lụa* needs **one adjacent non-weapon item** — computed from **every cell** an item occupies, which is why where you place items matters.

Balance numbers live in [`frontend/src/game/items.ts`](frontend/src/game/items.ts), [`frontend/src/game/stages.ts`](frontend/src/game/stages.ts) and [`frontend/src/game/pets.ts`](frontend/src/game/pets.ts).

## Source layout

```
frontend/                     # The `frontend` package
├─ src/game/                  # Pure-logic game core (no React dependency)
│  ├─ types.ts                # Domain types
│  ├─ items.ts                # 27 items, 5 star ranks, 5 quality bands (Vũ khí / Hộ giáp / Hồn Ngọc / Pháp Bảo / Đan Dược)
│  ├─ pets.ts                 # 3 pets, 5 levels, number of storage rows per level (4 columns)
│  ├─ stages.ts               # 60 stages / 3 maps + PvP blueprint
│  ├─ build.ts                # Merge passive + aura → combat stats
│  ├─ battle.ts               # Deterministic auto-battle simulation
│  ├─ sanitize.ts             # Normalise a broken save (anti blank page)
│  ├─ art.ts                  # Resolve art paths (image when available, emoji otherwise)
│  ├─ bag.ts                  # Multi-cell grid: collision, rotation, star merge, sell price
│  ├─ economy.ts              # Shop rolls, reroll
│  └─ rng.ts                  # mulberry32 PRNG (deterministic)
├─ src/api/                   # Talking to the backend
│  ├─ client.ts               # Plain fetch + ApiError class
│  ├─ queries.ts              # TanStack Query: session, pushing/pulling the save
│  ├─ queryClient.ts          # createQueryClient()
│  └─ saveSync.ts             # pushRun/pullRun — the sync rules, kept out of React
├─ src/store/
│  ├─ gameStore.ts            # Zustand + localStorage persist (game rules, progress)
│  ├─ persistedSave.ts        # Reading/writing the save in localStorage
│  └─ uiStore.ts              # Map / sign-in dialogs
├─ src/router.tsx             # createRouter(routeTree)
├─ src/routeTree.gen.ts       # Route tree generated by the plugin — do not edit by hand
├─ src/routes/                # One file per screen
│  ├─ __root.tsx              # Shared frame (TopBar, dialogs, Toasts)
│  ├─ index.tsx               # Phòng chuẩn bị (/)
│  └─ shop.tsx            # Cửa hàng (/shop)
├─ src/components/            # React UI
│  ├─ ItemIcon.tsx            # ItemIcon / PetIcon / SkillIcon — art or emoji fallback
│  ├─ ArtIcon.tsx             # Renders the image, falls back to emoji when the file is missing
│  ├─ GridBoard.tsx           # Shared multi-cell grid (Kho đồ + Trang bị panel)
│  ├─ PrepScreen.tsx          # Phòng chuẩn bị (path /)
│  ├─ ShopScreen.tsx          # Separate Cửa hàng screen (/shop)
│  ├─ ActionBar.tsx           # Bottom button bar: Mua Vật Phẩm · Nhiệm Vụ · Bộ Sưu Tập · Bản đồ · Đấu
│  ├─ PetLoadoutPanel.tsx     # Trang bị (currently carried) + shop button
│  └─ …                       # TopBar, InventoryPanel, PetPanel, BattleScreen, dialogs…
├─ src/styles/app.css         # @theme (design tokens) + project @utility rules
├─ src/test/router.tsx        # Router-aware render helper for tests
├─ public/icons/              # Item/pet/skill art (see docs/ASSETS.md)
├─ Dockerfile                 # The `fr` image (build context = repo root)
└─ nginx.conf                 # SPA fallback + /api proxy → be:8000

backend/                      # The `backend` package
├─ src/                       # Fastify: config, db, oauth, security, services, routes
├─ prisma/schema.prisma       # users, oauth_identities, game_saves tables
├─ prisma/migrations/0_init/  # Baseline SQL (idempotent, runs on an existing DB)
├─ tests/                     # Vitest — every test rolls back, leaves no data behind
├─ Dockerfile                 # The `be` image (build context = repo root), run with tsx
└─ docker-entrypoint.sh       # wait for DB → prisma migrate deploy → tsx src/main.ts
```

### Main API

| Method | Path                             | What it does                                  |
| ------ | -------------------------------- | --------------------------------------------- |
| GET    | `/api/auth/session`              | Sign-in status + available providers          |
| GET    | `/api/auth/google/login`         | Redirect to Google                            |
| GET    | `/api/auth/google/callback`      | Receive the authorization code, create a session |
| POST   | `/api/auth/logout`               | Sign out, revoke old tokens                   |
| GET    | `/api/me`                        | Current user profile                          |
| GET    | `/api/me/save`                   | The save stored on the server                 |
| PUT    | `/api/me/save`                   | Write the save (with a `revision` check)      |
| GET    | `/api/health`                    | Liveness check + configured providers         |
| GET    | `/docs` (Fastify)                | No Swagger; see `backend/src/routes/`          |

## Testing

```bash
pnpm test                      # 312 frontend tests
pnpm test:be                   # backend tests (Vitest, run inside a rolling-back transaction)
```

Frontend coverage: multi-cell Trang bị grids & star-merge rules, item shape/rotation, **splitting Trang bị ↔ Kho đồ** (buying puts items on Trang bị automatically, going to Kho đồ when full, unequipping/equipping back and forth), the 50% sell price, the item catalogue, shop rolls, the 60-stage ladder, pet stats, merging passives/auras, battle determinism, Chấn Đao, status effects, the whole store loop, battle playback, **navigating Phòng chuẩn bị ↔ Cửa hàng**, the **v1 → v2 migration**, **normalising a broken save + the recovery screen**, and **art with a real transparent background** (`artAlpha.test.ts`).

### Art

Item/pet icons are **CC0 from [ORHstudio](https://itch.io/c/7530014/wuxia-icon-series)** — attribution not required. For sources, licences, the mapping table and one trap that was hit (the pack says "transparent background" but 31 files are solid black): see [`docs/ASSETS.md`](docs/ASSETS.md).

![Item icon sheet](docs/images/icon-sheet.png)

Backend coverage: sign-in sessions, anonymous play still working, logging out revoking tokens, save sync + `revision` conflicts, size limits, the OAuth flow (forged state, provider errors, profile normalisation), account linking by email, and configuration (rejecting a sample/too-short `JWT_SECRET`).

## Things still worth doing

- **Audio / hit effects** — currently only a `shake` animation and a damage floater.
- **Detailed item tooltips** — currently the `title` attribute.
- **Real PvP** — leaderboards, or rival seeds that can be shared between players.
- **More pet sets**, and filtering/searching items once Kho đồ is crowded.
- **Localisation** — Vietnamese is currently hardcoded in `items.ts`/`pets.ts`/components.
- **Backend** — OAuth refresh tokens, rate limiting, cleaning up expired sessions. The `oauth_identities`
  table is ready for linking multiple providers but only Google is used today.
- **`autoCodeSplitting` for TanStack Router** — the bundle is currently ~422 KB (134 KB gzip).
- **Swagger/OpenAPI for Fastify** — FastAPI's `/api/docs` was lost when moving to Fastify.

## For AI agents / the next session

Read **[`AGENTS.md`](AGENTS.md)** before changing anything: the documentation lookup table, the commands, the source layout, the mandatory invariants, and the recipe for adding a new feature.

Topic-specific details live in [`docs/`](docs/): [architecture](docs/ARCHITECTURE.md) · [game rules](docs/GAME-RULES.md) · [testing](docs/TESTING.md) · [balance](docs/BALANCE.md) · [art](docs/ASSETS.md) · [OAuth](docs/OAUTH-SETUP.md).
