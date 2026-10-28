-- Issue #958: one-way trade risk reason (docs §20). SQLite cannot alter a CHECK, so risk_scores is rebuilt with one-way-trades in reasons (same pattern as 0102); rows are copied unchanged. Flag HARIMU_RISK_SCORING_ENABLED (off in production). Human review only.
DROP TABLE IF EXISTS risk_scores_old;
ALTER TABLE risk_scores RENAME TO risk_scores_old;
CREATE TABLE risk_scores (
 clerk_user_id TEXT NOT NULL PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 score INTEGER NOT NULL CHECK(score>=0),
 reasons TEXT NOT NULL CHECK(reasons IN (
 '',
 'new-account','dense-civic-acts','clerk-email','one-way-trades',
 'new-account,dense-civic-acts','new-account,clerk-email','new-account,one-way-trades',
 'dense-civic-acts,clerk-email','dense-civic-acts,one-way-trades','clerk-email,one-way-trades',
 'new-account,dense-civic-acts,clerk-email','new-account,dense-civic-acts,one-way-trades',
 'new-account,clerk-email,one-way-trades','dense-civic-acts,clerk-email,one-way-trades',
 'new-account,dense-civic-acts,clerk-email,one-way-trades'

 )),
 civic_act_count INTEGER NOT NULL CHECK(civic_act_count>=0),
 updated_at INTEGER NOT NULL,
 CHECK((score=0 AND reasons='') OR (score>0 AND reasons<>''))
);
INSERT INTO risk_scores (clerk_user_id, score, reasons, civic_act_count, updated_at)
 SELECT clerk_user_id, score, reasons, civic_act_count, updated_at FROM risk_scores_old;
DROP TABLE risk_scores_old;
