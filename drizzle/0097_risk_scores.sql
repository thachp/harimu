-- Issue #879: integrity risk scores for staff review (docs §20; flag HARIMU_RISK_SCORING_ENABLED, off in production). One additive table. Scores are for human review only.
CREATE TABLE IF NOT EXISTS risk_scores (
 clerk_user_id TEXT NOT NULL PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 score INTEGER NOT NULL CHECK(score>=0),
 reasons TEXT NOT NULL CHECK(reasons IN ('new-account','dense-civic-acts','new-account,dense-civic-acts','')),
 civic_act_count INTEGER NOT NULL CHECK(civic_act_count>=0),
 updated_at INTEGER NOT NULL,
 CHECK((score=0 AND reasons='') OR (score>0 AND reasons<>''))
);
