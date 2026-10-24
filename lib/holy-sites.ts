/** #855 Religious Harmony slice 2 (docs §14.5, §14.1): holy-site pilgrimages (granted or denied by the custodian nation) and clergy charity,
 *  counted as Harmony signals. Behind HARIMU_RELIGIOUS_HARMONY_ENABLED. Migration 0084 mirrors holySiteSchemas. No runtime imports. */
import type { GameDatabase } from './database-contract';

export const HOLY_SITE_GAME_DAY_SECONDS = 7200; // 12x clock: a game day is 2 real hours
/** Minimal MVP data: the holy sites custodied by an MVP nation (Figure 7). Kindle custodies none. Access: Aurelle grants pilgrims to the
 *  Hearth of First Names; Korund keeps the High Retreat closed (§14.1 "closed unless Korund grants access"). */
export const holySites = {
  'hearth-of-first-names': { custodian: 'aurelle', faithId: 'kinward-rite', access: 'granted' },
  'high-retreat': { custodian: 'korund', faithId: 'quiet-path', access: 'denied' },
} as const;
export type HolySiteId = keyof typeof holySites;
export const holySiteSchemas = [
  `CREATE TABLE IF NOT EXISTS faith_harmony_acts (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 act TEXT NOT NULL CHECK(act IN ('pilgrimage','charity')),
 game_day INTEGER NOT NULL,
 nation_id TEXT NOT NULL,
 site_id TEXT,
 outcome TEXT NOT NULL CHECK(outcome IN ('granted','denied','given')),
 acted_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, act, game_day)
)`,
];
export type HarmonyActCommand = { action: 'pilgrimage'; siteId: HolySiteId; requestId: string } | { action: 'charity'; requestId: string };
export function parseHarmonyAct(body: Record<string, unknown>): HarmonyActCommand | null {
  const requestId = typeof body.requestId === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(body.requestId) ? body.requestId : null;
  if (!requestId) return null;
  if (body.action === 'charity') return { action: 'charity', requestId };
  if (body.action === 'pilgrimage' && typeof body.siteId === 'string' && Object.hasOwn(holySites, body.siteId)) return { action: 'pilgrimage', siteId: body.siteId as HolySiteId, requestId };
  return null;
}
type Row = { user_id: string; act: string; outcome: string; site_id: string | null; nation_id: string };
const result = (row: Row, replayed: boolean) => ({ ok: true as const, act: row.act, outcome: row.outcome, siteId: row.site_id, nationId: row.nation_id, replayed });
/** The citizen's public faith (row, else the nation default as in readFaith) is not Unaffiliated. Korund hidden faiths do not count. */
export async function hasFaithAffiliation(db: GameDatabase, userId: string) {
  const row = await db.prepare('SELECT c.nation_id, f.faith_id FROM citizens c LEFT JOIN citizen_faith f ON f.user_id = c.clerk_user_id AND f.nation_id = c.nation_id WHERE c.clerk_user_id = ?').bind(userId).first<{ nation_id: string | null; faith_id: string | null }>();
  if (!row?.nation_id) return false;
  return (row.faith_id ?? (row.nation_id === 'aurelle' ? 'kinward-rite' : 'unaffiliated')) !== 'unaffiliated'; // mirrors lib/faith.ts defaultFaith (no runtime import here)
}
/** One pilgrimage and one charity act per citizen per game day. Race-safe: a single conditional INSERT ... SELECT ... ON CONFLICT DO NOTHING;
 *  the request id replays the stored outcome. Charity needs a seated officiant (clergy); the charity counts for the officiant's nation. */
export async function runHarmonyAct(db: GameDatabase, userId: string, command: HarmonyActCommand, now: number) {
  const read = () => db.prepare('SELECT user_id, act, outcome, site_id, nation_id FROM faith_harmony_acts WHERE request_id = ?').bind(command.requestId).first<Row>();
  const prior = await read();
  if (prior) return prior.user_id === userId ? result(prior, true) : { ok: false as const, status: 409, reason: 'request_reused', error: 'That request id was already used.' };
  const day = Math.floor(now / HOLY_SITE_GAME_DAY_SECONDS);
  // ARC on QA2's preview report: charity needs a faith affiliation; without one it is a clear 409 before any write (no act row, no wallet change).
  if (command.action === 'charity' && !(await hasFaithAffiliation(db, userId)))
    return { ok: false as const, status: 409, reason: 'no_affiliation', error: 'Choose a faith before giving clergy charity.' };
  const insert = 'INSERT INTO faith_harmony_acts (user_id, act, game_day, nation_id, site_id, outcome, acted_at, request_id)';
  const changes = command.action === 'pilgrimage'
    ? (await db.prepare(`${insert} SELECT c.clerk_user_id, 'pilgrimage', ?, ?, ?, ?, ?, ? FROM citizens c WHERE c.clerk_user_id = ? ON CONFLICT DO NOTHING`)
      .bind(day, holySites[command.siteId].custodian, command.siteId, holySites[command.siteId].access, now, command.requestId, userId).run()).meta?.changes
    : (await db.prepare(`${insert} SELECT c.clerk_user_id, 'charity', ?, c.nation_id, NULL, 'given', ?, ? FROM citizens c
        WHERE c.clerk_user_id = ? AND EXISTS (SELECT 1 FROM congregation_officiants o WHERE o.user_id = c.clerk_user_id) ON CONFLICT DO NOTHING`)
      .bind(day, now, command.requestId, userId).run()).meta?.changes;
  const saved = await read();
  if (saved) return saved.user_id === userId ? result(saved, Number(changes ?? 0) !== 1) : { ok: false as const, status: 409, reason: 'request_reused', error: 'That request id was already used.' };
  if (command.action === 'charity' && !(await db.prepare('SELECT 1 AS x FROM congregation_officiants WHERE user_id = ?').bind(userId).first()))
    return { ok: false as const, status: 403, reason: 'not_clergy', error: 'Only a seated officiant can give clergy charity.' };
  return { ok: false as const, status: 409, reason: 'already_today', error: 'You already did that this game day.' };
}
/** #889 faith-panel buttons. Copy by Content (Refs #889), tone from docs religion-faiths: invented faiths, the state favors none, the
 *  custodian nation sets access (§14.1), Religious Harmony rises with charity and granted access and falls with denied pilgrimages (§14.5).
 *  Phone width: button labels at most 36 characters, helper and outcome lines at most 90. No figures, no faith named. `proposal: true`. */
export const holySiteCopy = {
  heading: 'Pilgrimage and charity', proposal: true,
  pilgrimage: { 'hearth-of-first-names': 'Pilgrimage: Hearth of First Names', 'high-retreat': 'Pilgrimage: High Retreat' } as Record<HolySiteId, string>,
  charity: 'Give clergy charity',
  helper: {
    pilgrimage: 'One pilgrimage a game day. The nation that keeps the site decides who may enter.',
    charity: 'For seated officiants. One gift a game day, for your nation\'s Harmony.',
  },
  noAffiliation: 'Choose a faith to give clergy charity.', // placeholder for Content (QA2 preview report)
  outcome: { granted: 'You were welcomed at the site. Harmony rises there.', denied: 'The way was closed to you. Harmony falls there.', given: 'Your charity was given. Harmony rises at home.' } as Record<string, string>,
  failed: 'That did not go through: {reason}',
} as const;
