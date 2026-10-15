/** #441: Kindle town hall PoC (docs §9.4): 24-hour citizen questions and up-votes, top 10 answered by the AI candidate after close.
 *  HARIMU_TEST_STORAGE=postgres runs the runtime tests on PGlite. */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { postgresMigrations, isDestructive } from '../scripts/postgres-migrations.mjs';

const require = createRequire(import.meta.url);
const compile = async file => ts.transpileModule(await readFile(new URL(`../app/${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const load = async (file, shims) => { const exports = {}; new Function('exports', 'require', await compile(file))(exports, name => shims[name] ?? require(name)); return exports; };
const rt = await localRuntime(); after(() => rt.close());
const rules = await rt.importModule('lib/town-hall-rules.ts');
const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const previewEnv = { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' };
const DAY = 24 * 3600;
const CANDIDATE = 'ines-varro', OTHER = 'mara-quell';
const tables = ['town_halls', 'town_hall_questions', 'town_hall_votes', 'town_hall_answers'];
const tierOne = (r, user) => ({ userId: user, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
const reply = 'Our platform puts steady work and public works first, and I will keep trade deals careful and open to review by every citizen.';

test('#441 rules: window, question text, ranking ties and exactly the top 10', () => {
  assert.equal(rules.townHallWindowSeconds, DAY); assert.equal(rules.townHallTopAnswered, 10);
  assert.equal(rules.validQuestionText('What will you do about jobs?'), true);
  for (const bad of ['', 'too short', ' padded question here ', 'x'.repeat(201), 'Visit https://example.com now please', 'mail me@example.com please', 'a <b>bold</b> question', 'bell\u0007 char in a question', null, 7]) assert.equal(rules.validQuestionText(bad), false, String(bad));
  assert.equal(rules.validQuestionText('x'.repeat(200)), true);
  assert.equal(rules.townHallStage(5, null, null), 'waiting'); assert.equal(rules.townHallStage(9, 10, 10 + DAY), 'waiting');
  assert.equal(rules.townHallStage(10, 10, 10 + DAY), 'open'); assert.equal(rules.townHallStage(10 + DAY - 1, 10, 10 + DAY), 'open'); assert.equal(rules.townHallStage(10 + DAY, 10, 10 + DAY), 'closed');
  const q = (id, votes, createdAt) => ({ id, votes, createdAt });
  assert.deepEqual(rules.rankQuestions([q('b', 2, 5), q('a', 2, 5), q('c', 2, 3), q('d', 5, 9), q('e', 0, 1)]).map(x => x.id), ['d', 'c', 'a', 'b', 'e'], 'votes, then earliest, then id');
  const many = Array.from({ length: 14 }, (_, i) => q(`q${String(i).padStart(2, '0')}`, i % 3, i));
  const top = rules.topQuestions(many); assert.equal(top.length, 10); assert.deepEqual(top.map(x => x.id), rules.rankQuestions(many).slice(0, 10).map(x => x.id));
  assert.equal(rules.topQuestions(many.slice(0, 4)).length, 4, 'fewer than 10 questions: all are answered');
  assert.deepEqual(rules.topQuestions([]), []);
});

test('#441: the flags default to "false", migration 0044 only adds tables, and no route or page can trigger an AI answer', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  for (const flag of ['HARIMU_TOWN_HALLS_ENABLED', 'HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED']) assert.deepEqual([...cfg.matchAll(new RegExp(`"${flag}"\\s*:\\s*"([^"]*)"`, 'g'))].map(m => m[1]), ['false'], flag);
  assert.doesNotMatch(cfg, /"HARIMU_TOWN_HALL_OPEN_AT"\s*:/, 'no open time is configured: it never opens by default');
  for (const file of ['../drizzle/0044_town_halls.sql', '../db/postgres/0044_town_halls.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.equal(isDestructive(sql), false, file); assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file);
    assert.deepEqual([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), tables, file);
  }
  const migration = postgresMigrations().find(m => m.file.startsWith('0044_')); assert.deepEqual(migration.tables, tables);
  const route = await readFile(new URL('../app/api/town-hall/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /town-hall-ai|prepareTownHallAnswer|runTownHallCron|\.AI\b|ai-budget|ai-news/i, 'the route never reaches the AI');
  assert.match(await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8'), /runTownHallCron/);
  assert.doesNotMatch(await readFile(new URL('../lib/town-hall.ts', import.meta.url), 'utf8'), /ai-budget|ai-news|cabinet-response/, 'the read/write module has no AI imports');
});

const writePattern = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
function recordWrites(r) {
  const writes = []; const prepare = r.db.prepare.bind(r.db); const batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (writePattern.test(sql)) writes.push(sql.replace(/\s+/g, ' ').slice(0, 90)); return prepare(sql); };
  r.db.batch = statements => { writes.push(`batch(${statements.length})`); return batch(statements); };
  return { writes, restore() { r.db.prepare = prepare; r.db.batch = batch; } };
}
async function setup(t, { flag = true, preview = true, openAtOffset = 0 } = {}) {
  const r = await localRuntime(preview ? { accountElectionBindings: previewEnv } : {}); t.after(() => r.close());
  const open = Math.floor(r.now / 1000) + openAtOffset, iso = new Date(r.now).toISOString();
  if (flag) r.setFixtureEnv('HARIMU_TOWN_HALLS_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_TOWN_HALL_OPEN_AT', String(open));
  const citizen = async user => { if (!['alice', 'bob'].includes(user)) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(user, `Private ${user}`, iso, iso).run(); };
  const ask = (user, text, extra = {}) => r.call('town-hall', user, { action: 'ask', candidateId: CANDIDATE, requestId: randomUUID(), text, ...extra });
  const vote = (user, questionId, extra = {}) => r.call('town-hall', user, { action: 'vote', questionId, requestId: randomUUID(), ...extra });
  const count = async table => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
  const hall = async (user = 'alice', id = CANDIDATE) => (await r.call('town-hall', user)).data.halls.find(h => h.candidateId === id);
  const aiEnv = (ai, extra = {}) => ({ AI: ai, HARIMU_TOWN_HALLS_ENABLED: 'true', HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED: 'true', HARIMU_AI_DAILY_BUDGET_MICRO: '970000', HARIMU_AI_GATEWAY_ID: 'harimu-test', ...extra });
  const cron = async (env, now = Math.floor(r.now / 1000)) => (await r.importModule('lib/town-hall-ai.ts')).runTownHallCron(r.db, now, env);
  return { r, open, citizen, ask, vote, count, hall, aiEnv, cron };
}
/** A scripted gateway: answers by model and by the response format of each call, and records every call. */
const gateway = (text = reply) => ({ seen: [], async run(model, input, options) {
  this.seen.push({ model, input, options });
  if (model.includes('guard')) return { response: 'safe' };
  const required = input.response_format?.json_schema?.required ?? [];
  return { response: required.includes('supported') ? JSON.stringify({ supported: true }) : JSON.stringify({ response: text }) };
} });
const Q = n => `Question number ${String.fromCharCode(97 + n)} for the candidate about jobs and trade?`;

test(`#441 ${backend}: flag off is a complete no-op (even with an open time set)`, async t => {
  const c = await setup(t, { flag: false }); const { r } = c;
  const probe = recordWrites(r);
  try {
    const got = await r.call('town-hall', 'alice'); assert.equal(got.status, 404); assert.deepEqual(got.data, { enabled: false });
    assert.equal((await c.ask('alice', Q(0))).status, 404); assert.equal((await c.vote('alice', 'x')).status, 404);
    const ai = gateway(); assert.deepEqual(await c.cron(c.aiEnv(ai, { HARIMU_TOWN_HALLS_ENABLED: 'false' })), { status: 'disabled', results: [] }); assert.equal(ai.seen.length, 0);
    assert.deepEqual(probe.writes.filter(w => /town_hall/i.test(w)), [], 'no town hall write');
  } finally { probe.restore(); }
  for (const table of tables) assert.equal(await c.count(table), 0, table);
  assert.equal((await r.call('citizen', 'alice')).status, 200);
});

test(`#441 ${backend}: GET writes nothing: waiting, projected open and closed; a hall row appears only with the first question`, async t => {
  const c = await setup(t, { openAtOffset: 3600 }); const { r } = c;
  const read = async () => { const probe = recordWrites(r); try { const res = await r.call('town-hall', 'alice'); assert.equal(res.status, 200, JSON.stringify(res.data)); assert.deepEqual(probe.writes, []); assert.equal(res.cache, 'private, no-store'); return res.data; } finally { probe.restore(); } };
  const waiting = await read(); assert.equal(waiting.halls.length, 3, 'one town hall per AI presidential candidate'); assert.ok(waiting.halls.every(h => h.stage === 'waiting' && h.opensAt === c.open && h.questions.length === 0));
  assert.match(waiting.ai.disclosure, /AI/); assert.equal(waiting.ai.badge, true);
  r.setNow((c.open + 60) * 1000); const open = await read(); assert.ok(open.halls.every(h => h.stage === 'open' && h.closesAt === c.open + DAY));
  assert.equal(await c.count('town_halls'), 0, 'GET did not open a hall');
  assert.equal((await c.ask('alice', Q(0))).status, 200); assert.equal(await c.count('town_halls'), 1, 'POST opens only that candidate hall');
  assert.equal(Number((await r.db.prepare('SELECT opens_at AS o FROM town_halls').first()).o), c.open, 'opens_at is the configured time, not the request time');
  r.setNow((c.open + DAY + 5) * 1000); const closed = await read(); assert.ok(closed.halls.every(h => h.stage === 'closed'));
  assert.equal(await c.count('town_hall_answers'), 0, 'GET never answers');
  assert.equal((await r.call('town-hall', 'nobody-here')).status, 403, 'no citizen record');
  assert.equal((await r.call('town-hall', null)).status, 401);
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('town-hall', 'alice')).status, 403, 'Kindle citizens only');
});

test(`#441 ${backend}: intake: one question per citizen per hall, replay is a no-op, text and window are checked, the author is never shown`, async t => {
  const c = await setup(t); const { r } = c;
  await c.citizen('carol');
  r.setNow((c.open + 5) * 1000);
  const id = randomUUID(); const first = await c.ask('alice', Q(0), { requestId: id }); assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.alreadyRecorded, false);
  const replay = await c.ask('alice', Q(0), { requestId: id }); assert.equal(replay.status, 200); assert.equal(replay.data.alreadyRecorded, true); assert.equal(await c.count('town_hall_questions'), 1);
  assert.equal((await c.ask('bob', Q(1), { requestId: id })).status, 409, 'a request id used by another citizen');
  const second = await c.ask('alice', Q(2)); assert.equal(second.status, 409, 'one question per citizen per hall'); assert.equal(await c.count('town_hall_questions'), 1);
  assert.equal((await c.ask('alice', Q(3), { candidateId: OTHER })).status, 200, 'a different candidate is a different town hall'); assert.equal(await c.count('town_halls'), 2);
  for (const bad of ['short', 'see https://example.com for jobs please', 'x'.repeat(201)]) assert.equal((await c.ask('bob', bad)).status, 400, bad);
  assert.equal((await c.ask('bob', Q(4), { candidateId: 'nobody' })).status, 400); assert.equal((await c.ask('bob', Q(4), { requestId: 'not-a-uuid' })).status, 400);
  assert.equal((await r.call('town-hall', 'bob', { action: 'delete', requestId: randomUUID() })).status, 400);
  assert.equal((await r.call('town-hall', 'bob', { action: 'ask', candidateId: CANDIDATE, requestId: randomUUID(), text: Q(4) }, 'https://evil.invalid')).status, 403, 'same-origin only');
  const view = await c.hall('bob'); assert.equal(view.questions.length, 1); assert.equal(view.questions[0].mine, false); assert.equal((await c.hall('alice')).questions[0].mine, true); assert.equal((await c.hall('alice')).asked, true);
  assert.doesNotMatch(JSON.stringify((await r.call('town-hall', 'bob')).data), /alice|Private alice|author|clerk/i, 'no author identity leaves the server');
  assert.equal((await c.ask('bob', Q(5), { candidateId: OTHER })).status, 200);
  // Outside the window: before it opens and after it closes.
  r.setNow((c.open - 10) * 1000); assert.equal((await c.ask('carol', Q(6))).status, 409);
  r.setNow((c.open + DAY) * 1000); assert.equal((await c.ask('carol', Q(6))).status, 409, 'closed at exactly 24 hours');
});

test(`#441 ${backend}: only verified Kindle humans take part; a preview-off caller needs Tier 1`, async t => {
  const c = await setup(t, { preview: false }); const { r } = c;
  r.setNow((c.open + 5) * 1000);
  const refused = await c.ask('alice', Q(0)); assert.equal(refused.status, 403); assert.equal(await c.count('town_halls'), 0);
  const read = await r.call('town-hall', 'alice'); assert.equal(read.status, 200); assert.equal(read.data.eligibility.eligible, false, 'reading is open to Kindle citizens, writing is not');
  r.setVerification('alice', tierOne(r, 'alice')); r.setVerification('bob', tierOne(r, 'bob'));
  assert.equal((await c.ask('alice', Q(0))).status, 200);
  const id = (await c.hall('bob')).questions[0].id;
  assert.equal((await c.vote('bob', id)).status, 200);
  r.setVerification('bob', { ...tierOne(r, 'bob'), revoked: true }); assert.equal((await c.ask('bob', Q(1))).status, 403, 'revoked evidence is refused');
});

test(`#441 ${backend}: voting: one up-vote per citizen per question, never your own, replay and duplicates are no-ops, only while open`, async t => {
  const c = await setup(t); const { r } = c; await c.citizen('carol');
  r.setNow((c.open + 5) * 1000);
  assert.equal((await c.ask('alice', Q(0))).status, 200);
  const id = (await c.hall('bob')).questions[0].id;
  assert.equal((await c.vote('alice', id)).status, 409, 'not your own question');
  const rid = randomUUID(); const v1 = await c.vote('bob', id, { requestId: rid }); assert.equal(v1.status, 200, JSON.stringify(v1.data)); assert.equal(v1.data.alreadyRecorded, false);
  assert.equal((await c.hall('carol')).questions[0].votes, 1); assert.equal((await c.hall('bob')).questions[0].voted, true); assert.equal((await c.hall('carol')).questions[0].voted, false);
  const replay = await c.vote('bob', id, { requestId: rid }); assert.equal(replay.status, 200); assert.equal(replay.data.alreadyRecorded, true);
  const dup = await c.vote('bob', id); assert.equal(dup.status, 200); assert.equal(dup.data.alreadyRecorded, true); assert.equal(await c.count('town_hall_votes'), 1);
  assert.equal((await c.vote('carol', id, { requestId: rid })).status, 409, 'a receipt used by someone else');
  assert.equal((await c.vote('carol', 'no-such-question')).status, 404); assert.equal((await c.vote('carol', 5)).status, 400);
  assert.equal((await c.vote('carol', id)).status, 200); assert.equal((await c.hall('alice')).questions[0].votes, 2);
  r.setNow((c.open + DAY + 1) * 1000);
  await c.citizen('dave'); assert.equal((await c.vote('dave', id)).status, 409, 'closed'); assert.equal(await c.count('town_hall_votes'), 2);
});

test(`#441 ${backend}: after close exactly the top 10 are answered by the AI, labeled, through the gateway; nothing is generated before close`, async t => {
  const c = await setup(t); const { r } = c;
  const users = Array.from({ length: 12 }, (_, i) => `u${i}`); for (const u of users) await c.citizen(u);
  for (const [i, u] of users.entries()) { r.setNow((c.open + 10 + i) * 1000); assert.equal((await c.ask(u, Q(i))).status, 200, u); }
  const ids = Object.fromEntries((await c.hall('u0')).questions.map(q => [q.text, q.id]));
  const idOf = i => ids[Q(i)];
  r.setNow((c.open + 100) * 1000);
  for (const [voter, target] of [['u1', 0], ['u2', 0], ['u3', 0], ['u0', 1], ['u2', 1], ['u0', 2], ['u1', 2], ['u5', 11]]) assert.equal((await c.vote(voter, idOf(target))).status, 200, `${voter}->${target}`);
  const ai = gateway(); const env = c.aiEnv(ai);
  assert.deepEqual(await c.cron(env), { status: 'ran', results: ['idle'] }, 'still open: nothing is selected or generated'); assert.equal(ai.seen.length, 0);
  assert.equal((await c.hall('u0')).questions.every(q => q.answerStatus === 'none' && !q.selected), true);
  r.setNow((c.open + DAY + 5) * 1000);
  const closed = await c.hall('u0'); const selected = closed.questions.filter(q => q.selected);
  assert.equal(selected.length, 10); assert.deepEqual(selected.map(q => q.text).slice(0, 4), [Q(0), Q(1), Q(2), Q(11)], 'most votes first; the tie between 1 and 2 goes to the earlier question, 11 has one vote');
  assert.deepEqual(closed.questions.filter(q => !q.selected).map(q => q.text).sort(), [Q(9), Q(10)].sort(), 'the two latest zero-vote questions are not selected');
  assert.ok(closed.questions.filter(q => q.selected).every(q => q.answer === null && q.answerStatus === 'pending'), 'a fail-closed "no answer yet" until the Worker answers');
  assert.equal(ai.seen.length, 0, 'GET made no inference call'); assert.equal(await c.count('town_hall_answers'), 0);
  const runs = []; for (let i = 0; i < 6; i++) { const res = await c.cron(env); runs.push(...res.results); if (res.results.includes('idle')) break; }
  assert.equal(runs.at(-1), 'idle'); assert.equal(runs.filter(x => x === 'recorded').length, 10, 'exactly ten answers');
  assert.equal(ai.seen.length, 30, 'draft, check and safety call per answer');
  for (const call of ai.seen) assert.deepEqual(call.options, { gateway: { id: 'harimu-test' } });
  const drafts = ai.seen.filter(s => s.input.response_format?.json_schema?.required?.includes('response')); assert.equal(drafts.length, 10);
  for (const d of drafts) { assert.match(d.input.messages[0].content, /untrusted/); assert.match(d.input.messages[1].content, /platformCards/); assert.doesNotMatch(JSON.stringify(d.input), /u\d+|alice|Private/); }
  assert.match(drafts[0].input.messages[1].content, /Ines Varro/); assert.match(drafts[0].input.messages[1].content, /Hire|full employment|Full employment|jobs/i);
  const after = await c.hall('u0');
  assert.equal(after.questions.filter(q => q.answerStatus === 'answered').length, 10); assert.ok(after.questions.filter(q => q.answer).every(q => q.answer.ai === true && q.answer.text === reply));
  assert.deepEqual(after.questions.filter(q => !q.selected).map(q => q.answerStatus), ['none', 'none']);
  const reservations = (await r.db.prepare("SELECT status FROM harimu_ai_reservations WHERE request_id LIKE 'townhall:%'").all()).results; assert.equal(reservations.length, 10); assert.ok(reservations.every(x => x.status === 'finished'));
  const before = ai.seen.length; assert.deepEqual((await c.cron(env)).results, ['idle']); assert.equal(ai.seen.length, before, 'repeated and overlapping runs never re-call or re-publish');
  await Promise.all([c.cron(env), c.cron(env)]); assert.equal(ai.seen.length, before); assert.equal(await c.count('town_hall_answers'), 10);
  // The other candidates' halls never opened, so there is nothing for them.
  assert.equal((await c.hall('u0', OTHER)).questions.length, 0);
});

test(`#441 ${backend}: AI off, no binding, an exhausted budget, a gateway failure or an unsafe answer leave questions unanswered without error`, async t => {
  const c = await setup(t); const { r } = c; await c.citizen('carol');
  r.setNow((c.open + 5) * 1000); assert.equal((await c.ask('alice', Q(0))).status, 200); assert.equal((await c.ask('bob', Q(1))).status, 200);
  r.setNow((c.open + DAY + 5) * 1000);
  const answers = async () => (await c.hall('carol')).questions.map(q => q.answerStatus);
  const ai = gateway();
  assert.equal((await c.cron(c.aiEnv(ai, { HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED: 'false' }))).status, 'disabled');
  assert.equal((await c.cron(c.aiEnv(undefined))).status, 'disabled'); assert.equal((await c.cron(c.aiEnv(ai, { HARIMU_AI_DAILY_BUDGET_MICRO: undefined }))).status, 'disabled', 'no budget config, no AI');
  assert.equal(ai.seen.length, 0); assert.deepEqual(await answers(), ['pending', 'pending']);
  assert.deepEqual((await c.cron(c.aiEnv(ai, { HARIMU_AI_DAILY_BUDGET_MICRO: '1' }))).results, ['budget-unavailable']); assert.equal(ai.seen.length, 0, 'exhausted budget: no call'); assert.deepEqual(await answers(), ['pending', 'pending']);
  assert.equal(await c.count('harimu_ai_reservations'), 0, 'a refused reservation leaves no row');
  const down = { seen: [], async run() { this.seen.push(1); throw new Error('gateway down'); } };
  assert.deepEqual((await c.cron(c.aiEnv(down))).results, ['failed', 'failed', 'idle']); assert.deepEqual(await answers(), ['pending', 'pending'], 'a failed gateway call publishes nothing');
  assert.deepEqual((await c.cron(c.aiEnv(down))).results, ['idle'], 'one attempt per question per UTC day'); assert.equal(down.seen.length, 2);
  r.setNow((c.open + DAY + 5 + 2 * DAY) * 1000); // a later day: the unanswered questions are tried again
  const unsafe = { seen: [], async run(model, input) { this.seen.push(model); if (model.includes('guard')) return { response: 'unsafe' }; return gateway().run.call({ seen: [] }, model, input); } };
  assert.deepEqual((await c.cron(c.aiEnv(unsafe))).results, ['failed', 'failed', 'idle']); assert.deepEqual(await answers(), ['pending', 'pending'], 'an unsafe answer is never published');
  assert.equal(await c.count('town_hall_answers'), 0);
  r.setNow((c.open + DAY + 5 + 4 * DAY) * 1000);
  assert.deepEqual((await c.cron(c.aiEnv(gateway()))).results, ['recorded', 'recorded', 'idle']); assert.deepEqual(await answers(), ['answered', 'answered']);
});

test(`#441 ${backend}: an answer outside the platform is refused by the check, and a closed hall with no questions has nothing to answer`, async t => {
  const c = await setup(t); const { r } = c;
  r.setNow((c.open + 5) * 1000); assert.equal((await c.ask('alice', Q(0))).status, 200);
  r.setNow((c.open + DAY + 5) * 1000);
  const off = { seen: [], async run(model, input) { this.seen.push(model); if (model.includes('guard')) return { response: 'safe' }; const required = input.response_format?.json_schema?.required ?? []; return { response: required.includes('supported') ? JSON.stringify({ supported: false }) : JSON.stringify({ response: reply }) }; } };
  assert.deepEqual((await c.cron(c.aiEnv(off))).results, ['failed', 'idle']); assert.equal(off.seen.length, 2, 'draft and check; the safety model is not reached'); assert.equal(await c.count('town_hall_answers'), 0);
  const empty = await setup(t); empty.r.setNow((empty.open + DAY + 5) * 1000);
  const ai = gateway(); assert.deepEqual((await empty.cron(empty.aiEnv(ai))).results, ['idle']); assert.equal(ai.seen.length, 0);
});

test(`#441: the panel renders the Content copy, the AI label, the question list and the no-answer state`, async () => {
  const copy = (await rt.importModule('lib/campaign-copy.ts')).townHallCopy;
  const tags = await load('ai-disclosure.tsx', {}), actions = await load('action-button.tsx', {});
  const { TownHallPanel } = await load('town-hall.tsx', {
    '../lib/campaign-copy': { townHallCopy: copy }, './action-button': actions, './ai-disclosure': tags, './game-timer': { GameTimer: ({ label }) => React.createElement('span', null, label) },
    './nation-document': { NationDocument: ({ label, children }) => React.createElement('section', { 'aria-label': label }, children) },
  });
  const hall = (stage, questions = [], extra = {}) => ({ id: 'h', candidateId: CANDIDATE, candidateName: 'Ines Varro', platform: 'Full employment and cautious trade.', stage, opensAt: 1, closesAt: 2, asked: false, questions, ...extra });
  const base = halls => ({ enabled: true, electionId: 'e', halls, ai: { disclosure: copy.aiDisclosure.text, badge: true }, eligibility: { eligible: true, reason: '' } });
  const html = (snapshot, props = {}) => renderToStaticMarkup(React.createElement(TownHallPanel, { snapshot, onAsk: () => {}, onVote: () => {}, busy: false, error: '', ...props }));
  const open = html(base([hall('open', [{ id: 'q1', text: 'What about jobs?', votes: 3, mine: false, voted: false, selected: false, answer: null, answerStatus: 'none' }])]));
  assert.ok(open.includes('Ines Varro')); assert.ok(open.includes('What about jobs?')); assert.ok(open.includes('3')); assert.ok(open.includes('Ask'), 'a question form while open');
  assert.ok(copy.callForQuestions.some(l => open.includes(l.text.replace('{candidate}', 'Ines Varro'))), 'the call for questions is Content copy');
  const closed = html(base([hall('closed', [
    { id: 'q1', text: 'Answered one?', votes: 3, mine: false, voted: false, selected: true, answer: { text: reply, ai: true, at: 5 }, answerStatus: 'answered' },
    { id: 'q2', text: 'Waiting one?', votes: 2, mine: true, voted: false, selected: true, answer: null, answerStatus: 'pending' },
    { id: 'q3', text: 'Unranked one?', votes: 0, mine: false, voted: false, selected: false, answer: null, answerStatus: 'none' }])]));
  assert.ok(closed.includes(reply)); assert.ok(closed.includes('No answer yet')); assert.ok(closed.includes(copy.aiDisclosure.text.replace('{candidate}', 'Ines Varro')), 'the AI disclosure names the candidate');
  assert.equal(closed.includes('Ask</button>'), false, 'no question form once closed');
  assert.ok(copy.questionsClosed.some(l => closed.includes(l.text.replace('{candidate}', 'Ines Varro')))); assert.ok(copy.answersIntro.some(l => closed.includes(l.text.replace('{candidate}', 'Ines Varro'))));
  const waiting = html(base([hall('waiting')])); assert.ok(waiting.includes('not opened') || waiting.includes('not open'));
});
