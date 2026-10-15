-- Issue #309: additive war declarations (mobilizing is derived from declared_at + 48 real hours; active and ended are derived on read). Existing data is preserved.
CREATE TABLE IF NOT EXISTS wars (
 id TEXT COLLATE "C" PRIMARY KEY,
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 pair_key TEXT COLLATE "C" NOT NULL,
 attacker_nation TEXT COLLATE "C" NOT NULL CHECK(attacker_nation IN ('kindle','korund','aurelle')),
 defender_nation TEXT COLLATE "C" NOT NULL CHECK(defender_nation IN ('kindle','korund','aurelle')),
 casus_belli TEXT COLLATE "C" NOT NULL DEFAULT '' CHECK(length(casus_belli)<=40),
 declared_by TEXT COLLATE "C" NOT NULL CHECK(length(declared_by) BETWEEN 1 AND 60),
 declared_at BIGINT NOT NULL,
 mobilization_ends_at BIGINT NOT NULL,
 ended_at BIGINT,
 end_kind TEXT COLLATE "C" CHECK(end_kind IN ('treaty','other')),
 CHECK(attacker_nation<>defender_nation),
 CHECK(mobilization_ends_at=declared_at+172800),
 CHECK((ended_at IS NULL)=(end_kind IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wars_one_open_per_pair ON wars(pair_key) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wars_declared ON wars(declared_at);
