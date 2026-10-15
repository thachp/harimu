-- Issue #350: additive record of who acted and under which authority when a war is declared, an end is proposed, or an end is accepted. Existing data is preserved.
-- Written only by the server-only war commands behind HARIMU_WAR_ENABLED.
CREATE TABLE IF NOT EXISTS war_actions (
 id TEXT COLLATE "C" PRIMARY KEY,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 war_id TEXT COLLATE "C" NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 action TEXT COLLATE "C" NOT NULL CHECK(action IN ('declare','propose-end','accept-end')),
 nation TEXT COLLATE "C" NOT NULL CHECK(nation IN ('kindle','korund','aurelle')),
 role TEXT COLLATE "C" NOT NULL CHECK(length(role) BETWEEN 1 AND 40),
 authority TEXT COLLATE "C" NOT NULL CHECK(authority IN ('proposal','decree')),
 ratifier TEXT COLLATE "C" NOT NULL CHECK(length(ratifier) BETWEEN 1 AND 60),
 end_kind TEXT COLLATE "C" CHECK(end_kind IN ('ceasefire','peace')),
 acted_at BIGINT NOT NULL,
 CHECK((action='propose-end')=(end_kind IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_war_actions_one_per_kind ON war_actions(war_id,action);
