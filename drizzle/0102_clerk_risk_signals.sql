-- Issue #943: Clerk email risk signals (docs §20). Additive clerk_risk_signals. SQLite cannot alter a CHECK, so risk_scores is rebuilt with clerk-email in reasons (same pattern as 0054); rows are copied unchanged. Flag HARIMU_CLERK_RISK_SIGNALS_ENABLED (off in production). Human review only.
CREATE TABLE IF NOT EXISTS clerk_risk_signals (
 clerk_user_id TEXT NOT NULL PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 disposable_email INTEGER NOT NULL CHECK(disposable_email IN (0,1)),
 sub_address INTEGER NOT NULL CHECK(sub_address IN (0,1)),
 updated_at INTEGER NOT NULL
);
DROP TABLE IF EXISTS risk_scores_old;
ALTER TABLE risk_scores RENAME TO risk_scores_old;
CREATE TABLE risk_scores (
 clerk_user_id TEXT NOT NULL PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 score INTEGER NOT NULL CHECK(score>=0),
 reasons TEXT NOT NULL CHECK(reasons IN (
  '','new-account','dense-civic-acts','clerk-email',
  'new-account,dense-civic-acts','new-account,clerk-email','dense-civic-acts,clerk-email',
  'new-account,dense-civic-acts,clerk-email'
 )),
 civic_act_count INTEGER NOT NULL CHECK(civic_act_count>=0),
 updated_at INTEGER NOT NULL,
 CHECK((score=0 AND reasons='') OR (score>0 AND reasons<>''))
);
INSERT INTO risk_scores (clerk_user_id, score, reasons, civic_act_count, updated_at)
 SELECT clerk_user_id, score, reasons, civic_act_count, updated_at FROM risk_scores_old;
DROP TABLE risk_scores_old;
