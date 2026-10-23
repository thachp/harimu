/** #876: model-written Kindle rally speeches (docs §9.4 "Rallies and speeches"), the follow-up to #867. Scheduled Worker only (the `rallies` cron job), never a route
 *  and never a read. Off unless HARIMU_KINDLE_RALLIES_ENABLED and HARIMU_AI_RALLY_SPEECHES_ENABLED are both "true" and the AI binding and a valid daily AI budget are present.
 *  Uses the town hall answer pipeline (`generateAnswer`: one budget reservation, draft, support check against the platform cards, safety model). In templates-only mode
 *  (HARIMU_AI_TEMPLATES_ONLY covers Kindle) or with the `kindle-rally` persona muted there is no model call and no reservation, and the rally keeps its #867 template speech.
 *  At most one stored speech per rally (rally_speeches PRIMARY KEY rally_id); any failure leaves the template speech. Speeches are always shown labeled AI. */
import type { GameDatabase } from './database-contract';
import { aiPathPersonas, skipForMutedPersona, skipForTemplates, type AiTemplatesOnlyEnv } from './ai-kill-switch';
import { aiBudgetConfig } from './ai-budget';
import type { NewsAiBinding } from './ai-news';
import { generateAnswer, platformCards } from './town-hall-ai';
import { electionCandidates } from './elections';
import { rallyFor } from './rallies';
import { upcomingRallyWeek } from './rallies-rules';

export const rallySpeechSchemas = [
  `CREATE TABLE IF NOT EXISTS rally_speeches (rally_id TEXT PRIMARY KEY, speech TEXT NOT NULL CHECK(length(speech) BETWEEN 1 AND 600), created_at INTEGER NOT NULL)`,
];
export type RallySpeechBindings = AiTemplatesOnlyEnv & { AI?: NewsAiBinding; HARIMU_KINDLE_RALLIES_ENABLED?: string; HARIMU_AI_RALLY_SPEECHES_ENABLED?: string; HARIMU_AI_DAILY_BUDGET_MICRO?: string; HARIMU_AI_GATEWAY_ID?: string };
export const rallySpeechesConfigured = (b: RallySpeechBindings) =>
  b.HARIMU_KINDLE_RALLIES_ENABLED === 'true' && b.HARIMU_AI_RALLY_SPEECHES_ENABLED === 'true' && Boolean(b.AI) && aiBudgetConfig(b) !== null;

/** One pass over each candidate's upcoming rally that has no stored speech, at most one attempt per rally per UTC day (the reservation id is the lease). */
export async function runRallySpeechCron(db: GameDatabase, now: number, b: RallySpeechBindings) {
  if (!rallySpeechesConfigured(b)) return { status: 'disabled' as const, results: [] as string[] };
  if (skipForTemplates('rally', b, 'kindle', now)) return { status: 'templates-only' as const, results: [] as string[] };
  if (skipForMutedPersona('rally', b, aiPathPersonas.rally(), now)) return { status: 'persona-muted' as const, results: [] as string[] };
  const budget = aiBudgetConfig(b)!, day = new Date(now * 1000).toISOString().slice(0, 10), results: string[] = [];
  for (let i = 0; i < electionCandidates.length; i++) {
    const r = rallyFor(i, upcomingRallyWeek(now, i)), reservation = `rally:${r.id}:${day}`;
    const done = await db.prepare(`SELECT (SELECT COUNT(*) FROM rally_speeches WHERE rally_id=?) AS saved, (SELECT COUNT(*) FROM harimu_ai_reservations WHERE request_id=?) AS tried`).bind(r.id, reservation).first<{ saved: number; tried: number }>();
    if (Number(done?.saved) > 0 || Number(done?.tried) > 0) { results.push('skipped'); continue; }
    const card = platformCards(r.candidate.id), input = { candidate: card.name, platform: card.platform, platformCards: card.cards, city: r.city.name };
    const made = await generateAnswer(db, now, b.AI, { enabled: true, budget }, {
      reservation, input, guardQuestion: `Give a short public campaign rally speech in ${r.city.name}.`,
      draft: `You are ${card.name}, an AI candidate in the Kindle presidential campaign, giving a short speech at a rally in a city square. Speak in the first person, in two to four plain sentences, using only the candidate's platform and platform cards given below. Do not announce any new promise, policy, spending or appointment, and never ask anyone how to vote or offer anything for a vote. Use no numbers or links. Return JSON with a response string.`,
      check: 'Check this rally speech. Return JSON with supported true only when every claim in it is on the candidate platform or platform cards given, and it announces no new promise, policy, spending, appointment or quantity.',
    });
    if (made.status === 'budget-unavailable') { results.push(made.status); break; }
    if (made.status !== 'text') { results.push(made.status); continue; }
    const [saved] = await db.batch([
      db.prepare('INSERT INTO rally_speeches (rally_id, speech, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(r.id, made.text, now),
      db.prepare("UPDATE harimu_ai_reservations SET status='finished' WHERE request_id=?").bind(reservation),
    ]);
    results.push(saved.meta.changes ? 'recorded' : 'already-recorded');
  }
  return { status: 'ran' as const, results };
}
