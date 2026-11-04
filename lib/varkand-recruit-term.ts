/** #1095: Varkand National Service on the citizen read. A new citizen's first 7 real days are a recruit term
 *  (docs: Varkand, Economy). Pure: uses created_at already on the citizen row. The 14-day conscription
 *  shield in lib/army-conscription.ts is unchanged. */
export const RECRUIT_TERM_DAYS = 7;
const DAY_MS = 86_400_000;
export const RECRUIT_TERM_MS = RECRUIT_TERM_DAYS * DAY_MS;

export type VarkandRecruitTerm = { active: boolean; endsAt: number };
type RecruitCitizen = { nation_id?: string | null; created_at?: string | null } | null | undefined;

/** Active on [created_at, created_at + 7 real days). endsAt is that end, in integer ms. Other nations return null. */
export function varkandRecruitTerm(citizen: RecruitCitizen, nowMs: number): VarkandRecruitTerm | null {
  if (!citizen || citizen.nation_id !== 'varkand') return null;
  if (typeof citizen.created_at !== 'string' || !Number.isSafeInteger(nowMs)) return null;
  const created = Date.parse(citizen.created_at);
  if (!Number.isSafeInteger(created)) return null;
  const endsAt = created + RECRUIT_TERM_MS;
  if (!Number.isSafeInteger(endsAt)) return null;
  return { active: nowMs >= created && nowMs < endsAt, endsAt };
}
