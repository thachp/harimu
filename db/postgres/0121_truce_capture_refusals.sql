-- harimu:destructive-reviewed
-- Issue #1086: log foundation-truce refusals (docs §15.4, follow-up to #1070). The only DROP is war_capture_refusals_reason_check, re-added widened
-- for 'foundation_truce'; every existing reason ('weekly_cap','heartland') still satisfies it. No row is rewritten. Rides HARIMU_WAR_LOSS_CAP_ENABLED.
ALTER TABLE war_capture_refusals DROP CONSTRAINT IF EXISTS war_capture_refusals_reason_check;
ALTER TABLE war_capture_refusals ADD CONSTRAINT war_capture_refusals_reason_check CHECK(reason IN ('weekly_cap','heartland','foundation_truce'));
