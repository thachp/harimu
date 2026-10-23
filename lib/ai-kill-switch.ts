/** #742 slice 1: the "templates only" AI kill switch (docs moderation-safety §21.3/§21.4: "switch all narrative to templates", instantly and logged).
 *  One operator var, HARIMU_AI_TEMPLATES_ONLY: "" (off), "all", or a comma list of nation ids ("korund,aurelle"). When it covers a nation, every AI narrative
 *  path skips the model call and the budget reservation and uses its existing deterministic template or fallback. Anything else (an unknown nation, an empty
 *  list item, a non-string) fails closed and is treated as "all". It is an operator control, not a feature flag: "" in both wrangler files. */
export const aiTemplatesOnlyNations = ['kindle', 'korund', 'aurelle'] as const;
export type AiTemplatesOnlyMode = 'off' | 'all' | readonly string[];
export type AiTemplatesOnlyEnv = { HARIMU_AI_TEMPLATES_ONLY?: unknown; HARIMU_AI_MUTED_PERSONAS?: unknown };
export type AiNarrativePath = 'ai-news' | 'notables' | 'cabinet-response' | 'town-hall' | 'debate' | 'rally';

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

/** #764 slice 1: per-persona mute (docs moderation-safety §21.4: "Staff can mute a persona's narrative output"). One operator var, HARIMU_AI_MUTED_PERSONAS:
 *  "" (off), "all", or a comma list of persona ids. Notables use their profile id; the other AI paths speak as one fixed persona each (below). A muted
 *  persona's path makes no model call and no reservation; Notables answer with the shared "persona muted" notice copy. An unknown id or
 *  a non-string fails closed to "all". It is an operator control, not a feature flag: "" in both wrangler files. The logged switch record is a later slice. */
export const aiPathPersonas = { 'ai-news': (nationId: string) => `${nationId}-news-desk`, 'cabinet-response': () => 'kindle-cabinet', 'town-hall': () => 'kindle-town-hall', debate: () => 'kindle-debate', rally: () => 'kindle-rally' } as const;
// Every Notable profile id (the live and wave-2 Notable rosters; kept in step by tests/ai-persona-mute-764) plus the path personas.
export const aiNotablePersonas = ['kindle-journalist', 'korund-chronicler', 'aurelle-courtier', 'kindle-union-organizer', 'kindle-emberball-owner', 'kindle-cartoonist', 'korund-brigade-leader', 'korund-canteen-cook', 'korund-veteran-builder', 'aurelle-guild-master', 'aurelle-hearth-keeper', 'aurelle-landless-knight', 'confluence-cooperative-manager', 'confluence-almoner', 'confluence-faith-registrar', 'confluence-canal-captain', 'confluence-local-editor', 'confluence-party-cadre', 'hoarvale-coalition-whip', 'hoarvale-board-observer', 'hoarvale-mint-economist', 'hoarvale-bathhouse-keeper', 'hoarvale-sketch-comedian', 'hoarvale-crown-herald'] as const;
export const aiMutablePersonas: readonly string[] = [...aiNotablePersonas, ...aiTemplatesOnlyNations.map(n => aiPathPersonas['ai-news'](n)), 'kindle-cabinet', 'kindle-town-hall', 'kindle-debate', 'kindle-rally'];
export type AiMutedPersonasEnv = { HARIMU_AI_MUTED_PERSONAS?: unknown };
export function aiMutedPersonasMode(raw: unknown): AiTemplatesOnlyMode {
  if (raw === undefined || raw === null) return 'off';
  if (typeof raw !== 'string') return 'all';
  const value = raw.trim().toLowerCase();
  if (value === '') return 'off';
  if (value === 'all') return 'all';
  const ids = value.split(',').map(id => id.trim());
  if (ids.some(id => !aiMutablePersonas.includes(id))) return 'all';
  return [...new Set(ids)];
}
/** True when this persona's narrative output is muted. */
export function aiPersonaMuted(env: AiMutedPersonasEnv | null | undefined, personaId: string | null | undefined): boolean {
  const mode = aiMutedPersonasMode(env?.HARIMU_AI_MUTED_PERSONAS);
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  return typeof personaId === 'string' && mode.includes(personaId);
}
const lastMuteLogged = new Map<string, number>();
/** Check and log in one step: path and persona id only, never user data, once per path and persona per minute. */
export function skipForMutedPersona(path: AiNarrativePath, env: AiMutedPersonasEnv | null | undefined, personaId: string, now: number) {
  if (!aiPersonaMuted(env, personaId)) return false;
  const key = `${path}:${personaId}`, bucket = Math.floor((Number.isFinite(now) ? now : 0) / aiTemplatesOnlyLogSeconds);
  if (lastMuteLogged.get(key) !== bucket) { lastMuteLogged.set(key, bucket); console.info(`[ai-kill-switch] persona muted: path=${path} persona=${personaId}`); }
  return true;
}
