import vinext from 'vinext/server/app-router-entry';
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '../lib/auth';
import { getDatabase } from '../lib/db';
import { readCityLocation } from '../lib/city-location';
import { runCabinetCron } from '../lib/cabinet-cron';
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
  },
};
export default worker;
