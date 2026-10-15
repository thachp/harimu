-- Issue #441: additive Kindle town hall tables (questions, up-votes, AI answers). Existing data is preserved.
CREATE TABLE IF NOT EXISTS town_halls (
 id TEXT COLLATE "C" PRIMARY KEY,
 election_id TEXT COLLATE "C" NOT NULL,
 candidate_id TEXT COLLATE "C" NOT NULL,
 opens_at BIGINT NOT NULL,
 closes_at BIGINT NOT NULL,
 CHECK(closes_at = opens_at + 86400)
);
CREATE TABLE IF NOT EXISTS town_hall_questions (
 id TEXT COLLATE "C" PRIMARY KEY,
 hall_id TEXT COLLATE "C" NOT NULL REFERENCES town_halls(id),
 author_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 body TEXT COLLATE "C" NOT NULL CHECK(length(body) BETWEEN 10 AND 200),
 created_at BIGINT NOT NULL,
 UNIQUE(hall_id, author_id)
);
CREATE TABLE IF NOT EXISTS town_hall_votes (
 question_id TEXT COLLATE "C" NOT NULL REFERENCES town_hall_questions(id),
 voter_id TEXT COLLATE "C" NOT NULL REFERENCES citizens(clerk_user_id),
 request_id TEXT COLLATE "C" NOT NULL UNIQUE,
 voted_at BIGINT NOT NULL,
 PRIMARY KEY(question_id, voter_id)
);
CREATE TABLE IF NOT EXISTS town_hall_answers (
 question_id TEXT COLLATE "C" PRIMARY KEY REFERENCES town_hall_questions(id),
 hall_id TEXT COLLATE "C" NOT NULL REFERENCES town_halls(id),
 answer_text TEXT COLLATE "C" NOT NULL CHECK(length(answer_text) BETWEEN 1 AND 600),
 answered_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_town_hall_questions_hall ON town_hall_questions(hall_id);
CREATE INDEX IF NOT EXISTS idx_town_hall_votes_question ON town_hall_votes(question_id);
