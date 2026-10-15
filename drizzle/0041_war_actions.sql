-- Issue #350: additive record of who acted and under which authority when a war is declared, an end is proposed, or an end is accepted. Existing data is preserved.
-- Written only by the server-only war commands behind HARIMU_WAR_ENABLED.
CREATE TABLE IF NOT EXISTS war_actions (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK(action IN ('declare','propose-end','accept-end')),
 nation TEXT NOT NULL CHECK(nation IN ('kindle','korund','aurelle')),
 role TEXT NOT NULL CHECK(length(role) BETWEEN 1 AND 40),
 authority TEXT NOT NULL CHECK(authority IN ('proposal','decree')),
 ratifier TEXT NOT NULL CHECK(length(ratifier) BETWEEN 1 AND 60),
 end_kind TEXT CHECK(end_kind IN ('ceasefire','peace')),
 acted_at INTEGER NOT NULL,
 CHECK((action='propose-end')=(end_kind IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_war_actions_one_per_kind ON war_actions(war_id,action);
