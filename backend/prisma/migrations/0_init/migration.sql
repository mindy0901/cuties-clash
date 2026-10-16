-- Baseline schema: users, oauth_identities, game_saves.
--
-- Được sinh bằng:
--   pnpm --filter backend exec prisma migrate diff \
--     --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- rồi sửa tay thành IDEMPOTENT.
--
-- Vì sao idempotent: database đang chạy (dev và production đã triển khai) ĐÃ có ba
-- bảng này do Alembic tạo, với đúng tên bảng/cột/index/khoá ngoại như dưới đây.
-- `AUTO_CREATE_TABLES=true` chạy file này lúc khởi động, nên nếu nó không idempotent
-- thì lần khởi động thứ hai sẽ lỗi "relation already exists". Vì vậy:
--   * bảng  → CREATE TABLE IF NOT EXISTS
--   * index → CREATE INDEX IF NOT EXISTS  (Postgres coi unique constraint cũng là
--             một quan hệ cùng tên, nên `IF NOT EXISTS` nhận ra cả hai dạng)
--   * khoá ngoại → bọc trong khối DO … nếu tên constraint chưa tồn tại thì mới thêm
-- Không câu lệnh nào DROP/sửa dữ liệu, nên chạy trên database đang có dữ liệu là an toàn.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(320),
    "display_name" VARCHAR(120) NOT NULL,
    "avatar_url" TEXT,
    "session_epoch" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "last_login_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "oauth_identities" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "oauth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "game_saves" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "game_saves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ix_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_oauth_identities_user_id" ON "oauth_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "uq_oauth_provider_subject" ON "oauth_identities"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "game_saves_user_id_key" ON "game_saves"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_game_saves_user_updated" ON "game_saves"("user_id", "updated_at");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oauth_identities_user_id_fkey') THEN
        ALTER TABLE "oauth_identities" ADD CONSTRAINT "oauth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_saves_user_id_fkey') THEN
        ALTER TABLE "game_saves" ADD CONSTRAINT "game_saves_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;
