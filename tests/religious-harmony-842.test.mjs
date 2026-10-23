/** #842 slice 1: Religious Harmony (docs §14.5): a per-nation 0–100 score from existing faith signals, feeding Stability and shown on
 *  the faith panel (Korund: band only). Flag HARIMU_RELIGIOUS_HARMONY_ENABLED: off means no Stability input, no panel line, no reads. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { religiousHarmony, harmonyStabilityPoints, harmonyBand, harmonyLine, harmonyEnabled, harmonyWeights } from '../lib/religious-harmony.ts';
import { computeStability } from '../lib/stability.ts';

const sum = terms => terms.reduce((t, x) => t + x.points, 0);
test('pure: baseline 50; a festival raises it; raids and bans lower it; clamped at 0 and 100; capped terms', () => {
  assert.equal(religiousHarmony('kindle', {}), 50); assert.equal(harmonyWeights.baseline, 50);
  assert.equal(religiousHarmony('aurelle', { festivalHoliday: 1 }), 60); assert.equal(religiousHarmony('kindle', { festivalJoins: 3 }), 56);
  assert.equal(religiousHarmony('kindle', { festivalJoins: 99 }), 70, 'join term capped at 20');
  assert.equal(religiousHarmony('korund', { raids: 1 }), 40); assert.equal(religiousHarmony('korund', { bannedFestivalJoins: 2 }), 44); assert.equal(religiousHarmony('korund', { raidHits: 5 }), 45);
  assert.equal(religiousHarmony('korund', { raids: 9, raidHits: 99, bannedFestivalJoins: 99 }), 0, 'clamped at 0');
  assert.equal(religiousHarmony('aurelle', { festivalHoliday: 1, festivalJoins: 99 }), 80);
  assert.equal(religiousHarmony('kindle', { festivalJoins: -5, raids: -1 }), 50, 'negative signals ignored');
  assert.equal(Math.max(...[0, 50, 100].map(x => religiousHarmony('kindle', { festivalJoins: x, festivalHoliday: 1 }))) <= 100, true);
  assert.deepEqual([0, 9, 40, 49, 50, 59, 60, 100].map(harmonyStabilityPoints), [-5, -4, -1, 0, 0, 0, 1, 5]);
  assert.deepEqual([34, 35, 49, 50, 64, 65].map(harmonyBand), ['strained', 'uneasy', 'uneasy', 'calm', 'calm', 'harmonious']);
  assert.equal(harmonyLine('korund', 40), 'Religious Harmony: Uneasy', 'Korund: band only, never the number'); assert.equal(harmonyLine('kindle', 72), 'Religious Harmony: Harmonious (72/100)');
  assert.equal(harmonyEnabled({ HARIMU_RELIGIOUS_HARMONY_ENABLED: 'true' }), true); for (const e of [{}, null, { HARIMU_RELIGIOUS_HARMONY_ENABLED: 'TRUE' }]) assert.equal(harmonyEnabled(e), false);
});

test('Stability: harmony term with its points and detail; totals still add up and stay 0–100; absent input = no term', () => {
  const base = { citizens: 10, fed: 5, worked: 5, promisesKept: 0, promisesBroken: 0, petitionBacklog: 0 };
  const off = computeStability(base); assert.ok(!off.breakdown.stability.some(x => x.input === 'harmony'));
  for (const [h, pts] of [[80, 3], [20, -3], [50, 0], [100, 5], [0, -5]]) {
    const s = computeStability({ ...base, harmony: h }), term = s.breakdown.stability.find(x => x.input === 'harmony');
    assert.deepEqual([term.points, term.detail], [pts, `Religious Harmony ${h}/100`]); assert.equal(s.stability, off.stability + pts); assert.equal(sum(s.breakdown.stability), s.stability);
  }
  const low = computeStability({ citizens: 10, fed: 0, worked: 0, promisesKept: 0, promisesBroken: 9, petitionBacklog: 50, harmony: 0 });
  assert.ok(low.stability >= 0); assert.equal(sum(low.breakdown.stability), low.stability, 'fitted at 0');
});

const at = r => new Date(r.now).toISOString();
async function citizen(r, id, nation) { await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at(r), at(r)).run(); }
async function scene(t, backend, on) {
  const r = await localRuntime({ backend }); t.after(() => r.close()); r.setFaith(true);
  r.setFixtureEnv('HARIMU_RELIGIOUS_HARMONY_ENABLED', on ? 'true' : undefined);
  await citizen(r, 'kim', 'kindle'); await citizen(r, 'kai', 'korund'); await citizen(r, 'ava', 'aurelle');
  const now = Math.floor(r.now / 1000);
  await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(now - 7200 - 60).run(); // tick 1 is due
  await r.db.prepare("INSERT INTO korund_raids (id,city_id,game_day,raided_at) VALUES ('raid-1','korund-city',1,?)").bind(now - 3600).run();
  for (const [u, f] of [['kim', 'launching'], ['kai', 'oath-day']]) await r.db.prepare("INSERT INTO citizen_festival_joins (user_id,festival_id,occurrence,faith_id,game_day,joined_at,request_id) VALUES (?,?,1,'kinward-rite',1,?,?)").bind(u, f, now - 3600, `req-842-${u}`).run();
  return r;
}
for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: world tick with the flag on writes a harmony input and term per nation; Korund's raid and banned join lower it`, async t => {
    const r = await scene(t, backend, true); await r.call('world', null);
    const rows = Object.fromEntries((await r.db.prepare('SELECT nation_id,inputs_json,breakdown_json,stability FROM nation_stability_scores ORDER BY tick DESC').all()).results.map(x => [x.nation_id, x]));
    const h = n => JSON.parse(rows[n].inputs_json).harmony;
    assert.equal(h('kindle'), 52, 'one join'); assert.equal(h('korund'), 37, 'raid -10, banned join -3'); assert.equal(h('aurelle') >= 50, true);
    for (const n of ['kindle', 'korund', 'aurelle']) { const b = JSON.parse(rows[n].breakdown_json); assert.ok(b.stability.some(x => x.input === 'harmony'), n); assert.equal(sum(b.stability), Number(rows[n].stability), n); }
  });

  test(`${backend}: flag off: no harmony input, no harmony reads in the tick, and no panel line`, async t => {
    const r = await scene(t, backend, false);
    const prepare = r.db.prepare.bind(r.db), seen = []; r.db.prepare = q => { seen.push(q); return prepare(q); };
    try { await r.call('world', null); } finally { r.db.prepare = prepare; }
    assert.deepEqual(seen.filter(q => /korund_raid_hits/.test(q)), [], 'no harmony reads');
    for (const x of (await r.db.prepare('SELECT inputs_json,breakdown_json FROM nation_stability_scores').all()).results) { assert.equal(JSON.parse(x.inputs_json).harmony, undefined); assert.ok(!JSON.parse(x.breakdown_json).stability.some(y => y.input === 'harmony')); }
    for (const u of ['kim', 'kai']) assert.equal('harmony' in (await r.call('faith', u)).data, false, u);
  });

  test(`${backend}: faith panel line: Korund band only, Kindle band and number; GET stays read-only`, async t => {
    const r = await scene(t, backend, true);
    const prepare = r.db.prepare.bind(r.db), writes = []; r.db.prepare = q => { if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(q)) writes.push(q); return prepare(q); };
    let kai, kim; try { kai = await r.call('faith', 'kai'); kim = await r.call('faith', 'kim'); } finally { r.db.prepare = prepare; }
    assert.equal(kai.data.harmony.line, 'Religious Harmony: Uneasy', '37: band only'); assert.doesNotMatch(kai.data.harmony.line, /\d/);
    assert.equal(kim.data.harmony.line, 'Religious Harmony: Calm (52/100)'); assert.deepEqual(writes, []);
  });
}

test('panel renders the line only when present', async () => {
  const { readFileSync } = await import('node:fs'); const src = readFileSync('app/faith-panel.tsx', 'utf8');
  assert.match(src, /\{harmony && <p className="faith-harmony">\{harmony\.line\}<\/p>\}/);
});
