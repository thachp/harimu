/** #959: mod console API — admin reports GET, AI review queue limit/offset, AI decision records, idempotent mark-reviewed.
 *  Auth via HARIMU_ADMIN_TOKEN; flags HARIMU_REPORTS_ENABLED / HARIMU_AI_REVIEW_QUEUE_ENABLED. SQLite and HARIMU_TEST_STORAGE=postgres. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const TOKEN = 'fixture-admin-token-959-0123456789';
const quiet = fn => async t => { t.mock.method(console, 'warn', () => {}); t.mock.method(console, 'info', () => {}); await fn(t); };

async function admin(t, { review = 'true', reports = 'true', token = TOKEN } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_AI_REVIEW_QUEUE_ENABLED', review);
  r.setFixtureEnv('HARIMU_REPORTS_ENABLED', reports);
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token ?? undefined);
  await r.call('world', null);
  const queue = await r.importModule('app/api/admin/ai-review-queue/route.ts');
  const decisions = await r.importModule('app/api/admin/ai-decisions/route.ts');
  const reportsRoute = await r.importModule('app/api/admin/reports/route.ts');
  const send = async (route, method, query = '', body, auth = `Bearer ${TOKEN}`) => {
    const res = await route[method](new Request(`https://fixture.invalid/api/admin/x${query}`, {
      method, headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    return { status: res.status, data: await res.json() };
  };
  return { r, queue, decisions, reportsRoute, send };
}

const insertQueue = (db, id, nation, reason, at, reviewedAt = null, note = null) =>
  db.prepare("INSERT INTO ai_review_queue(id,created_at,source,nation_id,persona,output_text,filter_result,reason,reviewed_at,reviewer_note) VALUES (?,?,'notables',?,'p','text',?,?,?,?)")
    .bind(id, at, nation, reason === 'flagged' ? 'replaced' : 'passed', reason, reviewedAt, note).run();

const insertReport = (db, id, at) =>
  db.prepare("INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at) VALUES (?,?,?,'citizen-message',?,'harassment',null,?)")
    .bind(id, id + '-req', 'reporter-' + id, id + '-tgt', at).run();

test('admin reports: flag off / short token 404; wrong bearer 401; lists newest with limit/offset', quiet(async t => {
  for (const opts of [{ reports: 'false' }, { token: null }, { token: 'short' }]) {
    const { send, reportsRoute } = await admin(t, opts);
    assert.equal((await send(reportsRoute, 'GET')).status, 404);
  }
  const { r, send, reportsRoute } = await admin(t);
  assert.equal((await send(reportsRoute, 'GET', '', undefined, null)).status, 401);
  assert.equal((await send(reportsRoute, 'GET', '', undefined, 'Bearer wrong-token-0000000000000')).status, 401);
  await insertReport(r.db, 'r1', 100); await insertReport(r.db, 'r2', 200); await insertReport(r.db, 'r3', 300);
  assert.deepEqual((await send(reportsRoute, 'GET')).data.reports.map(x => x.id), ['r3', 'r2', 'r1']);
  assert.deepEqual((await send(reportsRoute, 'GET', '?limit=1')).data.reports.map(x => x.id), ['r3']);
  assert.deepEqual((await send(reportsRoute, 'GET', '?limit=1&offset=1')).data.reports.map(x => x.id), ['r2']);
  assert.equal((await send(reportsRoute, 'GET', '?limit=abc')).status, 400);
}));

test('AI review queue paging: limit/offset; AI decisions lists only reviewed; mark-reviewed idempotent', quiet(async t => {
  const { r, send, queue, decisions } = await admin(t);
  await insertQueue(r.db, 'a', 'kindle', 'flagged', 100);
  await insertQueue(r.db, 'b', 'korund', 'sample', 200);
  await insertQueue(r.db, 'c', 'kindle', 'sample', 300);
  assert.deepEqual((await send(queue, 'GET', '?limit=2')).data.items.map(i => i.id), ['c', 'b']);
  assert.deepEqual((await send(queue, 'GET', '?limit=2&offset=2')).data.items.map(i => i.id), ['a']);
  assert.equal((await send(queue, 'GET', '?offset=-1')).status, 400);
  assert.deepEqual((await send(decisions, 'GET')).data.decisions, []);
  assert.deepEqual((await send(queue, 'POST', '', { id: 'a', note: 'ok' })).data, { id: 'a', reviewed: true });
  assert.deepEqual((await send(queue, 'POST', '', { id: 'a', note: 'changed?' })).data, { id: 'a', reviewed: true });
  const again = (await send(queue, 'GET')).data.items.find(i => i.id === 'a');
  assert.equal(again.reviewer_note, 'ok'); assert.ok(again.reviewed_at > 0);
  const dec = (await send(decisions, 'GET')).data.decisions;
  assert.deepEqual(dec.map(d => d.id), ['a']);
  assert.equal(dec[0].reviewer_note, 'ok');
  assert.equal((await send(queue, 'POST', '', { id: 'missing', note: 'x' })).status, 409);
  for (const opts of [{ review: 'false' }, { token: null }]) {
    const ctx = await admin(t, opts);
    assert.equal((await ctx.send(ctx.decisions, 'GET')).status, 404);
  }
}));
