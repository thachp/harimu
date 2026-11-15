-- #1428: fixed-lot listings take a city. Existing rows stay on the legacy 'kindle' venue.
-- schema.sql already creates player_listings. 0130 is not required: this does not depend on civic_receipt_district.
ALTER TABLE player_listings ADD COLUMN IF NOT EXISTS city_id TEXT NOT NULL DEFAULT 'kindle';
