-- Issue #427 slice 2: war endings by surrender and concession of Frontier nation squares, flag HARIMU_WAR_ENDINGS_ENABLED (off in production). One additive table; nothing existing is changed, no ledger CHECK changes. No reparations field (deferred), no DMZ (out of scope).
CREATE TABLE IF NOT EXISTS war_end_terms (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('surrender','concession')),
 proposer_nation TEXT NOT NULL CHECK(proposer_nation IN ('kindle','korund','aurelle')),
 other_nation TEXT NOT NULL CHECK(other_nation IN ('kindle','korund','aurelle')),
 squares_json TEXT,
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','enacted','rejected')),
 decided_at INTEGER,
 ratification_json TEXT,
 reject_reason TEXT CHECK(reject_reason IS NULL OR length(reject_reason)<=40),
 CHECK(proposer_nation<>other_nation),
 CHECK((kind='concession')=(squares_json IS NOT NULL)),
 CHECK(status='proposed' OR decided_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_war_end_terms_one_pending ON war_end_terms(war_id) WHERE status='proposed';
