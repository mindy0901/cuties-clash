-- Pictures uploaded from the admin page: one PNG per item / pet, stored in the database.
--
-- Written IDEMPOTENT for the same reason as `0_init`: `AUTO_CREATE_TABLES=true` runs every
-- migration file at startup, so a second boot must be a no-op instead of failing with
-- "relation already exists". No statement drops anything or rewrites data.
--
-- Why the database instead of disk: the container has no writable volume for user content, so a
-- file would disappear on rebuild. The pictures are 256×256 PNGs (tens of KB), and `version` goes
-- into the public URL (`?v=3`) so a cached image is never stale.

-- CreateTable
CREATE TABLE IF NOT EXISTS "content_art" (
    "id" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "bytes" BYTEA NOT NULL,
    "mime" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" VARCHAR(320),

    CONSTRAINT "content_art_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_content_art_kind" ON "content_art"("kind");
