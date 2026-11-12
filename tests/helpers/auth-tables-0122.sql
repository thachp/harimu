-- #1322: SQLite fixture copy of db/postgres/0122_better_auth.sql. Better Auth is Postgres-only
-- (Kysely / Hyperdrive); these tables are not a D1 migration. local-runtime applies this so
-- the postgres-migration fixture snapshot includes the five auth_* names repoTables() lists.
CREATE TABLE IF NOT EXISTS auth_user(
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  phone_number TEXT UNIQUE,
  phone_number_verified INTEGER
);
CREATE TABLE IF NOT EXISTS auth_session(
  id TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS auth_account(
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_verification(
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_session_user_id_idx ON auth_session(user_id);
CREATE INDEX IF NOT EXISTS auth_account_user_id_idx ON auth_account(user_id);
CREATE INDEX IF NOT EXISTS auth_verification_identifier_idx ON auth_verification(identifier);
CREATE TABLE IF NOT EXISTS auth_phone_registry(
  phone_hmac TEXT PRIMARY KEY CHECK(length(phone_hmac)=64),
  user_id TEXT NOT NULL UNIQUE CHECK(user_id <> ''),
  bound_at INTEGER NOT NULL CHECK(bound_at > 0),
  revoked_at INTEGER CHECK(revoked_at IS NULL OR revoked_at >= bound_at)
);
