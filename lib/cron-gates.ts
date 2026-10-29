/** #384: which scheduled jobs have their flag on. worker/entry.ts opens the database for a job only when its flag is on, so a flag-off
 *  cron never opens a Hyperdrive connection or runs the Postgres readiness path. Each job's own lib check still applies (AI binding, budget).
 *  #988: flagOn so a packed flag (HARIMU_AURELLE_PACK) still gates its job. A direct string binding still wins. */
import { flagOn } from './flag-pack.mjs';
export type CronFlagBindings = Partial<Record<(typeof cronJobFlags)[CronJob][number], string>>;
export const cronJobFlags = {
  cabinet: ['HARIMU_AI_CABINET_RESPONSES_ENABLED'],
  diplomacy: ['HARIMU_DIPLOMACY_ENABLED'],
  crown: ['HARIMU_CROWN_DEBASEMENT_ENABLED'],
  townHall: ['HARIMU_TOWN_HALLS_ENABLED', 'HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED'],
  debate: ['HARIMU_DEBATE_ENABLED', 'HARIMU_AI_DEBATE_ANSWERS_ENABLED'],
  spark: ['HARIMU_SPARK_SUPPLY_ENABLED'],
  ledger: ['HARIMU_LEDGER_RECONCILIATION_ENABLED'],
  tesseraRewards: ['HARIMU_TESSERA_REWARDS_ENABLED'],
  rallies: ['HARIMU_KINDLE_RALLIES_ENABLED'],
  cityTier: ['HARIMU_CITY_TIER_GROWTH_ENABLED'], // #952 tier up, #966 tier down (same flag)
} as const;
export type CronJob = keyof typeof cronJobFlags;

export function cronJobsOn(bindings: CronFlagBindings): Record<CronJob, boolean> {
  return Object.fromEntries(Object.entries(cronJobFlags).map(([job, flags]) => [job, flags.every(flag => flagOn(bindings, flag))])) as Record<CronJob, boolean>;
}
