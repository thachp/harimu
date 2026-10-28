/** #994: Plan medals raise displayed Korund Standing (docs 12.11 step 3), behind HARIMU_KORUND_STANDING_ENABLED.
 *  Derived on read from the #737 medal total. No table, no migration, citizens.standing is not written. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRuntime } from './helpers/local-runtime.mjs';
import { componentModule } from './helpers/component-module.mjs';
import {
  korundStandingWorker, korundStandingGood, korundStandingExemplary, korundStandingGoodAt, korundStandingExemplaryAt,
  korundStandingLabel, korundPlanStanding, korundStandingCopy, korundStandingEnabled,
} from '../lib/korund-standing-rules.ts';

const WEEK = 50400;

test('rules: 0 is Worker; each threshold flips once; a later medal in the same band does not raise; re-read is identical', () => {
  assert.equal(korundStandingGoodAt, 1); assert.equal(korundStandingExemplaryAt, 3);
  assert.equal(korundStandingWorker, 'Worker'); assert.equal(korundStandingGood, 'Good standing'); assert.equal(korundStandingExemplary, 'Exemplary Worker');
  assert.equal(korundStandingLabel(0), korundStandingWorker);
  assert.equal(korundStandingLabel(korundStandingGoodAt), korundStandingGood);
  assert.equal(korundStandingLabel(korundStandingExemplaryAt - 1), korundStandingGood);
  assert.equal(korundStandingLabel(korundStandingExemplaryAt), korundStandingExemplary);
  assert.equal(korundStandingLabel(4), korundStandingExemplary);
  const at = (total, lastWeek) => korundPlanStanding({ total, lastWeek });
  assert.deepEqual(at(0, false), { label: korundStandingWorker, score: 0, raised: false });
  assert.deepEqual(at(1, true), { label: korundStandingGood, score: 1, raised: true });
  assert.deepEqual(at(2, true), { label: korundStandingGood, score: 2, raised: false }, 'second medal stays Good standing');
  assert.deepEqual(at(3, true), { label: korundStandingExemplary, score: 3, raised: true });
  assert.deepEqual(at(4, true), { label: korundStandingExemplary, score: 4, raised: false });
  assert.equal(at(3, false).raised, false, 'an older medal does not raise again');
  assert.deepEqual(at(3, true), at(3, true), 're-read is identical');
  assert.equal(korundStandingEnabled({ HARIMU_KORUND_MEDALS_ENABLED: 'true', HARIMU_KORUND_STANDING_ENABLED: 'true' }), true);
  for (const env of [null, {}, { HARIMU_KORUND_MEDALS_ENABLED: 'true' }, { HARIMU_KORUND_STANDING_ENABLED: 'true' }, { HARIMU_KORUND_MEDALS_ENABLED: 'TRUE', HARIMU_KORUND_STANDING_ENABLED: 'true' }]) assert.equal(korundStandingEnabled(env), false);
});

test('copy [ASSUMPTION]: exact notice, length caps, panel uses the copy module only', async () => {
  assert.equal(korundStandingCopy.line(korundStandingWorker), 'Standing: Worker');
  assert.equal(korundStandingCopy.line(korundStandingExemplary), 'Standing: Exemplary Worker');
  assert.equal(korundStandingCopy.raised(korundStandingGood), "Last week's Plan medal raised your Standing to Good standing.");
  assert.equal(korundStandingCopy.raised(korundStandingExemplary), "Last week's Plan medal raised your Standing to Exemplary Worker.");
  assert.ok(korundStandingCopy.line(korundStandingExemplary).length <= 40);
  assert.ok(korundStandingCopy.raised(korundStandingExemplary).length <= 80);
  const rules = await readFile(new URL('../lib/korund-standing-rules.ts', import.meta.url), 'utf8');
  assert.match(rules, /\[ASSUMPTION\]/);
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /korundStandingCopy\.line\(standing\.label\)/);
  assert.match(panel, /korundStandingCopy\.raised\(standing\.label\)/);
  assert.doesNotMatch(panel, /Standing: Worker|Last week's Plan medal/, 'no hard-coded standing copy in the panel');
  const { QuotaBar } = await import(await componentModule(new URL('../app/korund-plan-panel.tsx', import.meta.url).pathname));
  const quota = { workUnit: 'Brigade', targetFood: 40, unitFood: 40, ownFood: 8, weekStartsAt: '', weekEndsAt: '' };
  const medals = { total: 1, lastWeek: true };
  const raised = renderToStaticMarkup(React.createElement(QuotaBar, { quota, medals, standing: { label: korundStandingGood, score: 1, raised: true } }));
  assert.match(raised, /Plan medals: 1 · Standing: Good standing/);
  assert.match(raised, /role="status">Last week(?:'|&#x27;)s Plan medal raised your Standing to Good standing\./);
  const held = renderToStaticMarkup(React.createElement(QuotaBar, { quota, medals, standing: { label: korundStandingGood, score: 2, raised: false } }));
  assert.match(held, /Standing: Good standing/); assert.doesNotMatch(held, /raised your Standing/);
  const off = renderToStaticMarkup(React.createElement(QuotaBar, { quota, medals }));
  assert.match(off, /Plan medals: 1/); assert.doesNotMatch(off, /Standing:/);
});

test('preview flag is "true" and production is "false"', async () => {
  const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(strip(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')).vars.HARIMU_KORUND_STANDING_ENABLED, 'true');
  assert.equal(strip(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8')).vars.HARIMU_KORUND_STANDING_ENABLED, 'false');
});

async function setup(t, { medals = true, standing = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  if (medals) r.setFixtureEnv('HARIMU_KORUND_MEDALS_ENABLED', 'true');
  if (standing) r.setFixtureEnv('HARIMU_KORUND_STANDING_ENABLED', 'true');
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  return { r, epoch };
}
async function settle(r, user, at, shifts) {
  for (let i = 0; i < shifts; i++) {
    const id = randomUUID(), iso = new Date((at + i) * 1000).toISOString();
    await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Korund fixture', '4 state food', 4, iso, iso, iso).run();
    await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,4,?)').bind(id, user, at + i).run();
  }
}
const earnWeek = (r, epoch, week) => Promise.all([settle(r, 'alice', epoch + week * WEEK + 100, 2), settle(r, 'bob', epoch + week * WEEK + 200, 8)]);
const plan = async (r, user = 'alice') => (await r.call('citizen', user)).data.korundPlan;
const storedStanding = async (r, user = 'alice') => (await r.db.prepare('SELECT standing FROM citizens WHERE clerk_user_id=?').bind(user).first()).standing;

test('flag on: 0 medals is the base label; each closed-week threshold flips once; re-read is idempotent; citizens.standing stays put', async t => {
  const { r, epoch } = await setup(t);
  await earnWeek(r, epoch, 0);
  r.setNow((epoch + 1000) * 1000);
  assert.deepEqual((await plan(r)).planStanding, { label: 'Worker', score: 0, raised: false }, 'open week: 0 medals');
  r.setNow((epoch + WEEK + 100) * 1000);
  const once = (await plan(r)).planStanding;
  assert.deepEqual(once, { label: 'Good standing', score: 1, raised: true });
  assert.deepEqual((await plan(r)).planStanding, once, 'idempotent re-read');
  await earnWeek(r, epoch, 1); r.setNow((epoch + 2 * WEEK + 100) * 1000);
  assert.deepEqual((await plan(r)).planStanding, { label: 'Good standing', score: 2, raised: false });
  await earnWeek(r, epoch, 2); r.setNow((epoch + 3 * WEEK + 100) * 1000);
  assert.deepEqual((await plan(r)).planStanding, { label: 'Exemplary Worker', score: 3, raised: true });
  assert.deepEqual((await plan(r)).planStanding, { label: 'Exemplary Worker', score: 3, raised: true }, 'idempotent at the top threshold');
  await earnWeek(r, epoch, 3); r.setNow((epoch + 4 * WEEK + 100) * 1000);
  assert.deepEqual((await plan(r)).planStanding, { label: 'Exemplary Worker', score: 4, raised: false });
  assert.equal(await storedStanding(r), 'Good standing', 'citizens.standing is not written');
});

test('either flag off: no planStanding; medals flag off also omits medals; stored standing unchanged', async t => {
  for (const flags of [{ medals: false, standing: false }, { medals: true, standing: false }, { medals: false, standing: true }]) {
    const { r, epoch } = await setup(t, flags);
    await earnWeek(r, epoch, 0); r.setNow((epoch + WEEK + 100) * 1000);
    const row = await plan(r);
    assert.equal('planStanding' in row, false, JSON.stringify(flags));
    assert.equal('medals' in row, flags.medals === true, JSON.stringify(flags));
    assert.equal(await storedStanding(r), 'Good standing');
  }
});

test('non-Korund unchanged: a citizen who left, and one who never joined, get no planStanding', async t => {
  const { r, epoch } = await setup(t);
  await earnWeek(r, epoch, 0); r.setNow((epoch + WEEK + 100) * 1000);
  assert.equal((await plan(r)).planStanding.label, 'Good standing');
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  assert.equal((await plan(r)).planStanding, undefined);
  assert.equal(await storedStanding(r), 'Good standing');
  await r.db.prepare(`INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('carol','kindle','carol',18,0,'Good standing',?,?)`).bind(new Date(r.now).toISOString(), new Date(r.now).toISOString()).run();
  assert.equal((await plan(r, 'carol')).planStanding, undefined);
  assert.equal(await storedStanding(r, 'carol'), 'Good standing');
});

async function sqlDuring(r, fn) {
  const seen = [], prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(sql.replace(/\s+/g, ' ').trim()); return prepare(sql); };
  try { await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}
const isMedalQuery = sql => /FROM korund_settlements WHERE clerk_user_id=\? AND settled_at>=\? AND settled_at<\?/.test(sql);
const isWrite = sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

test('flag off runs no medal query when medals are off; flag on reads medals and writes nothing', async t => {
  const off = await setup(t, { medals: false, standing: true });
  await earnWeek(off.r, off.epoch, 0); off.r.setNow((off.epoch + WEEK + 100) * 1000);
  const quiet = await sqlDuring(off.r, () => plan(off.r));
  assert.equal(quiet.filter(isMedalQuery).length, 0, 'standing flag alone does not read medals');
  assert.equal(quiet.filter(sql => /UPDATE citizens SET standing/i.test(sql)).length, 0);
  const on = await setup(t);
  await earnWeek(on.r, on.epoch, 0); on.r.setNow((on.epoch + WEEK + 100) * 1000);
  const sql = await sqlDuring(on.r, async () => { for (let i = 0; i < 2; i++) await plan(on.r); });
  assert.ok(sql.some(isMedalQuery), 'baseline: both flags on still use the #737 medal read');
  assert.deepEqual(sql.filter(isWrite), [], 'GET with standing on is read-only');
});
