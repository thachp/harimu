import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefDayKey, morningBriefSections, shouldAutoOpenBrief, morningBriefSources, openNewsEvent, requestOpenNews, AI_GENERATED_LABEL, headlineDetail } from '../lib/morning-brief.ts';

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
test('#73 model-written headlines carry the AI-generated label the News panel uses; others do not', async () => {
  const { readFile } = await import('node:fs/promises');
  const disclosure = await readFile(new URL('../app/ai-disclosure.tsx', import.meta.url), 'utf8');
  assert.match(disclosure, new RegExp(`provenance==='model'\\?'${AI_GENERATED_LABEL}'`), 'same text as AiTextTag');
  const news = morningBriefSections({ capacity: 24, now, headlines: [
    { id: 'kindle:ai:1', title: 'Model story', source: 'model', kind: 'report' },
    { id: 'kindle:work:1', title: 'Rule story', source: 'rules', kind: 'template' },
    { id: 'kindle:sys:1', title: 'System story', source: 'system' },
  ] }).find(x => x.id === 'news');
  assert.match(news.items[0].detail, /^AI-generated · /);
  assert.doesNotMatch(news.items[1].detail, /AI-generated/);
  assert.doesNotMatch(news.items[2].detail, /AI-generated/);
  assert.equal(headlineDetail({}), 'Read in the news feed');
});

// #413: nation-aware food and shift lines. Kindle's wording is unchanged.
const needsOf = (input) => morningBriefSections({ capacity: 12, now, food: 2, ...input }).find(x => x.id === 'needs').items;
const detail = (items, id) => items.find(i => i.id === id).detail;
const finished = { title: 'Brigade shift', endsAt: now / 1000 - 1 }, underway = { title: 'Brigade shift', endsAt: now / 1000 + 600 };
test('#413 Kindle keeps the market and work board wording', () => {
  for (const input of [{}, { nationId: 'kindle' }, { nationId: 'kindle', marketOpen: true }]) {
    assert.equal(detail(needsOf(input), 'food'), 'Household food · buy or eat at the market');
    assert.equal(needsOf(input).find(i => i.id === 'food').target, 'market');
    assert.equal(detail(needsOf({ ...input, shift: finished }), 'shift'), 'Shift finished · collect at the work board');
    assert.equal(detail(needsOf({ ...input, shift: underway }), 'shift'), 'Shift underway');
    assert.equal(detail(needsOf(input), 'shift'), 'Choose a shift at the work board');
  }
});
test('#413 Kindle with the market flag off no longer sends the citizen to a market', () => {
  const food = needsOf({ nationId: 'kindle', marketOpen: false }).find(i => i.id === 'food');
  assert.doesNotMatch(food.detail, /market/i); assert.equal(food.target, 'square');
});
test('#413 Korund brief names the State store, ration coupons, brigade and Labor Notes, never the market or work board', () => {
  const lines = [needsOf({ nationId: 'korund' }), needsOf({ nationId: 'korund', shift: finished }), needsOf({ nationId: 'korund', shift: underway })].flat();
  assert.equal(detail(needsOf({ nationId: 'korund' }), 'food'), 'Household food · redeem ration coupons at the State store');
  assert.equal(needsOf({ nationId: 'korund' }).find(i => i.id === 'food').target, 'market', 'the State store lives on the market tab');
  assert.match(detail(needsOf({ nationId: 'korund' }), 'shift'), /brigade/);
  assert.match(detail(needsOf({ nationId: 'korund', shift: finished }), 'shift'), /Labor Notes/);
  assert.match(detail(needsOf({ nationId: 'korund', shift: underway }), 'shift'), /underway/);
  for (const item of lines) assert.doesNotMatch(item.detail, /at the market|work board/i);
  assert.equal(needsOf({ nationId: 'korund', marketOpen: false }).find(i => i.id === 'food').target, 'market', 'Korund keeps its State store when the flag is off');
});
test('#413 Aurelle brief names the chartered food counter, service and Crowns, never the market or work board', () => {
  const lines = [needsOf({ nationId: 'aurelle' }), needsOf({ nationId: 'aurelle', shift: finished }), needsOf({ nationId: 'aurelle', shift: underway })].flat();
  assert.equal(detail(needsOf({ nationId: 'aurelle' }), 'food'), 'Household food · buy at the chartered food counter');
  assert.equal(needsOf({ nationId: 'aurelle' }).find(i => i.id === 'food').target, 'market', 'the chartered counter lives on the market tab');
  assert.match(detail(needsOf({ nationId: 'aurelle' }), 'shift'), /royal estate service/);
  assert.match(detail(needsOf({ nationId: 'aurelle', shift: finished }), 'shift'), /Crowns/);
  for (const item of lines) assert.doesNotMatch(item.detail, /at the market|work board/i);
  assert.equal(needsOf({ nationId: 'aurelle', marketOpen: false }).find(i => i.id === 'food').target, 'market');
});
test('#413 page.tsx passes the citizen nation and market visibility to the brief', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /morningBriefSections\(\{[^}]*nationId: citizenNation\.id, marketOpen: marketShown/);
});
