-- #1428: fixed-lot listings take a city. Existing rows stay on the legacy 'kindle' venue.
-- Fresh D1 has no player_listings until request time, so create the legacy table first, then add the column.
-- 0130 is not required: this file does not depend on civic_receipt_district.
CREATE TABLE IF NOT EXISTS player_listings (
  id TEXT PRIMARY KEY, seller_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
  item TEXT NOT NULL CHECK(item IN ('food','materials','knowledge')),
  quantity INTEGER NOT NULL CHECK(typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 10),
  unit_minor INTEGER NOT NULL CHECK(typeof(unit_minor) = 'integer' AND unit_minor BETWEEN 1 AND 1000),
  created_at INTEGER NOT NULL
);
ALTER TABLE player_listings ADD COLUMN city_id TEXT NOT NULL DEFAULT 'kindle';
