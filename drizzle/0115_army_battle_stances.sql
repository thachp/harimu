-- #1061: freeze each side's squad-stance counts when a battle is stored, so a finished battle can show them without reading live members. Additive only. Null on older rows.
ALTER TABLE army_battles ADD COLUMN attacker_hold INTEGER;
ALTER TABLE army_battles ADD COLUMN attacker_advance INTEGER;
ALTER TABLE army_battles ADD COLUMN attacker_fall_back INTEGER;
ALTER TABLE army_battles ADD COLUMN defender_hold INTEGER;
ALTER TABLE army_battles ADD COLUMN defender_advance INTEGER;
ALTER TABLE army_battles ADD COLUMN defender_fall_back INTEGER;
