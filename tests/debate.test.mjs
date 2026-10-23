/** #282: Kindle presidential debate PoC (docs §9.4): citizen questions and up-votes through the town hall path, the top 5 put to every AI candidate, a transcript with a fact-check panel.
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
const rules = await rt.importModule('lib/debate-rules.ts');
const copyModule = await rt.importModule('lib/debate-copy.ts');
const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const previewEnv = { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' };
const DAY = 24 * 3600;
const CANDIDATES = ['ines-varro', 'tobin-achterberg', 'mara-quell'];
const tierOne = (r, user) => ({ userId: user, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
const reply = 'Our treasury and the income tax should serve every Resident, and I will keep trade deals careful and open to review by all.';
const Q = n => `Debate question number ${String.fromCharCode(97 + n)} for every candidate about jobs and trade?`;

test('#282 rules: window, exactly the top 5 by votes then earliest then id, and the fact-check matcher', () => {
  assert.equal(rules.debateWindowSeconds, DAY); assert.equal(rules.debateQuestionsAsked, 5);
  assert.equal(rules.debateStage(5, null, null), 'waiting'); assert.equal(rules.debateStage(10, 10, 10 + DAY), 'open'); assert.equal(rules.debateStage(10 + DAY, 10, 10 + DAY), 'closed');
  const q = (id, votes, createdAt) => ({ id, votes, createdAt });
  const many = [q('g', 1, 7), q('f', 1, 6), q('e', 4, 5), q('d', 4, 5), q('c', 4, 3), q('b', 9, 9), q('a', 0, 1)];
  assert.deepEqual(rules.debateTopQuestions(many).map(x => x.id), ['b', 'c', 'd', 'e', 'f'], 'votes, then earliest submitted, then id');
  assert.deepEqual(rules.debateTopQuestions(many).map(x => x.id), rules.debateTopQuestions([...many].reverse()).map(x => x.id), 'input order never matters');
  assert.equal(rules.debateTopQuestions(many.slice(0, 3)).length, 3); assert.deepEqual(rules.debateTopQuestions([]), []);
  const figures = { 'income-tax': { value: 15, text: '15%' }, treasury: { value: 1234.5, text: '1234.50 SPK' }, stability: { value: 62, text: '62 of 100' } };
  const one = text => rules.factChecks(text, figures);
  assert.deepEqual(one('Taxes are 15% today.'), [{ kind: 'income-tax', claim: 'Taxes are 15% today.', systemFigure: '15%', verdict: 'matches' }]);
  assert.equal(one('I will lower income tax to 20%.')[0].verdict, 'differs');
  assert.equal(one('The treasury holds 1,234.50 coins.')[0].verdict, 'matches'); assert.equal(one('The treasury holds 99.')[0].verdict, 'differs');
  assert.deepEqual(one('Stability is 62.').map(x => [x.kind, x.verdict]), [['stability', 'matches']]);
  assert.deepEqual(one('Our treasury must serve every Resident.').map(x => [x.kind, x.systemFigure, x.verdict]), [['treasury', '1234.50 SPK', null]], 'no number in the claim: the figure only');
  assert.deepEqual(one('Jobs and housing come first.'), [], 'no tracked subject, no entry');
  assert.deepEqual(one('Tax and the treasury matter. Stability too.').map(x => x.kind), ['income-tax', 'treasury', 'stability'], 'one entry per sentence and subject, in sentence order');
  assert.deepEqual(rules.factChecks('Taxes are 15% today.', { treasury: figures.treasury }), [], 'a figure that cannot be read is left out');
  assert.deepEqual(rules.factChecks('', figures), []);
});

test('#282: the flags default to "false", migration 0048 only adds the answers table, and nothing can reach the AI from a route or a read', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  for (const flag of ['HARIMU_DEBATE_ENABLED', 'HARIMU_AI_DEBATE_ANSWERS_ENABLED']) assert.deepEqual([...cfg.matchAll(new RegExp(`"${flag}"\\s*:\\s*"([^"]*)"`, 'g'))].map(m => m[1]), ['true'], flag);
  assert.match(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'), /"HARIMU_DEBATE_ENABLED": "false"/);
  assert.doesNotMatch(cfg, /"HARIMU_DEBATE_OPEN_AT"\s*:/, 'no open time is configured: it never opens by default');
  for (const file of ['../drizzle/0048_debate_answers.sql', '../db/postgres/0048_debate_answers.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.equal(isDestructive(sql), false, file); assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file);
    assert.deepEqual([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), ['debate_answers'], file);
  }
  assert.deepEqual(postgresMigrations().find(m => m.file.startsWith('0048_')).tables, ['debate_answers']);
  const route = await readFile(new URL('../app/api/debate/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /debate-ai|runDebateCron|prepareDebateAnswer|generateAnswer|\.AI\b|ai-budget|ai-news/i, 'the route never reaches the AI');
  assert.match(await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8'), /runDebateCron/);
  const lib = await readFile(new URL('../lib/debate.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /ai-budget|ai-news|cabinet-response|town-hall-ai/, 'the read/write module has no AI imports');
  assert.match(lib, /askInHall/); assert.match(lib, /voteQuestion/);
  assert.doesNotMatch(lib, /INSERT INTO town_hall_(questions|votes)/, 'questions and up-votes are the town hall path, not a copy of it');
  const ai = await readFile(new URL('../lib/debate-ai.ts', import.meta.url), 'utf8'); assert.match(ai, /generateAnswer/, 'the answer pipeline is the town hall one');
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
  if (flag) r.setFixtureEnv('HARIMU_DEBATE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_DEBATE_OPEN_AT', String(open));
  const citizen = async user => { if (!['alice', 'bob'].includes(user)) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(user, `Private ${user}`, iso, iso).run(); };
  const ask = (user, text, extra = {}) => r.call('debate', user, { action: 'ask', requestId: randomUUID(), text, ...extra });
  const vote = (user, questionId, extra = {}) => r.call('debate', user, { action: 'vote', questionId, requestId: randomUUID(), ...extra });
  const count = async table => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
  const view = async (user = 'alice') => (await r.call('debate', user)).data.debate;
  const aiEnv = (ai, extra = {}) => ({ AI: ai, HARIMU_DEBATE_ENABLED: 'true', HARIMU_AI_DEBATE_ANSWERS_ENABLED: 'true', HARIMU_AI_DAILY_BUDGET_MICRO: '970000', HARIMU_AI_GATEWAY_ID: 'harimu-test', ...extra });
  const cron = async (env, now = Math.floor(r.now / 1000)) => (await r.importModule('lib/debate-ai.ts')).runDebateCron(r.db, now, env);
  // n citizens each ask one question, with `votes[i]` up-votes spread over the others; returns question ids by index.
  const seed = async (n, votes = {}) => {
    const users = Array.from({ length: n }, (_, i) => `u${i}`); for (const u of users) await c.citizen(u);
    for (const [i, u] of users.entries()) { r.setNow((open + 10 + i) * 1000); assert.equal((await ask(u, Q(i))).status, 200, u); }
    const ids = Object.fromEntries((await view('u0')).questions.map(q => [q.text, q.id]));
    r.setNow((open + 100) * 1000);
    for (const [i, count] of Object.entries(votes)) { let given = 0; for (const voter of [...users, 'alice', 'bob']) { if (given >= count) break; if (voter === users[i]) continue; assert.equal((await vote(voter, ids[Q(Number(i))])).status, 200); given++; } }
    return ids;
  };
  const c = { r, open, citizen, ask, vote, count, view, aiEnv, cron, seed }; return c;
}
const gateway = (text = reply) => ({ seen: [], async run(model, input, options) {
  this.seen.push({ model, input, options });
  if (model.includes('guard')) return { response: 'safe' };
  const required = input.response_format?.json_schema?.required ?? [];
  return { response: required.includes('supported') ? JSON.stringify({ supported: true }) : JSON.stringify({ response: text }) };
} });

test(`#282 ${backend}: flag off is a complete no-op (even with an open time set)`, async t => {
  const c = await setup(t, { flag: false }); const { r } = c;
  const probe = recordWrites(r);
  try {
    const got = await r.call('debate', 'alice'); assert.equal(got.status, 404); assert.deepEqual(got.data, { enabled: false });
    assert.equal((await c.ask('alice', Q(0))).status, 404); assert.equal((await c.vote('alice', 'x')).status, 404);
    const ai = gateway(); assert.deepEqual(await c.cron(c.aiEnv(ai, { HARIMU_DEBATE_ENABLED: 'false' })), { status: 'disabled', results: [] }); assert.equal(ai.seen.length, 0);
    assert.deepEqual(probe.writes, [], 'no write at all');
  } finally { probe.restore(); }
  for (const table of ['town_halls', 'town_hall_questions', 'town_hall_votes', 'debate_answers']) assert.equal(await c.count(table), 0, table);
  assert.equal((await r.call('citizen', 'alice')).status, 200);
});

test(`#282 ${backend}: GET writes nothing: waiting, projected open and closed; the hall row appears only with the first question`, async t => {
  const c = await setup(t, { openAtOffset: 3600 }); const { r } = c;
  const read = async () => { const probe = recordWrites(r); try { const res = await r.call('debate', 'alice'); assert.equal(res.status, 200, JSON.stringify(res.data)); assert.deepEqual(probe.writes, []); assert.equal(res.cache, 'private, no-store'); return res.data; } finally { probe.restore(); } };
  const waiting = await read(); assert.equal(waiting.debate.stage, 'waiting'); assert.equal(waiting.debate.opensAt, c.open); assert.deepEqual(waiting.debate.questions, []); assert.equal(waiting.debate.transcript, null); assert.equal(waiting.ai.badge, true);
  r.setNow((c.open + 60) * 1000); const open = await read(); assert.equal(open.debate.stage, 'open'); assert.equal(open.debate.closesAt, c.open + DAY); assert.equal(await c.count('town_halls'), 0, 'GET did not open the debate');
  assert.equal((await c.ask('alice', Q(0))).status, 200); assert.equal(await c.count('town_halls'), 1);
  assert.equal(Number((await r.db.prepare('SELECT opens_at AS o FROM town_halls').first()).o), c.open, 'opens_at is the configured time, not the request time');
  r.setNow((c.open + DAY + 5) * 1000); const closed = await read(); assert.equal(closed.debate.stage, 'closed'); assert.equal(await c.count('debate_answers'), 0, 'GET never answers');
  assert.equal(closed.debate.transcript.length, 1, 'a closed debate with one question puts that question');
  assert.equal((await r.call('debate', 'nobody-here')).status, 403, 'no citizen record'); assert.equal((await r.call('debate', null)).status, 401);
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run(); assert.equal((await r.call('debate', 'alice')).status, 403, 'Kindle citizens only');
});

test(`#282 ${backend}: intake and up-votes: one question and one vote per citizen, replays are no-ops, never your own, only while open, the author is never shown`, async t => {
  const c = await setup(t); const { r } = c; await c.citizen('carol');
  r.setNow((c.open + 5) * 1000);
  const id = randomUUID(); const first = await c.ask('alice', Q(0), { requestId: id }); assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.alreadyRecorded, false);
  assert.equal((await c.ask('alice', Q(0), { requestId: id })).data.alreadyRecorded, true); assert.equal((await c.ask('bob', Q(1), { requestId: id })).status, 409, 'a request id used by another citizen');
  const second = await c.ask('alice', Q(2)); assert.equal(second.status, 409); assert.match(second.data.error, /debate/); assert.equal(await c.count('town_hall_questions'), 1);
  for (const bad of ['short', 'see https://example.com for jobs please', 'x'.repeat(201)]) assert.equal((await c.ask('bob', bad)).status, 400, bad);
  assert.equal((await r.call('debate', 'bob', { action: 'ask', requestId: 'not-a-uuid', text: Q(1) })).status, 400); assert.equal((await r.call('debate', 'bob', { action: 'delete', requestId: randomUUID() })).status, 400);
  assert.equal((await r.call('debate', 'bob', { action: 'ask', requestId: randomUUID(), text: Q(1) }, 'https://evil.invalid')).status, 403, 'same-origin only');
  const qid = (await c.view('bob')).questions[0].id;
  assert.equal((await c.vote('alice', qid)).status, 409, 'not your own question');
  const rid = randomUUID(); const v1 = await c.vote('bob', qid, { requestId: rid }); assert.equal(v1.status, 200, JSON.stringify(v1.data)); assert.equal(v1.data.alreadyRecorded, false);
  assert.equal((await c.vote('bob', qid, { requestId: rid })).data.alreadyRecorded, true);
  const dup = await c.vote('bob', qid); assert.equal(dup.status, 200); assert.equal(dup.data.alreadyRecorded, true, 'a second vote on the same question is not counted'); assert.equal(await c.count('town_hall_votes'), 1);
  assert.equal((await c.vote('carol', qid, { requestId: rid })).status, 409, 'a receipt used by someone else'); assert.equal((await c.vote('carol', 'no-such-question')).status, 404);
  assert.equal((await c.view('carol')).questions[0].votes, 1); assert.equal((await c.view('bob')).questions[0].voted, true); assert.equal((await c.view('alice')).questions[0].mine, true);
  assert.doesNotMatch(JSON.stringify((await r.call('debate', 'bob')).data), /alice|Private alice|author|clerk/i, 'no author identity leaves the server');
  r.setNow((c.open - 10) * 1000); assert.equal((await c.ask('carol', Q(3))).status, 409, 'before it opens');
  r.setNow((c.open + DAY) * 1000); assert.equal((await c.ask('carol', Q(3))).status, 409, 'closed at exactly 24 hours'); assert.equal((await c.vote('carol', qid)).status, 409, 'votes close with the window'); assert.equal(await c.count('town_hall_votes'), 1);
});

test(`#282 ${backend}: parallel retries are one question and one vote; a receipt shared by two citizens says so`, async t => {
  const c = await setup(t); const { r } = c; for (const u of ['carol', 'dave', 'erin']) await c.citizen(u);
  r.setNow((c.open + 5) * 1000);
  const id = randomUUID(); const asks = await Promise.all([1, 2, 3].map(() => c.ask('alice', Q(0), { requestId: id })));
  assert.deepEqual(asks.map(x => x.status), [200, 200, 200]); assert.equal(asks.filter(x => x.data.alreadyRecorded === false).length, 1); assert.equal(await c.count('town_hall_questions'), 1); assert.equal(await c.count('town_halls'), 1);
  const qid = (await c.view('bob')).questions[0].id;
  const rid = randomUUID(); const votes = await Promise.all([1, 2, 3].map(() => c.vote('carol', qid, { requestId: rid })));
  assert.deepEqual(votes.map(x => x.status), [200, 200, 200]); assert.equal(votes.filter(x => x.data.alreadyRecorded === false).length, 1); assert.equal(await c.count('town_hall_votes'), 1);
  const shared = randomUUID(); const two = await Promise.all([c.vote('dave', qid, { requestId: shared }), c.vote('erin', qid, { requestId: shared })]);
  assert.deepEqual(two.map(x => x.status).sort(), [200, 409]); assert.match(two.find(x => x.status === 409).data.error, /receipt already used/i);
});

test(`#282 ${backend}: only verified Kindle humans take part; a preview-off caller needs Tier 1`, async t => {
  const c = await setup(t, { preview: false }); const { r } = c;
  r.setNow((c.open + 5) * 1000);
  assert.equal((await c.ask('alice', Q(0))).status, 403); assert.equal(await c.count('town_halls'), 0);
  const read = await r.call('debate', 'alice'); assert.equal(read.status, 200); assert.equal(read.data.eligibility.eligible, false, 'reading is open to Kindle citizens, writing is not');
  r.setVerification('alice', tierOne(r, 'alice')); r.setVerification('bob', tierOne(r, 'bob'));
  assert.equal((await c.ask('alice', Q(0))).status, 200); assert.equal((await c.vote('bob', (await c.view('bob')).questions[0].id)).status, 200);
  r.setVerification('bob', { ...tierOne(r, 'bob'), revoked: true }); assert.equal((await c.ask('bob', Q(1))).status, 403, 'revoked evidence is refused'); assert.equal((await c.vote('bob', (await c.view('alice')).questions[0].id)).status, 403);
});

test(`#282 ${backend}: the debate shares the town hall's tables but is its own hall: town hall reads, votes and answers never see it`, async t => {
  const c = await setup(t); const { r } = c; await c.citizen('carol');
  r.setNow((c.open + 5) * 1000);
  const th = (user, body) => r.call('town-hall', user, body); r.setFixtureEnv('HARIMU_TOWN_HALLS_ENABLED', 'true'); r.setFixtureEnv('HARIMU_TOWN_HALL_OPEN_AT', String(c.open));
  assert.equal((await c.ask('alice', Q(0))).status, 200); const debateQuestion = (await c.view('bob')).questions[0].id;
  assert.equal((await th('alice', { action: 'ask', candidateId: 'ines-varro', requestId: randomUUID(), text: Q(1) })).status, 200, 'the same citizen may also ask a town hall');
  const townQuestion = (await th('bob')).data.halls.find(h => h.candidateId === 'ines-varro').questions[0].id;
  const hall = (await th('bob')).data; assert.equal(hall.halls.length, 3); assert.ok(hall.halls.every(h => h.candidateId !== 'debate')); assert.equal(hall.halls.flatMap(h => h.questions).length, 1, 'no debate question in any town hall');
  assert.equal((await th('bob', { action: 'vote', questionId: debateQuestion, requestId: randomUUID() })).status, 404, 'a town hall vote cannot land on a debate question');
  assert.equal((await c.vote('bob', townQuestion)).status, 404, 'a debate vote cannot land on a town hall question'); assert.equal(await c.count('town_hall_votes'), 0);
  assert.equal((await c.vote('bob', debateQuestion)).status, 200); assert.equal(await c.count('town_hall_votes'), 1);
  r.setNow((c.open + DAY + 5) * 1000);
  const ai = gateway(); const townCron = await rt.importModule('lib/town-hall-ai.ts');
  const env = { AI: ai, HARIMU_TOWN_HALLS_ENABLED: 'true', HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED: 'true', HARIMU_AI_DAILY_BUDGET_MICRO: '970000', HARIMU_AI_GATEWAY_ID: 'harimu-test' };
  const results = []; for (let i = 0; i < 4; i++) { const res = await (await r.importModule('lib/town-hall-ai.ts')).runTownHallCron(r.db, Math.floor(r.now / 1000), env); results.push(...res.results); if (res.results.includes('idle')) break; }
  assert.deepEqual(results, ['recorded', 'idle'], 'the town hall cron answers only the town hall question'); assert.equal(await c.count('town_hall_answers'), 1);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM town_hall_answers a JOIN town_hall_questions q ON q.id=a.question_id JOIN town_halls h ON h.id=q.hall_id WHERE h.candidate_id=?').bind('debate').first()).n), 0);
  assert.ok(townCron);
});

test(`#282 ${backend}: exactly the top 5 are asked, in a fixed order, only once intake has closed`, async t => {
  const c = await setup(t); const { r } = c;
  const ids = await c.seed(8, { 0: 1, 1: 3, 2: 3, 3: 2, 7: 3 });
  const openView = await c.view('u0'); assert.equal(openView.transcript, null, 'nothing is selected while open'); assert.ok(openView.questions.every(q => !q.selected));
  r.setNow((c.open + DAY + 5) * 1000);
  const closed = await c.view('u0'); const picked = closed.questions.filter(q => q.selected);
  assert.equal(picked.length, 5); assert.deepEqual(closed.transcript.map(x => x.text), [Q(1), Q(2), Q(7), Q(3), Q(0)], 'votes, then the earlier question: 1 and 2 and 7 have three votes (earliest first), then 3 has two, then 0 has one');
  assert.deepEqual(closed.transcript.map(x => x.questionId), closed.questions.filter(q => q.selected).map(q => q.id), 'the transcript follows the ranking');
  assert.ok(closed.transcript.every(x => x.answers.length === 3 && x.answers.map(a => a.candidateId).join() === CANDIDATES.join()), 'every candidate answers every question');
  assert.ok(ids[Q(4)] && !picked.some(q => q.id === ids[Q(4)]));
  assert.equal(JSON.stringify((await c.view('u3')).transcript), JSON.stringify(closed.transcript), 'the selection does not depend on who is looking');
});

test(`#282 ${backend}: with the AI off every candidate answers every question with the fallback line, and the fact-check panel shows the true figures`, async t => {
  const c = await setup(t); const { r } = c;
  await c.seed(6, { 0: 2, 1: 1 });
  r.setFixtureEnv('HARIMU_KINDLE_INCOME_TAX_ENABLED', 'true');
  await r.db.prepare("INSERT INTO nation_stability_scores (nation_id,tick,scheduled_at,computed_at,stability,unrest,inputs_json,breakdown_json) VALUES ('kindle',1,1,1,62,10,'{}','{}')").run();
  const treasury = Number((await r.db.prepare((await rt.importModule('lib/economy.ts')).kindleTreasuryBalanceSql).first()).balance) / 100;
  r.setNow((c.open + DAY + 5) * 1000);
  const probe = recordWrites(r); let d; try { d = await c.view('u0'); assert.deepEqual(probe.writes, [], 'reading the transcript writes nothing, not even a fallback row'); } finally { probe.restore(); }
  assert.equal(d.usingFallback, true); assert.equal(d.transcript.length, 5);
  const fallbacks = copyModule.fallbackLines; const names = { 'ines-varro': 'Ines Varro', 'tobin-achterberg': 'Tobin Achterberg', 'mara-quell': 'Mara Quell' };
  for (const item of d.transcript) for (const a of item.answers) { assert.equal(a.source, 'fallback'); assert.equal(a.text, fallbacks.find(f => f.candidateId === a.candidateId).text.replace('{candidate}', names[a.candidateId])); }
  const tobin = d.transcript[0].answers.find(a => a.candidateId === 'tobin-achterberg');
  assert.deepEqual(tobin.factChecks.map(f => [f.kind, f.systemFigure, f.verdict]), [['income-tax', '15%', 'differs']], 'the pledged 20% is shown beside the 15% in force');
  assert.match(tobin.factChecks[0].claim, /Lower income tax to 20%/);
  assert.equal(await c.count('debate_answers'), 0);
  // With the income tax off the true rate is 0%.
  r.setFixtureEnv('HARIMU_KINDLE_INCOME_TAX_ENABLED', 'false'); assert.equal((await c.view('u0')).transcript[0].answers[1].factChecks[0].systemFigure, '0%');
  assert.ok(Number.isFinite(treasury));
});

test(`#282 ${backend}: after intake closes the AI candidates answer the top 5 through the gateway; claims on tax, the treasury and Stability get the true figure beside them`, async t => {
  const c = await setup(t); const { r } = c;
  await c.seed(7, { 0: 3, 1: 2, 2: 2, 3: 1 });
  r.setFixtureEnv('HARIMU_KINDLE_INCOME_TAX_ENABLED', 'true');
  await r.db.prepare("INSERT INTO nation_stability_scores (nation_id,tick,scheduled_at,computed_at,stability,unrest,inputs_json,breakdown_json) VALUES ('kindle',1,1,1,62,10,'{}','{}')").run();
  const treasuryText = `${(Number((await r.db.prepare((await rt.importModule('lib/economy.ts')).kindleTreasuryBalanceSql).first()).balance) / 100).toFixed(2)} SPK`;
  const ai = gateway(reply + ' Stability for all depends on it.'), env = c.aiEnv(ai);
  assert.deepEqual(await c.cron(env), { status: 'ran', results: ['idle'] }, 'still open: nothing generated'); assert.equal(ai.seen.length, 0);
  r.setNow((c.open + DAY + 5) * 1000);
  assert.equal((await c.view('u0')).transcript.every(x => x.answers.every(a => a.source === 'fallback')), true, 'before the Worker runs, fallbacks');
  assert.equal(ai.seen.length, 0, 'GET made no inference call');
  // The daily AI budget (#45) may not cover all 15 answers in one UTC day: the rest wait for the next day and show their fallback line meanwhile.
  const runs = []; let days = 0;
  for (let day = 0; day < 4 && runs.at(-1) !== 'idle'; day++) { days = day; r.setNow((c.open + DAY + 5 + day * DAY) * 1000); for (let i = 0; i < 8; i++) { const res = await c.cron(env); runs.push(...res.results); if (res.results.includes('idle') || res.results.includes('budget-unavailable')) break; } }
  assert.equal(runs.at(-1), 'idle'); assert.equal(runs.filter(x => x === 'recorded').length, 15, `five questions, three candidates (${days + 1} UTC day(s))`); assert.equal(ai.seen.length, 45, 'draft, check and safety call per answer');
  for (const call of ai.seen) assert.deepEqual(call.options, { gateway: { id: 'harimu-test' } });
  const drafts = ai.seen.filter(s => s.input.response_format?.json_schema?.required?.includes('response')); assert.equal(drafts.length, 15);
  for (const d of drafts) { assert.match(d.input.messages[0].content, /untrusted/); assert.match(d.input.messages[0].content, /fact-check/); assert.match(d.input.messages[1].content, /platformCards/); assert.doesNotMatch(JSON.stringify(d.input), /u\d+|alice|Private/); }
  for (const name of Object.values({ a: 'Ines Varro', b: 'Tobin Achterberg', c: 'Mara Quell' })) assert.equal(drafts.filter(d => d.input.messages[1].content.includes(name)).length, 5, name);
  const d = await c.view('u0'); assert.equal(d.usingFallback, false);
  for (const item of d.transcript) for (const a of item.answers) {
    assert.equal(a.source, 'ai'); assert.equal(a.text, reply + ' Stability for all depends on it.');
    assert.deepEqual(a.factChecks.map(f => [f.kind, f.systemFigure, f.verdict]), [['income-tax', '15%', null], ['treasury', treasuryText, null], ['stability', '62 of 100', null]], 'the true figure beside each claim');
  }
  const reservations = (await r.db.prepare("SELECT status FROM harimu_ai_reservations WHERE request_id LIKE 'debate:%'").all()).results; assert.equal(reservations.length, 15); assert.ok(reservations.every(x => x.status === 'finished'));
  const before = ai.seen.length; assert.deepEqual((await c.cron(env)).results, ['idle']); await Promise.all([c.cron(env), c.cron(env)]);
  assert.equal(ai.seen.length, before, 'repeated and overlapping runs never re-call or re-publish'); assert.equal(await c.count('debate_answers'), 15);
});

test(`#282 ${backend}: a spent budget, no binding, a flag off, a gateway failure, an unsafe or unsupported or numeric answer publish only fallbacks, and a spent budget makes no gateway call`, async t => {
  const c = await setup(t); const { r } = c;
  await c.seed(2); r.setNow((c.open + DAY + 5) * 1000);
  const onlyFallbacks = async () => (await c.view('u0')).transcript.every(x => x.answers.every(a => a.source === 'fallback')) && await c.count('debate_answers') === 0;
  const ai = gateway();
  assert.equal((await c.cron(c.aiEnv(ai, { HARIMU_AI_DEBATE_ANSWERS_ENABLED: 'false' }))).status, 'disabled'); assert.equal((await c.cron(c.aiEnv(undefined))).status, 'disabled'); assert.equal((await c.cron(c.aiEnv(ai, { HARIMU_AI_DAILY_BUDGET_MICRO: undefined }))).status, 'disabled');
  assert.equal(ai.seen.length, 0); assert.ok(await onlyFallbacks());
  assert.deepEqual((await c.cron(c.aiEnv(ai, { HARIMU_AI_DAILY_BUDGET_MICRO: '1' }))).results, ['budget-unavailable']); assert.equal(ai.seen.length, 0, 'budget spent: no gateway call'); assert.equal(await c.count('harimu_ai_reservations'), 0); assert.ok(await onlyFallbacks());
  const down = { seen: [], async run() { this.seen.push(1); throw new Error('gateway down'); } };
  assert.deepEqual((await c.cron(c.aiEnv(down))).results, ['failed', 'failed', 'failed']); assert.ok(await onlyFallbacks());
  const unsafe = { seen: [], async run(model, input) { if (model.includes('guard')) return { response: 'unsafe' }; return gateway().run.call({ seen: [] }, model, input); } };
  r.setNow((c.open + 3 * DAY) * 1000); assert.deepEqual((await c.cron(c.aiEnv(unsafe))).results, ['failed', 'failed', 'failed']); assert.ok(await onlyFallbacks(), 'an unsafe answer is never published');
  const unsupported = { seen: [], async run(model, input) { if (model.includes('guard')) return { response: 'safe' }; const required = input.response_format?.json_schema?.required ?? []; return { response: required.includes('supported') ? JSON.stringify({ supported: false }) : JSON.stringify({ response: reply }) }; } };
  r.setNow((c.open + 5 * DAY) * 1000); assert.deepEqual((await c.cron(c.aiEnv(unsupported))).results, ['failed', 'failed', 'failed']); assert.ok(await onlyFallbacks(), 'an answer outside the platform is refused by the check');
  const numeric = gateway('Our income tax will be twenty percent and 20 is the figure that I will keep for every Resident.');
  r.setNow((c.open + 7 * DAY) * 1000); assert.deepEqual((await c.cron(c.aiEnv(numeric))).results, ['failed', 'failed', 'failed']); assert.ok(await onlyFallbacks(), 'the validator refuses any figure in an answer');
  assert.equal(numeric.seen.length, 3, 'the draft is refused before the check and the safety model');
  r.setNow((c.open + 9 * DAY) * 1000); const good = gateway(); const run = []; for (let i = 0; i < 4; i++) { const res = await c.cron(c.aiEnv(good)); run.push(...res.results); if (res.results.includes('idle')) break; }
  assert.equal(run.filter(x => x === 'recorded').length, 6, 'two questions, three candidates'); assert.equal(await c.count('debate_answers'), 6);
  const empty = await setup(t); empty.r.setNow((empty.open + DAY + 5) * 1000); const g = gateway(); assert.deepEqual((await empty.cron(empty.aiEnv(g))).results, ['idle']); assert.equal(g.seen.length, 0); assert.equal((await empty.view('alice')).transcript, null, 'a debate nobody asked a question in has no transcript');
});

test(`#282: the panel renders the Content copy, the AI label, the fallback notice and the fact-check panel`, async () => {
  const tags = await load('ai-disclosure.tsx', {}), actions = await load('action-button.tsx', {});
  const { DebatePanel } = await load('debate.tsx', {
    '../lib/debate-copy': copyModule, './action-button': actions, './ai-disclosure': tags, './game-timer': { GameTimer: ({ label }) => React.createElement('span', null, label) },
    './nation-document': { NationDocument: ({ label, children }) => React.createElement('section', { 'aria-label': label }, children) },
  });
  const base = debate => ({ enabled: true, electionId: 'e', debate: { id: 'd', stage: 'open', opensAt: 1, closesAt: 2, asked: false, questions: [], transcript: null, usingFallback: false, ...debate }, ai: { badge: true }, eligibility: { eligible: true, reason: '' } });
  const html = (snapshot, props = {}) => renderToStaticMarkup(React.createElement(DebatePanel, { snapshot, onAsk: () => {}, onVote: () => {}, busy: false, error: '', ...props }));
  const open = html(base({ questions: [{ id: 'q1', text: 'What about jobs?', votes: 3, mine: false, voted: false, selected: false }, { id: 'q2', text: 'My own one?', votes: 0, mine: true, voted: false, selected: false }] }));
  assert.ok(open.includes('What about jobs?')); assert.ok(open.includes(copyModule.questionIntakeCopy.submitButton)); assert.ok(open.includes(copyModule.questionIntakeCopy.upvoteButton)); assert.ok(open.includes(copyModule.questionIntakeCopy.upvoteHint.text)); assert.ok(open.includes('yours'));
  assert.equal((open.match(new RegExp(`>${copyModule.questionIntakeCopy.upvoteButton}<`, 'g')) ?? []).length, 1, 'no up-vote button on your own question');
  assert.ok(html(base({ questions: [{ id: 'q1', text: 'What about jobs?', votes: 3, mine: false, voted: true, selected: false }] })).includes(copyModule.questionIntakeCopy.alreadyVoted.text), 'a repeat vote is blocked with the copy line');
  assert.ok(html({ ...base({}), eligibility: { eligible: false, reason: 'x' } }).includes(copyModule.questionIntakeCopy.notEligible.text));
  assert.ok(html(base({ asked: true })).includes(copyModule.questionIntakeCopy.submitted.text));
  const answer = (candidateId, name, source, text, factChecks = []) => ({ candidateId, candidateName: name, source, text, factChecks });
  const closed = html(base({ stage: 'closed', usingFallback: true, transcript: [{ questionId: 'q1', text: 'Answered one?', votes: 3, answers: [
    answer('ines-varro', 'Ines Varro', 'ai', reply, [{ kind: 'treasury', claim: 'Our treasury must serve every Resident.', systemFigure: '10.00 SPK', verdict: null }]),
    answer('tobin-achterberg', 'Tobin Achterberg', 'fallback', 'Platform card: "Lower income tax to 20%".', [{ kind: 'income-tax', claim: 'Platform card: "Lower income tax to 20%".', systemFigure: '15%', verdict: 'differs' }]),
  ] }] }));
  assert.ok(closed.includes('Ines Varro')); assert.ok(closed.includes(reply)); assert.ok(closed.includes('AI-generated'), 'the model-written answer is labeled'); assert.ok(closed.includes(copyModule.fallbackNotice.text.replaceAll("'", '&#x27;')));
  assert.ok(closed.includes(copyModule.factCheckCopy.panelTitle)); assert.ok(closed.includes('10.00 SPK')); assert.ok(closed.includes('15%')); assert.ok(closed.includes(copyModule.factCheckCopy.labels.differs)); assert.ok(closed.includes(copyModule.factCheckCopy.labels.systemFigure));
  assert.equal(closed.includes(copyModule.questionIntakeCopy.submitButton), false, 'no question form once closed');
  assert.ok(html(base({ stage: 'waiting' })).includes('not opened'));
});

// #517 (follow-ups to #282).
test(`#517 ${backend}: a repeat vote on the other scope is a 404 in both directions, by question or by receipt, and writes nothing`, async t => {
  const c = await setup(t); const { r } = c; await c.citizen('carol');
  r.setNow((c.open + 5) * 1000);
  const th = (user, body) => r.call('town-hall', user, body); r.setFixtureEnv('HARIMU_TOWN_HALLS_ENABLED', 'true'); r.setFixtureEnv('HARIMU_TOWN_HALL_OPEN_AT', String(c.open));
  assert.equal((await c.ask('alice', Q(0))).status, 200); assert.equal((await th('alice', { action: 'ask', candidateId: 'ines-varro', requestId: randomUUID(), text: Q(1) })).status, 200);
  const debateQuestion = (await c.view('bob')).questions[0].id, townQuestion = (await th('bob')).data.halls.find(h => h.candidateId === 'ines-varro').questions[0].id;
  const debateReceipt = randomUUID(), townReceipt = randomUUID();
  assert.equal((await c.vote('bob', debateQuestion, { requestId: debateReceipt })).status, 200); assert.equal((await th('bob', { action: 'vote', questionId: townQuestion, requestId: townReceipt })).status, 200);
  assert.equal(await c.count('town_hall_votes'), 2);
  const townVote = (user, questionId, requestId = randomUUID()) => th(user, { action: 'vote', questionId, requestId });
  // Bob already voted on each question in its own scope; the same ids through the other scope are not found, however the receipt is chosen.
  for (const [label, res] of [
    ['town hall vote on a debate question, new receipt', await townVote('bob', debateQuestion)], ['town hall vote on a debate question, the debate receipt', await townVote('bob', debateQuestion, debateReceipt)],
    ['debate vote on a town hall question, new receipt', await c.vote('bob', townQuestion)], ['debate vote on a town hall question, the town hall receipt', await c.vote('bob', townQuestion, { requestId: townReceipt })],
  ]) { assert.equal(res.status, 404, label); assert.match(res.data.error, /does not exist/, label); }
  assert.equal(await c.count('town_hall_votes'), 2, 'nothing was written');
  // The right scope still answers a repeat as the no-op it is.
  assert.equal((await c.vote('bob', debateQuestion)).data.alreadyRecorded, true); assert.equal((await c.vote('bob', debateQuestion, { requestId: debateReceipt })).data.alreadyRecorded, true);
  assert.equal((await townVote('bob', townQuestion)).data.alreadyRecorded, true); assert.equal((await townVote('bob', townQuestion, townReceipt)).data.alreadyRecorded, true);
  // A first cross-scope vote is still a 404, and a missing question is too.
  assert.equal((await townVote('carol', debateQuestion)).status, 404); assert.equal((await c.vote('carol', townQuestion)).status, 404); assert.equal((await c.vote('carol', 'no-such-question')).status, 404); assert.equal((await townVote('carol', 'no-such-question')).status, 404);
  assert.equal(await c.count('town_hall_votes'), 2);
});

test(`#517 ${backend}: the AI answer insert itself checks the question is in the debate's top 5: a question that has dropped out gets no answer`, async t => {
  const c = await setup(t); const { r } = c;
  for (const u of ['u6']) await c.citizen(u);
  const ids = await c.seed(6, { 0: 2 });
  const q = i => ids[Q(i)];
  r.setNow((c.open + DAY + 5) * 1000);
  // While the first answer (the top-ranked question 0) is being generated, the ranking changes under it: questions 1 to 5 each gain three votes, so question 0 is no longer one of the five.
  let injected = false;
  const shifting = { seen: [], async run(model, input, options) {
    if (!injected) { injected = true; let n = 0; for (const i of [1, 2, 3, 4, 5]) for (const voter of ['alice', 'bob', 'u6']) await r.db.prepare('INSERT INTO town_hall_votes (question_id,voter_id,request_id,voted_at) VALUES (?,?,?,?)').bind(q(i), voter, `inject-${n++}`, Math.floor(r.now / 1000)).run(); }
    return gateway().run.call(this, model, input, options);
  } };
  const first = await c.cron(c.aiEnv(shifting));
  assert.equal(first.status, 'ran');
  const answered = async id => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM debate_answers WHERE question_id=?').bind(id).first()).n);
  assert.equal(await answered(q(0)), 0, 'question 0 is no longer in the top 5, so it is not published');
  assert.ok(first.results.includes('not-selected'), JSON.stringify(first.results));
  assert.ok(first.results.every(x => ['recorded', 'not-selected', 'idle'].includes(x)), JSON.stringify(first.results));
  // The rest of the run and later runs answer exactly the new top 5 (questions 1 to 5), three candidates each.
  const ai = gateway(); const env = c.aiEnv(ai); let last = [];
  for (let day = 0; day < 5 && last.at(-1) !== 'idle'; day++) { r.setNow((c.open + DAY + 5 + day * DAY) * 1000); for (let i = 0; i < 8; i++) { last = (await c.cron(env)).results; if (last.includes('idle') || last.includes('budget-unavailable')) break; } }
  assert.equal(last.at(-1), 'idle');
  assert.equal(await answered(q(0)), 0); for (const i of [1, 2, 3, 4, 5]) assert.equal(await answered(q(i)), 3, `question ${i}`);
  assert.equal(await c.count('debate_answers'), 15);
  const view = await c.view('u0'); assert.deepEqual(view.transcript.map(x => x.questionId).sort(), [1, 2, 3, 4, 5].map(q).sort(), 'the transcript shows the same five');
});
