import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { postgresMigrations, isDestructive, transactionProblem } from '../scripts/postgres-migrations.mjs';
import { greatLords, boundedName, coupNameMax, coupConfig, formationOdds, plotForms, plotState, plotRuler, powerWeight, coupSucceeds, pressureSeconds, hash } from '../lib/aurelle-coup-rules.ts';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const H = 3600, D = 86400;

test('#281 rules: names capped at 24 (pinned to Content #288), seeded and deterministic', () => {
  assert.equal(coupNameMax, COUP_NAME_MAX);
  for (const l of greatLords) { assert.ok(l.name.length <= 24 && l.house.length <= 24, l.id); assert.equal(boundedName(l.name), l.name); }
  assert.equal(boundedName('  Lord Ok  '), 'Lord Ok');
  for (const bad of ['', '   ', 'x'.repeat(25), 'Lord\u0000Bad']) assert.throws(() => boundedName(bad), RangeError);
  assert.equal(boundedName('x'.repeat(24)).length, 24);
  assert.equal(hash('a'), hash('a')); assert.deepEqual(plotState('coup:1', 9), plotState('coup:1', 9)); assert.equal(plotRuler('coup:1').id, plotRuler('coup:1').id);
});

test('#281 rules: a calm realm forms no plot; Unrest, low Stability and low Royal Favor raise the odds', () => {
  const hot = { unrest: 62, stability: 40, favor: 0, sustainedSeconds: 2 * D };
  assert.equal(formationOdds({ ...hot, sustainedSeconds: 24 * H - 1 }), 0, 'under 24 real hours of pressure');
  assert.equal(formationOdds({ ...hot, unrest: 58 }) < formationOdds(hot), true);
  assert.equal(formationOdds({ unrest: 56, stability: 90, favor: 100, sustainedSeconds: 3 * D }), 0, 'high Stability and Royal Favor starve it');
  assert.ok(formationOdds({ ...hot, stability: 30 }) > formationOdds(hot), 'lower Stability raises odds');
  assert.ok(formationOdds({ ...hot, favor: 30 }) < formationOdds(hot), 'Royal Favor lowers odds');
  assert.equal(formationOdds({ unrest: 100, stability: 0, favor: 0, sustainedSeconds: 5 * D }), 100, 'clamped');
  for (let i = 0; i < 50; i++) assert.equal(plotForms(`s${i}`, 100), true); for (let i = 0; i < 50; i++) assert.equal(plotForms(`s${i}`, 0), false);
  assert.equal(pressureSeconds([{ scheduledAt: 100, unrest: 70 }, { scheduledAt: 50, unrest: 56 }, { scheduledAt: 10, unrest: 40 }], 200), 150);
  assert.equal(pressureSeconds([{ scheduledAt: 100, unrest: 54 }], 200), 0);
});

test('#281 rules: the Crisis Window opens at 50% of the Guard + 3 great lords; both outcomes are reachable and deterministic', () => {
  let ready = 0, exposed = 0, win = 0, lose = 0;
  for (let i = 0; i < 200; i++) {
    const s = plotState(`coup:${i}`, 40);
    assert.ok(s.ready !== s.exposed || (!s.ready && !s.exposed), 'one first event');
    if (s.ready) { ready++; assert.ok(s.guardPct >= coupConfig.guardThresholdPct && s.greatLords >= coupConfig.greatLordsThreshold && s.exposure <= coupConfig.exposureLimit) /* the threshold day wins a tie with exposure */; assert.ok(powerWeight(s.guardPct, s.greatLords) >= 80);
      assert.equal(coupSucceeds({ guardPct: s.guardPct, greatLords: s.greatLords, stability: 0, seed: `coup:${i}` }), true, 'a collapsed Stability always loses the Crown');
      if (coupSucceeds({ guardPct: s.guardPct, greatLords: s.greatLords, stability: 100, seed: `coup:${i}` })) win++; else lose++; }
    if (s.exposed) exposed++;
    const before = plotState(`coup:${i}`, s.ageDays - 1); assert.equal(before.ready || before.exposed, false, 'ageDays is the first day it holds');
  }
  assert.ok(ready > 20 && exposed > 5, `${ready} ready, ${exposed} exposed`); assert.ok(lose > 0, 'the Crown can hold at full Stability'); assert.equal(win + lose, ready);
});

async function setup(t, { flag = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_AURELLE_COUP_ENABLED', flag ? 'true' : undefined);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id IN ('alice','bob')").run();
  const day0 = Math.floor(r.now / 1000 / D);
  const scores = async (fromSeconds, toSeconds, unrest, stability) => {
    const rows = []; for (let s = fromSeconds; s <= toSeconds; s += 2 * H) rows.push(r.db.prepare("INSERT INTO nation_stability_scores (nation_id,tick,scheduled_at,computed_at,stability,unrest,inputs_json,breakdown_json) VALUES ('aurelle',?,?,?,?,?,'{}','{}') ON CONFLICT DO NOTHING").bind(100000 + Math.floor(s / (2 * H)), s, s, stability, unrest));
    for (let i = 0; i < rows.length; i += 50) await r.db.batch(rows.slice(i, i + 50));
  };
  const coups = async () => (await r.db.prepare('SELECT * FROM aurelle_coups ORDER BY formed_at').all()).results;
  const gazette = async () => (await r.db.prepare("SELECT headline, detail FROM world_events WHERE kind='court-gazette' ORDER BY sort_order").all()).results;
  const tick = async () => { await r.call('world', null); await r.call('world', null); };
  // The first start day (≥ day0) whose seed ends the given way: 'ready' (window opens), 'exposed', or 'lost' (window opens, Crown holds at Stability 100).
  const startDay = way => { for (let k = 0; k < 400; k++) { const id = `coup:${day0 + k}`, s = plotState(id, 60);
    if (way === 'exposed' && s.exposed) return day0 + k;
    if (way === 'ready' && s.ready) return day0 + k;
    if (way === 'lost' && s.ready && !coupSucceeds({ guardPct: s.guardPct, greatLords: s.greatLords, stability: 100, seed: id })) return day0 + k; } throw Error('no seed'); };
  const goto = day => { r.setNow((day * D + H) * 1000); return day * D + H; };
  return { r, day0, scores, coups, gazette, tick, startDay, goto };
}

async function formPlot(c, day) {
  const n = c.goto(day);
  await c.scores(n - 72 * H, n, 100, 0);
  await c.tick();
  return n;
}

test(`#281 ${backend}: sustained Unrest forms one plot in secret; nothing about it reaches a client before the window opens`, async t => {
  const c = await setup(t); const { r } = c;
  const day = c.startDay('ready'), n = await formPlot(c, day);
  const [plot] = await c.coups(); assert.equal((await c.coups()).length, 1, 'exactly one plot'); assert.equal(plot.formed_at, n); assert.equal(plot.window_opened_at, null);
  assert.deepEqual(plot.ruler_name, plotRuler(`coup:${day}`).name);
  const rumours = await c.gazette(); assert.equal(rumours.length, 1, 'one rumour item, no names');
  assert.ok(!greatLords.some(l => JSON.stringify(rumours).includes(l.name) || JSON.stringify(rumours).includes(l.house)), 'the rumour names no lord or house');
  const view = await r.call('aurelle/rising', 'alice');
  assert.equal(view.data.coup, null, 'no window yet'); assert.ok(!greatLords.some(l => JSON.stringify(view.data).includes(l.name)), 'no plotter in the Rising view');
  const gov = JSON.stringify((await r.call('citizen', 'alice')).data) + JSON.stringify((await r.call('world', null)).data);
  assert.ok(!greatLords.some(l => gov.includes(l.name)) && !/guard_pct|great_lords|ruler_id/.test(gov), 'no plot internals anywhere public');
  await c.tick(); assert.equal((await c.coups()).length, 1); assert.equal((await c.gazette()).length, 1, 'idempotent');
});

test(`#281 ${backend}: calm fixtures, short pressure and flag off form no plot; flag off is a complete no-op`, async t => {
  const calm = await setup(t); let n = calm.goto(calm.day0 + 3);
  await calm.scores(n - 72 * H, n, 54, 10); await calm.tick(); assert.equal((await calm.coups()).length, 0, 'Unrest 54 never forms a plot');
  const short = await setup(t); n = short.goto(short.day0 + 3);
  await short.scores(n - 22 * H, n, 100, 0); await short.tick(); assert.equal((await short.coups()).length, 0, 'under 24 hours of pressure');
  const off = await setup(t, { flag: false }); n = off.goto(off.day0 + 3);
  await off.scores(n - 72 * H, n, 100, 0); await off.tick();
  assert.equal((await off.coups()).length, 0); assert.equal((await off.gazette()).length, 0);
  assert.equal('coup' in (await off.r.call('aurelle/rising', 'alice')).data, false, 'no coup field while the flag is off');
  assert.equal((await off.r.call('citizen', 'alice')).data.government.crown, undefined);
});

test(`#281 ${backend}: at threshold exactly one window opens (36h), the coup succeeds, the new AI house is crowned, gazette and panel name it`, async t => {
  const c = await setup(t); const { r } = c;
  const day = c.startDay('ready'), n = await formPlot(c, day); const id = `coup:${day}`;
  const st = plotState(id, 60);
  r.setNow((n + st.ageDays * D - 60) * 1000); await c.scores(n, n + st.ageDays * D, 100, 0); await c.tick();
  assert.equal((await c.coups())[0].window_opened_at, null, 'just before the threshold day: no window');
  const openAt = n + st.ageDays * D; r.setNow(openAt * 1000); await c.tick(); await c.tick();
  const [opened] = await c.coups(); assert.equal((await c.coups()).length, 1);
  assert.equal(Number(opened.window_opened_at), openAt); assert.equal(Number(opened.window_closes_at) - openAt, coupConfig.windowSeconds);
  assert.deepEqual([opened.guard_pct_at_open, opened.great_lords_at_open].map(Number), [st.guardPct, st.greatLords]);
  const gz = await c.gazette(); assert.equal(gz.length, 2, 'window proclaimed once');
  const win = (await r.call('aurelle/rising', 'bob')).data.coup;
  assert.deepEqual([win.status, win.closesAt, win.newLeader], ['open', Number(opened.window_closes_at), null], 'the window is public; the plotter is not');
  assert.ok(!JSON.stringify(gz).includes(opened.ruler_name), 'the window names no plotter');
  const closes = Number(opened.window_closes_at);
  r.setNow((closes - 60) * 1000); await c.tick(); assert.equal((await c.coups())[0].resolved_at, null, 'open until it closes');
  r.setNow((closes + 1) * 1000); await c.scores(closes - 2 * H, closes, 100, 0); await c.tick(); await c.tick(); await c.tick();
  const done = (await c.coups())[0]; assert.equal(done.outcome, 'succeeded'); assert.equal(Number(done.resolved_at), closes + 1);
  const all = await c.gazette(); assert.equal(all.length, 3, 'outcome logged exactly once');
  assert.match(all[0].headline + all[0].detail, new RegExp(done.ruler_name.split(' ').pop())); assert.match(all[0].headline + all[0].detail, new RegExp(done.house));
  const crown = (await r.call('citizen', 'alice')).data.government.crown;
  assert.deepEqual([crown.name, crown.house, crown.how], [done.ruler_name, done.house, 'coup']); assert.ok(crown.name.length <= 24 && crown.house.length <= 24);
  assert.equal((await r.call('aurelle/rising', 'bob')).data.crown.name, done.ruler_name);
  assert.deepEqual((await r.call('aurelle/rising', 'bob')).data.coup.newLeader, { name: done.ruler_name, house: done.house });
  r.setNow((closes + 2 * D) * 1000); await c.tick(); assert.equal((await c.coups()).length, 1, 'cool-down: no second plot within 7 days');
});

test(`#281 ${backend}: the Crown can hold: a failed coup purges the plotters and the monarch stays`, async t => {
  const c = await setup(t); const { r } = c;
  const day = c.startDay('lost'), n = await formPlot(c, day); const st = plotState(`coup:${day}`, 60);
  const openAt = n + st.ageDays * D; r.setNow(openAt * 1000); await c.scores(n, openAt, 100, 100); await c.tick();
  const [opened] = await c.coups(); assert.ok(opened.window_opened_at);
  const closes = Number(opened.window_closes_at); r.setNow((closes + 1) * 1000); await c.scores(closes - 2 * H, closes, 100, 100); await c.tick(); await c.tick();
  const done = (await c.coups())[0]; assert.equal(done.outcome, 'failed'); assert.equal((await c.gazette()).length, 3);
  assert.match((await c.gazette())[0].headline + (await c.gazette())[0].detail, /plot|plotters|purge|failed|Crown holds|order/i);
  assert.equal((await r.call('citizen', 'alice')).data.government.crown, undefined, 'the authored monarch keeps the throne');
  assert.equal((await r.call('aurelle/rising', 'bob')).data.coup.status, 'failed'); assert.equal((await r.call('aurelle/rising', 'bob')).data.coup.newLeader, null);
});

test(`#281 ${backend}: a plot exposed before the threshold is purged with no window`, async t => {
  const c = await setup(t); const { r } = c;
  const day = c.startDay('exposed'), n = await formPlot(c, day); const st = plotState(`coup:${day}`, 60);
  r.setNow((n + st.ageDays * D) * 1000); await c.scores(n, n + st.ageDays * D, 100, 0); await c.tick(); await c.tick();
  const [p] = await c.coups(); assert.deepEqual([p.outcome, p.window_opened_at], ['failed', null]);
  assert.equal((await r.call('aurelle/rising', 'bob')).data.coup, null, 'no public window ever opened'); assert.equal((await c.gazette()).length, 2, 'rumour then purge');
});

test(`#281 ${backend}: a palace coup and a Rising are never open at once`, async t => {
  const c = await setup(t); const { r } = c; const rising = await r.importModule('lib/aurelle-rising.ts');
  const day = c.startDay('ready'), n = await formPlot(c, day); const st = plotState(`coup:${day}`, 60); const openAt = n + st.ageDays * D;
  // A Rising window is open when the plot becomes ready: the plot waits.
  await r.db.prepare("INSERT INTO aurelle_risings (id,claimant_id,opened_at,closes_at,pledges_at_open,weekly_humans_at_open,unrest_at_open) VALUES ('rising:x','larkspire',?,?,1,3,70)").bind(openAt - H, openAt + 30 * H).run();
  r.setNow(openAt * 1000); await c.scores(n, openAt, 100, 0); await c.tick();
  assert.equal((await c.coups())[0].window_opened_at, null, 'no coup window while a Rising window is open');
  await r.db.prepare("UPDATE aurelle_risings SET resolved_at=?, outcome='failed' WHERE id='rising:x'").bind(openAt + 1).run();
  r.setNow((openAt + 2) * 1000); await c.tick();
  const [opened] = await c.coups(); assert.ok(opened.window_opened_at, 'the window opens once the Rising is resolved');
  // And while the coup window is open, a qualifying Rising cannot open.
  const collective = await r.importModule('lib/collective-petitions.ts'); const now = openAt + 2;
  for (const u of ['alice', 'bob']) await collective.recordVerifiedHumanVisit(r.db, u, now, { aurelleRising: true });
  await r.db.prepare("INSERT INTO aurelle_pledges (clerk_user_id,claimant_id,request_id,pledged_at,policy) VALUES ('alice','larkspire','8b6f6a2e-1c1e-4b57-9d3a-0e5d5f1b2c3d',?,'tier1-human-v1')").bind(now - 8 * D).run();
  await c.scores(now - 60 * H, now, 100, 0);
  await rising.runAurelleRising(r.db, now);
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM aurelle_risings WHERE id LIKE 'rising:%' AND id <> 'rising:x'").first()).n, 0, 'no Rising opens during a coup window');
});

test(`#281 ${backend}: GETs are read-only; names are capped at 24 characters by the schema too`, async t => {
  const c = await setup(t); const { r } = c;
  const day = c.startDay('ready'), n = await formPlot(c, day); const st = plotState(`coup:${day}`, 60); const openAt = n + st.ageDays * D;
  r.setNow(openAt * 1000); await c.scores(n, openAt, 100, 0); await c.tick();
  const ledgers = ['aurelle_coups', 'aurelle_risings', 'aurelle_pledges', 'world_events', 'world_ticks', 'civic_human_activity'];
  const snap = async () => JSON.stringify(await Promise.all(ledgers.map(async x => (await r.db.prepare(`SELECT * FROM ${x}`).all()).results)));
  const before = await snap();
  for (const ep of ['aurelle/rising', 'citizen']) assert.equal((await r.call(ep, 'alice')).status, 200);
  assert.equal(await snap(), before, 'GET /api/aurelle/rising and GET /api/citizen write nothing');
  const long = 'x'.repeat(25);
  await assert.rejects(r.db.prepare("INSERT INTO aurelle_coups (id,formed_at,ruler_id,ruler_name,house) VALUES ('c1',1,'ashgrove',?,'House X')").bind(long).run());
  await assert.rejects(r.db.prepare("INSERT INTO aurelle_coups (id,formed_at,ruler_id,ruler_name,house) VALUES ('c2',1,'ashgrove','Lord X',?)").bind(long).run());
  await assert.rejects(r.db.prepare("INSERT INTO aurelle_coups (id,formed_at,ruler_id,ruler_name,house) VALUES ('c3',1,'nobody','Lord X','House X')").run());
});

test(`#281 ${backend}: flag off after an earlier coup: the crowned ruler still shows, nothing else runs`, async t => {
  const c = await setup(t); const { r } = c;
  const day = c.startDay('ready'), n = await formPlot(c, day); const st = plotState(`coup:${day}`, 60); const openAt = n + st.ageDays * D;
  r.setNow(openAt * 1000); await c.scores(n, openAt, 100, 0); await c.tick();
  const closes = Number((await c.coups())[0].window_closes_at); r.setNow((closes + 1) * 1000); await c.scores(closes - 2 * H, closes, 100, 0); await c.tick();
  const done = (await c.coups())[0]; assert.equal(done.outcome, 'succeeded');
  const gazetteBefore = (await c.gazette()).length;
  r.setFixtureEnv('HARIMU_AURELLE_COUP_ENABLED', undefined);
  assert.equal((await r.call('citizen', 'alice')).data.government.crown.name, done.ruler_name, 'the crown, already history, still shows');
  const view = (await r.call('aurelle/rising', 'bob')).data;
  assert.equal(view.crown.name, done.ruler_name); assert.equal('coup' in view, false, 'no coup window field with the flag off');
  const later = closes + 9 * D; r.setNow(later * 1000); await c.scores(later - 72 * H, later, 100, 0); await c.tick(); await c.tick();
  assert.equal((await c.coups()).length, 1, 'no new plot after the cool-down while the flag is off'); assert.equal((await c.gazette()).length, gazetteBefore, 'no new gazette');
});

test('#281 migration 0030 is additive, matches the runtime schema, passes the guard', async () => {
  const d1 = await readFile('drizzle/0030_aurelle_palace_coup.sql', 'utf8'), pg = await readFile('db/postgres/0030_aurelle_palace_coup.sql', 'utf8');
  const src = await readFile('lib/aurelle-coup.ts', 'utf8');
  const schema = src.match(/export const aurelleCoupSchema = `([\s\S]*?)`;/)[1].replace(/\s*\n\s*/g, ' ').trim();
  assert.ok(d1.includes(schema), 'D1 migration matches the runtime schema'); assert.ok(d1.includes('idx_aurelle_coups_formed'));
  const m = postgresMigrations().find(x => x.file === '0030_aurelle_palace_coup.sql'); assert.ok(m); assert.deepEqual([...m.tables], ['aurelle_coups']);
  assert.ok(!isDestructive(pg) && !isDestructive(d1)); assert.equal(transactionProblem(pg), null);
  assert.match(pg, /length\(ruler_name\) BETWEEN 1 AND 24/); assert.match(pg, /length\(house\) BETWEEN 1 AND 24/);
});
