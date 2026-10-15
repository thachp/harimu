-- Issue #308: additive treaty records (AI treaties PoC). Existing data is preserved. in-force and expired are derived from ends_at on read.
CREATE TABLE IF NOT EXISTS treaties (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 pair_key TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('non-aggression','trade')),
 proposer_nation TEXT NOT NULL CHECK(proposer_nation IN ('kindle','korund','aurelle')),
 other_nation TEXT NOT NULL CHECK(other_nation IN ('kindle','korund','aurelle')),
 proposed_by TEXT NOT NULL CHECK(length(proposed_by) BETWEEN 1 AND 60),
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','in_force','rejected','expired','broken')),
 decided_at INTEGER,
 ratified_at INTEGER,
 ends_at INTEGER,
 ended_at INTEGER,
 ratification_json TEXT,
 CHECK(proposer_nation<>other_nation),
 CHECK(status NOT IN ('in_force','expired','broken') OR (ratified_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at>ratified_at)),
 CHECK(status IN ('proposed') OR decided_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_treaties_one_live_per_pair_kind ON treaties(pair_key,kind) WHERE status IN ('proposed','in_force');
CREATE INDEX IF NOT EXISTS idx_treaties_proposed ON treaties(proposed_at);
