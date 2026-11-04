/** #1082: Varkand stamped dispatches and the Alert Level banner (docs §23.2).
 *  NEXT_PUBLIC_HARIMU_VARKAND_DISPATCH is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off.
 *  #1081: with HARIMU_VARKAND_ALERT_ENABLED on, GET /api/world puts the stored Directorate level on the Varkand
 *  nation read as `alertLevel` (the same row the #992 permit check reads). A missing field or anything else is Green. */
export type VarkandAlertLevel = 'green' | 'amber' | 'red';

export function varkandDispatchFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_VARKAND_DISPATCH; }
  catch { return undefined; }
}
export function varkandDispatchEnabled(value: string | undefined = varkandDispatchFlag()): boolean {
  return value === 'true';
}

/** A nation read (`{ alertLevel }`) or the raw field. Absent and unknown values are Green. */
export function varkandAlertLevel(read: unknown): VarkandAlertLevel {
  const level = read !== null && typeof read === 'object' && 'alertLevel' in read ? (read as { alertLevel?: unknown }).alertLevel : read;
  return level === 'amber' || level === 'red' || level === 'green' ? level : 'green';
}

export const varkandAlertName: Readonly<Record<VarkandAlertLevel, string>> = { green: 'Green', amber: 'Amber', red: 'Red' };

/** The clause for each level, from the Varkand docs Freedoms row (Green / Amber / Red). */
export const varkandAlertMeaning: Readonly<Record<VarkandAlertLevel, string>> = {
  green: 'Licensed press, civilian dress, internal passes rarely checked.',
  amber: 'Checkpoints, curfew in game-night hours for public squares, censorship.',
  red: 'Martial law, information fog for foreign news, movement by order only.',
};
