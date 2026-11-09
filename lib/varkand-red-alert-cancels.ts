/** #1220: docs §7.8 Holidays & festivals — "Celebrations are canceled at Red Alert."
 *  Pure. The Alert Level is the only input. Green and Amber are not a cancellation.
 *  Dates stay on the holiday helpers, which take nowMs only and store the next date.
 *  Muster Day, Rotation Day, and Lantern Watch are the celebration rows. The Mandate Plebiscite is not marked.
 *  #1239: the atlas nextFestival skips these same celebration names while Red holds. */
export const VARKAND_CANCELED_CELEBRATION_NAMES = ['Muster Day', 'Rotation Day', 'Lantern Watch'] as const;

export function varkandCelebrationsCanceled(level: string | null | undefined): boolean {
  return level === 'red';
}

/** Atlas nextFestival names to skip while celebrations are canceled. Empty when the level is not Red. */
export function varkandAtlasCanceledFestivalNames(level: string | null | undefined): readonly (typeof VARKAND_CANCELED_CELEBRATION_NAMES)[number][] {
  return varkandCelebrationsCanceled(level) ? VARKAND_CANCELED_CELEBRATION_NAMES : [];
}
