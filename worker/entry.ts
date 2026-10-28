import vinext from 'vinext/server/app-router-entry';
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '../lib/auth';
import { getDatabase } from '../lib/db';
import { readCityLocation } from '../lib/city-location';
import { runCabinetCron } from '../lib/cabinet-cron';
import { cronJobsOn, type CronFlagBindings } from '../lib/cron-gates';
import { runRallyCron } from '../lib/rallies'; // #867
import { runRallySpeechCron, type RallySpeechBindings } from '../lib/rally-speech-ai'; // #876
import { runDiplomacyCron } from '../lib/diplomacy';
import { runCrownCron } from '../lib/crown-debasement';
import { runTownHallCron } from '../lib/town-hall-ai';
import { runDebateCron } from '../lib/debate-ai';
import { runSparkCron } from '../lib/spark-supply';
import { runLedgerReconciliationCron } from '../lib/ledger-reconciliation';
import { runTesseraRewardCron } from '../lib/tessera-rewards';
import { runCityTierGrowth } from '../lib/city-tier'; // #952
import { readVerification } from '../lib/verification';
import { presenceSocketPath, presenceUpgrade, type PresenceEnv } from '../lib/city-presence';
export { CityPresence } from './city-presence';

const worker = {
  async fetch(request: Request, workerEnv: unknown, ctx: ExecutionContext) {
    // WebSocket upgrade for the realtime presence spike (#76); everything else is the vinext app.
    if (new URL(request.url).pathname === presenceSocketPath) return presenceUpgrade(request, env as unknown as PresenceEnv, { authenticatedUserId, getDatabase, readCityLocation });
    return vinext.fetch(request, workerEnv as never, ctx as never);
  },
  // #247: Cron Trigger (wrangler.jsonc "triggers.crons"). AI Cabinet petition responses; a no-op unless enabled.
  async scheduled(controller: ScheduledController, _workerEnv: unknown, ctx: ExecutionContext) {
    // #384: a job whose flag is off never opens the database.
    const on = cronJobsOn(env as unknown as CronFlagBindings);
    if (on.cabinet) ctx.waitUntil((async () => runCabinetCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000)))()
      .then(() => undefined, error => { console.warn('[cron] AI Cabinet responses failed', error instanceof Error ? error.name : 'unknown'); }));
    // #400: scheduled AI-leader treaty proposals; a no-op unless HARIMU_DIPLOMACY_ENABLED is "true" (default "false").
    if (on.diplomacy) ctx.waitUntil((async () => runDiplomacyCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000), env as unknown as { HARIMU_DIPLOMACY_ENABLED?: string; HARIMU_EMBARGO_ENABLED?: string }))()
      .then(() => undefined, error => { console.warn('[cron] AI treaty proposals failed', error instanceof Error ? error.name : 'unknown'); }));
    // #362: the AI Monarch's yearly Crown debasement decree; a no-op unless HARIMU_CROWN_DEBASEMENT_ENABLED="true". Never runs on a read.
    if (on.crown) ctx.waitUntil((async () => runCrownCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000), { enabled: (env as unknown as { HARIMU_CROWN_DEBASEMENT_ENABLED?: string }).HARIMU_CROWN_DEBASEMENT_ENABLED === 'true', emissionCaps: (env as unknown as { HARIMU_EMISSION_CAPS_ENABLED?: string }).HARIMU_EMISSION_CAPS_ENABLED === 'true' }))()
      .then(() => undefined, error => { console.warn('[cron] Crown debasement failed', error instanceof Error ? error.name : 'unknown'); }));
    // #441: AI town hall answers for closed halls; a no-op unless HARIMU_TOWN_HALLS_ENABLED and HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED are "true" (both default "false"), with the AI binding and budget. Never runs on a read.
    if (on.townHall) ctx.waitUntil((async () => runTownHallCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000), env as unknown as Parameters<typeof runTownHallCron>[2]))()
      .then(() => undefined, error => { console.warn('[cron] Town hall answers failed', error instanceof Error ? error.name : 'unknown'); }));
    // #282: AI debate answers for a closed debate; a no-op unless HARIMU_DEBATE_ENABLED and HARIMU_AI_DEBATE_ANSWERS_ENABLED are "true" (both default "false"), with the AI binding and budget. Never runs on a read.
    if (on.debate) ctx.waitUntil((async () => runDebateCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000), env as unknown as Parameters<typeof runDebateCron>[2]))()
      .then(() => undefined, error => { console.warn('[cron] Debate answers failed', error instanceof Error ? error.name : 'unknown'); }));
    // #431: the AI Reserve Board's monthly Spark issuance; a no-op unless HARIMU_SPARK_SUPPLY_ENABLED="true". Never runs on a read.
    if (on.spark) ctx.waitUntil((async () => runSparkCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000), { enabled: (env as unknown as { HARIMU_SPARK_SUPPLY_ENABLED?: string }).HARIMU_SPARK_SUPPLY_ENABLED === 'true' }))()
      .then(() => undefined, error => { console.warn('[cron] Spark supply failed', error instanceof Error ? error.name : 'unknown'); }));
    // #432: daily ledger reconciliation (read-only on money, one report per game day); a no-op unless HARIMU_LEDGER_RECONCILIATION_ENABLED="true". Never runs on a read.
    if (on.ledger) ctx.waitUntil((async () => runLedgerReconciliationCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000), { enabled: (env as unknown as { HARIMU_LEDGER_RECONCILIATION_ENABLED?: string }).HARIMU_LEDGER_RECONCILIATION_ENABLED === 'true' }))()
      .then(() => undefined, error => { console.warn('[cron] Ledger reconciliation failed', error instanceof Error ? error.name : 'unknown'); }));
    // #465: earned-Tessera epoch close (one entry per verified settled shift, pro-rata from a fixed daily pool); a no-op unless HARIMU_TESSERA_REWARDS_ENABLED="true" (default "false"). Idempotent; never runs on a read.
    // #867: publish one AI-labeled news clip per Kindle rally whose time has passed; a no-op unless HARIMU_KINDLE_RALLIES_ENABLED is "true". Never runs on a read.
    if (on.rallies) ctx.waitUntil((async () => { const db = await getDatabase(), t = Math.floor(controller.scheduledTime / 1000); await runRallyCron(db, t); await runRallySpeechCron(db, t, env as unknown as RallySpeechBindings); /* #876: a no-op unless HARIMU_AI_RALLY_SPEECHES_ENABLED, AI binding and budget */ })()
      .then(() => undefined, error => { console.warn('[cron] Rally clips failed', error instanceof Error ? error.name : 'unknown'); }));
    if (on.tesseraRewards) ctx.waitUntil((async () => runTesseraRewardCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000), env as unknown as { HARIMU_TESSERA_REWARDS_ENABLED?: string }, async userId => (await readVerification(userId)).countedActionsEligible))()
      .then(() => undefined, error => { console.warn('[cron] Tessera reward epoch close failed', error instanceof Error ? error.name : 'unknown'); }));
    // #952: one tier up after 7 real days above the next population floor. No-op unless HARIMU_CITY_TIER_GROWTH_ENABLED="true".
    if (on.cityTier) ctx.waitUntil((async () => runCityTierGrowth(await getDatabase(), Math.floor(controller.scheduledTime / 1000), true))()
      .then(() => undefined, error => { console.warn('[cron] City tier growth failed', error instanceof Error ? error.name : 'unknown'); }));
  },
};
export default worker;
