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
# `DEV_WATCH=true` (service `be-dev` trong compose): tự nạp lại khi sửa file.
#
# ⚠️ Vì sao dùng `nodemon --legacy-watch` chứ không `tsx watch`: `tsx watch` dùng
# `node:fs.watch`, mà bind mount của Windows **không phát sự kiện filesystem** vào container
# (đã kiểm chứng: sửa file xong log trống, API vẫn chạy code cũ). `--legacy-watch` là chế độ
# polling của nodemon nên hoạt động bất kể loại filesystem.
if [ "$DEV_WATCH" = "true" ]; then
	exec pnpm dev:docker
fi

exec pnpm exec tsx src/main.ts

