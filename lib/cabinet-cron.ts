import { env } from 'cloudflare:workers';
import type { GameDatabase } from './database-contract';
import { aiBudgetConfig } from './ai-budget';
import type { AiFailoverEnv } from './ai-failover';
import { prepareAiCabinetResponse } from './cabinet-response-ai';
import type { NewsAiBinding } from './ai-news';

/** #247: the AI Cabinet's mandatory petition responses run from the scheduled Worker (cron), never from a read.
 *  Gated by HARIMU_AI_CABINET_RESPONSES_ENABLED (default "false"), the AI binding and a configured budget.
 *  Idempotent: each petition gets at most one attempt per UTC day (the `cabinet:<petition>:<day>` reservation), and the
 *  response is written only while `response_text IS NULL`, so overlapping or repeated cron runs never double-publish. */
export const cabinetCronMaxPetitions = 3; // per run, bounds inference time and spend
type Bindings = AiFailoverEnv & { AI?: NewsAiBinding; HARIMU_AI_CABINET_RESPONSES_ENABLED?: string; HARIMU_AI_DAILY_BUDGET_MICRO?: string; HARIMU_AI_GATEWAY_ID?: string; HARIMU_AI_TEMPLATES_ONLY?: string };

export function cabinetResponsesConfigured(bindings: Bindings = env as unknown as Bindings) {
  return bindings.HARIMU_AI_CABINET_RESPONSES_ENABLED === 'true' && Boolean(bindings.AI) && aiBudgetConfig(bindings) !== null;
}

export async function runCabinetCron(db: GameDatabase, now: number, bindings: Bindings = env as unknown as Bindings) {
  if (!cabinetResponsesConfigured(bindings)) return { status: 'disabled' as const, results: [] as string[] };
  const budget = aiBudgetConfig(bindings)!;
  const results: string[] = [];
  for (let i = 0; i < cabinetCronMaxPetitions; i++) {
    const result = await prepareAiCabinetResponse(db, now, bindings.AI, { enabled: true, budget, killSwitch: bindings, failover: bindings });
    results.push(result.status);
    if (result.status === 'idle' || result.status === 'disabled' || result.status === 'budget-unavailable' || result.status === 'templates-only') break;
  }
  return { status: 'ran' as const, results };
}
