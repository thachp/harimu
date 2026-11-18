-- #1453: Kindle player newspapers (docs §18.2). Flag HARIMU_KINDLE_NEWSPAPERS_ENABLED (GRAY 93; off in production). Additive only.
-- 0130 is not required. Safe after 0131.
CREATE TABLE IF NOT EXISTS kindle_newspapers (id TEXT COLLATE "C" PRIMARY KEY, founder_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id), name TEXT COLLATE "C" NOT NULL, founded_at BIGINT NOT NULL, request_id TEXT COLLATE "C" NOT NULL UNIQUE);
CREATE UNIQUE INDEX IF NOT EXISTS kindle_newspapers_founder ON kindle_newspapers(founder_user_id);
CREATE TABLE IF NOT EXISTS kindle_articles (id TEXT COLLATE "C" PRIMARY KEY, newspaper_id TEXT COLLATE "C" NOT NULL REFERENCES kindle_newspapers(id), author_user_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id), headline TEXT COLLATE "C" NOT NULL, body TEXT COLLATE "C" NOT NULL, published_at BIGINT NOT NULL, request_id TEXT COLLATE "C" NOT NULL UNIQUE);
