-- Issue #289: additive Royal Favor spend ledger (Favor stays derived: earned, capped at 100, minus spends). Existing data is preserved.
CREATE TABLE IF NOT EXISTS aurelle_favor_spends (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount INTEGER NOT NULL CHECK(amount>0),
 reason TEXT NOT NULL CHECK(reason IN ('leave-kinward')),
 spent_at INTEGER NOT NULL
);
