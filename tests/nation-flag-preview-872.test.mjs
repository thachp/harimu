/** #872 (ARC ruling): a nation leaves Preview / Coming soon only when nationPlayable is true for that account, never on its HARIMU_<ID>_ENABLED flag alone.
 *  Today only Confluence qualifies; the six unbuilt nations stay Coming soon (and not enrollable) even with their flag on. Flags off: unchanged. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { nationIsPreview } from '../lib/nation-discovery.ts';

const live = ['kindle', 'korund', 'aurelle'], unbuilt = ['meridian', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'];
const qa = { HARIMU_QA_TEST_CITIZENS: 'true', NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_QA_TEST_CITIZEN_IDS: 'qa', HARIMU_NATION_READINESS_ENABLED: 'true' };
const allOn = Object.fromEntries(['confluence', ...unbuilt].map(id => [`HARIMU_${id.toUpperCase()}_ENABLED`, 'true']));
const setEnv = (r, vars) => { for (const [k, v] of Object.entries(vars)) r.setFixtureEnv(k, v); };

test('nationIsPreview: without an open list, exactly as before; with one, only listed nations leave Preview; safe as a .filter callback', () => {
  assert.deepEqual(['confluence', ...unbuilt].map(id => nationIsPreview(id)), Array(7).fill(true));
  for (const id of live) assert.equal(nationIsPreview(id), false);
  assert.equal(nationIsPreview('confluence', ['kindle', 'korund', 'aurelle', 'confluence']), false);
  assert.equal(nationIsPreview('meridian', ['kindle', 'korund', 'aurelle', 'confluence']), true);
  assert.equal(['confluence', 'meridian'].filter(nationIsPreview).length, 2, '.filter passes an index, not a list');
});

test('playableNationIds follows nationPlayable: flags off or no user = the live three; Confluence on + playable joins; unbuilt nations with flag on never do', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { playableNationIds, nationPlayable } = await r.importModule('lib/nation-openings.ts');
  assert.deepEqual([...playableNationIds()], live); assert.deepEqual([...playableNationIds(qa, 'qa')], live, 'flags off');
  assert.deepEqual([...playableNationIds({ ...qa, ...allOn })], live, 'no user: public answer unchanged');
  assert.deepEqual([...playableNationIds({ ...qa, ...allOn }, 'someone')], live, 'not an account that passes the gates');
  assert.deepEqual([...playableNationIds({ ...qa, ...allOn }, 'qa')], ['kindle', 'confluence', 'korund', 'aurelle'].filter(id => nationPlayable(id, { ...qa, ...allOn }, 'qa')));
  assert.ok(playableNationIds({ ...qa, ...allOn }, 'qa').includes('confluence'));
  for (const id of unbuilt) assert.ok(!playableNationIds({ ...qa, ...allOn }, 'qa').includes(id), `${id}: flag on but unbuilt`);
});

test('GET /api/citizen: openNations appears only when a flag-opened nation is playable for this account; unbuilt stay out; enroll agrees', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'qa', { action: 'enroll', nationId: 'kindle', expectedNationId: null });
  await r.call('citizen', 'pub', { action: 'enroll', nationId: 'kindle', expectedNationId: null });
  const before = (await r.call('citizen', 'qa')).data;
  assert.equal('openNations' in before, false, 'flags off: no field');
  setEnv(r, { ...qa, ...allOn });
  const on = (await r.call('citizen', 'qa')).data;
  assert.ok(on.openNations.includes('confluence')); for (const id of unbuilt) assert.ok(!on.openNations.includes(id), id);
  assert.equal('openNations' in (await r.call('citizen', 'pub')).data, false, 'a public account sees no change');
  for (const id of unbuilt) assert.equal((await r.call('citizen', 'qa', { action: 'enroll', nationId: id, expectedNationId: 'kindle' })).status, 403, `${id} not enrollable`);
  assert.equal((await r.call('citizen', 'qa', { action: 'enroll', nationId: 'confluence', expectedNationId: 'kindle' })).status, 200, 'Confluence enrollable');
});

test('wiring: strip badge, panel band, comparison table and Preview badge read openNations; /api/world stays public and flag-free', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /setOpenNations\(snapshot\.openNations\)/);
  assert.match(page, /badge: nation\.populationBand && !\(nation\.populationBand === 'coming-soon' && openNations\?\.includes\(nation\.id\)\)/);
  assert.match(page, /selected\.populationBand && !\(selected\.populationBand === 'coming-soon' && openNations\?\.includes\(selected\.id\)\)/);
  assert.match(page, /<NationComparison nations=\{worldNations\} openNations=\{openNations\} \/>/); assert.match(page, /<GameShell visitorSession=\{isVisitorSession\([^\n]*openNations=\{openNations\}/);
  assert.match(await readFile(new URL('../app/nation-comparison.tsx', import.meta.url), 'utf8'), /nationIsPreview\(nation\.id,openNations\)/);
  assert.match(await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8'), /nationIsPreview\(item\.id, openNations\)/);
  assert.doesNotMatch(await readFile(new URL('../app/api/world/route.ts', import.meta.url), 'utf8'), /openNations|playableNationIds/, 'the public, cached world response carries nothing per account');
});
