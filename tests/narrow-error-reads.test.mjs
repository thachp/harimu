import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { isMissingRelation, isUniqueViolation, tolerate } from '../lib/db-errors.ts';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';

test('#306 error classifiers: missing table and unique violation only', async () => {
  for (const e of [new Error('no such table: x'), Object.assign(new Error('boom'), { code: '42P01' }), new Error('relation "x" does not exist')]) assert.equal(isMissingRelation(e), true);
  for (const e of [new Error('disk I/O error'), new Error('database is locked'), Object.assign(new Error('x'), { code: '08006' }), new Error('syntax error')]) assert.equal(isMissingRelation(e), false);
  for (const e of [new Error('UNIQUE constraint failed: aurelle_pledges.request_id'), Object.assign(new Error('dup'), { code: '23505' })]) assert.equal(isUniqueViolation(e), true);
  assert.equal(isUniqueViolation(new Error('no such table: x')), false);
  assert.equal(await Promise.reject(new Error('no such table: x')).catch(tolerate(isMissingRelation, 7)), 7);
  await assert.rejects(Promise.reject(new Error('disk I/O error')).catch(tolerate(isMissingRelation, 7)), /disk I\/O/);
});

async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_KORUND_PRESIDIUM_ENABLED', 'true'); r.setFixtureEnv('HARIMU_AURELLE_RISING_ENABLED', 'true');
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='bob'").run();
  const now = Math.floor(r.now / 1000);
  // A database whose stability-score reads fail with the given error; everything else is real.
  const failing = error => ({ ...r.db, prepare: sql => /FROM nation_stability_scores/.test(sql) ? { bind() { return this; }, all: async () => { throw error; }, first: async () => { throw error; }, run: async () => { throw error; } } : r.db.prepare(sql) });
  return { r, now, failing };
}

test(`#306 ${backend}: Presidium and Rising reads tolerate a missing table but surface any other error`, async t => {
  const { r, now, failing } = await setup(t);
  const presidium = await r.importModule('lib/korund-presidium.ts'), rising = await r.importModule('lib/aurelle-rising.ts');
  const missing = failing(new Error('no such table: nation_stability_scores'));
  await presidium.runKorundPresidium(missing, now); await rising.runAurelleRising(missing, now); // not migrated yet: nothing to read, nothing opens
  const broken = failing(new Error('disk I/O error'));
  await assert.rejects(presidium.runKorundPresidium(broken, now), /disk I\/O/);
  await assert.rejects(rising.runAurelleRising(broken, now), /disk I\/O/);
  // Missing session/rising tables read as the authored state; other errors surface.
  const noTables = error => ({ ...r.db, prepare: sql => /FROM (korund_presidium_sessions|aurelle_risings)/.test(sql) ? { bind() { return this; }, all: async () => { throw error; }, first: async () => { throw error; } } : r.db.prepare(sql) });
  assert.equal((await presidium.readPresidium(noTables(new Error('no such table: korund_presidium_sessions')))).chairman.name, 'Neral Voss');
  assert.equal(await rising.readCrown(noTables(Object.assign(new Error('relation does not exist'), { code: '42P01' }))), null);
  await assert.rejects(presidium.readPresidium(noTables(new Error('database is locked'))), /locked/);
  await assert.rejects(rising.readCrown(noTables(new Error('database is locked'))), /locked/);
});

test(`#306 ${backend}: a duplicate pledge request is tolerated (409/200 by the read), any other write error surfaces`, async t => {
  const { r, now } = await setup(t);
  const rising = await r.importModule('lib/aurelle-rising.ts');
  const writeFails = error => ({ ...r.db, prepare: sql => /INSERT INTO aurelle_pledges/.test(sql) ? { bind() { return this; }, run: async () => { throw error; } } : r.db.prepare(sql) });
  const id = '8b6f6a2e-1c1e-4b57-9d3a-0e5d5f1b2c3d';
  const dup = await rising.pledge(writeFails(new Error('UNIQUE constraint failed: aurelle_pledges.request_id')), 'bob', { requestId: id, claimantId: 'vaelcourt' }, now);
  assert.equal(dup.status, 409, 'the lost race reads back as not recorded');
  await assert.rejects(rising.pledge(writeFails(new Error('disk I/O error')), 'bob', { requestId: id.replace('8b', '9b'), claimantId: 'vaelcourt' }, now), /disk I\/O/);
});

test(`#306 ${backend}: the Aurelle crown reaches the public citizen snapshot; absent when no Rising succeeded`, async t => {
  const { r, now } = await setup(t);
  assert.equal((await r.call('citizen', 'bob')).data.government.crown, undefined, 'no Rising yet');
  await r.db.prepare("INSERT INTO aurelle_risings (id,claimant_id,opened_at,closes_at,pledges_at_open,weekly_humans_at_open,unrest_at_open,resolved_at,outcome,pledges_at_close,weekly_humans_at_close,stability_at_close) VALUES ('r1','larkspire',?,?,1,3,70,?,'succeeded',1,3,30)").bind(now - 7200, now - 3600, now - 3600).run();
  const crown = (await r.call('citizen', 'bob')).data.government.crown;
  assert.equal(crown.name, 'Lord Aubert'); assert.equal(crown.house, 'House Larkspire'); assert.equal(crown.claimantId, 'larkspire');
  assert.equal((await r.call('citizen', 'alice')).data.government.crown, undefined, 'Korund never carries a crown');
});
