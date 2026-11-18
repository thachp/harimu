-- #1453: Kindle player newspapers (docs §18.2). Flag HARIMU_KINDLE_NEWSPAPERS_ENABLED (GRAY 93; off in production). Additive only.
-- 0130 is not required. Safe after 0131.
CREATE TABLE IF NOT EXISTS kindle_newspapers (id TEXT PRIMARY KEY, founder_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), name TEXT NOT NULL, founded_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE);
CREATE UNIQUE INDEX IF NOT EXISTS kindle_newspapers_founder ON kindle_newspapers(founder_user_id);
CREATE TABLE IF NOT EXISTS kindle_articles (id TEXT PRIMARY KEY, newspaper_id TEXT NOT NULL REFERENCES kindle_newspapers(id), author_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), headline TEXT NOT NULL, body TEXT NOT NULL, published_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE);
