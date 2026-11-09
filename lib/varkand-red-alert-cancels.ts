/** #1220: docs §7.8 Holidays & festivals — "Celebrations are canceled at Red Alert."
 *  Pure. The Alert Level is the only input. Green and Amber are not a cancellation.
 *  Dates stay on the holiday helpers, which take nowMs only and store the next date.
 *  Lantern Watch has no government row on this commit. The Mandate Plebiscite is not marked. */
export function varkandCelebrationsCanceled(level: string | null | undefined): boolean {
  return level === 'red';
}
