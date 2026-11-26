/** #1524: GET /api/admin/moderation-summary returns aggregate counts for a half-open UTC window. Staff only. No new flag or migration. SQLite and postgres. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';

const TOKEN = 'fixture-admin-token-1524-0123456789';
const quiet = fn => async t => { t.mock.method(console, 'warn', () => {}); t.mock.method(console, 'info', () => {}); await fn(t); };
const utc = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;
const iso = seconds => new Date(seconds * 1000).toISOString().slice(0, 10);
const FROM = utc(2026, 1, 1), TO = utc(2026, 2, 1), MID = FROM + 10 * 86400;
const q = (from = '2026-01-01', to = '2026-02-01') => `?from=${from}&to=${to}`;
const LEAK = { reporter: 'reporter-alice-1524', target: 'target-item-1524', note: 'unique-note-text-1524', snapshot: 'unique-snapshot-1524', output: 'unique-output-text-1524', persona: 'leak-persona-1524' };
const emptyReports = { total: 0, byTargetKind: {}, byReasonId: {} };
const emptyAi = { total: 0, byReason: {}, byFilterResult: {} };
const emptyKill = { total: 0, byReason: {}, byState: {} };

async function setup(t, backend, flags = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_REPORTS_ENABLED', flags.reports ?? 'true');
  r.setFixtureEnv('HARIMU_AI_REVIEW_QUEUE_ENABLED', flags.ai ?? 'true');
  r.setFixtureEnv('HARIMU_KILL_SWITCH_EVENTS_ENABLED', flags.kill ?? 'true');
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', flags.token === undefined ? TOKEN : flags.token);
  await r.call('world', null);
  const route = await r.importModule('app/api/admin/moderation-summary/route.ts');
  const summary = await r.importModule('lib/moderation-summary.ts');
  const send = async (query, auth = `Bearer ${TOKEN}`) => {
    const res = await route.GET(new Request(`https://fixture.invalid/api/admin/moderation-summary${query}`, { headers: auth ? { Authorization: auth } : {} }));
    return { status: res.status, data: await res.json(), headers: res.headers };
  };
  return { r, send, summary };
}

const insertReport = (db, at, kind, reason, extra = {}) => db.prepare('INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at,target_snapshot) VALUES (?,?,?,?,?,?,?,?,?)')
  .bind(randomUUID(), randomUUID(), extra.reporter ?? 'r', kind, extra.target ?? randomUUID(), reason, extra.note ?? null, at, extra.snapshot ?? null).run();
const insertAi = (db, at, reason, filter, extra = {}) => db.prepare("INSERT INTO ai_review_queue(id,created_at,source,nation_id,persona,output_text,filter_result,reason) VALUES (?,?,'notables','kindle',?,?,?,?)")
  .bind(randomUUID(), at, extra.persona ?? 'p', extra.output ?? 'text', filter, reason).run();
const insertKill = (db, at, reason, state, persona = 'kindle-journalist') => db.prepare("INSERT INTO ai_kill_switch_events(id,actor,persona,state,reason,created_at) VALUES (?,'operator',?,?,?,?)")
  .bind(randomUUID(), persona, state, reason, at).run();

async function seed(db) {
  await insertReport(db, FROM, 'citizen-message', 'hate-harassment', LEAK);
  await insertReport(db, MID, 'citizen-message', 'spam-other');
  await insertReport(db, MID, 'notable-reply', 'spam-other');
  await insertReport(db, TO, 'citizen-message', 'hate-harassment');
  await insertReport(db, FROM - 1, 'ai-news', 'hate-harassment');
  await insertAi(db, FROM, 'flagged', 'replaced', { output: LEAK.output, persona: LEAK.persona });
  await insertAi(db, MID, 'sample', 'passed');
  await insertAi(db, MID, 'flagged', 'regenerated');
  await insertAi(db, TO, 'flagged', 'replaced');
  await insertKill(db, FROM, 'persona-mute', 'on', LEAK.persona);
  await insertKill(db, MID, 'templates-only', 'on');
  await insertKill(db, MID, 'persona-mute', 'off');
  await insertKill(db, TO, 'persona-mute', 'on');
}

const expected = {
  from: FROM, to: TO,
  reports: { total: 3, byTargetKind: { 'citizen-message': 2, 'notable-reply': 1 }, byReasonId: { 'hate-harassment': 1, 'spam-other': 2 } },
  aiReview: { total: 3, byReason: { flagged: 2, sample: 1 }, byFilterResult: { replaced: 1, passed: 1, regenerated: 1 } },
  killSwitch: { total: 3, byReason: { 'persona-mute': 2, 'templates-only': 1 }, byState: { on: 2, off: 1 } },
};

const noLeak = data => {
  const text = JSON.stringify(data);
  for (const value of Object.values(LEAK)) assert.equal(text.includes(value), false, 'the response contains no reporter id, target id, note, snapshot or output text');
};

test('#1524 mutations: dropping a half-open bound, the 92-day cap, from>=to, the flag gate, bearer, per-section null or a leak is caught', () => {
  const cases = [
    { file: 'lib/moderation-summary.ts', find: "const inWindow = 'created_at>=? AND created_at<?';", replace: "const inWindow = 'created_at>? AND created_at<?';", pattern: 'a row at from is included' },
    { file: 'lib/moderation-summary.ts', find: "const inWindow = 'created_at>=? AND created_at<?';", replace: "const inWindow = 'created_at>=? AND created_at<=?';", pattern: 'a row at to is excluded' },
    { file: 'lib/moderation-summary.ts', find: 'from >= to || to - from > summaryMaxDays * 86400', replace: 'from > to || to - from > summaryMaxDays * 86400', pattern: 'from equals to is 400' },
    { file: 'lib/moderation-summary.ts', find: 'from >= to || to - from > summaryMaxDays * 86400', replace: 'to - from > summaryMaxDays * 86400', pattern: 'from after to is 400' },
    { file: 'lib/moderation-summary.ts', find: 'to - from > summaryMaxDays * 86400', replace: 'to - from > 999 * 86400', pattern: 'a window over 92 days is 400' },
    { file: 'lib/moderation-summary.ts', find: 'to - from > summaryMaxDays * 86400', replace: 'to - from >= summaryMaxDays * 86400', pattern: 'a 92-day window is allowed' },
    { file: 'lib/moderation-summary.ts', find: 'if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;', replace: 'if (false) return null;', pattern: 'a malformed date is 400' },
    { file: 'app/api/admin/moderation-summary/route.ts', find: "bindings.HARIMU_REPORTS_ENABLED !== 'true' || ", replace: '', pattern: 'the reports flag off is 404' },
    { file: 'app/api/admin/moderation-summary/route.ts', find: " || typeof bindings.HARIMU_ADMIN_TOKEN !== 'string' || bindings.HARIMU_ADMIN_TOKEN.length < 16", replace: '', pattern: 'a short token is 404' },
    { file: 'app/api/admin/moderation-summary/route.ts', find: '!(await bearerMatches(request.headers.get(\'Authorization\'), bindings.HARIMU_ADMIN_TOKEN))', replace: 'false', pattern: 'a wrong bearer is 401' },
    { file: 'lib/moderation-summary.ts', find: 'if (!on) return null;', replace: 'if (!on) return { total: 0, byTargetKind: {}, byReasonId: {}, byReason: {}, byFilterResult: {}, byState: {} };', pattern: 'the AI-review or kill-switch flag off is null, not zeros' },
    { file: 'lib/moderation-summary.ts', find: 'if (isMissingRelation(error)) return null;', replace: 'if (isMissingRelation(error)) return { total: 0, byTargetKind: {}, byReasonId: {}, byReason: {}, byFilterResult: {}, byState: {} };', pattern: 'a missing table is null, not zeros' },
    { file: 'lib/moderation-summary.ts', find: 'SELECT ${column} AS k,COUNT(*) AS n FROM ${table}', replace: "SELECT ${table === 'moderation_reports' && column === 'target_kind' ? 'reporter_id' : column} AS k,COUNT(*) AS n FROM ${table}", pattern: 'the response contains no reporter id, target id, note, snapshot or output text' },
    { file: 'lib/moderation-summary.ts', find: 'SELECT ${column} AS k,COUNT(*) AS n FROM ${table}', replace: "SELECT ${table === 'ai_review_queue' && column === 'reason' ? 'output_text' : column} AS k,COUNT(*) AS n FROM ${table}", pattern: 'the response contains no reporter id, target id, note, snapshot or output text' },
  ];
  process.env.HARIMU_MUTANT_BACKENDS = 'sqlite';
  const tree = mutantTree();
  try {
    for (const c of cases) {
      const restore = tree.mutate(c.file, c.find, c.replace);
      try {
        const result = tree.run(['tests/moderation-summary-1524.test.mjs'], c.pattern);
        assert.notEqual(result.status, 0, `mutant survived (${c.pattern}):\n${result.stdout}\n${result.stderr}`);
      } finally { restore(); }
    }
  } finally { tree.close(); }
});

const backends = process.env.HARIMU_MUTANT_BACKENDS ? process.env.HARIMU_MUTANT_BACKENDS.split(',') : ['sqlite', 'postgres'];
for (const backend of backends) {
  test(`#1524 (${backend}): counts by grouping; a row at from is included and a row at to is excluded; the response contains no reporter id, target id, note, snapshot or output text`, quiet(async t => {
    const { r, send } = await setup(t, backend);
    await seed(r.db);
    const res = await send(q());
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
    assert.deepEqual(res.data, expected);
    noLeak(res.data);
  }));

  test(`#1524 (${backend}): an empty window returns zero totals and empty groupings`, quiet(async t => {
    const { send } = await setup(t, backend);
    const res = await send(q());
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { from: FROM, to: TO, reports: emptyReports, aiReview: emptyAi, killSwitch: emptyKill });
  }));

  test(`#1524 (${backend}): the AI-review or kill-switch flag off is null, not zeros`, quiet(async t => {
    const { r, send } = await setup(t, backend, { ai: 'false' });
    await seed(r.db);
    const a = await send(q());
    assert.equal(a.status, 200);
    assert.deepEqual(a.data.reports, expected.reports);
    assert.equal(a.data.aiReview, null, 'the AI-review flag off is null, not zeros');
    assert.deepEqual(a.data.killSwitch, expected.killSwitch);
    r.setFixtureEnv('HARIMU_AI_REVIEW_QUEUE_ENABLED', 'true');
    r.setFixtureEnv('HARIMU_KILL_SWITCH_EVENTS_ENABLED', 'false');
    const k = await send(q());
    assert.equal(k.data.killSwitch, null, 'the kill-switch flag off is null, not zeros');
    assert.deepEqual(k.data.reports, expected.reports);
    assert.deepEqual(k.data.aiReview, expected.aiReview);
  }));

  test(`#1524 (${backend}): a missing table is null, not zeros`, quiet(async t => {
    const { r, send, summary } = await setup(t, backend);
    await seed(r.db);
    if (backend === 'sqlite') {
      await r.db.prepare('DROP TABLE ai_review_queue').run();
      const res = await send(q());
      assert.equal(res.status, 200);
      assert.deepEqual(res.data.reports, expected.reports);
      assert.equal(res.data.aiReview, null, 'a missing table is null, not zeros');
      assert.deepEqual(res.data.killSwitch, expected.killSwitch);
    }
    const failing = error => ({ prepare() { return { bind() { return this; }, first: async () => { throw error; }, all: async () => { throw error; } }; } });
    const env = { HARIMU_REPORTS_ENABLED: 'true', HARIMU_AI_REVIEW_QUEUE_ENABLED: 'true', HARIMU_KILL_SWITCH_EVENTS_ENABLED: 'true' };
    for (const error of [Object.assign(new Error('no such table: moderation_reports'), { code: 'SQLITE_ERROR' }), Object.assign(new Error('relation "moderation_reports" does not exist'), { code: '42P01' })]) {
      const body = await summary.readModerationSummary(failing(error), { from: FROM, to: TO, env });
      assert.equal(body.reports, null, 'a missing table is null, not zeros');
    }
  }));

  test(`#1524 (${backend}): the reports flag off is 404, a short token is 404, a wrong bearer is 401, a malformed date is 400, from equals to is 400, from after to is 400, a window over 92 days is 400, and a 92-day window is allowed`, quiet(async t => {
    const { r, send } = await setup(t, backend);
    r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'false');
    assert.equal((await send(q())).status, 404, 'the reports flag off is 404');
    r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'true');
    r.setFixtureEnv('HARIMU_ADMIN_TOKEN', 'short');
    assert.equal((await send(q(), 'Bearer short')).status, 404, 'a short token is 404');
    r.setFixtureEnv('HARIMU_ADMIN_TOKEN', undefined);
    assert.equal((await send(q())).status, 404, 'a short token is 404');
    r.setFixtureEnv('HARIMU_ADMIN_TOKEN', TOKEN);
    assert.equal((await send(q(), null)).status, 401, 'a wrong bearer is 401');
    assert.equal((await send(q(), 'Bearer wrong-token-0000000000000')).status, 401, 'a wrong bearer is 401');
    for (const query of [q('foo', '2026-02-01'), q('2026-02-30', '2026-04-01'), q('2026-01-01T00:00:00Z', '2026-02-01'), '?to=2026-02-01', q('2026-01-01', '2026-01-01'), q('2026-02-01', '2026-01-01')]) {
      const res = await send(query);
      assert.equal(res.status, 400, query.includes('2026-01-01&to=2026-01-01') ? 'from equals to is 400' : query.includes('2026-02-01&to=2026-01-01') ? 'from after to is 400' : 'a malformed date is 400');
    }
    const start = FROM, allowed = iso(start + 92 * 86400), over = iso(start + 93 * 86400);
    assert.equal((await send(`?from=${iso(start)}&to=${allowed}`)).status, 200, 'a 92-day window is allowed');
    assert.equal((await send(`?from=${iso(start)}&to=${over}`)).status, 400, 'a window over 92 days is 400');
  }));
}

