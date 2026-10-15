-- Issue #616: indexes for the decayed Royal Favor balance (HARIMU_FAVOR_DECAY_ENABLED, #567/#607). The coup average reads one citizen's settlements and spends by clerk_user_id for every settling citizen; without these it scans both tables each time. Additive: indexes only, no table, no data change.
CREATE INDEX IF NOT EXISTS idx_aurelle_settlements_user_settled ON aurelle_settlements(clerk_user_id, settled_at, favor);
CREATE INDEX IF NOT EXISTS idx_aurelle_favor_spends_user_spent ON aurelle_favor_spends(clerk_user_id, spent_at, amount);
