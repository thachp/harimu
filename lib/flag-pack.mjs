/** #988: related boolean flags share one JSON binding so the Worker stays under Cloudflare's 128 text-binding limit
 *  (error 10055: secrets + plain text). A direct env.HARIMU_* string still wins, so tests and a leftover binding keep working.
 *  The pack is read only when that name is absent. A bad pack fails closed (the flag is off). */
export const FLAG_PACKS = {
  HARIMU_GRAY_PACK: [
    'HARIMU_GRAY_MARKET_ENABLED', 'HARIMU_GRAY_DAILY_CAP_ENABLED', 'HARIMU_GRAY_SUSPICION_ENABLED', 'HARIMU_GRAY_SEIZURE_ENABLED', 'HARIMU_GRAY_RATION_RISE_ENABLED',
    'HARIMU_KORUND_MEDALS_ENABLED', 'HARIMU_KORUND_STANDING_ENABLED', 'HARIMU_KORUND_SHORTFALL_ENABLED', 'HARIMU_KORUND_PLAN_STATS_ENABLED', 'HARIMU_WALLET_STREET_RATE_ENABLED', 'HARIMU_KORUND_RATION_CUT_ENABLED', 'HARIMU_KORUND_RATION_STABILITY_ENABLED', 'HARIMU_KORUND_STABILITY_RECOVERY_ENABLED',
    'HARIMU_LABOR_BUREAU_ENABLED', 'HARIMU_INTERNAL_PERMIT_ENABLED', 'HARIMU_SAVINGS_SHIELD_ENABLED',
  ],
  HARIMU_ARMY_PACK: ['HARIMU_ARMIES_ENABLED', 'HARIMU_ARMY_DRILLS_ENABLED', 'HARIMU_ARMY_MAP_ENABLED', 'HARIMU_ARMY_SUPPLY_ENABLED', 'HARIMU_ARMY_BATTLES_ENABLED'],
};
export const isFlagPackName = name => Object.prototype.hasOwnProperty.call(FLAG_PACKS, name);

function packRecord(raw) {
  const value = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
/** Direct string first, then the first pack that names the flag. */
export function flagValue(env, name) {
  if (!env || typeof env !== 'object') return undefined;
  if (typeof env[name] === 'string') return env[name];
  for (const packName of Object.keys(FLAG_PACKS)) {
    const packed = packRecord(env[packName]);
    if (packed && typeof packed[name] === 'string') return packed[name];
  }
  return undefined;
}
export const flagOn = (env, name) => flagValue(env, name) === 'true';

/** Flat string vars: pack keys are expanded and the pack binding itself is not a flag. */
export function expandFlagPacks(vars) {
  const out = {};
  for (const [name, value] of Object.entries(vars ?? {})) {
    if (isFlagPackName(name)) { const packed = packRecord(value); if (packed) for (const [flag, flagVal] of Object.entries(packed)) if (typeof flagVal === 'string') out[flag] = flagVal; }
    else if (typeof value === 'string') out[name] = value;
  }
  return out;
}
/** null when the pack is exactly the registered flags, each "true" or "false". */
export function flagPackProblems(name, value, rule = {}) {
  if (!isFlagPackName(name)) return 'is not a flag pack';
  const packed = packRecord(value);
  if (!packed) return 'must be a JSON object of "true"/"false" flags';
  const expected = [...FLAG_PACKS[name]].sort(), found = Object.keys(packed).sort();
  if (expected.join() !== found.join()) return `flags must be exactly ${expected.join(', ')}`;
  for (const flag of expected) {
    const flagValue = packed[flag];
    if (flagValue !== 'true' && flagValue !== 'false') return `${flag} must be "true" or "false"`;
    if (rule.allFalse && flagValue !== 'false') return `${flag} must be "false" on production`;
    if (rule.allTrue && flagValue !== 'true') return `${flag} must be "true" in preview`;
  }
  return null;
}
/** Spawn env values must be strings. A JSON pack is passed through as text for the build; the Worker still receives the binding. */
export function varsForProcessEnv(vars) {
  return Object.fromEntries(Object.entries(vars).map(([name, value]) => [name, typeof value === 'string' ? value : JSON.stringify(value)]));
}
