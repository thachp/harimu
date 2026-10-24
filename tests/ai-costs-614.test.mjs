/** #614: read-only admin AI cost dashboard (GET /api/admin/ai-costs) over harimu_ai_reservations, on SQLite and PGlite (HARIMU_TEST_STORAGE=postgres).
 *  Flag HARIMU_AI_COST_DASHBOARD_ENABLED is "true" in preview and "false" in production (#880). Flag off or token unset = 404 with zero DB calls; wrong bearer = 401; GET never writes. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { aiCostPurpose, aiCostPurposes } from '../lib/ai-costs.ts';

const TOKEN = 'fixture-admin-token-614-0123456789';
async function setup(t, { flag = true, token = TOKEN } = {}) { // token null = unset
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_AI_COST_DASHBOARD_ENABLED', flag ? 'true' : 'false'); r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token ?? undefined);
  r.setFixtureEnv('HARIMU_AI_DAILY_BUDGET_MICRO', '970000'); r.setFixtureEnv('HARIMU_AI_GATEWAY_ID', 'harimu-preview');
  await r.call('world', null);
  const route = await r.importModule('app/api/admin/ai-costs/route.ts');
  const get = async (auth = `Bearer ${TOKEN}`) => { const res = await route.GET(new Request('https://fixture.invalid/api/admin/ai-costs', { headers: auth ? { Authorization: auth } : {} })); return { status: res.status, cache: res.headers.get('Cache-Control'), text: await res.text() }; };
  return { r, get };
}
async function spy(r, fn) {
  const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db), seen = { calls: 0, writes: [] };
  r.db.prepare = sql => { seen.calls++; if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) seen.writes.push(sql.trim().slice(0, 60)); return prepare(sql); };
  r.db.batch = s => { seen.calls++; seen.writes.push('batch'); return batch(s); };
  try { seen.result = await fn(); } finally { r.db.prepare = prepare; r.db.batch = batch; }
  return seen;
}
const day = (r, offset) => new Date(r.now - offset * 86400000).toISOString().slice(0, 10);
async function seed(r) {
  const rows = [
    ['ai-news:kindle:a', 0, 'news-sequence-3b-guard-2026-10-14', 300, 'finished'], ['ai-news:kindle:b', 0, 'news-sequence-3b-guard-2026-10-14', 500, 'uncertain'],
    [`notable:${'a'.repeat(64)}:q1`, 0, 'notable-question-3b-double-guard-2026-10-14', 700, 'finished'], ['cabinet:p1:x', 0, 'cabinet-response-3b-guard-2026-10-14', 200, 'pending'],
    ['townhall:q1:x', 1, 'cabinet-response-3b-guard-2026-10-14', 400, 'finished'], ['debate:q1:c1:x', 1, 'cabinet-response-3b-guard-2026-10-14', 100, 'finished'], ['legacy-row', 1, '@cf/meta/llama-guard-3-8b', 50, 'finished'],
    ['ai-news:old', 20, 'news-sequence-3b-guard-2026-10-14', 999, 'finished'],
  ];
  for (const [id, offset, model, micro, status] of rows) await r.db.prepare('INSERT INTO harimu_ai_reservations(request_id,utc_day,next_utc_day,model,reserved_micro,started_at,status) VALUES (?,?,?,?,?,?,?)')
    .bind(id, day(r, offset), day(r, offset - 1), model, micro, Math.floor(r.now / 1000), status).run();
}

test('flag off or token unset/short: 404 before any DB statement; baseline: flag on with the token makes DB calls', async t => {
  for (const [flag, token] of [[false, TOKEN], [true, null], [true, 'short-token']]) {
    const { r, get } = await setup(t, { flag, token });
    const off = await spy(r, () => get());
    assert.equal(off.result.status, 404, `flag ${flag} token ${token}`); assert.equal(off.calls, 0, 'no DB access'); assert.equal(off.result.cache, 'private, no-store');
  }
  const { r, get } = await setup(t);
  const on = await spy(r, () => get());
  assert.equal(on.result.status, 200); assert.ok(on.calls > 0, 'baseline: the spy sees the read'); assert.deepEqual(on.writes, [], 'GET is strictly read-only');
});

test('missing, malformed or wrong bearer: 401, no DB access, token never echoed', async t => {
  const { r, get } = await setup(t);
  for (const auth of [null, 'Basic abc', `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(0, -1)}`, TOKEN]) {
    const res = await spy(r, () => get(auth));
    assert.equal(res.result.status, 401, String(auth)); assert.equal(res.calls, 0); assert.ok(!res.result.text.includes(TOKEN.slice(0, 16)));
  }
  const ok = await get(); assert.equal(ok.status, 200); assert.ok(!ok.text.includes(TOKEN), 'the token is never returned');
});

test('14 UTC days of totals with per-model, per-purpose and per-status breakdowns; aggregates only (no request or user ids); read-only', async t => {
  const { r, get } = await setup(t); await seed(r);
  const res = await spy(r, () => get());
  assert.equal(res.result.status, 200); assert.deepEqual(res.writes, []);
  const body = JSON.parse(res.result.text);
  assert.equal(body.windowDays, 14); assert.equal(body.days.length, 14); assert.equal(body.days[0].day, day(r, 0)); assert.equal(body.days[13].day, day(r, 13));
  const [today, yesterday] = body.days;
  assert.deepEqual([today.reservedMicro, today.settledMicro, today.calls, today.budgetMicro], [1700, 1000, 4, 970000]);
  assert.deepEqual(today.byStatus, { pending: 1, finished: 2, uncertain: 1 });
  assert.deepEqual(today.byPurpose, { news: { reservedMicro: 800, settledMicro: 300, calls: 2 }, notable: { reservedMicro: 700, settledMicro: 700, calls: 1 }, cabinet: { reservedMicro: 200, settledMicro: 0, calls: 1 } });
  assert.deepEqual(today.byModel['news-sequence-3b-guard-2026-10-14'], { reservedMicro: 800, settledMicro: 300, calls: 2 });
  assert.deepEqual(yesterday.byPurpose, { town_hall: { reservedMicro: 400, settledMicro: 400, calls: 1 }, debate: { reservedMicro: 100, settledMicro: 100, calls: 1 }, unknown: { reservedMicro: 50, settledMicro: 50, calls: 1 } });
  assert.deepEqual([yesterday.reservedMicro, yesterday.settledMicro], [550, 550]);
  assert.ok(body.days.slice(2).every(d => d.calls === 0), 'the 20-day-old row is outside the window');
  assert.doesNotMatch(res.result.text, /request_id|ai-news:|notable:a|cabinet:p1|legacy-row|clerk|alice/, 'no ids leave the server');
});

// Every file (lib/, app/, worker/, any depth) that calls reserveAi*, plus debate-ai.ts, which reserves through town-hall-ai's generateAnswer.
const sources = dir => readdirSync(dir, { recursive: true }).map(f => `${dir}/${f}`).filter(f => /\.tsx?$/.test(f));
// The exact expression each caller builds its reservation id with; the captured group is the prefix that reaches harimu_ai_reservations.
const idBuilders = {
  'lib/ai-news.ts': /const reservation=`([^`$:]*):\$\{/, 'lib/cabinet-response-ai.ts': /const reservation=`([^`$:]*):\$\{/,
  'lib/debate-ai.ts': /const reservationFor = \([^)]*\) => `([^`$:]*):\$\{/, 'lib/notables.ts': /async function ownerPrefix[^]*?return '([^':]*):'\+/,
  'lib/town-hall-ai.ts': /const reservation = `([^`$:]*):\$\{/,
};
test('every existing AI caller reserves under a mapped purpose prefix (no reservation can report as unknown)', () => {
  const callers = ['lib', 'app', 'worker'].flatMap(sources).filter(f => f !== 'lib/ai-budget.ts' && /\breserveAi(Call|Sequence|CabinetSequence)\(/.test(readFileSync(f, 'utf8'))).sort();
  assert.deepEqual(callers, ['lib/ai-news.ts', 'lib/cabinet-response-ai.ts', 'lib/notables.ts', 'lib/town-hall-ai.ts'], 'a new AI caller must use a mapped reservation prefix (lib/ai-costs.ts)');
  assert.match(readFileSync('lib/debate-ai.ts', 'utf8'), /generateAnswer\(db[^]*?\breservation,/, 'debate-ai reserves through generateAnswer with its own id');
  for (const [file, builder] of Object.entries(idBuilders)) {
    const prefix = readFileSync(file, 'utf8').match(builder)?.[1];
    assert.ok(prefix, `${file}: reservation id builder not found`);
    assert.notEqual(aiCostPurpose(`${prefix}:x`), 'unknown', `${file} reserves under ${prefix}:, which lib/ai-costs.ts does not map`);
  }
  assert.equal(aiCostPurpose('no-prefix'), 'unknown'); assert.equal(aiCostPurpose('debate'), 'unknown', 'a bare word is not a prefix'); assert.equal(aiCostPurpose(':x'), 'unknown'); assert.equal(aiCostPurpose('constructor:x'), 'unknown');
  assert.deepEqual(Object.values(aiCostPurposes).sort(), ['cabinet', 'debate', 'news', 'notable', 'town_hall']);
});

test('a failed read is an explicit 500 with an error field, never 200 with $0', async t => {
  const { r, get } = await setup(t);
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => /FROM harimu_ai_reservations/.test(sql) ? { bind: () => ({ all: () => Promise.reject(new Error('fixture read failure')) }) } : prepare(sql); // the query itself fails
  try {
    const res = await get();
    assert.equal(res.status, 500); assert.equal(res.cache, 'private, no-store');
    const body = JSON.parse(res.text);
    assert.equal(typeof body.error, 'string'); assert.equal(body.days, undefined); assert.doesNotMatch(res.text, /fixture read failure/);
  } finally { r.db.prepare = prepare; }
});

test('flag: preview on, production off; no route besides the admin GET reads the dashboard', () => {
  assert.match(readFileSync('wrangler.jsonc', 'utf8'), /"HARIMU_AI_COST_DASHBOARD_ENABLED": "true"/);
  assert.match(readFileSync('wrangler.prod.jsonc', 'utf8'), /"HARIMU_AI_COST_DASHBOARD_ENABLED": "false"/);
  for (const file of ['wrangler.jsonc', 'wrangler.prod.jsonc']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /HARIMU_ADMIN_TOKEN"\s*:/, `${file}: the admin token is a Worker secret, never a var`);
  }
  const route = readFileSync('app/api/admin/ai-costs/route.ts', 'utf8');
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/); assert.doesNotMatch(route, /console\./, 'nothing is logged');
});
