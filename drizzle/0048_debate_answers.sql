-- Issue #282: additive Kindle presidential debate table (the AI candidates' answers). Questions and up-votes reuse the town hall tables (a hall row whose candidate_id is 'debate'). Existing data is preserved.
CREATE TABLE IF NOT EXISTS debate_answers (
 question_id TEXT NOT NULL REFERENCES town_hall_questions(id),
 candidate_id TEXT NOT NULL,
 answer_text TEXT NOT NULL CHECK(length(answer_text) BETWEEN 1 AND 600),
 answered_at INTEGER NOT NULL,
 PRIMARY KEY(question_id, candidate_id)
);
