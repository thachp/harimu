-- Issue #427 slice 1: the Kindle Assembly war vote, flag HARIMU_WAR_ASSEMBLY_ENABLED (off in production). One additive table: Kindle's President proposes a war, the world tick decides it once by the Assembly (more than half of all seats). Nothing existing is changed; no ledger CHECK changes.
CREATE TABLE IF NOT EXISTS war_proposals (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 defender_nation TEXT NOT NULL CHECK(defender_nation IN ('korund','aurelle')),
 casus_belli TEXT NOT NULL DEFAULT '' CHECK(length(casus_belli)<=40),
 declared_by TEXT NOT NULL CHECK(length(declared_by) BETWEEN 1 AND 60),
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected')),
 decided_at INTEGER,
 war_id TEXT,
 vote_json TEXT,
 reject_reason TEXT CHECK(reject_reason IS NULL OR length(reject_reason)<=40),
 CHECK(status='proposed' OR decided_at IS NOT NULL),
 CHECK((status='approved')=(war_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_war_proposals_one_pending ON war_proposals(defender_nation) WHERE status='proposed';
