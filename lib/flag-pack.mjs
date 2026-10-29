/** #988: related boolean flags share one JSON binding so the Worker stays under Cloudflare's 128 text-binding limit
 *  (error 10055: secrets + plain text). A direct env.HARIMU_* string still wins, so tests and a leftover binding keep working.
 *  The pack is read only when that name is absent. A bad pack fails closed (the flag is off). */
export const FLAG_PACKS = {
  HARIMU_GRAY_PACK: [
    'HARIMU_GRAY_MARKET_ENABLED', 'HARIMU_GRAY_DAILY_CAP_ENABLED', 'HARIMU_GRAY_SUSPICION_ENABLED', 'HARIMU_GRAY_SEIZURE_ENABLED', 'HARIMU_GRAY_RATION_RISE_ENABLED',
    'HARIMU_KORUND_MEDALS_ENABLED', 'HARIMU_KORUND_STANDING_ENABLED', 'HARIMU_KORUND_SHORTFALL_ENABLED', 'HARIMU_KORUND_PLAN_STATS_ENABLED', 'HARIMU_WALLET_STREET_RATE_ENABLED', 'HARIMU_KORUND_TSR_VIEW_ENABLED', 'HARIMU_KORUND_RATION_CUT_ENABLED', 'HARIMU_KORUND_RATION_STABILITY_ENABLED', 'HARIMU_KORUND_STABILITY_RECOVERY_ENABLED',
    'HARIMU_LABOR_BUREAU_ENABLED', 'HARIMU_INTERNAL_PERMIT_ENABLED', 'HARIMU_SAVINGS_SHIELD_ENABLED', 'HARIMU_KINDLE_CERTIFICATION_ENABLED', 'HARIMU_SEASON_FARMING_ENABLED',
  ],
  HARIMU_ARMY_PACK: ['HARIMU_ARMIES_ENABLED', 'HARIMU_ARMY_DRILLS_ENABLED', 'HARIMU_ARMY_MAP_ENABLED', 'HARIMU_ARMY_SUPPLY_ENABLED', 'HARIMU_ARMY_BATTLES_ENABLED', 'HARIMU_WINTER_MARCH_ENABLED', 'HARIMU_WAR_PEACE_REVERT_ENABLED'], // #1054
  // #798: spa WC bonus sits with dev's city-pack keys. Founding stays its own var.
  HARIMU_CITY_PACK: [
    'HARIMU_CITY_TIER_GROWTH_ENABLED', 'HARIMU_CITY_TIER_UNLOCKS_ENABLED', 'HARIMU_CITY_TIER_FESTIVAL_NOTE_ENABLED',
    'HARIMU_CITY_SPECIALTY_NOTE_ENABLED', 'HARIMU_CITY_CAPTURE_NOTE_ENABLED', 'HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED', 'HARIMU_CITY_IMPORTS_NOTE_ENABLED', 'HARIMU_CITY_GOVERNOR_NOTE_ENABLED',
    'HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED', 'HARIMU_CITY_CAPTURE_HISTORY_ENABLED', 'HARIMU_SPA_WC_BONUS_ENABLED', 'HARIMU_SEASON_SEA_LANES_ENABLED', // #1034
  ],
  HARIMU_AURELLE_PACK: [
    'HARIMU_AURELLE_RISING_ENABLED',
    'HARIMU_AURELLE_COUP_ENABLED',
    'HARIMU_AURELLE_CHARTERS_ENABLED',
    'HARIMU_AURELLE_SUCCESSION_ENABLED',
    'HARIMU_CROWN_DEBASEMENT_ENABLED',
    'HARIMU_AURELLE_TSR_VIEW_ENABLED',
  ],
  // #1008/#1009/#1039/#1040/#1041/#1042: client UI flags. NEXT_PUBLIC_* names are inlined at build. HARIMU_WORLD_AGES_ENABLED is not: the server reads it with flagOn and sends it on GET /api/world. The pack is one Worker binding.
  HARIMU_UI_PACK: ['NEXT_PUBLIC_HARIMU_NATION_SKIN', 'NEXT_PUBLIC_HARIMU_WIRE_BYLINES', 'NEXT_PUBLIC_HARIMU_RARE_MARKER', 'NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET', 'NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS', 'NEXT_PUBLIC_HARIMU_ZONE_LEGEND', 'NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT', 'NEXT_PUBLIC_HARIMU_MOBILE_TOPDOWN_MAP', 'NEXT_PUBLIC_HARIMU_MOBILE_TWO_TAP', 'HARIMU_WORLD_AGES_ENABLED', 'NEXT_PUBLIC_HARIMU_CITIZEN_GAME_AGE'],
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
/** Spawn env values must be strings. A JSON pack is passed through as text for the build; the Worker still receives the binding.
 *  NEXT_PUBLIC_* names inside a pack are also copied out so the client bundle inlines them. A direct string binding wins.
 *  HARIMU_WORLD_AGES_ENABLED stays in the pack: the client does not inline it. */
export function varsForProcessEnv(vars) {
  const out = Object.fromEntries(Object.entries(vars).map(([name, value]) => [name, typeof value === 'string' ? value : JSON.stringify(value)]));
  for (const [name, value] of Object.entries(expandFlagPacks(vars))) if (name.startsWith('NEXT_PUBLIC_') && out[name] === undefined) out[name] = value;
  return out;
}
