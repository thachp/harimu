/** #994 Korund Standing from Plan medals (docs 12.11 step 3: over-fulfilment earns medals and Standing).
 *  Derived on read from the #737 medal total. No table, no migration, no write of citizens.standing.
 *  [ASSUMPTION] the docs name Exemplary Worker and do not give medal counts. One pinned table:
 *  0 → Worker, 1–2 → Good standing, 3+ → Exemplary Worker. Score is the medal total. */
export const korundStandingWorker = 'Worker';
export const korundStandingGood = 'Good standing';
export const korundStandingExemplary = 'Exemplary Worker';
/** [ASSUMPTION] medal totals that flip the label. */
export const korundStandingGoodAt = 1;
export const korundStandingExemplaryAt = 3;

export type KorundPlanStanding = { label: string; score: number; raised: boolean };

export function korundStandingLabel(medals: number): string {
  const total = Math.max(0, Math.floor(Number(medals)) || 0);
  if (total >= korundStandingExemplaryAt) return korundStandingExemplary;
  if (total >= korundStandingGoodAt) return korundStandingGood;
  return korundStandingWorker;
}

/** Label for a #737 medal read. `raised` is true only when last week's medal crossed a threshold. Same input, same output. */
export function korundPlanStanding(medals: { total: number; lastWeek: boolean }): KorundPlanStanding {
  const total = Math.max(0, Math.floor(Number(medals?.total)) || 0);
  const label = korundStandingLabel(total);
  const previous = medals?.lastWeek && total > 0 ? korundStandingLabel(total - 1) : label;
  return { label, score: total, raised: previous !== label };
}

/** [ASSUMPTION] invented wording. The docs say over-fulfilment earns Standing and give no sentence. */
export const korundStandingCopy = {
  line: (label: string) => `Standing: ${label}`,
  raised: (label: string) => `Last week's Plan medal raised your Standing to ${label}.`,
} as const;

/** Both flags, exactly "true". Standing also needs the #737 medals path. */
export const korundStandingEnabled = (env: { HARIMU_KORUND_MEDALS_ENABLED?: string; HARIMU_KORUND_STANDING_ENABLED?: string } | null | undefined) =>
  env?.HARIMU_KORUND_MEDALS_ENABLED === 'true' && env?.HARIMU_KORUND_STANDING_ENABLED === 'true';
