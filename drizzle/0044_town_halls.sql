-- Issue #441: additive Kindle town hall tables (questions, up-votes, AI answers). Existing data is preserved.
CREATE TABLE IF NOT EXISTS town_halls (
 id TEXT PRIMARY KEY,
 election_id TEXT NOT NULL,
 candidate_id TEXT NOT NULL,
 opens_at INTEGER NOT NULL,
 closes_at INTEGER NOT NULL,
 CHECK(closes_at = opens_at + 86400)
);
CREATE TABLE IF NOT EXISTS town_hall_questions (
 id TEXT PRIMARY KEY,
 hall_id TEXT NOT NULL REFERENCES town_halls(id),
 author_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 request_id TEXT NOT NULL UNIQUE,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 10 AND 200),
 created_at INTEGER NOT NULL,
 UNIQUE(hall_id, author_id)
);
CREATE TABLE IF NOT EXISTS town_hall_votes (
 question_id TEXT NOT NULL REFERENCES town_hall_questions(id),
 voter_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 request_id TEXT NOT NULL UNIQUE,
 voted_at INTEGER NOT NULL,
 PRIMARY KEY(question_id, voter_id)
);
CREATE TABLE IF NOT EXISTS town_hall_answers (
 question_id TEXT PRIMARY KEY REFERENCES town_hall_questions(id),
 hall_id TEXT NOT NULL REFERENCES town_halls(id),
 answer_text TEXT NOT NULL CHECK(length(answer_text) BETWEEN 1 AND 600),
 answered_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_town_hall_questions_hall ON town_hall_questions(hall_id);
CREATE INDEX IF NOT EXISTS idx_town_hall_votes_question ON town_hall_votes(question_id);
