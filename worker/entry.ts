import vinext from 'vinext/server/app-router-entry';
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '../lib/auth';
import { getDatabase } from '../lib/db';
import { readCityLocation } from '../lib/city-location';
import { runCabinetCron } from '../lib/cabinet-cron';
import { runDiplomacyCron } from '../lib/diplomacy';
import { runCrownCron } from '../lib/crown-debasement';
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
    ctx.waitUntil((async () => runCabinetCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000)))()
      .then(() => undefined, error => { console.warn('[cron] AI Cabinet responses failed', error instanceof Error ? error.name : 'unknown'); }));
    // #400: scheduled AI-leader treaty proposals; a no-op unless HARIMU_DIPLOMACY_ENABLED is "true" (default "false").
    ctx.waitUntil((async () => runDiplomacyCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000), env as unknown as { HARIMU_DIPLOMACY_ENABLED?: string; HARIMU_EMBARGO_ENABLED?: string }))()
      .then(() => undefined, error => { console.warn('[cron] AI treaty proposals failed', error instanceof Error ? error.name : 'unknown'); }));
    // #362: the AI Monarch's yearly Crown debasement decree; a no-op unless HARIMU_CROWN_DEBASEMENT_ENABLED="true". Never runs on a read.
    ctx.waitUntil((async () => runCrownCron(await getDatabase(), Math.floor(controller.scheduledTime / 1000), { enabled: (env as unknown as { HARIMU_CROWN_DEBASEMENT_ENABLED?: string }).HARIMU_CROWN_DEBASEMENT_ENABLED === 'true' }))()
      .then(() => undefined, error => { console.warn('[cron] Crown debasement failed', error instanceof Error ? error.name : 'unknown'); }));
  },
};
export default worker;
