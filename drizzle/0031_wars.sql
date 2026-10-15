-- Issue #309: additive war declarations (mobilizing is derived from declared_at + 48 real hours; active and ended are derived on read). Existing data is preserved.
CREATE TABLE IF NOT EXISTS wars (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 pair_key TEXT NOT NULL,
 attacker_nation TEXT NOT NULL CHECK(attacker_nation IN ('kindle','korund','aurelle')),
 defender_nation TEXT NOT NULL CHECK(defender_nation IN ('kindle','korund','aurelle')),
 casus_belli TEXT NOT NULL DEFAULT '' CHECK(length(casus_belli)<=40),
 declared_by TEXT NOT NULL CHECK(length(declared_by) BETWEEN 1 AND 60),
 declared_at INTEGER NOT NULL,
 mobilization_ends_at INTEGER NOT NULL,
 ended_at INTEGER,
 end_kind TEXT CHECK(end_kind IN ('treaty','other')),
 CHECK(attacker_nation<>defender_nation),
 CHECK(mobilization_ends_at=declared_at+172800),
 CHECK((ended_at IS NULL)=(end_kind IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wars_one_open_per_pair ON wars(pair_key) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wars_declared ON wars(declared_at);
