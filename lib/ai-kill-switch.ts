/** #742 slice 1: the "templates only" AI kill switch (docs moderation-safety §21.3/§21.4: "switch all narrative to templates", instantly and logged).
 *  One operator var, HARIMU_AI_TEMPLATES_ONLY: "" (off), "all", or a comma list of nation ids ("korund,aurelle"). When it covers a nation, every AI narrative
 *  path skips the model call and the budget reservation and uses its existing deterministic template or fallback. Anything else (an unknown nation, an empty
 *  list item, a non-string) fails closed and is treated as "all". It is an operator control, not a feature flag: "" in both wrangler files. */
export const aiTemplatesOnlyNations = ['kindle', 'korund', 'aurelle'] as const;
export type AiTemplatesOnlyMode = 'off' | 'all' | readonly string[];
export type AiTemplatesOnlyEnv = { HARIMU_AI_TEMPLATES_ONLY?: unknown };
export type AiNarrativePath = 'ai-news' | 'notables' | 'cabinet-response' | 'town-hall' | 'debate';

export function aiTemplatesOnlyMode(raw: unknown): AiTemplatesOnlyMode {
  if (raw === undefined || raw === null) return 'off';
  if (typeof raw !== 'string') return 'all';
  const value = raw.trim().toLowerCase();
  if (value === '') return 'off';
  if (value === 'all') return 'all';
  const ids = value.split(',').map(id => id.trim());
  if (ids.some(id => !(aiTemplatesOnlyNations as readonly string[]).includes(id))) return 'all';
  return [...new Set(ids)];
}

/** True when this nation's AI narrative must use templates. */
export function aiTemplatesOnly(env: AiTemplatesOnlyEnv | null | undefined, nationId: string | null | undefined): boolean {
  const mode = aiTemplatesOnlyMode(env?.HARIMU_AI_TEMPLATES_ONLY);
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return typeof nationId === 'string' && mode.includes(nationId);
}

/** Workers logs line for a skipped model call: path, nation and mode only, never user data. Logged once per path and nation per minute (the cron and
 *  world-tick cadence), so a busy read path does not flood the logs. */
export const aiTemplatesOnlyLogSeconds = 60;
const lastLogged = new Map<string, number>();
export function logAiTemplatesOnly(path: AiNarrativePath, nationId: string, env: AiTemplatesOnlyEnv | null | undefined, now: number) {
  const key = `${path}:${nationId}`, bucket = Math.floor(now / aiTemplatesOnlyLogSeconds);
  if (lastLogged.get(key) === bucket) return false;
  lastLogged.set(key, bucket);
  const mode = aiTemplatesOnlyMode(env?.HARIMU_AI_TEMPLATES_ONLY);
  console.info(`[ai-kill-switch] templates only: path=${path} nation=${nationId} mode=${mode === 'all' ? 'all' : 'nations'}`);
  return true;
}

/** Check and log in one step. */
export function skipForTemplates(path: AiNarrativePath, env: AiTemplatesOnlyEnv | null | undefined, nationId: string, now: number) {
  if (!aiTemplatesOnly(env, nationId)) return false;
  logAiTemplatesOnly(path, nationId, env, Number.isFinite(now) ? now : 0);
  return true;
}
