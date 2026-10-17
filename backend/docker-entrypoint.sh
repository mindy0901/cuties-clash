#!/bin/sh
# Wait for the database, run the migrations, then start the API.
set -e

echo "→ Waiting for the database to be ready…"
node scripts/wait-for-db.mjs

echo "→ Applying Prisma migrations…"
# `scripts/migrate.mjs` baselines by itself when the database already has tables from the
# Alembic era (otherwise `prisma migrate deploy` dies with P3005 "The database schema is not
# empty").
node scripts/migrate.mjs

echo "→ Starting the API on port 8000…"
# `DEV_WATCH=true` (the `be-dev` service in compose): reload when files change.
#
# ⚠️ Why `nodemon --legacy-watch` and not `tsx watch`: `tsx watch` uses `node:fs.watch`, and a
# Windows bind mount does **not** deliver filesystem events into the container (verified: after
# editing a file the log stayed empty and the API kept running the old code). `--legacy-watch`
# is nodemon's polling mode, so it works regardless of the filesystem type.
if [ "$DEV_WATCH" = "true" ]; then
	exec pnpm dev:docker
fi

exec pnpm exec tsx src/main.ts

