-- harimu:destructive-reviewed
-- Issue #957: brigade LN wages and Aurelle food-estate wages write issuance ledger rows (#954 gap).
-- Widen source CHECK and retarget shift_id FK to work_shifts so korund_settlements / aurelle_settlements wages can mint rows. Existing post/charter sources and rows stay valid. Backfill any settlement still missing an issuance. Index helps the #885 period SUM.
ALTER TABLE labor_note_issuances DROP CONSTRAINT IF EXISTS labor_note_issuances_shift_id_fkey;
ALTER TABLE labor_note_issuances DROP CONSTRAINT IF EXISTS labor_note_issuances_source_check;
ALTER TABLE labor_note_issuances ADD CONSTRAINT labor_note_issuances_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES work_shifts(id);
ALTER TABLE labor_note_issuances ADD CONSTRAINT labor_note_issuances_source_check CHECK(source IN ('korund-post-wage','korund-brigade-wage'));
INSERT INTO labor_note_issuances (id,shift_id,clerk_user_id,amount_minor,source,issued_at)
 SELECT 'ln-wage:'||shift_id,shift_id,clerk_user_id,wage_minor,'korund-brigade-wage',settled_at FROM korund_settlements s
 WHERE NOT EXISTS (SELECT 1 FROM labor_note_issuances i WHERE i.shift_id = s.shift_id);

ALTER TABLE crown_issuances DROP CONSTRAINT IF EXISTS crown_issuances_shift_id_fkey;
ALTER TABLE crown_issuances DROP CONSTRAINT IF EXISTS crown_issuances_source_check;
ALTER TABLE crown_issuances ADD CONSTRAINT crown_issuances_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES work_shifts(id);
ALTER TABLE crown_issuances ADD CONSTRAINT crown_issuances_source_check CHECK(source IN ('aurelle-charter-wage','aurelle-food-estate-wage'));
INSERT INTO crown_issuances (id,shift_id,clerk_user_id,amount_minor,source,issued_at)
 SELECT 'crn-wage:'||shift_id,shift_id,clerk_user_id,wage_minor,'aurelle-food-estate-wage',settled_at FROM aurelle_settlements s
 WHERE NOT EXISTS (SELECT 1 FROM crown_issuances i WHERE i.shift_id = s.shift_id);
CREATE INDEX IF NOT EXISTS idx_crown_issuances_issued ON crown_issuances(issued_at);
