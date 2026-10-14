// Server-only (#40, #125, #252): the answer key, the per-shift option order and grading. Never import this from app/
// client components; tests/shift-quality.test.mjs checks that no client module or API payload carries it.
// #252: each shift shows the options in its own order, derived from HMAC(server secret, shift id), so the best
// answer's position changes from shift to shift and cannot be memorized. The client only ever sees the shuffled
// option texts and a signed ticket; the secret, the order mapping and the key stay here.
// Type-only import keeps this file loadable without a bundler; callers pass the (client-safe) question list in.
import type { QualityGrade, QualityInput, QualityQuestion, QualityResult, QualityTicket } from './shift-quality';
const qualityWorkOrderId = 'harvest';
const gradeByScore: readonly QualityGrade[] = ['poor', 'fair', 'good', 'excellent'];
const multiplierPct: Record<QualityGrade, number> = { poor: 100, fair: 110, good: 125, excellent: 150 };

/** Index of the best option for each harvest question, in canonical (lib/shift-quality.ts) option order. */
const canonicalBest: readonly number[] = [1, 1, 2];

/** HARIMU_SHIFT_QUALITY_SECRET (at least 16 chars). Missing or short: the quality step is unavailable (fail closed). */
export function shiftQualitySecret(env: { HARIMU_SHIFT_QUALITY_SECRET?: string }): string | null {
  const secret = env.HARIMU_SHIFT_QUALITY_SECRET;
  return typeof secret === 'string' && secret.length >= 16 ? secret : null;
}

const encoder = new TextEncoder();
async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Per question: displayed position -> canonical option index. Deterministic for a (secret, shift id) pair. */
export async function shiftOptionOrder(secret: string, shiftId: string, questions: readonly QualityQuestion[]): Promise<number[][]> {
  const bytes = await hmac(secret, `order:${shiftId}`);
  return questions.map((q, qi) => {
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = bytes[(qi * 8 + i) % bytes.length] % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  });
}
/** Displayed position of the best option for each question of this shift. */
export async function shiftAnswerKey(secret: string, shiftId: string, questions: readonly QualityQuestion[]): Promise<number[]> {
  if (questions.length !== canonicalBest.length) throw Error('Shift quality key does not match the questions.');
  return (await shiftOptionOrder(secret, shiftId, questions)).map((order, qi) => order.indexOf(canonicalBest[qi]));
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const signature = async (secret: string, userId: string, shiftId: string) => hex(await hmac(secret, `ticket:${userId}:${shiftId}`)).slice(0, 32);

/** Issue the step for the citizen's next shift: a new shift id, signed for this user, and its shuffled questions. */
export async function issueQualityTicket(secret: string, userId: string, questions: readonly QualityQuestion[]): Promise<QualityTicket> {
  const shiftId = crypto.randomUUID();
  const order = await shiftOptionOrder(secret, shiftId, questions);
  return { ticket: `${shiftId}.${await signature(secret, userId, shiftId)}`,
    questions: questions.map((q, qi) => ({ prompt: q.prompt, options: order[qi].map((i) => q.options[i]) })) };
}
/** The shift id a ticket was issued for, or null when it is malformed or was not issued to this user by this server. */
export async function redeemQualityTicket(secret: string, userId: string, ticket: string): Promise<string | null> {
  const [shiftId, sig, extra] = ticket.split('.');
  if (extra !== undefined || !shiftId || !sig || !uuid.test(shiftId)) return null;
  const expected = await signature(secret, userId, shiftId);
  let diff = expected.length ^ sig.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (sig.charCodeAt(i) || 0);
  return diff === 0 ? shiftId : null;
}

/**
 * Grade a quality step once, at commit-work, against this shift's key. Only signed-in human citizens playing the
 * quality job get a bonus; skipping, other jobs, a missing key and any AI/background actor receive the base (100%) reward.
 */
export function gradeShift(workOrderId: string, input: QualityInput | undefined, actor: 'human' | 'ai', key?: readonly number[]): QualityResult {
  if (actor !== 'human' || workOrderId !== qualityWorkOrderId || !input || 'skip' in input || !key) return { grade: null, multiplierPct: 100, correct: null };
  const correct = input.answers.filter((a, i) => a === key[i]).length;
  const grade = gradeByScore[correct];
  return { grade, multiplierPct: multiplierPct[grade], correct };
}
