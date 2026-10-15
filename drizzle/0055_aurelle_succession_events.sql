-- Issue #613 (Aurelle hereditary succession PoC, slice 1): the recorded succession events (illness, vacancy, abdication, accession, Great Council). Additive: one new table, existing data untouched.
-- Written only by the admin-bearer succession command behind HARIMU_AURELLE_SUCCESSION_ENABLED (default "false"). seq and request_id are UNIQUE, so a retry or a race records nothing twice. The state is derived on read; nothing here is updated or deleted.
CREATE TABLE IF NOT EXISTS aurelle_succession_events (
 id TEXT PRIMARY KEY,
 seq INTEGER NOT NULL UNIQUE CHECK(seq >= 1),
 request_id TEXT NOT NULL UNIQUE CHECK(length(request_id) BETWEEN 8 AND 64),
 kind TEXT NOT NULL CHECK(kind IN ('illness','vacancy','abdication','accession','great_council')),
 member_id TEXT,
 name TEXT CHECK(name IS NULL OR length(name) BETWEEN 1 AND 24),
 house TEXT CHECK(house IS NULL OR length(house) BETWEEN 1 AND 24),
 occurred_at INTEGER NOT NULL,
 CHECK((kind IN ('accession','great_council')) = (name IS NOT NULL AND house IS NOT NULL))
);
