import { validPlayerCommand, type PlayerCommand } from './player-market';
import { validMarketCommand, type MarketCommand } from './market';

type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Intents = { market: MarketCommand | null; player: PlayerCommand | null;
  government: { topic: 'food' | 'infrastructure' | 'work'; requestId: string } | null };
const key = (userId: string) => `harimu-pending-intents-v1:${userId}`;
// Session scoped recovery stores commands only, never private plans or credentials.
export function writeCitizenIntents(storage: StorageAccess, userId: string, intents: Intents) {
  try {
    if (!intents.market && !intents.player && !intents.government) storage.removeItem(key(userId));
    else storage.setItem(key(userId), JSON.stringify(intents));
  } catch { /* In-memory intent recovery remains available when storage is disabled. */ }
}
export function readCitizenIntents(storage: StorageAccess, userId: string): Intents | null {
  try {
    const raw = storage.getItem(key(userId));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return null;
    const command = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
    const government = command(saved.government) && ['food','infrastructure','work'].includes(saved.government.topic as string)
      && typeof saved.government.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.government.requestId)
      ? { topic:saved.government.topic, requestId:saved.government.requestId } as Intents['government'] : null;
    return { market:command(saved.market) && validMarketCommand(saved.market) ? saved.market : null,
      player:command(saved.player) && validPlayerCommand(saved.player) ? saved.player : null, government };
  } catch { return null; }
}
