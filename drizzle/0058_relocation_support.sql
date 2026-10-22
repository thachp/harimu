-- Issue #470 slice 2 (Decision 109): relocation support claims, flag HARIMU_RELOCATION_SUPPORT_ENABLED (off in production). Two additive tables: one pot per city capture (capture_id is the primary key, written once at the first claim) and one claim per citizen per capture (request_id UNIQUE). The ledger reason CHECK and the capture tables are unchanged.
CREATE TABLE IF NOT EXISTS relocation_support_pots (
 capture_id TEXT PRIMARY KEY REFERENCES city_captures(id) ON DELETE CASCADE,
 protocol_minor INTEGER NOT NULL CHECK(protocol_minor >= 0),
 treasury_topup_minor INTEGER NOT NULL CHECK(treasury_topup_minor >= 0),
 eligible_count INTEGER NOT NULL CHECK(eligible_count >= 0),
 per_citizen_minor INTEGER NOT NULL CHECK(per_citizen_minor >= 0),
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS relocation_support_claims (
 capture_id TEXT NOT NULL REFERENCES relocation_support_pots(capture_id) ON DELETE CASCADE,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 request_id TEXT NOT NULL UNIQUE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
 claimed_at INTEGER NOT NULL,
 PRIMARY KEY (capture_id, clerk_user_id)
);
CREATE INDEX IF NOT EXISTS idx_relocation_support_claims_user ON relocation_support_claims(clerk_user_id);
