/** #1130: Fulmara non-election shareholder resolutions (docs §7.10, §8.17, §9.8).
 *  Pure: a posted register, no database, so no migration. This read does not cast a vote, list holders, or open a proxy.
 *  [ASSUMPTION] The register is the docs example of 1,000 Charter Shares. Totals are shares, not people, and only human
 *  holders are counted (AI-held shares cast no ballot). A row's for + against + abstain is at most the register.
 *  [ASSUMPTION] Status is open while the tally is still being taken. A closed ordinary resolution is carried when for
 *  is greater than against, and lost otherwise. A closed share issue is carried only when for is at least 2/3 of
 *  for + against (docs §7.10). Abstain is recorded and does not count toward either majority. Ties are lost.
 *  [ASSUMPTION] The four rows are a fixed public sample (one charter, one share issue, one reserve rule, one alliance).
 *  They do not move with the clock. */
export const FULMARA_SHARE_REGISTER = 1000;
export type FulmaraResolutionStatus = 'open' | 'carried' | 'lost';
export type FulmaraShareTotals = { for: number; against: number; abstain: number };
export type FulmaraResolution = { id: string; title: string; status: FulmaraResolutionStatus; shares: FulmaraShareTotals };
type FulmaraResolutionKind = 'charter' | 'share_issue' | 'reserve_rule' | 'alliance';

const posted: readonly { id: string; title: string; kind: FulmaraResolutionKind; open: boolean; shares: FulmaraShareTotals }[] = [
  { id: 'fulmara-kindle-convoy', title: 'Route charter: Kindle convoy', kind: 'charter', open: true, shares: { for: 420, against: 180, abstain: 40 } },
  { id: 'fulmara-arc-share-issue', title: 'Share issue: Arc Exchange expansion', kind: 'share_issue', open: true, shares: { for: 610, against: 240, abstain: 30 } },
  { id: 'fulmara-reserve-band', title: 'Reserve rule: Bank of the Arc band', kind: 'reserve_rule', open: false, shares: { for: 640, against: 210, abstain: 50 } },
  { id: 'fulmara-meridian-compact', title: 'Alliance: trade compact with Meridian', kind: 'alliance', open: false, shares: { for: 280, against: 510, abstain: 70 } },
];

/** Closed share issues use integer 2/3 (for * 3 >= cast * 2). Ordinary business uses a strict majority of for over against. */
export function fulmaraResolutionStatus(open: boolean, kind: FulmaraResolutionKind, shares: FulmaraShareTotals): FulmaraResolutionStatus {
  if (open) return 'open';
  const cast = shares.for + shares.against;
  if (cast <= 0) return 'lost';
  const carried = kind === 'share_issue' ? shares.for * 3 >= cast * 2 : shares.for > shares.against;
  return carried ? 'carried' : 'lost';
}

/** A fresh list, so a caller cannot change the posted register. */
export function fulmaraResolutions(): FulmaraResolution[] {
  return posted.map(row => ({
    id: row.id, title: row.title, status: fulmaraResolutionStatus(row.open, row.kind, row.shares),
    shares: { for: row.shares.for, against: row.shares.against, abstain: row.shares.abstain },
  }));
}
