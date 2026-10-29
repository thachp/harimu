/** #1040 (docs §23.2): phone shortcuts so start/claim, collect wage or rations, and the civic inbox ballot
 *  are on the home screen. Build flag NEXT_PUBLIC_HARIMU_MOBILE_TWO_TAP, a key of HARIMU_UI_PACK
 *  ("true" in preview, "false" in production). Only the exact string "true" enables it. */
export type TwoTapId = 'shift' | 'wage' | 'ballot';
export type TwoTapShift = { id: string; ready: boolean };
export function mobileTwoTapEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_MOBILE_TWO_TAP): boolean {
  return value === 'true';
}
/** Which existing action a shortcut runs. An underway shift is not started again; an unready wage opens Work. */
export function twoTapCommand(nationId: string, id: TwoTapId, shift: TwoTapShift | null) {
  if (id === 'ballot') return { kind: 'inbox' as const };
  if (id === 'wage' && nationId === 'korund') return { kind: 'korund' as const, action: 'korund-redeem-ration' as const };
  if (shift && !shift.ready) return { kind: 'open-work' as const };
  if (shift?.ready) {
    if (nationId === 'korund') return { kind: 'korund' as const, action: 'korund-claim-work' as const, shiftId: shift.id };
    if (nationId === 'aurelle') return { kind: 'aurelle' as const, action: 'aurelle-claim-work' as const, shiftId: shift.id };
    return { kind: 'claim' as const, shiftId: shift.id };
  }
  if (id === 'wage') return { kind: 'open-work' as const };
  if (nationId === 'korund') return { kind: 'korund' as const, action: 'korund-start-work' as const };
  if (nationId === 'aurelle') return { kind: 'aurelle' as const, action: 'aurelle-start-work' as const };
  return { kind: 'start' as const };
}
/** Visible label. The accessible name stays the same for every nation. */
export function twoTapButtons(nationId: string): { id: TwoTapId; label: string; ariaLabel: string }[] {
  return [
    { id: 'shift', label: 'Shift', ariaLabel: 'Start or claim shift' },
    { id: 'wage', label: nationId === 'korund' ? 'Rations' : 'Wages', ariaLabel: 'Collect wage or rations' },
    { id: 'ballot', label: 'Ballot', ariaLabel: 'Open civic inbox ballot' },
  ];
}
