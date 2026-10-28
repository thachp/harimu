-- Issue #933: partial siege capture. SQLite/D1 fresh DBs get city_captures without UNIQUE(siege_id) from lib/siege.ts siegeSchemas. This migration only adds the siege index for parity; Postgres drops the unique constraint in db/postgres/0099.
CREATE INDEX IF NOT EXISTS idx_city_captures_siege ON city_captures(siege_id);
