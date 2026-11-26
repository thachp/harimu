/** #1526 [ASSUMPTION, ARC on #1526]: each in-force embargo against a nation costs this many Stability points (docs §13.3 names Stability for the target). */
export const EMBARGO_TARGET_STABILITY_DROP = 4;
/** #1526 [ASSUMPTION, ARC on #1526]: each in-force embargo a nation imposes costs this many Stability points (docs §13.3 Feedback: "lost exports"). */
export const EMBARGO_SANCTIONER_STABILITY_DROP = 1;
/** #1526 [ASSUMPTION, ARC on #1526]: the combined embargo Stability term is capped at this many points (applied as −cap) and never positive. */
export const EMBARGO_STABILITY_CAP = 8;

const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
const minus = (n: number) => `−${n}`;

/** Target −4 per embargo against us, sanctioner −1 per embargo we impose, total capped at −8, never raised. Missing/invalid counts contribute 0. */
export function embargoStabilityPoints(counts: { embargoesAgainstUs?: number; embargoesWeImpose?: number } = {}): number {
  const against = count(counts.embargoesAgainstUs);
  const impose = count(counts.embargoesWeImpose);
  const raw = against * EMBARGO_TARGET_STABILITY_DROP + impose * EMBARGO_SANCTIONER_STABILITY_DROP;
  return -Math.min(EMBARGO_STABILITY_CAP, raw) || 0;
}

/** Combined breakdown copy (proposal: true). Empty when the term is 0. */
export function embargoStabilityDetail(counts: { embargoesAgainstUs?: number; embargoesWeImpose?: number } = {}): string {
  const against = count(counts.embargoesAgainstUs);
  const impose = count(counts.embargoesWeImpose);
  const points = embargoStabilityPoints({ embargoesAgainstUs: against, embargoesWeImpose: impose });
  if (points === 0) return '';
  const parts: string[] = [];
  if (against > 0) parts.push(`Embargo: ${minus(against * EMBARGO_TARGET_STABILITY_DROP)}`);
  if (impose > 0) parts.push(`Lost exports (our embargo): ${minus(impose * EMBARGO_SANCTIONER_STABILITY_DROP)}`);
  const raw = -(against * EMBARGO_TARGET_STABILITY_DROP + impose * EMBARGO_SANCTIONER_STABILITY_DROP);
  if (raw < points) parts.push(`capped at ${minus(EMBARGO_STABILITY_CAP)}`);
  return parts.join('; ');
}
