-- #467 slice 1 (Postgres pair of drizzle/0123; COLLATE "C" keys, BIGINT times): off-chain land lots, tile titles, leases and first-lot records (design: issue #467 comment 6323494577). Additive; nothing reads or
-- writes these tables yet (HARIMU_LAND_TILES_ENABLED, off in production). Tiles are virtual: a row exists only for a controlled tile. No land_title_anchors.
-- Hotfix: no FK to world_squares. The preview migration role lacks REFERENCES on it ("permission denied for table world_squares"); a later write slice checks the square in app code.
CREATE TABLE IF NOT EXISTS land_lots (id TEXT COLLATE "C" PRIMARY KEY, sx INTEGER NOT NULL, sy INTEGER NOT NULL, origin_tx INTEGER NOT NULL, origin_ty INTEGER NOT NULL,
 size INTEGER NOT NULL CHECK(size IN (10,20,30)), kind TEXT COLLATE "C" NOT NULL CHECK(kind IN ('residential')), created_at BIGINT NOT NULL,
 UNIQUE(sx, sy, origin_tx, origin_ty));
CREATE TABLE IF NOT EXISTS land_titles (sx INTEGER NOT NULL, sy INTEGER NOT NULL, tx INTEGER NOT NULL, ty INTEGER NOT NULL, lot_id TEXT COLLATE "C" NOT NULL REFERENCES land_lots(id),
 holder_kind TEXT COLLATE "C" NOT NULL CHECK(holder_kind IN ('citizen','nation')), holder_id TEXT COLLATE "C" NOT NULL, tenure TEXT COLLATE "C" NOT NULL CHECK(tenure IN ('freehold','state')),
 state TEXT COLLATE "C" NOT NULL CHECK(state IN ('active','frozen')), acquired_via TEXT COLLATE "C" NOT NULL CHECK(acquired_via IN ('starter','purchase','allocation','buyout','migration')),
 updated_at BIGINT NOT NULL, PRIMARY KEY (sx, sy, tx, ty));
CREATE TABLE IF NOT EXISTS land_leases (id TEXT COLLATE "C" PRIMARY KEY, lot_id TEXT COLLATE "C" NOT NULL, lessor_kind TEXT COLLATE "C" NOT NULL, lessor_id TEXT COLLATE "C" NOT NULL, lessee_id TEXT COLLATE "C" NOT NULL,
 starts_at BIGINT NOT NULL, ends_at BIGINT NOT NULL, rent_minor INTEGER NOT NULL CHECK(rent_minor >= 0), renewal TEXT COLLATE "C" NOT NULL, permitted_use TEXT COLLATE "C" NOT NULL,
 state TEXT COLLATE "C" NOT NULL CHECK(state IN ('offered','active','notice','ended','terminated')), notice_at BIGINT, appeal_until BIGINT);
-- One active lease per tile is a write-path rule for a later slice, not a UNIQUE here, so ended leases keep their history.
CREATE TABLE IF NOT EXISTS land_lease_tiles (lease_id TEXT COLLATE "C" NOT NULL, sx INTEGER NOT NULL, sy INTEGER NOT NULL, tx INTEGER NOT NULL, ty INTEGER NOT NULL, PRIMARY KEY (lease_id, sx, sy, tx, ty));
CREATE TABLE IF NOT EXISTS land_starter_grants (person_key TEXT COLLATE "C" PRIMARY KEY, clerk_user_id TEXT COLLATE "C" NOT NULL UNIQUE, lot_id TEXT COLLATE "C" NOT NULL UNIQUE, granted_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS land_title_events (id TEXT COLLATE "C" PRIMARY KEY, request_id TEXT COLLATE "C" UNIQUE, sx INTEGER NOT NULL, sy INTEGER NOT NULL, tx INTEGER NOT NULL, ty INTEGER NOT NULL,
 kind TEXT COLLATE "C" NOT NULL CHECK(kind IN ('grant','purchase','transfer','lease_start','lease_end','freeze','unfreeze','migrate')),
 from_kind TEXT COLLATE "C", from_id TEXT COLLATE "C", to_kind TEXT COLLATE "C", to_id TEXT COLLATE "C", ref TEXT COLLATE "C", occurred_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS citizen_primary_lot (clerk_user_id TEXT COLLATE "C" PRIMARY KEY, lot_id TEXT COLLATE "C");
