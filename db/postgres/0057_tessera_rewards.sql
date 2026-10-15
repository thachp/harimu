-- Issue #465 (slice 1, ARC: Option A, shift source only): earned-Tessera rewards, flag HARIMU_TESSERA_REWARDS_ENABLED (off). Three additive tables: one row per closed epoch (the primary key is the idempotent-close guard), immutable entries (source_shift_id UNIQUE, so a shift pays once) and claim receipts (entry_id and request_id UNIQUE). Nothing existing is changed.
CREATE TABLE IF NOT EXISTS tessera_reward_epochs (
 epoch_day BIGINT PRIMARY KEY,
 pool_minor BIGINT NOT NULL CHECK(pool_minor >= 0),
 allocated_minor BIGINT NOT NULL CHECK(allocated_minor >= 0 AND allocated_minor <= pool_minor),
 entries BIGINT NOT NULL CHECK(entries >= 0),
 closed_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS tessera_reward_entries (
 id TEXT COLLATE "C" PRIMARY KEY,
 epoch_day BIGINT NOT NULL REFERENCES tessera_reward_epochs(epoch_day),
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 source_shift_id TEXT COLLATE "C" NOT NULL UNIQUE REFERENCES shift_settlements(shift_id),
 amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
 provenance TEXT COLLATE "C" NOT NULL CHECK(provenance IN ('shift'))
);
CREATE TABLE IF NOT EXISTS tessera_reward_claims (
 entry_id TEXT COLLATE "C" PRIMARY KEY REFERENCES tessera_reward_entries(id),
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
 claimed_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tessera_reward_entries_user ON tessera_reward_entries(clerk_user_id, epoch_day);
