/** #743 slice 1: POST /api/reports intake for city chat messages and Notable replies. Flag HARIMU_REPORTS_ENABLED. SQLite and HARIMU_TEST_STORAGE=postgres. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';

const rows = async db => (await db.prepare('SELECT reporter_id,target_kind,target_id,reason_id,note FROM moderation_reports ORDER BY created_at,id').all()).results.map(row => ({...row}));
const quiet = fn => async t => { t.mock.method(console, 'warn', () => {}); t.mock.method(console, 'info', () => {}); await fn(t); };
async function setup(t, on = true) {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_REPORTS_ENABLED', on ? 'true' : 'false');
  const post = async (user, text) => { const id = randomUUID(); const res = await r.call('square', user, {action: 'post', id, text, expectedNationId: 'kindle'}); assert.equal(res.status, 200, JSON.stringify(res.data)); return id; };
  const report = (user, body) => r.call('reports', user, {requestId: randomUUID(), ...body});
  return {r, post, report};
}

test('flag off: 404, no row and no database access', quiet(async t => {
  const {r, report} = await setup(t, false);
  const prepare = r.db.prepare.bind(r.db); let touched = 0; r.db.prepare = (...a) => { touched++; return prepare(...a); }; t.after(() => { r.db.prepare = prepare; });
  const res = await report('alice', {targetKind: 'citizen-message', targetId: randomUUID(), reasonId: 'spam-other'});
  assert.equal(res.status, 404); assert.equal(touched, 0);
  r.db.prepare = prepare; assert.deepEqual(await rows(r.db), []);
}));

test('a citizen reports another citizen\'s chat message once; replay is idempotent and a second report is a duplicate', quiet(async t => {
  const {r, post, report} = await setup(t);
  const msg = await post('bob', 'hello square');
  const requestId = randomUUID(), body = {requestId, targetKind: 'citizen-message', targetId: msg, reasonId: 'hate-harassment', note: '  rude  '};
  const first = await r.call('reports', 'alice', body);
  assert.equal(first.status, 201); assert.deepEqual(first.data, {ok: true}); assert.equal(first.cache, 'private, no-store');
  assert.equal((await r.call('reports', 'alice', body)).status, 201, 'same request id replays');
  assert.equal((await r.call('reports', 'alice', {...body, reasonId: 'spam-other'})).status, 409, 'a reused request id with other content is refused');
  const dup = await report('alice', {targetKind: 'citizen-message', targetId: msg, reasonId: 'spam-other'});
  assert.equal(dup.status, 409); assert.equal(dup.data.duplicate, true);
  assert.deepEqual(await rows(r.db), [{reporter_id: 'alice', target_kind: 'citizen-message', target_id: msg, reason_id: 'hate-harassment', note: 'rude'}]);
}));

test('refusals: guest, cross-origin, missing or own target, bad reason, AI-only reason on a human message, long note', quiet(async t => {
  const {r, post, report} = await setup(t);
  const msg = await post('bob', 'hello square'), own = await post('alice', 'my own words');
  assert.equal((await report(null, {targetKind: 'citizen-message', targetId: msg, reasonId: 'spam-other'})).status, 401);
  assert.equal((await r.call('reports', 'alice', {requestId: randomUUID(), targetKind: 'citizen-message', targetId: msg, reasonId: 'spam-other'}, 'https://evil.invalid')).status, 403);
  assert.equal((await report('alice', {targetKind: 'citizen-message', targetId: randomUUID(), reasonId: 'spam-other'})).status, 404);
  assert.equal((await report('alice', {targetKind: 'citizen-message', targetId: own, reasonId: 'spam-other'})).status, 404, 'not your own message');
  assert.equal((await report('alice', {targetKind: 'citizen-message', targetId: msg, reasonId: 'made-up'})).status, 400);
  assert.equal((await report('alice', {targetKind: 'citizen-message', targetId: msg, reasonId: 'ai-inappropriate'})).status, 400);
  assert.equal((await report('alice', {targetKind: 'ai-news', targetId: msg, reasonId: 'spam-other'})).status, 400, 'only slice-1 targets');
  assert.equal((await report('alice', {targetKind: 'citizen-message', targetId: msg, reasonId: 'spam-other', note: 'x'.repeat(281)})).status, 400);
  assert.equal((await r.call('reports', 'alice', {targetKind: 'citizen-message', targetId: msg, reasonId: 'spam-other'})).status, 400, 'request id required');
  assert.deepEqual(await rows(r.db), []);
}));

test('a Notable reply is reportable only by the citizen who asked, and the AI-only reason is allowed', quiet(async t => {
  const {r, report} = await setup(t);
  const requestId = randomUUID();
  // The Notable reservation row for alice's request, as answerNotable writes it.
  const {ownerPrefix} = await r.importModule('lib/notables.ts');
  await r.db.prepare("INSERT INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) VALUES (?,'2026-10-22','2026-10-23','fixture',1,1,'finished')").bind((await ownerPrefix('alice')) + requestId).run();
  assert.equal((await report('bob', {targetKind: 'notable-reply', targetId: requestId, reasonId: 'ai-inappropriate'})).status, 404);
  assert.equal((await report('alice', {targetKind: 'notable-reply', targetId: requestId, reasonId: 'ai-inappropriate'})).status, 201);
  assert.deepEqual((await rows(r.db)).map(x => [x.reporter_id, x.target_kind, x.reason_id]), [['alice', 'notable-reply', 'ai-inappropriate']]);
}));

test('the daily limit refuses the eleventh report with 429', quiet(async t => {
  const {r, post, report} = await setup(t);
  const ids = []; for (let i = 0; i < 11; i++) { r.setNow(r.now + 11000); ids.push(await post('bob', `message ${i}`)); }
  for (const id of ids.slice(0, 10)) assert.equal((await report('alice', {targetKind: 'citizen-message', targetId: id, reasonId: 'spam-other'})).status, 201);
  assert.equal((await report('alice', {targetKind: 'citizen-message', targetId: ids[10], reasonId: 'spam-other'})).status, 429);
  assert.equal((await rows(r.db)).length, 10);
}));

test('migration 0070 is additive and exists for D1 and Postgres; nothing creates the table at runtime', () => {
  for (const f of ['drizzle/0070_moderation_reports.sql', 'db/postgres/0070_moderation_reports.sql']) {
    const sql = readFileSync(f, 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS moderation_reports/); assert.doesNotMatch(sql, /\b(DROP|ALTER|DELETE|UPDATE)\b/i);
  }
  assert.doesNotMatch(readFileSync('lib/reports.ts', 'utf8'), /CREATE TABLE/i); assert.doesNotMatch(readFileSync('lib/db.ts', 'utf8'), /moderation_reports/);
});
