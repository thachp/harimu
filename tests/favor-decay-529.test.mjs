/** #529: Aurelle Royal Favor decays over time (read-time, flag HARIMU_FAVOR_DECAY_ENABLED, off). HARIMU_TEST_STORAGE=postgres runs it on PGlite. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { favorDecaySeconds, favorCap, royalFavorSql, royalFavorBinds, royalFavorBalanceSql } from '../lib/aurelle.ts';

const DAY = 86400 * 1000;
const ON = 'HARIMU_FAVOR_DECAY_ENABLED';
async function setup(t, decay) {
  const r = await localRuntime(); t.after(() => r.close()); r.setFaith(true);
  if (decay) r.setFixtureEnv(ON, 'true');
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('ava','aurelle','ava',18,0,'Good standing',?,?)").bind(at, at).run();
  return r;
}
/** `shifts` settled estate shifts (2 Favor each) for a citizen, settled at the runtime's current time. */
async function serve(r, user, shifts) {
  const iso = new Date(r.now).toISOString();
  for (let n = 0; n < shifts; n++) { const id = randomUUID(); await r.db.batch([
    r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Estate fixture', '4 state food', 4, iso, iso, iso),
    r.db.prepare('INSERT INTO aurelle_settlements VALUES (?,?,?,?,?,?)').bind(id, user, 800, 4, 2, Math.floor(r.now / 1000)),
  ]); }
}
const favor = async (r, user = 'ava') => (await r.call('citizen', user)).data.aurellePlan.favor;
const faith = async (r, user = 'ava') => (await r.call('faith', user)).data;
const leave = (r, user = 'ava', to = 'open-hand') => r.call('faith', user, { action: 'choose-faith', faithId: to, requestId: randomUUID() });
const count = async (r, table) => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);

test('static: the flag ships "false"; one decay constant and one rule used by readAurelle and royalFavorBalance; flag off is the old SQL, byte for byte', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_FAVOR_DECAY_ENABLED"\s*:\s*"([^"]*)"/g)].map(x => x[1]), ['false']);
  assert.equal(royalFavorBalanceSql, "MAX(0,MIN(100,COALESCE((SELECT SUM(favor) FROM aurelle_settlements WHERE clerk_user_id=?),0))-COALESCE((SELECT SUM(amount) FROM aurelle_favor_spends WHERE clerk_user_id=?),0))");
  assert.equal(royalFavorSql(), royalFavorBalanceSql); assert.deepEqual(royalFavorBinds('u'), ['u', 'u']);
  assert.equal(favorDecaySeconds, 14 * 86400); assert.equal(favorCap, 100);
  assert.match(royalFavorSql(1_000_000), new RegExp(`/${favorDecaySeconds} AS INTEGER`)); { const w = [1_000_000 - favorDecaySeconds, 1_000_000, 1_000_000 - favorDecaySeconds]; assert.deepEqual(royalFavorBinds('u', 1_000_000), [...w, 'u', ...w, 'u']); }
  const strip = f => readFile(new URL(f, import.meta.url), 'utf8').then(x => x.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''));
  const aurelle = await strip('../lib/aurelle.ts'), faithSrc = await strip('../lib/faith.ts');
  const readPlan = aurelle.slice(aurelle.indexOf('export async function readAurelle'), aurelle.indexOf('export async function executeAurelle'));
  assert.doesNotMatch(readPlan, /SUM\(favor/, 'readAurelle has no Favor rule of its own');
  assert.match(aurelle, /royalFavorBalance\(db,userId,options\.favorDecayAt\)/);
  assert.match(faithSrc, /royalFavorSql\(favorDecayAt\)/); assert.doesNotMatch(faithSrc, /royalFavorBalanceSql/);
  assert.doesNotMatch(await strip('../lib/missionary-actions.ts'), /chooseFaith\([^)]*now, enabled\)/, 'the mission conversion passes the same decay time');
  assert.match(await strip('../app/api/faith/route.ts'), /favorDecayAt\(now\)/);
  const worker = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8'); assert.doesNotMatch(worker, /favor/i, 'no cron');
});

test('flag off (shipped default): old Favor never fades and a spend is judged on the flat balance', async t => {
  const r = await setup(t, false);
  await serve(r, 'ava', 10); assert.equal(await favor(r), 20);
  r.setNow(r.now + 100 * DAY); assert.equal(await favor(r), 20, '100 days later, still 20');
  assert.equal((await faith(r)).royalFavor, 20);
  const before = [await count(r, 'aurelle_settlements'), await count(r, 'aurelle_favor_spends')];
  assert.equal((await leave(r)).status, 200, 'leaving costs 10 of the flat 20');
  assert.deepEqual([await count(r, 'aurelle_settlements'), await count(r, 'aurelle_favor_spends')], [before[0], before[1] + 1]);
});

test('decay: Favor fades linearly to nothing over the window, read-time only (nothing is written)', async t => {
  const r = await setup(t, true);
  await serve(r, 'ava', 10); assert.equal(await favor(r), 20);
  const rows = [await count(r, 'aurelle_settlements'), await count(r, 'aurelle_favor_spends')];
  const steps = [[1, 18], [3.5, 15], [7, 10], [10.5, 5], [13, 1], [14, 0], [30, 0]]; // 20 x (14 - d) / 14, truncated
  for (const [days, expected] of steps) {
    r.setNow(r.now - 0); const base = r.now; r.setNow(base + days * DAY);
    assert.equal(await favor(r), expected, `day ${days}`); assert.equal((await faith(r)).royalFavor, expected, `faith view, day ${days}`);
    r.setNow(base);
  }
  assert.deepEqual([await count(r, 'aurelle_settlements'), await count(r, 'aurelle_favor_spends')], rows, 'reads never write');
  r.setNow(r.now + 7 * DAY); assert.equal(await favor(r), 10);
});

test('new service restores Favor: fresh Favor is undecayed while the old fades', async t => {
  const r = await setup(t, true);
  await serve(r, 'ava', 10); r.setNow(r.now + 14 * DAY); assert.equal(await favor(r), 0, 'all faded');
  await serve(r, 'ava', 5); assert.equal(await favor(r), 10, 'five new shifts are worth their full 10');
  r.setNow(r.now + 7 * DAY); assert.equal(await favor(r), 5);
  await serve(r, 'ava', 1); assert.equal(await favor(r), 7);
});

test('a spend after decay cannot overdraw: the leave cost is judged on the decayed balance, and a spend made earlier never drives the balance below zero', async t => {
  const r = await setup(t, true);
  await serve(r, 'ava', 10); r.setNow(r.now + 10 * DAY); // 20 x 4/14 = 5 left, under the cost of 10
  assert.equal(await favor(r), 5);
  const refused = await leave(r); assert.equal(refused.status, 409); assert.equal(refused.data.reason, 'insufficient_royal_favor'); assert.match((await faith(r)).leaveBlockedReason, /You have 5/);
  assert.equal(await count(r, 'aurelle_favor_spends'), 0, 'a refused change spends nothing');
  // fresh service lifts it over the cost: the spend lands and the balance floors at zero, never negative
  await serve(r, 'ava', 3); assert.equal(await favor(r), 11);
  assert.equal((await leave(r)).status, 200); assert.equal(await favor(r), 1); assert.equal(await count(r, 'aurelle_favor_spends'), 1);
  r.setNow(r.now + 20 * DAY); assert.equal(await favor(r), 0, 'everything faded, the face-value spend does not make it negative'); assert.equal((await faith(r)).royalFavor ?? 0, 0);
  // the same state with decay off would have allowed the change (flat 20): the flag is what changes the answer
  const flat = await setup(t, false); await serve(flat, 'ava', 10); flat.setNow(flat.now + 10 * DAY); assert.equal((await leave(flat)).status, 200);
});

test('the 100 cap holds with and without decay', async t => {
  const r = await setup(t, true);
  await serve(r, 'ava', 60); // 120 earned
  assert.equal(await favor(r), 100);
  r.setNow(r.now + 1 * DAY); assert.equal(await favor(r), 100, '120 x 13/14 = 111, still capped');
  r.setNow(r.now + 3 * DAY); assert.equal(await favor(r), 85, '120 x 10/14 = 85, below the cap');
  const off = await setup(t, false); await serve(off, 'ava', 60); assert.equal(await favor(off), 100); off.setNow(off.now + 400 * DAY); assert.equal(await favor(off), 100);
});
