/** #489 (Stage 0c): nationPlayable(id, bindings, userId) is the one gate for enrolling in, switching to and playing a nation. Fails closed. Flags are HARIMU_<ID>_ENABLED, QA allowlist only. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const closed = ['confluence', 'meridian', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'];
const live = ['kindle', 'korund', 'aurelle'];
const qa = { HARIMU_QA_TEST_CITIZENS: 'true', NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_QA_TEST_CITIZEN_IDS: 'qa-1, qa-2' };
const load = async t => { const r = await localRuntime(); t.after(() => r.close()); return { r, reg: await r.importModule('lib/nation-openings.ts') }; };
const citizens = async r => (await r.db.prepare('SELECT clerk_user_id,nation_id,nation_changes,updated_at FROM citizens ORDER BY clerk_user_id').all()).results.map(x => ({ ...x }));
const qaEnv = (r, ids = 'qa') => { r.setFixtureEnv('HARIMU_QA_TEST_CITIZENS', 'true'); r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true'); r.setFixtureEnv('HARIMU_QA_TEST_CITIZEN_IDS', ids); };

test('helper table: live always true; flag off false; flag on + allowlisted true; flag on + not allowlisted false; unknown false', async t => {
  const { reg } = await load(t);
  for (const id of live) for (const [bindings, user] of [[{}, undefined], [undefined, 'x'], [qa, 'qa-1'], [{ ...qa, [`HARIMU_${id.toUpperCase()}_ENABLED`]: 'true' }, 'nobody']]) assert.equal(reg.nationPlayable(id, bindings, user), true, `${id} is live for everyone`);
  for (const id of closed) {
    const flag = `HARIMU_${id.toUpperCase()}_ENABLED`, on = { ...qa, [flag]: 'true' };
    assert.equal(reg.nationOpening(id).openingFlag, flag, 'the registry names exactly HARIMU_<ID>_ENABLED');
    assert.equal(reg.nationPlayable(id), false, `${id}: no bindings`);
    assert.equal(reg.nationPlayable(id, qa, 'qa-1'), false, `${id}: flag off, even for an allowlisted account`);
    for (const value of [undefined, '', 'false', '1', 'TRUE', 'yes', ' true']) assert.equal(reg.nationPlayable(id, { ...qa, [flag]: value }, 'qa-1'), false, `${id}: flag ${JSON.stringify(value)}`);
    assert.equal(reg.nationPlayable(id, on, 'qa-1'), true, `${id}: flag on + allowlisted`);
    assert.equal(reg.nationPlayable(id, on, 'qa-2'), true, 'second allowlisted id (trimmed list)');
    assert.equal(reg.nationPlayable(id, on, 'someone-else'), false, `${id}: flag on, not allowlisted`);
    assert.equal(reg.nationPlayable(id, on), false, `${id}: flag on, no user id`);
    assert.equal(reg.nationPlayable(id, on, ''), false); assert.equal(reg.nationPlayable(id, on, null), false);
    assert.equal(reg.nationPlayable(id, { ...on, HARIMU_QA_TEST_CITIZENS: undefined }, 'qa-1'), false, 'QA switch off');
    assert.equal(reg.nationPlayable(id, { ...on, NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'false' }, 'qa-1'), false, 'production (no development preview): the flag opens nothing');
    assert.equal(reg.nationPlayable(id, { ...qa, HARIMU_QA_TEST_CITIZEN_IDS: '', [flag]: 'true' }, 'qa-1'), false, 'empty allowlist');
    for (const other of closed.filter(o => o !== id)) assert.equal(reg.nationPlayable(other, on, 'qa-1'), false, `${flag} opens only ${id}, not ${other}`);
  }
  for (const bad of [undefined, null, 5, {}, [], '', 'atlantis', 'Kindle', 'KORUND', '__proto__', 'constructor', 'kindle ']) assert.equal(reg.nationPlayable(bad, { ...qa, HARIMU_ATLANTIS_ENABLED: 'true' }, 'qa-1'), false, String(bad));
});

test('flag names in wrangler match HARIMU_<ID>_ENABLED exactly, are "false" except Confluence in preview (#487), and are the only opening flags', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const found = Object.fromEntries([...cfg.matchAll(/^\s*"(HARIMU_(CONFLUENCE|MERIDIAN|ILMAR|HOARVALE|VARKAND|VELDWOOD|FULMARA)_ENABLED)"\s*:\s*"([^"]*)"/gm)].map(x => [x[1], x[3]]));
  assert.deepEqual(found, Object.fromEntries(closed.map(id => [`HARIMU_${id.toUpperCase()}_ENABLED`, id === 'confluence' ? 'true' : 'false'])), '#487: Confluence is on in preview (QA allowlist only)');
  const prod = await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8');
  assert.deepEqual(Object.fromEntries([...prod.matchAll(/^\s*"(HARIMU_(CONFLUENCE|MERIDIAN|ILMAR|HOARVALE|VARKAND|VELDWOOD|FULMARA)_ENABLED)"\s*:\s*"([^"]*)"/gm)].map(x => [x[1], x[3]])), Object.fromEntries(closed.map(id => [`HARIMU_${id.toUpperCase()}_ENABLED`, 'false'])), 'production keeps all seven off');
  assert.doesNotMatch(cfg, /HARIMU_(KINDLE|KORUND|AURELLE)_ENABLED/, 'live nations have no opening flag');
});

test('enroll: each of the seven is refused with flag off, flag on for the public, and flag on for a non-allowlisted account; nothing is written', async t => {
  const { r } = await load(t);
  const run = async label => { for (const nationId of closed) {
    const before = await citizens(r);
    const res = await r.call('citizen', 'newbie', { action: 'enroll', nationId, expectedNationId: null });
    assert.equal(res.status, 403, `${label} ${nationId}`); assert.equal(res.data.reason, 'not_playable');
    assert.deepEqual(await citizens(r), before, `${label} ${nationId}: no write`);
  } };
  await run('flag off');
  for (const id of closed) r.setFixtureEnv(`HARIMU_${id.toUpperCase()}_ENABLED`, 'true');
  await run('flag on, QA off');
  qaEnv(r, 'someone-else'); await run('flag on, not allowlisted');
  assert.equal((await r.call('citizen', 'alice', { action: 'enroll', nationId: 'kindle', expectedNationId: null })).status, 200);
  const before = await citizens(r);
  for (const nationId of closed) assert.equal((await r.call('citizen', 'alice', { action: 'enroll', nationId, expectedNationId: 'kindle' })).status, 403, `change to ${nationId}`);
  assert.deepEqual(await citizens(r), before, 'a non-allowlisted citizen cannot change into a flag-on nation; the free change is not spent');
});

test('enroll and the QA switch: a flag-on nation opens for an allowlisted account only, one nation per flag, before any write for everyone else', async t => {
  const { r } = await load(t);
  qaEnv(r, 'qa'); r.setFixtureEnv('HARIMU_CONFLUENCE_ENABLED', 'true');
  assert.equal((await r.call('citizen', 'pub', { action: 'enroll', nationId: 'confluence', expectedNationId: null })).status, 403, 'public account, flag on');
  assert.equal((await r.call('citizen', 'qa', { action: 'enroll', nationId: 'meridian', expectedNationId: null })).status, 403, 'allowlisted account, that nation flag off');
  assert.equal((await r.call('citizen', 'qa', { action: 'enroll', nationId: 'kindle', expectedNationId: null })).status, 200);
  assert.equal((await r.call('citizen', 'qa', { action: 'qa-test-nation', nationId: 'meridian' })).status, 400, 'QA switch: flag off');
  assert.equal((await r.call('citizen', 'qa', { action: 'qa-test-nation', nationId: 'atlantis' })).status, 400);
  const switched = await r.call('citizen', 'qa', { action: 'qa-test-nation', nationId: 'confluence' });
  assert.equal(switched.status, 200); assert.equal(switched.data.nationId, 'confluence');
  assert.equal((await citizens(r)).find(x => x.clerk_user_id === 'qa').nation_id, 'confluence');
  assert.equal((await r.call('citizen', 'pub', { action: 'qa-test-nation', nationId: 'confluence' })).status, 404, 'the QA switch is still 404 for a non-QA account');
});

test('the three live nations are unchanged (enroll, change, repeat), existing citizens are unaffected, and /api/world leaks no flag state', async t => {
  const { r } = await load(t);
  const world = async () => JSON.stringify((await r.call('world', null)).data);
  const before = await world();
  for (const id of closed) r.setFixtureEnv(`HARIMU_${id.toUpperCase()}_ENABLED`, 'true'); qaEnv(r, 'qa');
  assert.equal(await world(), before, 'flags on: /api/world answers exactly as with them off');
  assert.doesNotMatch(before, /HARIMU_|openingFlag|_ENABLED/);
  for (const nationId of live) { const res = await r.call('citizen', `u-${nationId}`, { action: 'enroll', nationId, expectedNationId: null }); assert.equal(res.status, 200, nationId); assert.equal(res.data.nationId, nationId); }
  assert.equal((await r.call('citizen', 'u-kindle', { action: 'enroll', nationId: 'korund', expectedNationId: 'kindle' })).status, 200);
  assert.equal((await r.call('citizen', 'u-kindle', { action: 'enroll', nationId: 'korund', expectedNationId: 'kindle' })).status, 200, 'repeat choice is a no-op success');
  assert.equal((await r.call('citizen', 'u-korund')).status, 200, 'existing citizens read their state');
});

test('wiring: both entry points call nationPlayable before any write; the registry owns the helper and reuses qaTestCitizenAllowed', async () => {
  const route = await readFile(new URL('../app/api/citizen/route.ts', import.meta.url), 'utf8');
  const gate = 'nationPlayable(nationId, env as never, userId)';
  assert.equal(route.split(gate).length - 1, 2, 'the QA switch and the enroll path, the same helper');
  assert.ok(route.indexOf(gate) < route.indexOf('qaTestNationSql).bind'));
  assert.ok(route.lastIndexOf(gate) < route.indexOf('enrollmentInitialSql).bind'));
  assert.doesNotMatch(route, /isLiveNation/);
  const reg = await readFile(new URL('../lib/nation-openings.ts', import.meta.url), 'utf8');
  assert.match(reg, /qaTestCitizenAllowed\(bindings, userId\)/); assert.match(reg, /from '\.\/qa-tools'/);
  assert.doesNotMatch(await readFile(new URL('../lib/nation-discovery.ts', import.meta.url), 'utf8'), /^import /m, 'nation-discovery stays import-free');
  assert.doesNotMatch(await readFile(new URL('../lib/qa-tools.ts', import.meta.url), 'utf8'), /^import /m, 'qa-tools stays import-free');
});
