/** #70 + #74 Korund emergency Presidium session and AI Chairman purge/succession: pure rules (no runtime imports).
 *  Canon: docs ai-leadership §8.11, coups-transitions §10.3 (party-states row) and §10.4 (Korund: AI Presidium purge,
 *  Unrest-forced emergency Presidium). Thresholds are config [ASSUMPTION] values. Rule-bound personas; no live AI model. */
export type SeatId = 'voss' | 'morrow' | 'holt' | 'kestrel' | 'brand';
export type Seat = { id: SeatId; name: string; role: string; faction: 'chair' | 'reform' | 'hardline' };
/** The Chairman plus four Presidium seats (#74: 3–5 named AI seats). Neral Voss matches lib/leader-personas.ts. */
export const presidiumSeats: readonly Seat[] = [
  { id: 'voss', name: 'Neral Voss', role: 'Chairman', faction: 'chair' },
  { id: 'morrow', name: 'Ilsa Morrow', role: 'Secretary for Planning', faction: 'reform' },
  { id: 'holt', name: 'Vera Holt', role: 'Secretary for Rations', faction: 'reform' },
  { id: 'kestrel', name: 'Dagan Kestrel', role: 'Chief of State Security', faction: 'hardline' },
  { id: 'brand', name: 'Oren Brand', role: 'Commissar of Brigades', faction: 'hardline' },
];
/** Succession order for the designated "Chosen Comrade", and which hardline seat falls with each purged Chairman. */
export const chosenComrades: readonly SeatId[] = ['morrow', 'holt'];
export const purgeOrder: readonly SeatId[] = ['kestrel', 'brand'];
export const seat = (id: string) => presidiumSeats.find(s => s.id === id) ?? null;

export const presidiumConfig = {
  unrestThreshold: 65,               // Korund Unrest (#69) at or above this ...
  unrestSustainSeconds: 7 * 86400,   // ... for 7 real days opens an emergency session
  confirmSeconds: 24 * 3600,         // the Chosen Comrade is confirmed or rejected within 24 real hours
  cooldownSeconds: 7 * 86400,        // no new session for 7 real days after one resolves
  purgeWeight: 50,                   // reform weight at or above this purges the Chairman
} as const;

export function unrestSustainedSeconds(scores: { scheduledAt: number; unrest: number }[], now: number): number {
  let start: number | null = null;
  for (const s of scores) { if (s.unrest < presidiumConfig.unrestThreshold) break; start = s.scheduledAt; }
  return start === null ? 0 : Math.max(0, now - start);
}
export const sessionReady = (sustainedSeconds: number) => sustainedSeconds >= presidiumConfig.unrestSustainSeconds;

/** Small deterministic jitter from the session seed (FNV-1a), 0..9: the same seed always gives the same outcome. */
export function seedJitter(seed: string): number {
  let h = 0x811c9dc5; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 10;
}
/** Reform factions gain weight with sustained Unrest above the threshold and with missed plan quota. */
export function reformWeight(input: { unrest: number; quotaPct: number; sustainedDays: number }): number {
  const over = Math.max(0, input.unrest - presidiumConfig.unrestThreshold);
  return Math.round(over * 2 + (100 - Math.max(0, Math.min(100, input.quotaPct))) * 0.3 + Math.max(0, input.sustainedDays - 7) * 2);
}
export type SessionDecision = { outcome: 'survived' | 'purged'; weight: number; jitter: number; successor: SeatId | null; purgedSeat: SeatId | null; reasoning: string };
/** `purged` lists seats that cannot succeed or be purged: removed seats plus the sitting Chairman. */
export function resolveSession(input: { unrest: number; quotaPct: number; sustainedDays: number; seed: string; purged: SeatId[] }): SessionDecision {
  const weight = reformWeight(input), jitter = seedJitter(input.seed);
  const successor = chosenComrades.find(id => !input.purged.includes(id)) ?? null;
  const purgedSeat = purgeOrder.find(id => !input.purged.includes(id)) ?? null;
  const facts = `Unrest ${input.unrest}, plan quota ${input.quotaPct}%, ${input.sustainedDays} days of sustained Unrest; reform weight ${weight} + ${jitter}.`;
  if (weight + jitter >= presidiumConfig.purgeWeight && successor && purgedSeat)
    return { outcome: 'purged', weight, jitter, successor, purgedSeat, reasoning: `Reform factions carried the session. ${facts} Within Charter Limits the Presidium removed the Chairman and confirmed the Chosen Comrade.` };
  return { outcome: 'survived', weight, jitter, successor: null, purgedSeat: null, reasoning: `The Chairman kept the Presidium's confidence and conceded a review of ration targets. ${facts}` };
}
