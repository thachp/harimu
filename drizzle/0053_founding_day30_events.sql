-- Issue #612 (Founding Period PoC, slice A): one recorded day-30 event per MVP nation (docs coups-transitions §10.6). Additive: one new table, existing data untouched.
-- Written only by the world-simulation tick behind HARIMU_FOUNDING_PERIOD_ENABLED (default "false"); the primary key makes the tick idempotent. occurred_at is the scheduled day-30 time (shard start + 30 days), recorded_at is the tick that wrote it.
CREATE TABLE IF NOT EXISTS founding_day30_events (
 nation_id TEXT PRIMARY KEY CHECK(nation_id IN ('kindle','korund','aurelle')),
 kind TEXT NOT NULL CHECK(kind IN ('first_election','chairman_confirmed','houses_publish_claims')),
 occurred_at INTEGER NOT NULL,
 recorded_at INTEGER NOT NULL,
 CHECK((nation_id='kindle' AND kind='first_election') OR (nation_id='korund' AND kind='chairman_confirmed') OR (nation_id='aurelle' AND kind='houses_publish_claims'))
);
