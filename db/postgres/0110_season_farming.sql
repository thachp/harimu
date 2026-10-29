-- harimu:destructive-reviewed
-- #1033: farming season yield may pay a food count other than 4 (still at least 1). Existing rows stay 4.
ALTER TABLE korund_settlements DROP CONSTRAINT IF EXISTS korund_output;
ALTER TABLE korund_settlements ADD CONSTRAINT korund_output CHECK (food_output >= 1);
ALTER TABLE aurelle_settlements DROP CONSTRAINT IF EXISTS aurelle_settlement_food;
ALTER TABLE aurelle_settlements ADD CONSTRAINT aurelle_settlement_food CHECK (food_output >= 1);
