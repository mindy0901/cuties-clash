# Backend — Martial Cutie

API **Fastify 5 + Prisma** for Martial Cutie (Đấu Trường Thú Cưng). The backend **contains
no game rules**: it only authenticates identities (Google OAuth) and stores/reads the `RunState`
as raw JSON. All battle computation lives in `frontend/src/game/`.

## Running

From the **repo root** (this is a pnpm workspace):

```bash
pnpm install          # installs both packages
docker compose up -d db
pnpm db:migrate       # prisma migrate deploy
pnpm dev:be           # http://localhost:8000 (tsx watch)
```

In Docker: `docker compose up --build` (image `be`, port 8000).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev:be` | Run in dev, reloading on change (`tsx watch`) |
| `pnpm build:be` | `prisma generate` + `tsc --noEmit` (typecheck, produces no `dist/`) |
| `pnpm test:be` | Vitest |
| `pnpm db:migrate` | `prisma migrate deploy` |

## Configuration

Read in the order `../.env` → `backend/.env` → environment variables (environment variables
win). See the full table in [`.env.example`](../.env.example).

- `DATABASE_URL` — accepts both `postgresql://` and `postgresql+psycopg://` (the driver suffix is
  stripped).
- `JWT_SECRET` — **required**, at least 32 characters. Get it wrong and the app **does not
  start** (deliberate: a weak key means tokens can be forged).
- `AUTO_CREATE_TABLES` — `true` (the default, handy in dev) runs the idempotent baseline SQL in
  `prisma/migrations/0_init/` at startup. Docker sets it to `false` and uses
  `prisma migrate deploy` instead.

## Migrations

`schema.prisma` is the source of truth. The `0_init` baseline was **rewritten to be idempotent**
(`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) so it can run on a database that
already has the tables from the Alembic era — every statement there is a no-op and it only adds
the `_prisma_migrations` bookkeeping table.

⚠️ When you change the schema, generate a new migration and then **eyeball** it to check it does
not accidentally `DROP` anything from the running database.

## Testing

Tests use the **same `DATABASE_URL`** as `.env` — but **every case runs inside
`prisma.$transaction` and always rolls back** (a sentinel is thrown at the end and caught
outside). That means no extra database, no leftover data, and the real saves are never touched.

What makes that work: **every database access must go through the injected `db`** in
`buildApp({ db, config })`. ❌ Do not import `PrismaClient` at module scope.

Network calls to Google are blocked: `tests/setup.ts` installs a `fetch` that **throws**, and the
OAuth tests stub it instead.

⚠️ A consequence worth knowing: `users_id_seq` does **not** roll back with it (sequences are not
transactional), so the id sequence grows with every test run. It does not affect the data.

## Docker

`docker-entrypoint.sh`: wait for the DB → `prisma migrate deploy` → `tsx src/main.ts`.

⚠️ It runs via **`tsx`**, not `node dist/main.js`: the source imports have no extension
(`from './config'`) and plain Node ESM requires a `.js` extension. That is why `build` is a
**typecheck** step that produces no `dist/`. The image uses `node:22-slim` (Debian) because
Prisma needs an libssl that matches its binary engine — alpine/musl breaks very easily.
