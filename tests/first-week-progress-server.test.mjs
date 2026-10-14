import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
// first-week-server.ts is exercised through the route (its extensionless imports are transpiled by localRuntime).
import { serverFirstWeekProgressStore } from '../lib/first-week-progress.ts';

const day = 86400;
test('#135 complete is idempotent, validated, and persists across sessions', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  const created = Date.parse((await r.db.prepare('SELECT created_at FROM citizens WHERE clerk_user_id=?').bind('alice').first()).created_at);
  r.setNow(created + day * 1000 + 60000); // arc day 2
  const before = await r.call('citizen', 'alice'); assert.deepEqual(before.data.firstWeek, { completed: [] });
  const cmd = { action: 'first-week-complete', goalId: 'kindle-2-sell', requestId: 'req-00000001' };
  for (let i = 0; i < 2; i++) { const res = await r.call('citizen', 'alice', cmd); assert.equal(res.status, 200); assert.deepEqual(res.data.firstWeek.completed, ['kindle-2-sell']); }
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM citizen_first_week_goals WHERE clerk_user_id=?').bind('alice').first()).n, 1);
  assert.equal((await r.call('citizen', 'alice', { ...cmd, goalId: 'kindle-5-ballot' })).status, 403, 'future day');
  assert.equal((await r.call('citizen', 'alice', { ...cmd, goalId: 'kindle-3-news' })).status, 403, 'hidden goal');
  assert.equal((await r.call('citizen', 'alice', { ...cmd, goalId: 'korund-2-quota' })).status, 400, 'other nation');
  assert.equal((await r.call('citizen', 'alice', { ...cmd, requestId: 'x' })).status, 400);
  assert.equal((await r.call('citizen', 'alice', cmd, 'https://foreign.invalid')).status, 403);
  assert.equal((await r.call('citizen', 'alice', { ...cmd, goalId: 'nope' })).status, 400);
  assert.equal((await r.call('citizen', 'alice', { ...cmd, goalId: { x: 1 } })).status, 400);
  r.setNow(created + 9 * day * 1000);
  assert.equal((await r.call('citizen', 'alice', { ...cmd, goalId: 'kindle-5-ballot' })).status, 200, 'past day still completable');
  r.reopen();
  assert.deepEqual((await r.call('citizen', 'alice')).data.firstWeek.completed, ['kindle-2-sell', 'kindle-5-ballot'], 'survives a new session');
  assert.deepEqual((await r.call('citizen', 'bob')).data.firstWeek.completed, [], 'per citizen');
});
test('#135 event-backed goals complete automatically from the ledgers', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  const created = Date.parse((await r.db.prepare('SELECT created_at FROM citizens WHERE clerk_user_id=?').bind('alice').first()).created_at);
  r.setNow(created + day * 1000 + 60000); // day 2: a second settled shift
  for (let i = 0; i < 2; i++) {
    const started = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' }); assert.equal(started.status, 200);
    const shift = started.data.shifts.find(s => !s.claimedAt); r.setNow(Date.parse(shift.completesAt) + 1000);
    assert.equal((await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id })).status, 200);
  }
  const after = (await r.call('citizen', 'alice')).data.firstWeek.completed;
  assert.ok(after.includes('kindle-2-shift'), JSON.stringify(after));
  const row = await r.db.prepare("SELECT source FROM citizen_first_week_goals WHERE clerk_user_id='alice' AND goal_id='kindle-2-shift'").first();
  assert.equal(row.source, 'ledger', 'latched');
});
test('#135 server store: load returns delivered ids; save posts only new ids', async () => {
  const posts = []; const store = serverFirstWeekProgressStore(['a'], async body => { posts.push(body); });
  assert.deepEqual(store.load('k'), ['a']);
  store.save('k', ['a', 'b', 'b']);
  assert.deepEqual(posts.map(p => [p.action, p.goalId]), [['first-week-complete', 'b']]);
  assert.match(posts[0].requestId, /^[0-9a-f-]{36}$/);
  store.save('k', ['a', 'b']); assert.equal(posts.length, 1);
  assert.doesNotThrow(() => serverFirstWeekProgressStore(null, () => Promise.reject(new Error('offline'))).save('k', ['c']));
});
