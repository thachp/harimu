import vinext from 'vinext/server/app-router-entry';
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '../lib/auth';
import { getDatabase } from '../lib/db';
import { readCityLocation } from '../lib/city-location';
import { presenceSocketPath, presenceUpgrade, type PresenceEnv } from '../lib/city-presence';
export { CityPresence } from './city-presence';

const worker = {
  async fetch(request: Request, workerEnv: unknown, ctx: ExecutionContext) {
    // WebSocket upgrade for the realtime presence spike (#76); everything else is the vinext app.
    if (new URL(request.url).pathname === presenceSocketPath) return presenceUpgrade(request, env as unknown as PresenceEnv, { authenticatedUserId, getDatabase, readCityLocation });
    return vinext.fetch(request, workerEnv as never, ctx as never);
  },
};
export default worker;
