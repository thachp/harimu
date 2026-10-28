/** #753 slice 1: AI review queue (docs §21.4). Flag HARIMU_AI_REVIEW_QUEUE_ENABLED: off = no rows and admin 404; on = a filter-failed Notable reply
 *  always lands, a passing one only when sampled (~1%, seeded); the admin list and mark-reviewed need the bearer token. SQLite and HARIMU_TEST_STORAGE=postgres. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { aiReviewSampled, aiReviewSampleBasisPoints } from '../lib/ai-review-queue.ts';

const TOKEN = 'fixture-admin-token-753-0123456789';
const budget = { dailyBudgetMicro: 970000, gatewayId: 'harimu-test' };
const good = { title: 'National ledger record', summary: 'Recorded work contributes to household food. The ledger lists it publicly.', claims: ['citizens', 'completedShifts', 'food'] };
const stub = verdict => { const calls = []; return { calls, async run(model) { calls.push(model); return { response: [JSON.stringify(good), verdict, 'safe'][(calls.length - 1) % 3] }; } }; };
const quiet = fn => async t => { t.mock.method(console, 'warn', () => {}); t.mock.method(console, 'info', () => {}); await fn(t); };
const rows = async db => (await db.prepare('SELECT id,source,nation_id,persona,output_text,filter_result,filter_detail,reason FROM ai_review_queue ORDER BY created_at').all()).results;
const command = () => ({ requestId: randomUUID(), notableId: 'kindle-journalist', topic: 'news' });

test('sampling is deterministic and close to 1% over a seeded set of ids', () => {
  assert.equal(aiReviewSampleBasisPoints, 100);
  const ids = Array.from({ length: 20000 }, (_, i) => `notable:seed:${i}`), hits = ids.filter(id => aiReviewSampled(id)).length;
  assert.ok(hits > 140 && hits < 260, `about 200 of 20,000 sampled, got ${hits}`);
  for (const id of ids.slice(0, 500)) assert.equal(aiReviewSampled(id), aiReviewSampled(id));
  assert.equal(ids.some(id => aiReviewSampled(id, 0)), false); assert.equal(ids.slice(0, 50).every(id => aiReviewSampled(id, 10000)), true);
});

test('flag off: a rejected Notable reply writes no row', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const result = await r.answerNotable('alice', command(), stub('{"supported":false}'), { enabled: true, budget, reviewQueue: false });
  assert.equal(result.source, 'authored'); assert.equal(result.rejectedAt, 'draft-unsupported');
  assert.deepEqual(await rows(r.db), []);
}));

test('flag on: a filter-rejected reply always lands as flagged, with the gate and the model text; the player still gets the authored example', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const result = await r.answerNotable('alice', command(), stub('{"supported":false}'), { enabled: true, budget, reviewQueue: true });
  assert.equal(result.status, 200); assert.equal(result.source, 'authored');
  const [row, ...rest] = await rows(r.db); assert.equal(rest.length, 0);
  assert.equal(row.reason, 'flagged'); assert.equal(row.filter_result, 'replaced'); assert.equal(row.filter_detail, 'draft-unsupported');
  assert.equal(row.source, 'notables'); assert.equal(row.nation_id, 'kindle'); assert.equal(row.persona, 'kindle-journalist'); assert.equal(JSON.parse(row.output_text).title, good.title);
}));

// Same id as lib/notables.ts builds: 'notable:' + sha256(userId) + ':' + requestId. Seed request ids whose stored id is (or is not) sampled.
const storedId = (user, requestId) => `notable:${createHash('sha256').update(user).digest('hex')}:${requestId}`;
const seededRequestId = (user, sampled) => { for (let i = 0; ; i++) { const rid = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`; if (aiReviewSampled(storedId(user, rid)) === sampled) return rid; } };

for (const sampled of [true, false]) test(`flag on: a passing reply with a ${sampled ? 'sampled' : 'non-sampled'} id writes ${sampled ? '1 row' : '0 rows'}`, quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const requestId = seededRequestId('alice', sampled);
  const ok = await r.answerNotable('alice', { ...command(), requestId }, stub('{"supported":true}'), { enabled: true, budget, reviewQueue: true });
  assert.equal(ok.source, 'model');
  assert.equal((await r.db.prepare('SELECT request_id FROM harimu_ai_reservations').first()).request_id, storedId('alice', requestId), 'seed matches the stored id');
  const written = await rows(r.db);
  assert.equal(written.length, sampled ? 1 : 0);
  for (const row of written) { assert.equal(row.reason, 'sample'); assert.equal(row.filter_result, 'passed'); assert.equal(row.output_text, ok.reply); }
}));

test('POST /api/notables wires the flag: off writes 0 rows, on writes 1 flagged row for a rejected reply', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); r.setFixtureAiFlags({ notables: true });
  r.setFixtureAiBinding(stub('{"supported":false}')); r.setFixtureEnv('HARIMU_AI_REVIEW_QUEUE_ENABLED', 'false');
  const off = await r.call('notables', 'alice', command());
  assert.equal(off.status, 200); assert.equal(off.data.source, 'authored'); assert.deepEqual(await rows(r.db), []);
  r.setFixtureAiBinding(stub('{"supported":false}')); r.setFixtureEnv('HARIMU_AI_REVIEW_QUEUE_ENABLED', 'true');
  const on = await r.call('notables', 'alice', command());
  assert.equal(on.status, 200); assert.equal(on.data.source, 'authored');
  const written = await rows(r.db); assert.equal(written.length, 1);
  assert.equal(written[0].reason, 'flagged'); assert.equal(written[0].filter_result, 'replaced'); assert.equal(written[0].filter_detail, 'draft-unsupported');
}));

async function admin(t, { flag = 'true', token = TOKEN } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_AI_REVIEW_QUEUE_ENABLED', flag); r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token ?? undefined);
  await r.call('world', null);
  const route = await r.importModule('app/api/admin/ai-review-queue/route.ts');
  const send = async (method, query = '', body, auth = `Bearer ${TOKEN}`) => {
    const res = await route[method](new Request(`https://fixture.invalid/api/admin/ai-review-queue${query}`, { method, headers: { ...(auth ? { Authorization: auth } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: res.status, data: await res.json() };
  };
  return { r, send };
}
const insert = (db, id, nation, reason, at) => db.prepare("INSERT INTO ai_review_queue(id,created_at,source,nation_id,persona,output_text,filter_result,reason) VALUES (?,?,'notables',?,'p','text',?,?)").bind(id, at, nation, reason === 'flagged' ? 'replaced' : 'passed', reason).run();

test('admin route: flag off or token unset is 404, a wrong bearer is 401, for both GET and POST', async t => {
  for (const opts of [{ flag: 'false' }, { token: null }, { token: 'short' }]) {
    const { send } = await admin(t, opts);
    assert.equal((await send('GET')).status, 404); assert.equal((await send('POST', '', { id: 'x', note: 'n' })).status, 404);
  }
  const { send } = await admin(t);
  for (const auth of [null, 'Bearer wrong-token-0000000000000', TOKEN]) { assert.equal((await send('GET', '', undefined, auth)).status, 401); assert.equal((await send('POST', '', { id: 'x', note: 'n' }, auth)).status, 401); }
});

test('admin route: lists newest first with reason and nation filters, and marks one entry reviewed (idempotent)', async t => {
  const { r, send } = await admin(t);
  await insert(r.db, 'a', 'kindle', 'flagged', 100); await insert(r.db, 'b', 'korund', 'sample', 200); await insert(r.db, 'c', 'kindle', 'sample', 300);
  assert.deepEqual((await send('GET')).data.items.map(i => i.id), ['c', 'b', 'a']);
  assert.deepEqual((await send('GET', '?reason=sample')).data.items.map(i => i.id), ['c', 'b']);
  assert.deepEqual((await send('GET', '?nation=kindle&reason=flagged')).data.items.map(i => i.id), ['a']);
  assert.equal((await send('GET', '?nation=atlantis')).status, 400);
  assert.equal((await send('POST', '', { id: 'a', note: '' })).status, 400);
  assert.deepEqual((await send('POST', '', { id: 'a', note: 'Fine, on-topic.' })).data, { id: 'a', reviewed: true });
  assert.deepEqual((await send('POST', '', { id: 'a', note: 'again' })).data, { id: 'a', reviewed: true }); assert.equal((await send('POST', '', { id: 'zz', note: 'x' })).status, 409);
  const a = (await send('GET', '?reason=flagged')).data.items[0]; assert.equal(a.reviewer_note, 'Fine, on-topic.'); assert.ok(a.reviewed_at > 0);
});

test('migration 0068 is additive and matches between D1 and Postgres', () => {
  for (const f of ['drizzle/0068_ai_review_queue.sql', 'db/postgres/0068_ai_review_queue.sql']) {
    const sql = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_review_queue/); assert.doesNotMatch(sql, /\b(DROP|ALTER|DELETE|RENAME|TRUNCATE)\b/i);
  }
});
