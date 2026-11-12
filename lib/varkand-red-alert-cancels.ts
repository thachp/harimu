/** #1220: docs §7.8 Holidays & festivals — "Celebrations are canceled at Red Alert."
 *  Pure. The Alert Level is the only input. Green and Amber are not a cancellation.
 *  Dates stay on the holiday helpers, which take nowMs only and store the next date.
 *  Muster Day, Rotation Day, and Lantern Watch are the celebration rows. The Mandate Plebiscite is not marked.
 *  #1239: the atlas nextFestival skips these same celebration names while Red holds.
 *  #1400: player-facing surfaces omit the upcoming celebration and its date while those rows are canceled.
 *  Dates still stay on withVarkandRedAlertCancels and the holiday helpers. */
export const VARKAND_CANCELED_CELEBRATION_NAMES = ['Muster Day', 'Rotation Day', 'Lantern Watch'] as const;

export function varkandCelebrationsCanceled(level: string | null | undefined): boolean {
  return level === 'red';
}

/** Atlas nextFestival names to skip while celebrations are canceled. Empty when the level is not Red. */
export function varkandAtlasCanceledFestivalNames(level: string | null | undefined): readonly (typeof VARKAND_CANCELED_CELEBRATION_NAMES)[number][] {
  return varkandCelebrationsCanceled(level) ? VARKAND_CANCELED_CELEBRATION_NAMES : [];
}

const CELEBRATION_KEYS = ['musterDay', 'rotationDay', 'lanternWatch'] as const;

/** Player-facing government read: drop canceled celebration keys (no upcoming celebration, no date).
 *  Same object when nothing is marked canceled. The Mandate Plebiscite is left in place. */
export function varkandPlayerFacingCelebrations<T extends { [K in typeof CELEBRATION_KEYS[number]]?: { canceled?: true } }>(snapshot: T): T {
  if (!CELEBRATION_KEYS.some(key => snapshot[key]?.canceled === true)) return snapshot;
  const next = { ...snapshot };
  for (const key of CELEBRATION_KEYS) if (next[key]?.canceled === true) delete next[key];
  return next;
}

/** #1285 Varkand host note: omit both keys while the #1220 gate holds (cancels flag, alert flag, stored Red). */
export function varkandFestivalHostFields<T extends object>(
  nationId: string,
  fields: T,
  level: string | null | undefined,
  cancelsEnabled: boolean,
  alertEnabled: boolean,
): T | Record<string, never> {
  if (nationId !== 'varkand' || !cancelsEnabled || !alertEnabled || !varkandCelebrationsCanceled(level)) return fields;
  return {};
}
