-- The **kit catalogue** becomes data: catalogues (headings) the admin can create/rename/delete, and
-- kit entries that can be renamed, moved between catalogues, retuned, created and deleted.
--
-- ⚠️ The 30 mechanics themselves stay in code (`frontend/src/game/kits.ts`): the engine runs them and
-- the game must work with no backend. A `kit_entries` row is therefore an **overlay** over one of them
-- (`mechanic`), written only when the admin changed something — or created a new kit out of a mechanic.
--
-- ⚠️ `kit_removals` (migration 5) is folded into `kit_entries.removed`: one table for the catalogue,
-- one meaning for a row ("this kit exists, and here is how it differs from code").
--
-- ⚠️ Idempotent (AUTO_CREATE_TABLES runs every file on every startup).

CREATE TABLE IF NOT EXISTS "kit_categories" (
    "id"         VARCHAR(40)    NOT NULL,
    "label"      VARCHAR(60)    NOT NULL,
    "position"   SMALLINT       NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(320),
    CONSTRAINT "kit_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "kit_entries" (
    "id"          VARCHAR(40)    NOT NULL,
    "mechanic"    VARCHAR(40)    NOT NULL,
    "label"       VARCHAR(80),
    "category_id" VARCHAR(40),
    "applies_to"  VARCHAR(8),
    "params"      JSONB,
    "position"    SMALLINT,
    "removed"     BOOLEAN        NOT NULL DEFAULT false,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by"  VARCHAR(320),
    CONSTRAINT "kit_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "kit_entries"
    DROP CONSTRAINT IF EXISTS "kit_entries_category_id_fkey";
ALTER TABLE "kit_entries"
    ADD CONSTRAINT "kit_entries_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "kit_categories"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "ix_kit_entries_category" ON "kit_entries" ("category_id");

-- The five catalogues of the code catalogue (`KIT_CATEGORIES` in `frontend/src/game/kits.ts`). Seeded
-- here so the table is complete on the first boot; the client keeps the same five as its offline
-- fallback, and an admin may rename them or add more.
INSERT INTO "kit_categories" ("id", "label", "position") VALUES
    ('attack',  'Attack',            0),
    ('control', 'Control',           1),
    ('support', 'Support',           2),
    ('defense', 'Defense',           3),
    ('stats',   'Stats & resources', 4)
ON CONFLICT ("id") DO NOTHING;

-- Kits deleted before this migration (only ever created by `5_kit_removals`).
DO $$
BEGIN
    IF to_regclass('public.kit_removals') IS NOT NULL THEN
        INSERT INTO "kit_entries" ("id", "mechanic", "removed", "created_at", "updated_at", "updated_by")
        SELECT "id", "id", true, "created_at", "updated_at", "updated_by" FROM "kit_removals"
        ON CONFLICT ("id") DO UPDATE SET "removed" = true;
        DROP TABLE "kit_removals";
    END IF;
END $$;
