-- Issue #985: Kindle Policy Ledger (docs §8.6). Append-only public decisions. Flag HARIMU_KINDLE_POLICY_LEDGER_ENABLED (off in production).
CREATE TABLE IF NOT EXISTS kindle_policy_decisions (
 decision_key TEXT PRIMARY KEY CHECK(length(decision_key)=64),
 published_at INTEGER NOT NULL CHECK(published_at>=0),
 office TEXT NOT NULL CHECK(length(office) BETWEEN 1 AND 40),
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
 brief TEXT NOT NULL CHECK(length(brief) BETWEEN 1 AND 2000)
);
CREATE INDEX IF NOT EXISTS idx_kindle_policy_decisions_published ON kindle_policy_decisions(published_at);
