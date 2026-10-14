/** Clergy office Devotion gate help line (issue #261). Content only: the Officiant seat mechanics live in #224/#286
 * (lib/congregations.ts) and no UI imports this. Canon: harimu-docs religion-faiths §14.4 ("Devotion (0–100) ... Gates
 * clergy offices"). The docs name no numeric cutoff and do not tie the gate to a display tier, and #286 sets no
 * Devotion minimum (the seat goes to the highest-Devotion opted-in member). So the line states no number and names no
 * tier (ARC final on #297: docs win; no number picked by content). One line shared across the three MVP faiths.
 * All wording is new: `proposal: true`. */

export const CLERGY_GATE_LABEL_MAX=40;
export const CLERGY_GATE_BODY_MAX=140;

export const clergyGateHelp={
 label:'Holding the Officiant seat',
 line:'Devotion decides who holds the Officiant seat: it goes to the member with the most Devotion who opts in.',
 proposal:true,
} as const;
