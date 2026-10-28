-- harimu:destructive-reviewed
-- Issue #943: Clerk email risk signals (docs §20). Additive clerk_risk_signals table. The only DROP is risk_scores.reasons CHECK, re-added widened for clerk-email; every existing reasons value still satisfies it. Flag HARIMU_CLERK_RISK_SIGNALS_ENABLED (off in production). Human review only.
CREATE TABLE IF NOT EXISTS clerk_risk_signals (
 clerk_user_id TEXT COLLATE "C" NOT NULL PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 disposable_email BIGINT NOT NULL CHECK(disposable_email IN (0,1)),
 sub_address BIGINT NOT NULL CHECK(sub_address IN (0,1)),
 updated_at BIGINT NOT NULL
);
ALTER TABLE risk_scores DROP CONSTRAINT IF EXISTS risk_scores_reasons_check;
ALTER TABLE risk_scores ADD CONSTRAINT risk_scores_reasons_check CHECK(reasons IN (
 '','new-account','dense-civic-acts','clerk-email',
 'new-account,dense-civic-acts','new-account,clerk-email','dense-civic-acts,clerk-email',
 'new-account,dense-civic-acts,clerk-email'
));
