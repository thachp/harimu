/** #488: lib/nation-openings.ts is the registry of how each of the ten nations opens; every gate reads the live list and behaviour is identical for all ten nations. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const ten = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'];
const oldLive = ['kindle', 'korund', 'aurelle']; // the literal every gate used before
const load = async t => { const r = await localRuntime(); t.after(() => r.close()); return { r, reg: await r.importModule('lib/nation-openings.ts'), disc: await r.importModule('lib/nation-discovery.ts') }; };
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('registry: one entry per nation for all ten ids; the three live ids are the only openingFlag:null entries; the seven closed ones name an off flag; only Confluence has a capital (#487)', async t => {
  const { r, reg, disc } = await load(t);
  assert.deepEqual(reg.nationOpenings.map(o => o.id), ten); assert.deepEqual([...reg.nationIds], ten);
  assert.deepEqual(reg.nationOpenings.filter(o => o.openingFlag === null).map(o => o.id).sort(), [...oldLive].sort());
  assert.deepEqual([...disc.liveNations], oldLive, 'the live list is unchanged');
  assert.deepEqual([...reg.liveNations], [...disc.liveNations], 'the registry re-exports the same list');
  for (const id of disc.liveNations) assert.ok(ten.includes(id), 'every live id is a catalog nation');
  for (const o of reg.nationOpenings.filter(o => o.openingFlag !== null)) { assert.equal(o.openingFlag, `HARIMU_${o.id.toUpperCase()}_ENABLED`); if (o.id === 'confluence') assert.deepEqual(o.capital, { x: 4, y: 13 }, '#487: Meetwater'); else assert.equal(o.capital, undefined, `${o.id} has no capital yet`); }
  assert.equal(new Set(reg.nationOpenings.map(o => o.openingFlag).filter(Boolean)).size, 7, 'seven distinct flags');
  const seeded = (await r.db.prepare('SELECT id FROM nations ORDER BY id').all()).results.map(x => x.id).sort();
  assert.deepEqual(seeded, [...ten].sort(), 'the registry covers exactly the seeded nations');
});

test('behaviour is identical for all ten ids: nationIsPreview, isLiveNation, openNationIds and the old literal agree; unknown input fails closed', async t => {
  const { reg, disc } = await load(t);
  assert.deepEqual(ten.map(id => disc.nationIsPreview(id)), ten.map(id => !oldLive.includes(id)));
  assert.deepEqual(ten.map(id => disc.isLiveNation(id)), ten.map(id => oldLive.includes(id)));
  assert.deepEqual([...reg.openNationIds()], oldLive, 'no flags: only the live nations');
  assert.deepEqual([...reg.openNationIds({ HARIMU_CONFLUENCE_ENABLED: 'false', HARIMU_MERIDIAN_ENABLED: '1', HARIMU_ILMAR_ENABLED: '' })], oldLive, 'only exactly "true" opens a flag');
  assert.deepEqual([...reg.openNationIds({ HARIMU_CONFLUENCE_ENABLED: 'true' })], ['kindle', 'confluence', 'korund', 'aurelle']);
  assert.equal(disc.nationIsPreview('confluence'), true, 'an opening flag does not make a nation public: the public gate stays on liveNations');
  for (const bad of [undefined, null, 5, {}, '', 'atlantis', 'Kindle', '__proto__', 'constructor']) { assert.equal(disc.isLiveNation(bad), false); assert.equal(reg.nationOpening(bad), undefined); }
  assert.equal(reg.nationOpening('korund').openingFlag, null);
});

test('wiring: one direction only, the list file stays import-free, gates read it, onboarding order is unchanged, the opening flags are all off', async t => {
  const { r } = await load(t);
  const onboarding = await r.importModule('lib/onboarding-preferences.ts');
  assert.deepEqual(onboarding.suggestNations({}), ['kindle', 'korund', 'aurelle']);
  const discovery = await read('lib/nation-discovery.ts');
  assert.doesNotMatch(discovery, /^import /m, 'nation-discovery.ts imports nothing (component tests load it under plain Node)');
  assert.doesNotMatch(discovery, /from ['"]\.\/nation-openings/, 'nothing in nation-discovery imports the registry');
  assert.match(await read('lib/nation-openings.ts'), /from '\.\/nation-discovery'/);
  assert.doesNotMatch(await read('lib/qa-tools.ts'), /^import /m, 'qa-tools.ts is import-free again (QA3 note on #493)');
  assert.doesNotMatch(await read('lib/qa-tools.ts'), /qaTestNations/);
  assert.match(await read('lib/onboarding-preferences.ts'), /from '\.\/nation-discovery'/);
  assert.match(await read('app/government-panel.tsx'), /from '@\/lib\/nation-discovery'/);
  assert.match(await read('app/api/citizen/route.ts'), /if \(!nationPlayable\(nationId, env as never, userId\)\) return privateJson\(\{ error: 'Choose a nation/, 'the QA switch uses nationPlayable');
  assert.match(await read('app/api/world/route.ts'), /populationBands\([^;]*nationIsPreview/s, 'population bands treat exactly the non-live nations as Coming soon, through nationIsPreview');
  for (const file of ['app/government-panel.tsx', 'lib/onboarding-preferences.ts']) assert.doesNotMatch(await read(file), /\['kindle','korund','aurelle'\]/, file);
  assert.equal([...(await read('wrangler.jsonc')).matchAll(/"HARIMU_(CONFLUENCE|MERIDIAN|ILMAR|HOARVALE|VARKAND|VELDWOOD|FULMARA)_ENABLED"\s*:\s*"false"/g)].length, 7, 'the seven opening flags are defined and off (#489)');
});
