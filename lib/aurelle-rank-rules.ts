/** #1359: Aurelle noble ranks (docs §11.6 Progression ladders: honors and privileges, never office).
 *  Pure and import-free. Rank is derived from lifetime Royal Favor earned; spends and decay never demote.
 *  Honors only: nothing reads a rank to grant power, votes, estates or jurisdiction. */
export const AURELLE_RANKS_FLAG = 'HARIMU_AURELLE_RANKS_ENABLED';
/** [ASSUMPTION] accepted by ARC on #1359: docs name the ranks but give no figures. One pinned table. */
export const aurelleRankThresholds = [
  { key: 'commoner', earned: 0 },
  { key: 'freeholder', earned: 6 },
  { key: 'knight', earned: 20 },
  { key: 'baron', earned: 50 },
] as const;
export type AurelleRankKey = (typeof aurelleRankThresholds)[number]['key'];
export type AurelleRankStep = { key: AurelleRankKey; earned: number; next: AurelleRankKey | null; needs: number | null };
/** Highest step whose earned threshold is met. */
export function aurelleRankAt(earned: number): AurelleRankStep {
  const have = Math.max(0, Math.floor(Number(earned) || 0));
  let at = 0;
  while (at + 1 < aurelleRankThresholds.length && have >= aurelleRankThresholds[at + 1].earned) at++;
  const next = aurelleRankThresholds[at + 1];
  return { key: aurelleRankThresholds[at].key, earned: have, next: next?.key ?? null, needs: next?.earned ?? null };
}
