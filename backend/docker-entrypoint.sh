#!/bin/sh
# Chờ cơ sở dữ liệu, chạy migration rồi khởi động API.
set -e

echo "→ Chờ cơ sở dữ liệu sẵn sàng…"
node scripts/wait-for-db.mjs

echo "→ Áp migration Prisma…"
# `scripts/migrate.mjs` tự baseline khi database đã có bảng từ thời Alembic (nếu không,
# `prisma migrate deploy` chết với P3005 "The database schema is not empty").
node scripts/migrate.mjs

echo "→ Khởi động API tại cổng 8000…"
exec pnpm exec tsx src/main.ts

