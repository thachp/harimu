-- harimu:destructive-reviewed
-- Issue #958: one-way trade risk reason (docs §20). The only DROP is risk_scores.reasons CHECK, re-added widened for one-way-trades; every existing reasons value still satisfies it. Flag HARIMU_RISK_SCORING_ENABLED (off in production). Human review only.
ALTER TABLE risk_scores DROP CONSTRAINT IF EXISTS risk_scores_reasons_check;
ALTER TABLE risk_scores ADD CONSTRAINT risk_scores_reasons_check CHECK(reasons IN (
 '',
 'new-account','dense-civic-acts','clerk-email','one-way-trades',
 'new-account,dense-civic-acts','new-account,clerk-email','new-account,one-way-trades',
 'dense-civic-acts,clerk-email','dense-civic-acts,one-way-trades','clerk-email,one-way-trades',
 'new-account,dense-civic-acts,clerk-email','new-account,dense-civic-acts,one-way-trades',
 'new-account,clerk-email,one-way-trades','dense-civic-acts,clerk-email,one-way-trades',
 'new-account,dense-civic-acts,clerk-email,one-way-trades'

));
