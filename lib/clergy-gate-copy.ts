/** Clergy office Devotion gate help line (issue #261). Content only: the gate mechanics live in #224 (lib/congregations.ts)
 * and no UI imports this. Canon: harimu-docs religion-faiths §14.4 (Devotion 0-100 "gates clergy offices" and gives
 * small social rewards). The docs name no cutoff; the figure comes from ARC's lock on #261 (Oct 14, 2026): Devotion
 * at or above 50, i.e. "Devoted" and above in the shared tiers (lib/faith-copy.ts devotionTierCopy); below that, member
 * actions only. The display tiers stay labels and do not themselves grant offices. One line shared across the three MVP
 * faiths. The only figure is the 50 that ARC set. All wording is new: `proposal: true`. */

export const CLERGY_GATE_LABEL_MAX=40;
export const CLERGY_GATE_BODY_MAX=140;
/** ARC #261 lock (Oct 14, 2026). Copy only; #224 owns the enforced value. */
export const CLERGY_GATE_DEVOTION=50;
export const CLERGY_GATE_TIER='Devoted';

export const clergyGateHelp={
 label:'Holding a clergy office',
 line:'Clergy offices are open from Devotion 50, the Devoted tier and above. Below that, you take part as a member.',
 proposal:true,
} as const;
