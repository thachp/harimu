/** #442: Kindle canvassing PoC (docs §9.4 ground game): party members' quests raise display-only district visibility, never votes.
 *  HARIMU_TEST_STORAGE=postgres runs the runtime tests on PGlite. */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { postgresMigrations, isDestructive } from '../scripts/postgres-migrations.mjs';

const require = createRequire(import.meta.url);
const compile = async file => ts.transpileModule(await readFile(new URL(`../app/${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const load = async (file, shims) => { const exports = {}; new Function('exports', 'require', await compile(file))(exports, name => shims[name] ?? require(name)); return exports; };
const rt = await localRuntime(); after(() => rt.close());
const rules = await rt.importModule('lib/canvassing-rules.ts');
const { hopefulsOf } = await rt.importModule('lib/primaries-rules.ts');
const { assemblyDistricts } = await rt.importModule('lib/assembly-rules.ts');
const copyModule = await rt.importModule('lib/campaign-copy.ts');
const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const previewEnv = { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' };
const S = 'steady-hand', O = 'open-ledger', D = 'dockside-builders';
const INES = 'ines-varro', TOBIN = 'tobin-achterberg', MARA = 'mara-quell';
const HOUR = 3600, DAY = 86400, W = 72 * HOUR;
const tierOne = (r, user) => ({ userId: user, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });

test('#442 rules: gain is base 10 in an untouched district and diminishes, never below 1; one quest per day; stages', () => {
  assert.equal(rules.canvassBasePoints, 10); assert.equal(rules.canvassCapacityCost, 2); assert.equal(rules.canvassDurationSeconds, HOUR);
  assert.equal(rules.visibilityGain(0), 10); assert.equal(rules.visibilityGain(50), 5); assert.equal(rules.visibilityGain(450), 1);
  let last = Infinity; for (let existing = 0; existing <= 2000; existing += 7) { const gain = rules.visibilityGain(existing); assert.ok(gain >= 1 && gain <= last && gain <= rules.canvassBasePoints); last = gain; }
  assert.equal(rules.visibilityGain(1_000_000), 1);
  for (const bad of [-1, 1.5, NaN, '3']) assert.throws(() => rules.visibilityGain(bad), /non-negative/);
  assert.equal(rules.canvassDay(Date.UTC(2026, 0, 15, 23, 59, 59) / 1000), '2026-01-15'); assert.equal(rules.canvassDay(Date.UTC(2026, 0, 16) / 1000), '2026-01-16');
  assert.equal(rules.questStage(5, null), 'none'); assert.equal(rules.questStage(5, { completesAt: 9, completedAt: null }), 'active');
  assert.equal(rules.questStage(9, { completesAt: 9, completedAt: null }), 'ready'); assert.equal(rules.questStage(99, { completesAt: 9, completedAt: 20 }), 'completed');
});

test('#442: the flag defaults to "false", migration 0046 only adds a table, and no ballot, count or AI-share module can read visibility', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_CANVASSING_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['true']);
  assert.match(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'), /"HARIMU_CANVASSING_ENABLED": "false"/);
  for (const file of ['../drizzle/0046_canvass_quests.sql', '../db/postgres/0046_canvass_quests.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.equal(isDestructive(sql), false, file); assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file); assert.match(sql, /CREATE TABLE IF NOT EXISTS canvass_quests/);
  }
  assert.deepEqual(postgresMigrations().find(m => m.file.startsWith('0046_')).tables, ['canvass_quests']);
  // Nothing that counts, tallies or weighs a ballot (or an AI bloc share) mentions canvassing, visibility or the table.
  const ballotModules = ['assembly-rules', 'assembly', 'assembly-copy', 'elections', 'instant-runoff', 'primaries-rules', 'primaries', 'preview-election', 'ballot-privacy', 'kindle-parties'];
  for (const name of ballotModules) assert.doesNotMatch(await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8'), /canvass|visibility/i, `lib/${name}.ts`);
  for (const route of ['election', 'assembly', 'primaries']) assert.doesNotMatch(await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), 'utf8'), /canvass/i, `app/api/${route}`);
  // And the canvassing modules import none of the counting code (they read party membership and the home district only).
  const canvass = await readFile(new URL('../lib/canvassing.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(canvass, /assemblyResult|districtResult|dHondt|instantRunoff|countPrimary|primaryResult|finalizeAssembly|finalizeDueElection|finalizePrimary/);
  const importers = []; for (const dir of ['../lib', '../app', '../worker']) for (const file of await readdir(new URL(`${dir}/`, import.meta.url), { recursive: true })) {
    if (!/\.(ts|tsx)$/.test(file)) continue; const text = await readFile(new URL(`${dir}/${file}`, import.meta.url), 'utf8');
    if (/from ['"](?:\.\/|\.\.\/lib\/|@\/lib\/)canvassing(?:-rules)?['"]/.test(text)) importers.push(`${dir}/${file}`);
  }
  assert.deepEqual(importers.sort(), ['../app/api/canvassing/route.ts', '../app/canvassing.tsx', '../app/page.tsx', '../lib/canvassing.ts', '../lib/db.ts'].sort());
  assert.doesNotMatch(await readFile(new URL('../app/api/canvassing/route.ts', import.meta.url), 'utf8'), /\.AI\b|ai-budget|ai-news/);
});

const writePattern = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
function recordWrites(r) {
  const writes = []; const prepare = r.db.prepare.bind(r.db); const batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (writePattern.test(sql)) writes.push(sql.replace(/\s+/g, ' ').slice(0, 90)); return prepare(sql); };
  r.db.batch = statements => { writes.push(`batch(${statements.length})`); return batch(statements); };
  return { writes, restore() { r.db.prepare = prepare; r.db.batch = batch; } };
}
async function setup(t, { flag = true, preview = true } = {}) {
  const r = await localRuntime(preview ? { accountElectionBindings: previewEnv } : {}); t.after(() => r.close());
  const iso = new Date(r.now).toISOString();
  if (flag) r.setFixtureEnv('HARIMU_CANVASSING_ENABLED', 'true');
  const citizen = async (user, { party, home, capacity = 18 } = {}) => {
    if (!['alice', 'bob'].includes(user)) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(user, `Private ${user}`, iso, iso).run();
    await r.db.prepare('UPDATE citizens SET capacity=? WHERE clerk_user_id=?').bind(capacity, user).run();
    if (party) await r.db.prepare('INSERT INTO party_members (clerk_user_id,party_id,joined_at) VALUES (?,?,?)').bind(user, party, Math.floor(r.now / 1000)).run();
    if (home) await r.db.prepare("INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,'kindle',?,?,?)").bind(user, home, home, Math.floor(r.now / 1000)).run();
  };
  const start = (user, extra = {}) => r.call('canvassing', user, { action: 'start', requestId: randomUUID(), ...extra });
  const finish = (user, questId, extra = {}) => r.call('canvassing', user, { action: 'complete', questId, requestId: randomUUID(), ...extra });
  const count = async table => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
  const capacity = async user => Number((await r.db.prepare('SELECT capacity FROM citizens WHERE clerk_user_id=?').bind(user).first()).capacity);
  const points = async (candidate, district) => Number((await r.db.prepare('SELECT COALESCE(SUM(points),0) AS n FROM canvass_quests WHERE candidate_id=? AND district_id=?').bind(candidate, district).first()).n);
  return { r, citizen, start, finish, count, capacity, points };
}

test(`#442 ${backend}: flag off is a complete no-op`, async t => {
  const c = await setup(t, { flag: false }); const { r } = c; await c.citizen('alice', { party: S });
  const probe = recordWrites(r);
  try {
    const got = await r.call('canvassing', 'alice'); assert.equal(got.status, 404); assert.deepEqual(got.data, { enabled: false });
    assert.equal((await c.start('alice')).status, 404); assert.equal((await c.finish('alice', 'x')).status, 404);
    assert.deepEqual(probe.writes.filter(w => /canvass|capacity/i.test(w)), [], 'no canvassing or capacity write');
  } finally { probe.restore(); }
  assert.equal(await c.count('canvass_quests'), 0); assert.equal(await c.capacity('alice'), 18);
});

test(`#442 ${backend}: GET writes nothing, shows the quest state, and visibility totals are public and display-only`, async t => {
  const c = await setup(t); const { r } = c; await c.citizen('alice', { party: S, home: 'tarrek-foundry' }); await c.citizen('bob');
  const read = async user => { const probe = recordWrites(r); try { const res = await r.call('canvassing', user); assert.equal(res.status, 200, JSON.stringify(res.data)); assert.deepEqual(probe.writes, []); assert.equal(res.cache, 'private, no-store'); return res.data; } finally { probe.restore(); } };
  const before = await read('alice'); assert.equal(before.member, true); assert.equal(before.partyId, S); assert.equal(before.candidate.id, INES); assert.equal(before.district.id, 'tarrek-foundry');
  assert.equal(before.cost, 2); assert.equal(before.capacity, 18); assert.equal(before.today, null); assert.equal(before.visibility.length, 3); assert.ok(before.visibility.every(v => v.districts.length === assemblyDistricts.length && v.districts.every(d => d.points === 0)));
  const outsider = await read('bob'); assert.equal(outsider.member, false); assert.equal(outsider.candidate, null); assert.equal(outsider.today, null);
  assert.equal((await c.start('alice')).status, 200); assert.equal((await read('alice')).today.stage, 'active');
  r.setNow((Math.floor(r.now / 1000) + HOUR) * 1000); assert.equal((await read('alice')).today.stage, 'ready'); assert.equal(await c.count('canvass_quests'), 1);
  assert.equal((await r.call('canvassing', null)).status, 401); assert.equal((await r.call('canvassing', 'nobody-here')).status, 403);
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='bob'").run(); assert.equal((await r.call('canvassing', 'bob')).status, 403, 'Kindle citizens only');
});

test(`#442 ${backend}: start: members only, home district and party candidate from the server, WC debited once, one quest per day, replay is a no-op`, async t => {
  const c = await setup(t); const { r } = c;
  await c.citizen('alice', { party: S, home: 'tarrek-foundry' }); await c.citizen('bob'); await c.citizen('carol', { party: D, capacity: 1 }); await c.citizen('dave', { party: O });
  const refused = await c.start('bob'); assert.equal(refused.status, 403); assert.equal(await c.count('canvass_quests'), 0); assert.equal(await c.capacity('bob'), 18);
  const id = randomUUID(); const first = await c.start('alice', { requestId: id, district: 'forgehaven', candidateId: MARA, partyId: D, capacity: 99 });
  assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.alreadyRecorded, false);
  const quest = (await r.db.prepare('SELECT * FROM canvass_quests').first());
  assert.equal(quest.district_id, 'tarrek-foundry', 'the request cannot name a district'); assert.equal(quest.candidate_id, INES, 'nor a candidate'); assert.equal(quest.party_id, S);
  assert.equal(Number(quest.completes_at) - Number(quest.started_at), HOUR); assert.equal(Number(quest.capacity_spent), 2); assert.equal(quest.completed_at, null);
  assert.equal(await c.capacity('alice'), 16, 'Work Capacity is debited once');
  const replay = await c.start('alice', { requestId: id }); assert.equal(replay.status, 200); assert.equal(replay.data.alreadyRecorded, true); assert.equal(await c.capacity('alice'), 16); assert.equal(await c.count('canvass_quests'), 1);
  const second = await c.start('alice'); assert.equal(second.status, 409, 'one quest per real day'); assert.equal(await c.capacity('alice'), 16);
  assert.equal((await c.start('dave', { requestId: id })).status, 409, 'a receipt used by someone else'); assert.equal(await c.capacity('dave'), 18);
  const poor = await c.start('carol'); assert.equal(poor.status, 409); assert.match(poor.data.error, /Work Capacity/); assert.equal(await c.capacity('carol'), 1); assert.equal(await c.count('canvass_quests'), 1);
  assert.equal((await r.call('canvassing', 'dave', { action: 'start', requestId: 'not-a-uuid' })).status, 400); assert.equal((await r.call('canvassing', 'dave', { action: 'delete', requestId: randomUUID() })).status, 400);
  assert.equal((await r.call('canvassing', 'dave', { action: 'start', requestId: randomUUID() }, 'https://evil.invalid')).status, 403, 'same-origin only');
  // A concurrent double start debits once.
  const raced = await Promise.all([c.start('dave'), c.start('dave')]); assert.equal(raced.filter(x => x.status === 200).length, 1, JSON.stringify(raced.map(x => x.data))); assert.equal(await c.capacity('dave'), 16);
  // Next real day: allowed again.
  r.setNow((Math.floor(r.now / 1000) + DAY) * 1000); assert.equal((await c.start('alice')).status, 200); assert.equal(await c.count('canvass_quests'), 3);
  assert.equal(await c.capacity('alice') >= 14, true);
});

test(`#442 ${backend}: only verified Kindle humans take part; a preview-off caller needs Tier 1`, async t => {
  const c = await setup(t, { preview: false }); const { r } = c; await c.citizen('alice', { party: S });
  assert.equal((await c.start('alice')).status, 403); assert.equal(await c.count('canvass_quests'), 0); assert.equal(await c.capacity('alice'), 18);
  const read = await r.call('canvassing', 'alice'); assert.equal(read.status, 200); assert.equal(read.data.eligibility.eligible, false);
  r.setVerification('alice', tierOne(r, 'alice')); assert.equal((await c.start('alice')).status, 200);
  r.setVerification('alice', { ...tierOne(r, 'alice'), revoked: true }); const id = (await r.db.prepare('SELECT id FROM canvass_quests').first()).id;
  r.setNow((Math.floor(r.now / 1000) + HOUR) * 1000); assert.equal((await c.finish('alice', id)).status, 403, 'revoked evidence is refused');
});

test(`#442 ${backend}: complete: only when finished, once, diminishing returns per candidate and district, never another citizen's quest`, async t => {
  const c = await setup(t); const { r } = c;
  const users = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5']; for (const u of users) await c.citizen(u, { party: S, home: 'forgehaven' });
  await c.citizen('rival', { party: O, home: 'forgehaven' }); await c.citizen('far', { party: S, home: 'tarrek-foundry' });
  const t0 = Math.floor(r.now / 1000);
  for (const u of [...users, 'rival', 'far']) assert.equal((await c.start(u)).status, 200, u);
  const quest = async u => (await r.db.prepare('SELECT * FROM canvass_quests WHERE clerk_user_id=?').bind(u).first());
  const early = await c.finish('u0', (await quest('u0')).id); assert.equal(early.status, 409); assert.equal(await c.points(INES, 'forgehaven'), 0);
  r.setNow((t0 + HOUR - 1) * 1000); assert.equal((await c.finish('u0', (await quest('u0')).id)).status, 409, 'one second early');
  r.setNow((t0 + HOUR) * 1000);
  assert.equal((await c.finish('u0', (await quest('u1')).id)).status, 404, 'not your quest'); assert.equal((await c.finish('u0', 'nope')).status, 404); assert.equal((await c.finish('u0', 7)).status, 400);
  const rid = randomUUID(); const done = await c.finish('u0', (await quest('u0')).id, { requestId: rid }); assert.equal(done.status, 200, JSON.stringify(done.data)); assert.equal(done.data.alreadyRecorded, false);
  assert.equal((await quest('u0')).points, 10, 'first quest in an untouched district earns the base'); assert.equal(done.data.today.stage, 'completed'); assert.equal(done.data.today.points, 10);
  const again = await c.finish('u0', (await quest('u0')).id, { requestId: rid }); assert.equal(again.status, 200); assert.equal(again.data.alreadyRecorded, true);
  assert.equal((await c.finish('u0', (await quest('u0')).id)).data.alreadyRecorded, true, 'a repeat with a new request id is a no-op'); assert.equal(await c.points(INES, 'forgehaven'), 10);
  assert.equal((await c.finish('u1', (await quest('u1')).id, { requestId: rid })).status, 409, 'a receipt used for another quest');
  // Diminishing returns: each later quest in the same candidate+district earns no more than the one before, and the SQL gain equals the pure rule.
  let existing = 10; const gains = [10];
  for (const u of ['u1', 'u2', 'u3', 'u4', 'u5']) { assert.equal((await c.finish(u, (await quest(u)).id)).status, 200); const gain = Number((await quest(u)).points); assert.equal(gain, rules.visibilityGain(existing), u); existing += gain; gains.push(gain); }
  assert.deepEqual(gains, [10, 8, 7, 6, 6, 5]); for (let i = 1; i < gains.length; i++) assert.ok(gains[i] <= gains[i - 1]);
  assert.ok(gains.at(-1) < gains[0], 'it does diminish'); assert.equal(await c.points(INES, 'forgehaven'), existing);
  // Other candidate or district: independent totals, back at the base.
  assert.equal((await c.finish('rival', (await quest('rival')).id)).status, 200); assert.equal((await quest('rival')).points, 10); assert.equal(await c.points(TOBIN, 'forgehaven'), 10);
  assert.equal((await c.finish('far', (await quest('far')).id)).status, 200); assert.equal((await quest('far')).points, 10); assert.equal(await c.points(INES, 'tarrek-foundry'), 10);
  const view = (await r.call('canvassing', 'u0')).data; assert.equal(view.visibility.find(v => v.candidateId === INES).districts.find(d => d.districtId === 'forgehaven').points, existing);
  assert.doesNotMatch(JSON.stringify(view), /Private|clerk|u1|u2/, 'no citizen identity in the totals');
  // A daily cap per citizen: one quest a day means at most the base per citizen per day.
  const perDay = (await r.db.prepare('SELECT clerk_user_id,utc_day,SUM(points) AS p FROM canvass_quests GROUP BY clerk_user_id,utc_day').all()).results; assert.ok(perDay.every(x => Number(x.p) <= rules.canvassBasePoints));
});

// ---- visibility never changes a ballot result ----
const hugeVisibility = async r => {
  const iso = Math.floor(r.now / 1000);
  for (const candidate of [INES, TOBIN, MARA]) for (const district of assemblyDistricts) for (let i = 0; i < 12; i++) {
    await r.db.prepare('INSERT INTO canvass_quests (id,clerk_user_id,party_id,candidate_id,district_id,utc_day,request_id,complete_request_id,capacity_spent,started_at,completes_at,completed_at,points) VALUES (?,?,?,?,?,?,?,?,2,?,?,?,500)')
      .bind(randomUUID(), 'alice', S, candidate, district.id, `2025-01-${String(i + 1).padStart(2, '0')}-${candidate}-${district.id}`, randomUUID(), randomUUID(), iso - 9 * DAY, iso - 9 * DAY + HOUR, iso - 9 * DAY + HOUR).run();
  }
};
const tick = async r => { await r.call('world', null); await r.call('world', null); };
const ledgerOf = { assembly: 'assembly', primaries: 'primaries', presidential: 'election' };
async function scenario(kind, visibility) {
  const r = await localRuntime({ accountElectionBindings: previewEnv }); const iso = new Date(r.now).toISOString(), now = Math.floor(r.now / 1000);
  try {
    for (const u of ['carol', 'dave', 'erin']) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(u, `Private ${u}`, iso, iso).run();
    if (visibility) await hugeVisibility(r);
    if (kind === 'assembly') {
      r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_ENABLED', 'true'); r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_OPEN_AT', String(now));
      for (const [u, party] of [['alice', S], ['bob', S], ['carol', O], ['dave', D], ['erin', D]]) assert.equal((await r.call('assembly', u, { action: 'vote', electionId: 'kindle-assembly-account-poc-1', requestId: randomUUID(), partyId: party })).status, 200);
      r.setNow((now + W + 5) * 1000); await tick(r); const got = await r.call('assembly', 'alice'); assert.equal(got.data.status, 'closed'); return got.data.result;
    }
    if (kind === 'primaries') {
      r.setFixtureEnv('HARIMU_PRIMARIES_ENABLED', 'true'); r.setFixtureEnv('HARIMU_PRIMARIES_OPEN_AT', String(now + 3600));
      for (const u of ['alice', 'bob', 'carol']) assert.equal((await r.call('primaries', u, { action: 'join', partyId: S })).status, 200);
      r.setNow((now + 3660) * 1000); const ids = hopefulsOf(S).map(h => h.id);
      const rankings = [ids, [...ids].reverse(), [ids[1], ids[2], ids[0]]];
      for (const [i, u] of ['alice', 'bob', 'carol'].entries()) assert.equal((await r.call('primaries', u, { action: 'vote', electionId: 'kindle-primary-account-poc-1', requestId: randomUUID(), ranking: rankings[i] })).status, 200);
      r.setNow((now + 3600 + W + 5) * 1000); await tick(r); const got = await r.call('primaries', 'alice'); assert.equal(got.data.status, 'closed'); return got.data.result;
    }
    const ranks = [[INES, TOBIN, MARA], [MARA, TOBIN, INES], [TOBIN, MARA, INES]];
    for (const [i, u] of ['alice', 'bob', 'carol'].entries()) assert.equal((await r.call('election', u, { action: 'vote', electionId: 'kindle-presidential-account-poc-1', requestId: randomUUID(), ranking: ranks[i] })).status, 200);
    r.setNow((now + W + 5) * 1000); await tick(r); const got = await r.call('election', 'alice'); assert.equal(got.data.status, 'closed'); return got.data.result;
  } finally { await r.close(); }
}
for (const kind of ['assembly', 'primaries', 'presidential']) test(`#442 ${backend}: heavy district visibility changes no ${kind} result`, async () => {
  const plain = await scenario(kind, false), boosted = await scenario(kind, true);
  assert.ok(plain && JSON.stringify(plain).length > 20, 'the election produced a count'); assert.deepEqual(boosted, plain);
});
test(`#442 ${backend}: visibility added after a count closes leaves the published count unchanged`, async t => {
  const c = await setup(t); const { r } = c; const now = Math.floor(r.now / 1000);
  r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_ENABLED', 'true'); r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_OPEN_AT', String(now));
  assert.equal((await r.call('assembly', 'alice', { action: 'vote', electionId: 'kindle-assembly-account-poc-1', requestId: randomUUID(), partyId: O })).status, 200);
  r.setNow((now + W + 5) * 1000); await tick(r); const first = (await r.call('assembly', 'alice')).data.result;
  await hugeVisibility(r); await tick(r); assert.deepEqual((await r.call('assembly', 'alice')).data.result, first);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM assembly_elections').first()).n), 1);
});

test(`#442: the panel renders the Content copy, the quest states and the display-only visibility`, async () => {
  const copy = copyModule.canvassingCopy;
  const tags = await load('ai-disclosure.tsx', {}), actions = await load('action-button.tsx', {});
  const { CanvassingPanel } = await load('canvassing.tsx', {
    '../lib/campaign-copy': copyModule, './action-button': actions, './ai-disclosure': tags, './game-timer': { GameTimer: ({ label }) => React.createElement('span', null, label) },
    './session-retry': await load('session-retry.tsx', {}), './nation-document': { NationDocument: ({ label, children }) => React.createElement('section', { 'aria-label': label }, children) },
  });
  const base = (today, extra = {}) => ({ enabled: true, member: true, partyId: S, partyName: 'Steady Hand Party', candidate: { id: INES, name: 'Ines Varro' }, district: { id: 'forgehaven', name: 'Forgehaven' }, cost: 2, capacity: 18, durationSeconds: HOUR, today,
    visibility: [{ candidateId: INES, candidateName: 'Ines Varro', districts: [{ districtId: 'forgehaven', districtName: 'Forgehaven', points: 27 }, { districtId: 'tarrek-foundry', districtName: 'Tarrek Foundry', points: 0 }] }], eligibility: { eligible: true, reason: '' }, ...extra });
  const html = (snapshot, props = {}) => renderToStaticMarkup(React.createElement(CanvassingPanel, { snapshot, onStart: () => {}, onComplete: () => {}, busy: false, error: '', ...props }));
  const idle = html(base(null)); assert.ok(idle.includes('Canvass for Steady Hand Party')); for (const task of copy.tasks) assert.ok(idle.includes(task.text.replace('{party}', 'Steady Hand Party').replace(/&/g, '&amp;')) || idle.includes(task.text.replace('{party}', 'Steady Hand Party')), task.text);
  assert.ok(idle.includes(copy.note.text)); assert.ok(idle.includes('Start canvassing')); assert.ok(idle.includes('Forgehaven: 27')); assert.ok(idle.includes('Tarrek Foundry: 0'));
  assert.ok(html(base({ id: 'q', stage: 'active', completesAt: 99 })).includes('Quest finishes')); assert.ok(html(base({ id: 'q', stage: 'ready', completesAt: 1 })).includes('Finish canvassing'));
  const done = html(base({ id: 'q', stage: 'completed', completesAt: 1, points: 10 })); assert.ok(done.includes('Quest complete. Ines Varro is more visible in Forgehaven.')); assert.equal(done.includes('Start canvassing'), false);
  assert.ok(html(base(null, { capacity: 1 })).includes('costs 2 Work Capacity')); assert.ok(html(base(null, { member: false, partyId: null, partyName: null, candidate: null })).includes('Join a party'));
  for (const text of [idle, done]) assert.doesNotMatch(text.replace(copy.note.text, ''), /\bvotes?\b/i, 'the panel never speaks of votes beyond the Content note');
});
