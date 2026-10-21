-- Issue #601: targeted goods sanctions PoC, flag HARIMU_TARGETED_SANCTIONS_ENABLED (off in production). One additive table on top of #363's embargoes: a nation bans named goods (stored as ",a,b,") to another; one live sanction per direction; a lift is a proposal on the same row (lift_* columns), ratified like the impose. Nothing existing is changed.
CREATE TABLE IF NOT EXISTS goods_sanctions (
 id TEXT COLLATE "C" PRIMARY KEY,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 pair_key TEXT COLLATE "C" NOT NULL,
 actor_nation TEXT COLLATE "C" NOT NULL CHECK(actor_nation IN ('kindle','korund','aurelle')),
 target_nation TEXT COLLATE "C" NOT NULL CHECK(target_nation IN ('kindle','korund','aurelle')),
 goods TEXT COLLATE "C" NOT NULL CHECK(length(goods) BETWEEN 3 AND 80),
 proposed_by TEXT COLLATE "C" NOT NULL CHECK(length(proposed_by) BETWEEN 1 AND 60),
 proposed_at BIGINT NOT NULL,
 status TEXT COLLATE "C" NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','in_force','rejected','lifted')),
 decided_at BIGINT, imposed_at BIGINT, lifted_at BIGINT,
 ratification_json TEXT COLLATE "C",
 lift_request_id TEXT COLLATE "C" UNIQUE, lift_status TEXT COLLATE "C" CHECK(lift_status IN ('proposed','rejected','ratified')), lift_proposed_at BIGINT, lift_ratification_json TEXT COLLATE "C",
 CHECK((lift_status IS NULL)=(lift_request_id IS NULL)),
 CHECK(lift_status IS NULL OR lift_status<>'ratified' OR status='lifted'),
 CHECK(actor_nation<>target_nation),
 CHECK(status IN ('proposed') OR decided_at IS NOT NULL),
 CHECK(status NOT IN ('in_force','lifted') OR imposed_at IS NOT NULL),
 CHECK((status='lifted')=(lifted_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_sanctions_one_live_per_direction ON goods_sanctions(actor_nation,target_nation) WHERE status IN ('proposed','in_force');
CREATE INDEX IF NOT EXISTS idx_goods_sanctions_pair ON goods_sanctions(pair_key);
