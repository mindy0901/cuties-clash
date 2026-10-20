-- Kits can be deleted from the whole game (admin page → Kits).
--
-- The kit catalogue itself stays in code (`frontend/src/game/kits.ts`): a kit is a mechanic the engine
-- runs, and the game must stay complete with no backend. What the database has to remember is
-- therefore only **"this kit does not exist any more"** — one row per deleted kit id. The server also
-- detaches the kit from every item and Cutie when the row is written (see `removeKit` in
-- `backend/src/content.ts`), and this table is what stops the code copy from coming back on a reload.
--
-- ⚠️ Idempotent (AUTO_CREATE_TABLES runs every file on every startup).

CREATE TABLE IF NOT EXISTS "kit_removals" (
    "id"         VARCHAR(40)    NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(320),
    CONSTRAINT "kit_removals_pkey" PRIMARY KEY ("id")
);
