import type { SceneView } from './scene-navigation';

/**
 * Morning brief (#42). Sections whose data source is not built yet stay off
 * and are hidden, never rendered empty: news (#22), petitions (#20) and
 * ballots (#25). Flip a flag once its feature ships and pass its items.
 * #73: news is on. Headlines come from the same /api/news edition as the News panel.
 */
export const morningBriefSources = { news: true, petitions: false, ballots: false } as const;

/** #73: a brief headline opens the News panel on that story. The panel listens for this window event. */
export const openNewsEvent = 'harimu:open-news';
export function requestOpenNews(id: string, target: Pick<Window, 'dispatchEvent'> | undefined = typeof window === 'undefined' ? undefined : window) {
  target?.dispatchEvent(new CustomEvent(openNewsEvent, { detail: { id } }));
}

/** #73: brief headlines keep the /api/news provenance so model-written items carry the same label as the News panel (AiTextTag). */
export type MorningBriefHeadline = { id: string; title: string; source?: string; kind?: string };
export const AI_GENERATED_LABEL = 'AI-generated';
export function headlineDetail(h: Pick<MorningBriefHeadline, 'source'>): string {
  return h.source === 'model' ? `${AI_GENERATED_LABEL} · Read in the news feed` : 'Read in the news feed';
}

export type MorningBriefItem = { id: string; label: string; detail: string; target: SceneView; newsId?: string };
export type MorningBriefSection = { id: 'news' | 'leader' | 'needs' | 'notifications'; title: string; items: MorningBriefItem[] };

export type MorningBriefInput = {
  food?: number;
  capacity: number;
  maxCapacity?: number;
  shift?: { title: string; endsAt: number } | null;
  now: number;
  leaderOrder?: { title: string; reason: string } | null;
  headlines?: MorningBriefHeadline[];
  petitions?: { id: string; title: string }[];
  ballots?: { id: string; title: string }[];
  /** #413: the citizen's nation picks the food and shift wording. Unset or any other nation keeps Kindle's wording. */
  nationId?: string;
  /** #413: marketVisible(nationId, flag). False only hides Kindle's market wording; Korund's State store and Aurelle's counter stay. Defaults to true. */
  marketOpen?: boolean;
};

/** #413: the Needs lines per nation. Wording follows each nation's starter copy (lib/starter-copy.ts) and its own food counter:
 * Korund redeems ration coupons at the State store, Aurelle buys at the chartered food counter. Both counters live on the market tab. */
type NeedsCopy = { food: string; finished: string; underway: string; none: string };
const kindleNeeds: NeedsCopy = { food: 'Household food · buy or eat at the market', finished: 'Shift finished · collect at the work board', underway: 'Shift underway', none: 'Choose a shift at the work board' };
const nationNeeds: Readonly<Record<string, NeedsCopy>> = {
  korund: { food: 'Household food · redeem ration coupons at the State store', finished: 'Shift finished · record your output and collect your Labor Notes in Work', underway: 'Shift underway · your brigade is at work', none: 'Report to your brigade in Work for your assigned shift' },
  aurelle: { food: 'Household food · buy at the chartered food counter', finished: 'Service finished · receive your Crowns in Work', underway: 'Service underway', none: 'Enter royal estate service in Work' },
};
/** #365: while the market flag is off Kindle has no market tab; the starter merchant is in the City daily loop. */
const kindleMarketOffFood = 'Household food · buy from the starter merchant in your daily loop';

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
  if (headlines.length) sections.push({ id: 'news', title: 'Headlines', items: headlines.map(h => ({ id: `news:${h.id}`, label: h.title, detail: headlineDetail(h), target: 'square' as SceneView, newsId: h.id })) });
  if (input.leaderOrder) sections.push({ id: 'leader', title: "Leader's latest order", items: [{ id: 'leader', label: input.leaderOrder.title, detail: input.leaderOrder.reason, target: 'government' }] });
  const needs: MorningBriefItem[] = [];
  const copy = (input.nationId && nationNeeds[input.nationId]) || kindleNeeds;
  const marketOff = copy === kindleNeeds && input.marketOpen === false;
  if (input.food !== undefined) needs.push({ id: 'food', label: `${input.food} food`, detail: marketOff ? kindleMarketOffFood : copy.food, target: marketOff ? 'square' : 'market' });
  needs.push({ id: 'wc', label: `${input.capacity} / ${input.maxCapacity ?? 24} WC`, detail: 'Work capacity · meals restore it', target: 'household' });
  if (input.shift) needs.push({ id: 'shift', label: input.shift.title, detail: input.now >= input.shift.endsAt * 1000 ? copy.finished : copy.underway, target: 'workplace' });
  else needs.push({ id: 'shift', label: 'No active shift', detail: copy.none, target: 'workplace' });
  sections.push({ id: 'needs', title: 'Your needs', items: needs });
  const notices: MorningBriefItem[] = [
    ...(sources.petitions ? (input.petitions ?? []).map(p => ({ id: `petition:${p.id}`, label: p.title, detail: 'Open petition', target: 'government' as SceneView })) : []),
    ...(sources.ballots ? (input.ballots ?? []).map(b => ({ id: `ballot:${b.id}`, label: b.title, detail: 'Ballot open', target: 'government' as SceneView })) : []),
  ];
  if (notices.length) sections.push({ id: 'notifications', title: 'Notifications', items: notices });
  return sections;
}

/** Auto-open at most once per real day: the day is recorded when the brief is shown, not only when dismissed,
 *  so reloading the page does not re-open it. Storage failures fail closed (no auto-open loop). */
export function claimDailyBrief(storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined, key: string, now: number): boolean {
  try {
    if (!storage || !shouldAutoOpenBrief(storage.getItem(key), now)) return false;
    storage.setItem(key, briefDayKey(now));
    return true;
  } catch { return false; }
}
