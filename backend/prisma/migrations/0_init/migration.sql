-- Baseline schema: users, oauth_identities, game_saves.
--
-- Generated with:
--   pnpm --filter backend exec prisma migrate diff \
--     --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- then edited by hand to be IDEMPOTENT.
--
-- Why idempotent: the running database (both dev and deployed production) ALREADY has these
-- three tables, created by Alembic, with exactly the table/column/index/foreign-key names
-- below. `AUTO_CREATE_TABLES=true` runs this file at startup, so if it were not idempotent the
-- second boot would fail with "relation already exists". Therefore:
--   * tables  → CREATE TABLE IF NOT EXISTS
--   * indexes → CREATE INDEX IF NOT EXISTS  (Postgres treats a unique constraint as a relation
--             with the same name, so `IF NOT EXISTS` recognises both forms)
--   * foreign keys → wrapped in a DO … block that only adds the constraint when its name does
--             not exist yet
-- No statement drops anything or rewrites data, so running it against a database that already
-- holds data is safe.

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
