import type { SceneView } from './scene-navigation';

/**
 * Morning brief (#42). Sections whose data source is not built yet stay off
 * and are hidden, never rendered empty: news (#22), petitions (#20) and
 * ballots (#25). Flip a flag once its feature ships and pass its items.
 */
export const morningBriefSources = { news: false, petitions: false, ballots: false } as const;

export type MorningBriefItem = { id: string; label: string; detail: string; target: SceneView };
export type MorningBriefSection = { id: 'news' | 'leader' | 'needs' | 'notifications'; title: string; items: MorningBriefItem[] };

export type MorningBriefInput = {
  food?: number;
  capacity: number;
  maxCapacity?: number;
  shift?: { title: string; endsAt: number } | null;
  now: number;
  leaderOrder?: { title: string; reason: string } | null;
  headlines?: { id: string; title: string }[];
  petitions?: { id: string; title: string }[];
  ballots?: { id: string; title: string }[];
};

/** Local calendar day used for the once-per-real-day rule. */
export function briefDayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shouldAutoOpenBrief(lastSeenDay: string | null, now: number): boolean {
  return lastSeenDay !== briefDayKey(now);
}

export function morningBriefSections(input: MorningBriefInput, sources: { news: boolean; petitions: boolean; ballots: boolean } = morningBriefSources): MorningBriefSection[] {
  const sections: MorningBriefSection[] = [];
  const headlines = sources.news ? (input.headlines ?? []).slice(0, 3) : [];
  if (headlines.length) sections.push({ id: 'news', title: 'Headlines', items: headlines.map(h => ({ id: `news:${h.id}`, label: h.title, detail: 'Read in the news feed', target: 'square' })) });
  if (input.leaderOrder) sections.push({ id: 'leader', title: "Leader's latest order", items: [{ id: 'leader', label: input.leaderOrder.title, detail: input.leaderOrder.reason, target: 'government' }] });
  const needs: MorningBriefItem[] = [];
  if (input.food !== undefined) needs.push({ id: 'food', label: `${input.food} food`, detail: 'Household food · buy or eat at the market', target: 'market' });
  needs.push({ id: 'wc', label: `${input.capacity} / ${input.maxCapacity ?? 24} WC`, detail: 'Work capacity · meals restore it', target: 'household' });
  if (input.shift) needs.push({ id: 'shift', label: input.shift.title, detail: input.now >= input.shift.endsAt * 1000 ? 'Shift finished · collect at the work board' : 'Shift underway', target: 'workplace' });
  else needs.push({ id: 'shift', label: 'No active shift', detail: 'Choose a shift at the work board', target: 'workplace' });
  sections.push({ id: 'needs', title: 'Your needs', items: needs });
  const notices: MorningBriefItem[] = [
    ...(sources.petitions ? (input.petitions ?? []).map(p => ({ id: `petition:${p.id}`, label: p.title, detail: 'Open petition', target: 'government' as SceneView })) : []),
    ...(sources.ballots ? (input.ballots ?? []).map(b => ({ id: `ballot:${b.id}`, label: b.title, detail: 'Ballot open', target: 'government' as SceneView })) : []),
  ];
  if (notices.length) sections.push({ id: 'notifications', title: 'Notifications', items: notices });
  return sections;
}
