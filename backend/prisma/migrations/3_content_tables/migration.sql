-- Items and Cuties get a real schema (one row per entity, one row per kit) and the JSON overlay
-- `content_overrides` goes away.
--
-- ⚠️ Idempotent, because `AUTO_CREATE_TABLES=true` runs every file on every startup (see
-- `src/baseline.ts`): `IF NOT EXISTS` for the DDL, `ON CONFLICT DO NOTHING` for the copy, and the
-- copy only runs while the old table still exists.
--
-- ⚠️ The copy **drops dead keys** the game stopped reading a while ago: an item's per-star `attack`,
-- a kit's `speed` parameter, and a Cutie's `attackSpeed`. Leaving them in would mean migrating
-- garbage forward.

CREATE TABLE IF NOT EXISTS items (
    id          varchar(120) PRIMARY KEY,
    name        varchar(80)  NOT NULL,
    icon        varchar(8),
    cls         varchar(16)  NOT NULL DEFAULT 'melee',
    tier        smallint     NOT NULL DEFAULT 1,
    quality     smallint     NOT NULL DEFAULT 1,
    cost        integer      NOT NULL DEFAULT 1,
    space_w     smallint     NOT NULL DEFAULT 1,
    space_h     smallint     NOT NULL DEFAULT 1,
    art         boolean      NOT NULL DEFAULT false,
    removed     boolean      NOT NULL DEFAULT false,
    created_at  timestamptz(6) NOT NULL DEFAULT now(),
    updated_at  timestamptz(6) NOT NULL DEFAULT now(),
    updated_by  varchar(320)
);

CREATE INDEX IF NOT EXISTS ix_items_tier ON items (tier);

CREATE TABLE IF NOT EXISTS item_kits (
    id       serial PRIMARY KEY,
    item_id  varchar(120) NOT NULL,
    kit_id   varchar(40)  NOT NULL,
    position smallint     NOT NULL,
    params   jsonb        NOT NULL DEFAULT '{}'::jsonb,
    stats    jsonb,
    aura     jsonb,
    on_hit   jsonb,
    charge   jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_item_kits_position ON item_kits (item_id, position);
CREATE INDEX IF NOT EXISTS ix_item_kits_item_id ON item_kits (item_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_kits_item_id_fkey') THEN
        ALTER TABLE item_kits
            ADD CONSTRAINT item_kits_item_id_fkey
            FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS cuties (
    id           varchar(120) PRIMARY KEY,
    name         varchar(80),
    icon         varchar(8),
    blurb        varchar(400),
    unlock_stage smallint,
    attack       integer,
    max_hp       integer,
    max_se       integer,
    se_regen     double precision,
    art          boolean,
    skill_art    boolean,
    avatar       boolean,
    kits_synced  boolean NOT NULL DEFAULT false,
    created_at   timestamptz(6) NOT NULL DEFAULT now(),
    updated_at   timestamptz(6) NOT NULL DEFAULT now(),
    updated_by   varchar(320)
);

CREATE TABLE IF NOT EXISTS cutie_kits (
    id       serial PRIMARY KEY,
    cutie_id varchar(120) NOT NULL,
    kit_id   varchar(40)  NOT NULL,
    position smallint     NOT NULL,
    params   jsonb        NOT NULL DEFAULT '{}'::jsonb,
    stats    jsonb,
    aura     jsonb,
    on_hit   jsonb,
    charge   jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cutie_kits_position ON cutie_kits (cutie_id, position);
CREATE INDEX IF NOT EXISTS ix_cutie_kits_cutie_id ON cutie_kits (cutie_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cutie_kits_cutie_id_fkey') THEN
        ALTER TABLE cutie_kits
            ADD CONSTRAINT cutie_kits_cutie_id_fkey
            FOREIGN KEY (cutie_id) REFERENCES cuties (id) ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

-- ── Move the JSON rows over ──────────────────────────────────────────────────
-- `content_overrides.id` was `item:<templateId>` / `pet:<petId>`, so the prefix is stripped with
-- `substr` (6 / 5 characters).

DO $$
BEGIN
    IF to_regclass('public.content_overrides') IS NOT NULL THEN
        INSERT INTO items (id, name, icon, cls, tier, quality, cost, space_w, space_h, art, removed,
                           created_at, updated_at, updated_by)
        SELECT substr(id, 6),
               COALESCE(payload::jsonb ->> 'name', substr(id, 6)),
               payload::jsonb ->> 'icon',
               COALESCE(payload::jsonb ->> 'cls', 'melee'),
               COALESCE((payload::jsonb ->> 'tier')::int, 1),
               COALESCE((payload::jsonb ->> 'quality')::int, 1),
               COALESCE((payload::jsonb ->> 'cost')::int, 1),
               COALESCE((payload::jsonb -> 'space' ->> 'w')::int, 1),
               COALESCE((payload::jsonb -> 'space' ->> 'h')::int, 1),
               COALESCE((payload::jsonb ->> 'art')::boolean, false),
               COALESCE((payload::jsonb ->> 'removed')::boolean, false),
               updated_at,
               updated_at,
               updated_by
          FROM content_overrides
         WHERE kind = 'item'
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO item_kits (item_id, kit_id, position, params, stats, aura, on_hit, charge)
        SELECT substr(co.id, 6),
               k.kit ->> 'id',
               (k.ord - 1)::int,
               COALESCE(k.kit -> 'params', '{}'::jsonb) - 'speed',
               k.kit -> 'stats',
               k.kit -> 'aura',
               NULLIF(k.kit -> 'onHit', 'null'::jsonb),
               NULLIF(k.kit -> 'charge', 'null'::jsonb)
          FROM content_overrides co
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(co.payload::jsonb -> 'kits', '[]'::jsonb))
               WITH ORDINALITY AS k(kit, ord)
         WHERE co.kind = 'item'
        ON CONFLICT (item_id, position) DO NOTHING;

        INSERT INTO cuties (id, name, icon, blurb, unlock_stage, attack, max_hp, max_se, se_regen,
                          art, skill_art, avatar, kits_synced, created_at, updated_at, updated_by)
        SELECT substr(id, 5),
               payload::jsonb ->> 'name',
               payload::jsonb ->> 'icon',
               payload::jsonb ->> 'blurb',
               (payload::jsonb ->> 'unlockStage')::int,
               (payload::jsonb ->> 'attack')::int,
               (payload::jsonb ->> 'maxHp')::int,
               (payload::jsonb ->> 'maxSe')::int,
               (payload::jsonb ->> 'seRegen')::double precision,
               (payload::jsonb ->> 'art')::boolean,
               (payload::jsonb ->> 'skillArt')::boolean,
               (payload::jsonb ->> 'avatar')::boolean,
               COALESCE(payload::jsonb ? 'kits', false),
               updated_at,
               updated_at,
               updated_by
          FROM content_overrides
         WHERE kind = 'pet'
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO cutie_kits (cutie_id, kit_id, position, params, stats, aura, on_hit, charge)
        SELECT substr(co.id, 5),
               k.kit ->> 'id',
               (k.ord - 1)::int,
               COALESCE(k.kit -> 'params', '{}'::jsonb) - 'speed',
               k.kit -> 'stats',
               k.kit -> 'aura',
               NULLIF(k.kit -> 'onHit', 'null'::jsonb),
               NULLIF(k.kit -> 'charge', 'null'::jsonb)
          FROM content_overrides co
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(co.payload::jsonb -> 'kits', '[]'::jsonb))
               WITH ORDINALITY AS k(kit, ord)
         WHERE co.kind = 'pet'
        ON CONFLICT (cutie_id, position) DO NOTHING;

        DROP TABLE content_overrides;
    END IF;
END $$;
