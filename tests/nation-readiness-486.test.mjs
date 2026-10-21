/** #486 slice 1: the registry-only opening checklist and HARIMU_NATION_READINESS_ENABLED. Flag off: nationPlayable and openNationIds answer exactly as before. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const r = await localRuntime();
const { nationIds, nationPlayable, nationReadiness, openNationIds } = await r.importModule('lib/nation-openings.ts');
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
