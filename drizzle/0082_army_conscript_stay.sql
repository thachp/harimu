-- Issue #738 slice 3 follow-up (ARC on #839): a conscript who chooses to stay after the term keeps their unit; others are released at term end. Additive only.
ALTER TABLE army_conscripts ADD COLUMN stayed_at INTEGER;
