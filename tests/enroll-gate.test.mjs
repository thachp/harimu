/** #485: the enroll route only playable nations. Before this, a direct POST could enroll a citizen in any seeded nation (the "Coming soon" gate was client-side only). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const unplayable = ['confluence', 'meridian', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'];
const live = ['kindle', 'korund', 'aurelle'];
const citizens = async r => (await r.db.prepare('SELECT clerk_user_id,nation_id,nation_changes,updated_at FROM citizens ORDER BY clerk_user_id').all()).results.map(x => ({ ...x }));

test('first enrollment: a direct POST for each of the seven non-playable nations is refused with a 4xx and nothing is written', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  for (const nationId of unplayable) {
    const before = await citizens(r);
    const res = await r.call('citizen', 'newbie', { action: 'enroll', nationId, expectedNationId: null });
    assert.ok(res.status >= 400 && res.status < 500, `${nationId}: ${res.status}`);
    assert.equal(res.data.reason, 'not_playable', nationId);
    assert.deepEqual(await citizens(r), before, `${nationId}: no citizen row written`);
  }
  assert.equal((await citizens(r)).some(x => x.clerk_user_id === 'newbie'), false, 'the account never became a citizen of anything');
});

test('changing nation: a citizen in a live nation cannot move to a non-playable one; nothing changes, the free change is not spent', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  assert.equal((await r.call('citizen', 'alice', { action: 'enroll', nationId: 'kindle', expectedNationId: null })).status, 200);
  const before = await citizens(r);
  for (const nationId of unplayable) {
    const res = await r.call('citizen', 'alice', { action: 'enroll', nationId, expectedNationId: 'kindle' });
    assert.ok(res.status >= 400 && res.status < 500, nationId); assert.equal(res.data.reason, 'not_playable');
  }
  assert.deepEqual(await citizens(r), before);
  assert.equal((await citizens(r)).find(x => x.clerk_user_id === 'alice').nation_id, 'kindle', 'existing citizens are unaffected');
  assert.equal((await r.call('citizen', 'alice')).status, 200, 'and still read their own state');
});

test('an unknown nation is still a plain 400 and the three live nations still enroll (first enrollment and the one free change)', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const unknown = await r.call('citizen', 'zed', { action: 'enroll', nationId: 'atlantis', expectedNationId: null });
  assert.equal(unknown.status, 400); assert.equal(unknown.data.reason, undefined);
  for (const nationId of live) {
    const user = `u-${nationId}`;
    const res = await r.call('citizen', user, { action: 'enroll', nationId, expectedNationId: null });
    assert.equal(res.status, 200, nationId); assert.equal(res.data.nationId, nationId);
  }
  const moved = await r.call('citizen', 'u-kindle', { action: 'enroll', nationId: 'korund', expectedNationId: 'kindle' });
  assert.equal(moved.status, 200); assert.equal(moved.data.nationId, 'korund');
  assert.equal((await r.call('citizen', 'u-kindle', { action: 'enroll', nationId: 'korund', expectedNationId: 'kindle' })).status, 200, 'a repeated choice of the same live nation is still a no-op success');
});

test('the QA nation switch cannot reach a non-playable nation either; one shared list drives the server gate and the client Coming soon gate', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_QA_TEST_CITIZENS', 'true'); r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true'); r.setFixtureEnv('HARIMU_QA_TEST_CITIZEN_IDS', 'qa');
  assert.equal((await r.call('citizen', 'qa', { action: 'enroll', nationId: 'kindle', expectedNationId: null })).status, 200);
  for (const nationId of unplayable) assert.equal((await r.call('citizen', 'qa', { action: 'qa-test-nation', nationId })).status, 400, nationId);
  assert.equal((await r.call('citizen', 'qa', { action: 'qa-test-nation', nationId: 'aurelle' })).status, 200);
  const shared = await r.importModule('lib/playable-nations.ts'), discovery = await r.importModule('lib/nation-discovery.ts'), qa = await r.importModule('lib/qa-tools.ts');
  assert.deepEqual([...shared.liveNations], live);
  const all = [...live, ...unplayable, 'atlantis'];
  assert.deepEqual(all.map(id => shared.isLiveNation(id)), all.map(id => live.includes(id)));
  assert.deepEqual(all.filter(id => ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'].includes(id)).map(id => discovery.nationIsPreview(id)), ['kindle', 'korund', 'aurelle', ...unplayable].map(id => !live.includes(id)), 'same answer as the old literal for all ten');
  assert.deepEqual([...qa.qaTestNations], [...shared.liveNations]);
  const route = await readFile(new URL('../app/api/citizen/route.ts', import.meta.url), 'utf8');
  assert.ok(route.indexOf('isLiveNation(nationId)') > route.indexOf("body.action === 'enroll'") && route.indexOf('isLiveNation(nationId)') < route.indexOf('enrollmentInitialSql).bind'), 'the gate runs before any enrollment write');
  assert.doesNotMatch(await readFile(new URL('../lib/playable-nations.ts', import.meta.url), 'utf8'), /^import /m, 'the shared list imports nothing');
});
