/** #1066 (docs §17.4): Dormant (30+ real days) releases the job; Away keeps it. Flag HARIMU_DORMANCY_ENABLED.
 *  The releasing read is GET /api/world, which already runs the world pass with that flag. GET /api/citizen stays read-only (#205). */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import * as copy from '../lib/dormancy-copy.ts';

const D = 86400;
const iso = (seconds) => new Date(seconds * 1000).toISOString();

async function setup(t, { backend = 'sqlite', on = true } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setDormancy(on);
  const now = Math.floor(r.now / 1000);
  const shift = (user, id) => r.db.prepare(`INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at) VALUES (?,?, 'harvest','Harvest','food',4,?,?)`).bind(id, user, iso(now), iso(now + 7200)).run();
  const seen = (user, days) => r.db.prepare('UPDATE citizens SET last_active_at=? WHERE clerk_user_id=?').bind(iso(now - days * D), user).run();
  await shift('alice', 'shift-alice'); await shift('bob', 'shift-bob');
  await r.db.prepare("INSERT INTO korund_job_assignments (id,clerk_user_id,job_id,outcome,reasons,assigned_at) VALUES ('job-alice','alice','korund-plan-clerk','first-choice','[]',?)").bind(now - 40 * D).run();
  await r.db.prepare("INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES ('alice','kindle','kolt-savanna','kolt-savanna',1)").run();
  await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES ('keep','alice','sell','food',-3,500,1)").run();
  const open = async (user) => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM work_shifts WHERE clerk_user_id=? AND claimed_at IS NULL').bind(user).first()).n);
  const releases = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM dormant_job_releases').first()).n);
  const kept = async () => ({
    home: (await r.db.prepare("SELECT home_city_id FROM citizen_city_locations WHERE user_id='alice'").first()).home_city_id,
    food: Number((await r.db.prepare("SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id='alice' AND item='food'").first()).quantity),
    wallet: Number((await r.db.prepare("SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id='alice'").first()).balance),
    capacity: Number((await r.db.prepare("SELECT capacity FROM citizens WHERE clerk_user_id='alice'").first()).capacity),
    settlements: Number((await r.db.prepare('SELECT COUNT(*) AS n FROM shift_settlements').first()).n),
  });
  const bureau = async (user) => (await (await r.importModule('lib/labor-bureau.ts')).readBureau(r.db, user, now));
  return { r, now, seen, open, releases, kept, bureau, read: () => r.call('world') };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: 31 days ago has no job after the world read; 10 days keeps it; a second read changes nothing; home, items and savings stay`, async t => {
    const w = await setup(t, { backend });
    await w.seen('alice', 31); await w.seen('bob', 10);
    const before = await w.kept();
    assert.equal((await w.bureau('alice')).assignment.jobId, 'korund-plan-clerk');
    assert.equal((await w.bureau('alice')).jobs.find(job => job.id === 'korund-plan-clerk').filled, 1);
    const quiet = await w.r.call('citizen', 'alice');
    assert.equal(quiet.status, 200); assert.equal(await w.open('alice'), 1, 'GET /api/citizen does not release');
    assert.equal((await w.read()).status, 200);
    assert.equal(await w.open('alice'), 0, '31 days: no job'); assert.equal(await w.open('bob'), 1, '10 days: job kept');
    assert.equal((await w.bureau('alice')).assignment, null); assert.equal((await w.bureau('bob')).jobs.find(job => job.id === 'korund-plan-clerk').filled, 0, 'the seat can be taken again');
    assert.equal(await w.releases(), 1);
    assert.deepEqual(await w.kept(), before, 'home, items, savings and capacity unchanged, and nothing was paid');
    assert.equal((await w.read()).status, 200);
    assert.equal(await w.releases(), 1, 'idempotent'); assert.equal(await w.open('alice'), 0); assert.equal(await w.open('bob'), 1);
    // '2000-01-01' sorts before the cutoff. The length guard is what keeps it from counting as Dormant.
    await w.r.db.prepare("UPDATE citizens SET last_active_at='2000-01-01' WHERE clerk_user_id='bob'").run();
    await w.read(); assert.equal(await w.open('bob'), 1, 'a short date that sorts before the cutoff is not dormant');
  });

  test(`${backend}: flag off is a no-op; a return shows the line only when a job was released`, async t => {
    const off = await setup(t, { backend, on: false });
    await off.seen('alice', 31);
    const prepare = off.r.db.prepare.bind(off.r.db), seen = []; off.r.db.prepare = (q) => { seen.push(q); return prepare(q); };
    assert.equal((await off.read()).status, 200); assert.equal((await off.r.call('citizen/heartbeat', 'alice', {})).status, 404);
    off.r.db.prepare = prepare;
    assert.equal(seen.some(q => /dormant_job_releases/.test(q)), false); assert.equal(await off.open('alice'), 1);
    const on = await setup(t, { backend, on: true });
    await on.seen('alice', 31); await on.seen('bob', 10);
    const back = await on.r.call('citizen/heartbeat', 'alice', {});
    assert.equal(back.status, 200, JSON.stringify(back.data));
    assert.equal(back.data.welcomeBack.status, 'dormant'); assert.equal(back.data.welcomeBack.jobReleased, true);
    assert.equal(await on.open('alice'), 0); assert.equal(await on.releases(), 1);
    const again = await on.r.call('citizen/heartbeat', 'alice', {});
    assert.equal(again.data.welcomeBack, null, 'the briefing, and so the line, is shown once'); assert.equal(await on.releases(), 1);
    await on.r.db.prepare('DELETE FROM work_shifts WHERE clerk_user_id=?').bind('bob').run();
    await on.r.db.prepare('DELETE FROM korund_job_assignments WHERE clerk_user_id=?').bind('bob').run();
    const away = await on.r.call('citizen/heartbeat', 'bob', {});
    assert.equal(away.data.welcomeBack.status, 'away'); assert.equal(away.data.welcomeBack.jobReleased, undefined);
    const bare = await setup(t, { backend, on: true });
    await bare.r.db.prepare('DELETE FROM work_shifts').run(); await bare.r.db.prepare('DELETE FROM korund_job_assignments').run();
    await bare.seen('alice', 31);
    const none = await bare.r.call('citizen/heartbeat', 'alice', {});
    assert.equal(none.data.welcomeBack.status, 'dormant'); assert.equal(none.data.welcomeBack.jobReleased, undefined, 'no job, no line');
    assert.equal(await bare.releases(), 0);
    await bare.seen('alice', 181);
    await bare.r.db.prepare(`INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at) VALUES ('shift-arch','alice','harvest','Harvest','food',4,?,?)`).bind(iso(bare.now), iso(bare.now)).run();
    const archived = await bare.r.call('citizen/heartbeat', 'alice', {});
    assert.equal(archived.data.welcomeBack.status, 'archived'); assert.equal(archived.data.welcomeBack.jobReleased, true);
  });
}

const welcomeHtml = async (data, nationId = 'kindle') => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const React = (await import('react')).default;
  const require = createRequire(import.meta.url);
  const src = await readFile(new URL('../app/welcome-back.tsx', import.meta.url), 'utf8');
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports, (name) => name === '@/lib/dormancy-copy' ? copy : require(name));
  return renderToStaticMarkup(React.createElement(exports.WelcomeBack, { nationId, data, now: Date.parse('2026-03-01T00:00:00.000Z'), onClose() {} }));
};

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: a Dormant return can pay the Savings Shield without a job, and then there is no job-released line`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setDormancy(true);
    r.setFixtureEnv('HARIMU_SAVINGS_SHIELD_ENABLED', 'true');
    r.setFixtureEnv('HARIMU_ACCOUNT_ELECTION_POC_ENABLED', 'true');
    r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true');
    await r.call('citizen', 'alice');
    await r.db.prepare('DELETE FROM work_shifts').run();
    await r.db.prepare('DELETE FROM korund_job_assignments').run();
    const now = Math.floor(r.now / 1000), last = now - 40 * D;
    await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), 'alice', 10000).run();
    await r.db.prepare("UPDATE economy_funds SET initial_minor = 100000 WHERE id = 'kindle-treasury'").run();
    await r.db.prepare("INSERT INTO spark_issuances VALUES ('spark-seed','spark-seed',1,'seed',0,100000,0,100000,'Reserve Board',?,NULL)").bind(last - 3600).run();
    await r.db.prepare("INSERT INTO spark_issuances VALUES ('i1','i1',2,'emergency',1000,10000,100000,110000,'Reserve Board',?,'spark-seed')").bind(last + D).run();
    await r.db.prepare('UPDATE citizens SET last_active_at=? WHERE clerk_user_id=?').bind(iso(last), 'alice').run();
    const back = await r.call('citizen/heartbeat', 'alice', {});
    assert.equal(back.status, 200, JSON.stringify(back.data));
    assert.equal(back.data.welcomeBack.status, 'dormant');
    assert.ok(back.data.welcomeBack.shield.creditMinor > 0, 'the shield paid');
    assert.equal(back.data.welcomeBack.jobReleased, undefined, 'the shield paid and no job was released, so jobReleased is absent');
    assert.equal(await r.db.prepare('SELECT COUNT(*) AS n FROM dormant_job_releases').first().then(row => Number(row.n)), 0);
    const html = await welcomeHtml(back.data.welcomeBack);
    assert.match(html, /not counted in quorums/);
    assert.doesNotMatch(html, /Your job slot was released|job board|Labor Bureau|chartered markets/);
  });

  test(`${backend}: a settled unclaimed shift is left in place while an unsettled job is released`, async t => {
    const w = await setup(t, { backend });
    await w.seen('alice', 31);
    await w.r.db.prepare("INSERT INTO shift_settlements (shift_id,clerk_user_id,wage_minor,item,quantity,settled_at) VALUES ('shift-alice','alice',800,'food',4,?)").bind(iso(w.now)).run();
    const read = await w.read();
    assert.equal(read.status, 200, JSON.stringify(read.data));
    const shift = await w.r.db.prepare("SELECT claimed_at FROM work_shifts WHERE id='shift-alice'").first();
    assert.equal(shift?.claimed_at ?? null, null, 'the settled shift row stays');
    assert.equal(Number((await w.r.db.prepare("SELECT wage_minor FROM shift_settlements WHERE shift_id='shift-alice'").first()).wage_minor), 800);
    assert.equal((await w.bureau('alice')).assignment, null, 'the bureau seat still released, so the batch committed');
  });

  test(`${backend}: a second absence releases only a new assignment, and an old released assignment is not recorded again`, async t => {
    const w = await setup(t, { backend });
    await w.r.db.prepare("DELETE FROM work_shifts WHERE clerk_user_id='alice'").run();
    await w.seen('alice', 40);
    assert.equal((await w.read()).status, 200);
    const jobs = async () => (await w.r.db.prepare("SELECT job_id FROM dormant_job_releases WHERE clerk_user_id='alice' ORDER BY released_at, absence_key").all()).results.map(row => row.job_id);
    assert.deepEqual(await jobs(), ['korund-plan-clerk']);
    await w.r.db.prepare('UPDATE citizens SET last_active_at=? WHERE clerk_user_id=?').bind(iso(w.now), 'alice').run();
    w.r.setNow(w.r.now + 31 * D * 1000);
    assert.equal((await w.read()).status, 200);
    assert.deepEqual(await jobs(), ['korund-plan-clerk'], 'dormant again with no new assignment: the old one is not recorded again');
    const backAt = Math.floor(w.r.now / 1000);
    await w.r.db.prepare('UPDATE citizens SET last_active_at=? WHERE clerk_user_id=?').bind(iso(backAt), 'alice').run();
    await w.r.db.prepare("INSERT INTO korund_job_assignments (id,clerk_user_id,job_id,outcome,reasons,assigned_at) VALUES ('job-alice-2','alice','korund-quarry-gang','first-choice','[]',?)").bind(backAt).run();
    w.r.setNow(w.r.now + 31 * D * 1000);
    assert.equal((await w.read()).status, 200);
    assert.deepEqual(await jobs(), ['korund-plan-clerk', 'korund-quarry-gang']);
    assert.equal((await w.read()).status, 200);
    assert.deepEqual(await jobs(), ['korund-plan-clerk', 'korund-quarry-gang'], 'the new assignment is released once');
  });

  test(`${backend}: a released assignment does not keep the request cooldown`, async t => {
    const w = await setup(t, { backend });
    await w.r.db.prepare("DELETE FROM work_shifts WHERE clerk_user_id='alice'").run();
    await w.r.db.prepare('UPDATE korund_job_assignments SET assigned_at=? WHERE id=?').bind(w.now - 5 * D, 'job-alice').run();
    await w.seen('alice', 31);
    await w.r.db.prepare("INSERT INTO korund_job_preferences (clerk_user_id,first_job,second_job,third_job,filed_at) VALUES ('alice','korund-food-production','korund-quarry-gang','korund-foundry-hand',?)").bind(w.now).run();
    assert.equal((await w.read()).status, 200);
    const bureau = await w.r.importModule('lib/labor-bureau.ts');
    const view = await bureau.readBureau(w.r.db, 'alice', w.now);
    assert.equal(view.assignment, null);
    assert.equal(view.nextRequestAt, null);
    assert.equal(view.canRequest, true);
    const result = await bureau.requestAssignment(w.r.db, 'alice', randomUUID(), w.now);
    assert.equal(result.status, 200, JSON.stringify(result));
  });
}

test('Welcome back renders the job line only when a job was released', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const React = (await import('react')).default;
  const require = createRequire(import.meta.url);
  const src = await readFile(new URL('../app/welcome-back.tsx', import.meta.url), 'utf8');
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports, (name) => name === '@/lib/dormancy-copy' ? copy : require(name));
  const html = (data, nationId = 'kindle') => renderToStaticMarkup(React.createElement(exports.WelcomeBack, { nationId, data, now: Date.parse('2026-03-01T00:00:00.000Z'), onClose() {} }));
  const since = '2026-01-01T00:00:00.000Z';
  assert.match(html({ status: 'dormant', since, jobReleased: true }), /Your job slot was released\. Open the job board to find work\./);
  assert.match(html({ status: 'dormant', since, jobReleased: true }, 'korund'), /Report to the Labor Bureau/);
  assert.match(html({ status: 'archived', since, jobReleased: true }, 'aurelle'), /a guild or in the chartered markets/);
  const dormant = html({ status: 'dormant', since });
  assert.match(dormant, /not counted in quorums/); assert.doesNotMatch(dormant, /job slot was released|job board|Labor Bureau/);
  const away = html({ status: 'away', since });
  assert.match(away, /off conscription and quotas/); assert.doesNotMatch(away, /job slot was released|job board/);
  assert.equal(exports.jobReleasedLine('confluence'), 'Your job slot was released. Pick a new one from Work.');
});
