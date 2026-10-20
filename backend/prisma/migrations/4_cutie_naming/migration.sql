-- The product word is **Cutie** everywhere; `pet` was the internal name. This repairs a database
-- that was created while `3_content_tables` still used it, so the storage matches the UI:
-- `select * from cuties` reads like the game.
--
-- ⚠️ `3_content_tables` already creates the final names (`cuties` / `cutie_kits`), so on a **fresh**
--    database this file does nothing at all. It exists for the databases that were migrated while the
--    old names were in place: those rows are copied over and the legacy tables dropped.
--
-- ⚠️ Idempotent (AUTO_CREATE_TABLES runs every file on every startup): each step is guarded, and the
--    copy uses `ON CONFLICT DO NOTHING`, so running it twice cannot duplicate or lose a row.

DO $$
BEGIN
    -- ── Case 1: only the old names exist → rename in place (no data movement at all). ─────────────
    IF to_regclass('public.pets') IS NOT NULL AND to_regclass('public.cuties') IS NULL THEN
        ALTER TABLE pets RENAME TO cuties;
    END IF;
    IF to_regclass('public.pet_kits') IS NOT NULL AND to_regclass('public.cutie_kits') IS NULL THEN
        ALTER TABLE pet_kits RENAME TO cutie_kits;
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'cutie_kits' AND column_name = 'pet_id'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'cutie_kits' AND column_name = 'cutie_id'
    ) THEN
        ALTER TABLE cutie_kits RENAME COLUMN pet_id TO cutie_id;
    END IF;
END $$;

-- ── Case 2: both names exist (rows were written under the old name before the rename) ─────────────
DO $$
BEGIN
    IF to_regclass('public.pets') IS NOT NULL AND to_regclass('public.cuties') IS NOT NULL THEN
        INSERT INTO cuties (id, name, icon, blurb, unlock_stage, attack, max_hp, max_se, se_regen,
                            art, skill_art, avatar, kits_synced, created_at, updated_at, updated_by)
        SELECT id, name, icon, blurb, unlock_stage, attack, max_hp, max_se, se_regen,
               art, skill_art, avatar, kits_synced, created_at, updated_at, updated_by
          FROM pets
        ON CONFLICT (id) DO NOTHING;

        IF to_regclass('public.pet_kits') IS NOT NULL THEN
            INSERT INTO cutie_kits (cutie_id, kit_id, position, params, stats, aura, on_hit, charge)
            SELECT pet_id, kit_id, position, params, stats, aura, on_hit, charge
              FROM pet_kits
             WHERE pet_id IN (SELECT id FROM cuties)
            ON CONFLICT (cutie_id, position) DO NOTHING;
            DROP TABLE pet_kits;
        END IF;

        DROP TABLE pets;
    END IF;
END $$;

-- ── Names of constraints / indexes (they are what an error message prints) ────────────────────────
-- ⚠️ `conname` / `relname` are only unique **per table**: a guard on the name alone passes while the
--    constraint it means sits on another table, and the rename then fails on the next startup. Every
--    check below is scoped to its own table, and the rename only runs when the target name is free.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE c.conname = 'pet_kits_pet_id_fkey' AND t.relname = 'cutie_kits'
    ) AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cutie_kits_cutie_id_fkey') THEN
        ALTER TABLE cutie_kits RENAME CONSTRAINT pet_kits_pet_id_fkey TO cutie_kits_cutie_id_fkey;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uq_pet_kits_position' AND relkind = 'i')
       AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uq_cutie_kits_position' AND relkind = 'i') THEN
        ALTER INDEX uq_pet_kits_position RENAME TO uq_cutie_kits_position;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ix_pet_kits_pet_id' AND relkind = 'i')
       AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ix_cutie_kits_cutie_id' AND relkind = 'i') THEN
        ALTER INDEX ix_pet_kits_pet_id RENAME TO ix_cutie_kits_cutie_id;
    END IF;
END $$;

-- ── Uploaded pictures are keyed `<kind>:<id>`, and the kind was `pet` ─────────────────────────────
UPDATE content_art SET kind = 'cutie' WHERE kind = 'pet';
UPDATE content_art SET id = 'cutie:' || substr(id, 5) WHERE id LIKE 'pet:%';
