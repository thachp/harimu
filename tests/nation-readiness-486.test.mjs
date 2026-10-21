/** #486 slice 1: the registry-only opening checklist and HARIMU_NATION_READINESS_ENABLED. Flag off: nationPlayable and openNationIds answer exactly as before. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const r = await localRuntime();
const { nationIds, nationPlayable, nationReadiness, openNationIds, openingReadiness, capitalFits, mapFitRules, nationOpening } = await r.importModule('lib/nation-openings.ts');
test.after(() => r.close());

const qa = { HARIMU_QA_TEST_CITIZENS: 'true', NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_QA_TEST_CITIZEN_IDS: 'alice' };
const allOn = Object.fromEntries(nationIds.filter(id => !['kindle', 'korund', 'aurelle'].includes(id)).map(id => [`HARIMU_${id.toUpperCase()}_ENABLED`, 'true']));

test('readiness: live nations and Confluence are ready; the six unopened nations have no map or work entry yet', () => {
  for (const id of ['kindle', 'korund', 'aurelle', 'confluence']) assert.deepEqual(nationReadiness(id), { map: true, work: true, ready: true }, id);
  for (const id of ['meridian', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara']) assert.deepEqual(nationReadiness(id), { map: false, work: false, ready: false }, id);
  for (const id of ['atlantis', '', null, 7]) assert.equal(nationReadiness(id), undefined);
});

test('flag off (unset or "false"): a flag-on but unready nation answers exactly as before #486', () => {
  for (const off of [{}, { HARIMU_NATION_READINESS_ENABLED: 'false' }, { HARIMU_NATION_READINESS_ENABLED: 'TRUE' }]) {
    const env = { ...qa, ...allOn, ...off };
    for (const id of nationIds) assert.equal(nationPlayable(id, env, 'alice'), true, id);
    assert.deepEqual(openNationIds(env), nationIds);
  }
});

test('flag true: only complete entries open; live nations, the allowlist and fail-closed rules are unchanged', () => {
  const env = { ...qa, ...allOn, HARIMU_NATION_READINESS_ENABLED: 'true' };
  assert.deepEqual(openNationIds(env), ['kindle', 'confluence', 'korund', 'aurelle']);
  for (const id of ['kindle', 'korund', 'aurelle', 'confluence']) assert.equal(nationPlayable(id, env, 'alice'), true, id);
  for (const id of ['meridian', 'hoarvale', 'fulmara']) assert.equal(nationPlayable(id, env, 'alice'), false, id);
  assert.equal(nationPlayable('confluence', env, 'bob'), false, 'not allowlisted');
  assert.equal(nationPlayable('confluence', { ...env, HARIMU_CONFLUENCE_ENABLED: 'false' }, 'alice'), false, 'nation flag off');
  for (const id of ['kindle', 'korund', 'aurelle']) assert.equal(nationPlayable(id, env, null), true, id);
});

test('wrangler: preview "true", production "false", full-line comments', () => {
  const strip = t => JSON.parse(t.replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(strip(readFileSync('wrangler.jsonc', 'utf8')).vars.HARIMU_NATION_READINESS_ENABLED, 'true');
  assert.equal(strip(readFileSync('wrangler.prod.jsonc', 'utf8')).vars.HARIMU_NATION_READINESS_ENABLED, 'false');
});

test('QA1 nit 1: a partial entry is not ready; dropping the currency, wage or jobs check fails here', () => {
  const full = nationOpening('confluence');
  assert.deepEqual(openingReadiness(full), { map: true, work: true, ready: true });
  for (const [label, entry] of [['no currency', { ...full, currency: undefined }], ['no wage fund', { ...full, wage: undefined }], ['no jobs', { ...full, jobs: undefined }], ['empty jobs', { ...full, jobs: [] }]])
    assert.deepEqual(openingReadiness(entry), { map: true, work: false, ready: false }, label);
  for (const [label, entry] of [['no capital', { ...full, capital: undefined }], ['no biome', { ...full, biome: undefined }], ['empty biome', { ...full, biome: [] }]])
    assert.deepEqual(openingReadiness(entry), { map: false, work: true, ready: false }, label);
  assert.deepEqual(openingReadiness({ ...nationOpening('meridian'), currency: full.currency, wage: full.wage, jobs: full.jobs }), { map: false, work: true, ready: false }, 'work only');
});

test('QA1 nit 2: map ready also needs the 7x7 block to fit (grid, capitals >= 7, Commons >= 5); a check only', async () => {
  const z = await r.importModule('lib/map-zones.ts');
  assert.equal(mapFitRules.width, z.mapWidth); assert.equal(mapFitRules.height, z.mapHeight);
  const full = nationOpening('confluence');
  const at = capital => openingReadiness({ ...full, capital }).map;
  assert.equal(at({ x: 4, y: 13 }), true, 'Meetwater as placed');
  assert.equal(at({ x: 2, y: 13 }), false, 'block off the west edge'); assert.equal(at({ x: 21, y: 12 }), false, 'off the east edge');
  assert.equal(at({ x: 20, y: 2 }), false, 'off the north edge'); assert.equal(at({ x: 19, y: 15 }), false, 'off the south edge');
  assert.equal(at({ x: 6, y: 13 }), false, 'Chebyshev 6 from Aurelle (12,14)'); assert.equal(at({ x: 19, y: 11 }), true, 'the one free corner site on #486');
  assert.equal(capitalFits({ x: 12, y: 10 }, []), false, 'Chebyshev 4 from the Commons centre'); assert.equal(capitalFits({ x: 12, y: 11 }, []), true, 'Chebyshev 5 from the Commons centre');
  assert.equal(capitalFits({ x: 10, y: 14 }, [{ x: 17, y: 14 }]), true, 'exactly 7'); assert.equal(capitalFits({ x: 10, y: 14 }, [{ x: 16, y: 14 }]), false, '6');
  for (const id of ['kindle', 'korund', 'aurelle', 'confluence']) assert.equal(nationReadiness(id).ready, true, id);
  assert.equal(z.mappedNations.length, 4, 'no capital added');
});
