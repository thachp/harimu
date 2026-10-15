-- Issue #382 PR B: Korund Correction Duty appeals. Additive: one new table, existing data untouched. A duty itself is derived on read from korund_raid_hits;
-- only the appeal (one per duty, decided automatically at once) is stored. Written only by POST /api/faith behind HARIMU_FAITH_ENABLED.
CREATE TABLE IF NOT EXISTS korund_duty_appeals (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 duty_started_at INTEGER NOT NULL,
 appealed_at INTEGER NOT NULL,
 granted INTEGER NOT NULL CHECK(granted IN (0,1)),
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, duty_started_at)
);
