-- Issue #992: single-use internal residence permits for closed-system home-city moves (flag HARIMU_INTERNAL_PERMIT_ENABLED, off in production). Additive table; granted lazily after a short real-time wait; consumed on a successful move.
CREATE TABLE IF NOT EXISTS internal_residence_permits (
 request_id TEXT COLLATE "C" PRIMARY KEY,
 clerk_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT COLLATE "C" NOT NULL,
 to_city_id TEXT COLLATE "C" NOT NULL,
 requested_at BIGINT NOT NULL,
 consumed_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_internal_permits_user_city ON internal_residence_permits(clerk_user_id, to_city_id, requested_at);
