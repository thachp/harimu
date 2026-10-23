/** #740 slice 1: Kindle polling rules (docs §9.4 "System polls from random samples of voluntary human voter-intent answers, with a margin indicator").
 *  Pure and import-free: seeded sampling, shares and the 95% margin. Nothing here sees who answered; callers pass bare candidate ids. */
/** [ASSUMPTION] Below 10 sampled answers nothing is published: a tiny sample could reveal individuals. */
export const minimumPublishedSample = 10;
/** [ASSUMPTION] A poll samples at most 400 answers (about ±4.9 points); fewer answers are all used. */
export const maximumSample = 400;
export const pollingFlagOn = (env: unknown) => (env as { HARIMU_KINDLE_POLLING_ENABLED?: string } | null)?.HARIMU_KINDLE_POLLING_ENABLED === 'true';
/** FNV-1a seed then mulberry32: the same seed always draws the same sample. */
export function seededRandom(seed: string) {
  let h = 0x811c9dc5; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return () => { h = (h + 0x6d2b79f5) >>> 0; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Partial Fisher–Yates over a copy: a uniform sample of up to `size` items, deterministic for a seed. */
export function drawSample<T>(items: readonly T[], size: number, seed: string): T[] {
  const pool = [...items], rand = seededRandom(seed), take = Math.max(0, Math.min(size, pool.length));
  for (let i = 0; i < take; i++) { const j = i + Math.floor(rand() * (pool.length - i)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, take);
}
/** 95% margin in percentage points for a share near 50%: 1.96·√(0.25/n) ≈ 0.98/√n, to one decimal. */
export const marginPoints = (n: number) => n > 0 ? Math.round(980 / Math.sqrt(n)) / 10 : null;
/** ARC ruling (a): published shares are whole percents rounded to the nearest 5; raw counts and n are never published. */
export const shareStep = 5;
/** ARC ruling (b): after the first snapshot, a new one publishes only when at least this many answers were added since the last one. */
export const minimumNewAnswers = 10;
/** [ASSUMPTION] A margin from n would reveal n, so only a coarse band is published: the smallest of these bounds at or above the true margin. */
export const marginBands = [5, 10, 20, 35] as const;
export const marginBand = (n: number) => { const m = marginPoints(n); return m === null ? null : marginBands.find(b => m <= b) ?? marginBands[marginBands.length - 1]; };
/** Internal: n is stored (never returned); margin is already the coarse band. */
export type PollResult = { n: number; margin: number; shares: { candidateId: string; share: number }[] };
/** Shares (nearest 5%) for every slate candidate, slate order. null under the minimum sample. */
export function tallyPoll(sample: readonly string[], slate: readonly string[]): PollResult | null {
  const n = sample.length;
  if (n < minimumPublishedSample) return null;
  return { n, margin: marginBand(n)!, shares: slate.map(candidateId => ({ candidateId, share: Math.round(sample.filter(c => c === candidateId).length * 100 / n / shareStep) * shareStep })) };
}
/** One seed per election per real day, so each day's poll draws a fresh sample once the answers exceed the maximum sample. */
export const pollSeed = (electionId: string, day: number) => `${electionId}:${day}`;
export const pollDay = (nowSec: number) => Math.floor(nowSec / 86400);
