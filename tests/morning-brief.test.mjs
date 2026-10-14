import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefDayKey, morningBriefSections, shouldAutoOpenBrief, morningBriefSources, openNewsEvent, requestOpenNews } from '../lib/morning-brief.ts';

const now = new Date(2026, 9, 14, 8, 0).getTime();
test('brief auto-opens once per real day', () => {
  assert.equal(shouldAutoOpenBrief(null, now), true);
  assert.equal(shouldAutoOpenBrief(briefDayKey(now), now + 3600_000), false);
  assert.equal(shouldAutoOpenBrief(briefDayKey(now), now + 24 * 3600_000), true);
});
test('needs mirror top bar food, WC and shift and link to action screens', () => {
  const s = morningBriefSections({ food: 3, capacity: 12, now, shift: { title: 'Harvest', endsAt: now / 1000 - 1 } });
  const needs = s.find(x => x.id === 'needs');
  assert.deepEqual(needs.items.map(i => [i.label, i.target]), [['3 food', 'market'], ['12 / 24 WC', 'household'], ['Harvest', 'workplace']]);
  assert.match(needs.items[2].detail, /collect/);
});
test('#73 headlines are on by default; petitions (#20) and ballots (#25) stay hidden', () => {
  assert.deepEqual(morningBriefSources, { news: true, petitions: false, ballots: false });
  const s = morningBriefSections({ capacity: 24, now, headlines: [{ id: 'a', title: 'x' }], petitions: [{ id: 'p', title: 'y' }], ballots: [{ id: 'b', title: 'z' }] });
  assert.deepEqual(s.map(x => x.id), ['news', 'needs']);
});
test('#73 up to 3 headlines, each opening that news item; empty editions hide the section', () => {
  for (const nation of ['kindle', 'korund', 'aurelle']) {
    const headlines = [1, 2, 3, 4, 5].map(i => ({ id: `${nation}:work:${i}`, title: `${nation} ${i}` }));
    const news = morningBriefSections({ capacity: 24, now, headlines }).find(x => x.id === 'news');
    assert.deepEqual(news.items.map(i => i.newsId), headlines.slice(0, 3).map(h => h.id), nation);
  }
  assert.deepEqual(morningBriefSections({ capacity: 24, now, headlines: [] }).map(x => x.id), ['needs'], 'no empty placeholder');
  assert.deepEqual(morningBriefSections({ capacity: 24, now }).map(x => x.id), ['needs']);
  const events = []; requestOpenNews('kindle:work:1', { dispatchEvent: e => { events.push(e); return true; } });
  assert.equal(events[0].type, openNewsEvent); assert.deepEqual(events[0].detail, { id: 'kindle:work:1' });
});
test('sections with data render; empty ones are hidden; headlines capped at 3', () => {
  const on = { news: true, petitions: true, ballots: true };
  const s = morningBriefSections({ capacity: 5, now, leaderOrder: { title: 'Fund waterworks', reason: 'r' }, headlines: [1, 2, 3, 4].map(i => ({ id: String(i), title: `h${i}` })), petitions: [] , ballots: [{ id: 'b', title: 'Election' }] }, on);
  assert.deepEqual(s.map(x => x.id), ['news', 'leader', 'needs', 'notifications']);
  assert.equal(s[0].items.length, 3);
  assert.equal(s[1].items[0].target, 'government');
  assert.deepEqual(morningBriefSections({ capacity: 5, now }, on).map(x => x.id), ['needs']);
});
