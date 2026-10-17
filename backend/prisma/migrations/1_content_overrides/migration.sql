-- Table holding content edited from the admin page (`/admin`).
--
-- Written IDEMPOTENT for the same reason as `0_init`: `AUTO_CREATE_TABLES=true` runs every
-- migration file at startup, so a second boot must be a no-op instead of failing with
-- "relation already exists". No statement drops anything or rewrites data.
--
-- This table does NOT hold whole templates: the originals stay in code (`game/items.ts`,
-- `game/pets.ts`) and the client layers the override on top. Deleting a row returns the
-- entity to its default.

-- CreateTable
CREATE TABLE IF NOT EXISTS "content_overrides" (
    "id" VARCHAR(120) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "payload" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" VARCHAR(320),

    CONSTRAINT "content_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ix_content_overrides_kind" ON "content_overrides"("kind");
