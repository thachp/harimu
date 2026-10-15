/** #375: Korund and Aurelle city noticeboards must never show Kindle stories; Kindle still shows its own. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { noticeboardEvents, noticeboardNation } from '../lib/noticeboard.ts';

const kindleSeeds = ['Capacity grant closes', 'District assembly session', 'Trade corridor vote'];
const fallback = [{ id: 1, kind: 'Work', headline: 'Example: harvest sign-up deadline', location: 'Forgehaven' }, { id: 2, kind: 'Civic', headline: 'District assembly session', location: 'Forgehaven East' }, { id: 3, kind: 'Ballot', headline: 'Trade corridor vote', location: 'Kindle Assembly' }];

test('pure rule: Kindle stories belong to Kindle, Court Gazette entries to Aurelle, Korund has none', () => {
  const gazette = { id: 9, kind: 'court-gazette', headline: 'Rising', location: 'Aurelle' };
  const all = [...fallback, gazette];
  assert.deepEqual(noticeboardEvents(all, 'korund'), [], 'Korund shows no Kindle story');
  assert.deepEqual(noticeboardEvents(all, 'aurelle'), [gazette], 'Aurelle shows only its own gazette');
  assert.deepEqual(noticeboardEvents(all, 'kindle').map(e => e.id), [1, 2, 3], 'Kindle keeps its own stories, in order');
  assert.deepEqual(noticeboardEvents(fallback, 'aurelle'), [], 'the page fallback is Kindle-only too');
  assert.deepEqual(noticeboardEvents(all, 'varkand'), []); assert.deepEqual(noticeboardEvents([], 'kindle'), []);
  assert.equal(noticeboardNation(gazette), 'aurelle'); assert.equal(noticeboardNation(fallback[0]), 'kindle');
});

test('the real /api/world events: seeded stories reach only Kindle; a Court Gazette entry reaches only Aurelle', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("INSERT INTO world_events (kind, headline, detail, location, occurred_at, sort_order) VALUES ('court-gazette','Gazette test','Aurelle only','Aurelle','Today',10)").run();
  const world = await r.call('world', null); assert.equal(world.status, 200);
  const events = world.data.worldEvents;
  for (const title of kindleSeeds) assert.ok(events.some(e => e.headline === title), `the seeded story "${title}" is in the shared feed`);
  const heads = nation => noticeboardEvents(events, nation).map(e => e.headline);
  assert.deepEqual(heads('kindle'), kindleSeeds);
  assert.deepEqual(heads('korund'), [], 'Korund noticeboard: no stories');
  assert.deepEqual(heads('aurelle'), ['Gazette test'], 'Aurelle noticeboard: its own gazette only');
  for (const nation of ['korund', 'aurelle']) for (const e of noticeboardEvents(events, nation)) assert.doesNotMatch(`${e.headline} ${e.detail} ${e.location}`, /Kindle|Forgehaven|Trade corridor|waterworks/i, nation);
});

test('the city noticeboard in app/page.tsx is fed through the nation filter, never the raw feed', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<SceneNews events=\{noticeboardEvents\(worldEvents, selected\.id\)\} title="City noticeboard" \/>/);
  assert.doesNotMatch(page, /<SceneNews events=\{worldEvents\}/);
});
