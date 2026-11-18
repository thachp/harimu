-- #1416: the voter's Kindle district on a presidential receipt, recorded at vote time. Nullable so a receipt written before this column stays valid and stays out of the per-district list. Not on civic_anonymous_ballots.
ALTER TABLE civic_voter_receipts ADD COLUMN IF NOT EXISTS district_id TEXT COLLATE "C";
