-- Issue #911 (docs §15.4): soldiers of a unit that loses a stored battle are wounded, never killed, for 1–3 real days (deterministic from the battle key). Written once by the world tick (conditional insert). Behind HARIMU_ARMY_BATTLES_ENABLED. Additive only.
CREATE TABLE IF NOT EXISTS army_wounds (battle_key TEXT NOT NULL, clerk_user_id TEXT NOT NULL, wounded_until INTEGER NOT NULL, PRIMARY KEY (battle_key, clerk_user_id));
CREATE INDEX IF NOT EXISTS idx_army_wounds_user ON army_wounds(clerk_user_id, wounded_until);
