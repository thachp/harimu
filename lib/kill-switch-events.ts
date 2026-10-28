/** #764 slice 2 (docs moderation-safety §21.4): logged kill-switch changes. Who, persona, on/off, time, reason.
 *  The switches are operator config (`HARIMU_AI_MUTED_PERSONAS`, `HARIMU_AI_TEMPLATES_ONLY`), so the actor is the role `operator`, never an account id or other user PII.
 *  Templates-only is nation-scoped: its subject is stored in `persona` as the nation id or `all`.
 *  Flag HARIMU_KILL_SWITCH_EVENTS_ENABLED: "true" in preview, "false" in production. Off: no reads and no writes. */
import type { GameDatabase } from './database-contract';
import { aiMutedPersonasMode, aiTemplatesOnlyMode, type AiTemplatesOnlyEnv } from './ai-kill-switch';

export const killSwitchEventsEnabled = (env: { HARIMU_KILL_SWITCH_EVENTS_ENABLED?: unknown } | null | undefined) => env?.HARIMU_KILL_SWITCH_EVENTS_ENABLED === 'true';
export const killSwitchReasons = ['persona-mute', 'templates-only'] as const;
export type KillSwitchReason = (typeof killSwitchReasons)[number];
export type KillSwitchState = 'on' | 'off';
export type KillSwitchEventEnv = AiTemplatesOnlyEnv & { HARIMU_KILL_SWITCH_EVENTS_ENABLED?: unknown };
export type KillSwitchEventInput = { persona: string; state: KillSwitchState; reason: KillSwitchReason; createdAt: number };
export type KillSwitchEvent = { actor: 'operator'; persona: string; state: KillSwitchState; reason: KillSwitchReason; createdAt: number };

export const killSwitchEventSchemas = [
  `CREATE TABLE IF NOT EXISTS ai_kill_switch_events (
 id TEXT PRIMARY KEY,
 actor TEXT NOT NULL CHECK(actor IN ('operator')),
 persona TEXT NOT NULL CHECK(length(persona) BETWEEN 1 AND 80),
 state TEXT NOT NULL CHECK(state IN ('on','off')),
 reason TEXT NOT NULL CHECK(reason IN ('persona-mute','templates-only')),
 created_at INTEGER NOT NULL CHECK(created_at>=0)
)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_kill_switch_events_created ON ai_kill_switch_events(created_at)`,
] as const;

const personaOk = (persona: string) => /^[a-z0-9-]{1,80}$/.test(persona);

/** Append one change. The actor column is the constant `operator` (no caller-supplied who). Rejects anything that is not a persona id, nation id or `all`. */
export async function insertKillSwitchEvent(db: GameDatabase, event: KillSwitchEventInput): Promise<boolean> {
  if (!personaOk(event.persona) || (event.state !== 'on' && event.state !== 'off') || !(killSwitchReasons as readonly string[]).includes(event.reason) || !Number.isSafeInteger(event.createdAt) || event.createdAt < 0) throw new Error('Invalid kill-switch event.');
  const result = await db.prepare(`INSERT INTO ai_kill_switch_events (id, actor, persona, state, reason, created_at) VALUES (?, 'operator', ?, ?, ?, ?)`).bind(crypto.randomUUID(), event.persona, event.state, event.reason, event.createdAt).run();
  return result.meta.changes === 1;
}

const wanted = (env: KillSwitchEventEnv | null | undefined) => {
  const rows: { reason: KillSwitchReason; persona: string }[] = [];
  const add = (reason: KillSwitchReason, mode: ReturnType<typeof aiMutedPersonasMode>) => {
    if (mode === 'off') return;
    if (mode === 'all') rows.push({ reason, persona: 'all' });
    else for (const persona of mode) rows.push({ reason, persona });
  };
  add('persona-mute', aiMutedPersonasMode(env?.HARIMU_AI_MUTED_PERSONAS));
  add('templates-only', aiTemplatesOnlyMode(env?.HARIMU_AI_TEMPLATES_ONLY));
  return rows;
};

/** Diff the current operator config against the latest row per switch and subject, and append only the changes. Flag off: no query. */
export async function recordKillSwitchChanges(db: GameDatabase, env: KillSwitchEventEnv | null | undefined, now: number): Promise<number> {
  if (!killSwitchEventsEnabled(env) || !Number.isSafeInteger(now) || now < 0) return 0;
  const rows = (await db.prepare('SELECT reason, persona, state FROM ai_kill_switch_events ORDER BY created_at ASC, id ASC').all<{ reason: KillSwitchReason; persona: string; state: KillSwitchState }>()).results ?? [];
  const on = new Set<string>();
  for (const row of rows) { const key = `${row.reason}:${row.persona}`; if (row.state === 'on') on.add(key); else on.delete(key); }
  const next = new Set(wanted(env).map(row => `${row.reason}:${row.persona}`));
  let wrote = 0;
  for (const key of on) if (!next.has(key)) { const [reason, persona] = key.split(':') as [KillSwitchReason, string]; if (await insertKillSwitchEvent(db, { persona, state: 'off', reason, createdAt: now })) wrote++; }
  for (const key of next) if (!on.has(key)) { const [reason, persona] = key.split(':') as [KillSwitchReason, string]; if (await insertKillSwitchEvent(db, { persona, state: 'on', reason, createdAt: now })) wrote++; }
  return wrote;
}

/** Staff read, newest first. */
export async function listKillSwitchEvents(db: GameDatabase, limit = 200): Promise<KillSwitchEvent[]> {
  const rows = (await db.prepare('SELECT actor, persona, state, reason, created_at FROM ai_kill_switch_events ORDER BY created_at DESC, id DESC LIMIT ?').bind(limit)
    .all<{ actor: 'operator'; persona: string; state: KillSwitchState; reason: KillSwitchReason; created_at: number }>()).results ?? [];
  return rows.map(row => ({ actor: 'operator', persona: row.persona, state: row.state, reason: row.reason, createdAt: Number(row.created_at) }));
}
