-- Issue #363: additive embargo records (embargo PoC). Existing data is preserved.
CREATE TABLE IF NOT EXISTS embargoes (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 pair_key TEXT NOT NULL,
 actor_nation TEXT NOT NULL CHECK(actor_nation IN ('kindle','korund','aurelle')),
 target_nation TEXT NOT NULL CHECK(target_nation IN ('kindle','korund','aurelle')),
 proposed_by TEXT NOT NULL CHECK(length(proposed_by) BETWEEN 1 AND 60),
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','in_force','rejected','lifted')),
 decided_at INTEGER,
 imposed_at INTEGER,
 lifted_at INTEGER,
 ratification_json TEXT,
 CHECK(actor_nation<>target_nation),
 CHECK(status IN ('proposed') OR decided_at IS NOT NULL),
 CHECK(status NOT IN ('in_force','lifted') OR imposed_at IS NOT NULL),
 CHECK((status='lifted')=(lifted_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_embargoes_one_live_per_direction ON embargoes(actor_nation,target_nation) WHERE status IN ('proposed','in_force');
CREATE INDEX IF NOT EXISTS idx_embargoes_pair ON embargoes(pair_key);
