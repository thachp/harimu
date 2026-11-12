/** #1324: a siege capture evacuates the defender's citizens to the nearest home city (Chebyshev). Flag off: no move, no notice. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { dormancyStatus } from '../lib/dormancy-rules.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('playwright');
const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30), FLAG = 'HARIMU_WAR_EVACUATION_ENABLED';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const ON = { HARIMU_WAR_ENABLED: 'true', HARIMU_WAR_EVACUATION_ENABLED: 'true' };
const iso = sec => new Date(sec * 1000).toISOString();

test('HARIMU_WAR_EVACUATION_ENABLED is army-pack entry 10, preview on, production off, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(FLAG_PACKS.HARIMU_ARMY_PACK[8], 'HARIMU_VARKAND_NATIONAL_SERVICE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_ARMY_PACK[9], FLAG);
  assert.equal(FLAG_PACKS.HARIMU_ARMY_PACK.at(-1), FLAG);
  assert.equal(preview.vars[FLAG], undefined, 'not its own text binding');
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_ARMY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_ARMY_PACK[FLAG], 'false');
  assert.equal(flagOn({ HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_PACK: preview.vars.HARIMU_ARMY_PACK }, FLAG), true);
  assert.equal(flagOn({ HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_PACK: prod.vars.HARIMU_ARMY_PACK }, FLAG), false);
  assert.equal(flagOn({ HARIMU_ARMY_PACK: '{"HARIMU_WAR_EVACUATION_ENABLED":"true"}', [FLAG]: 'false' }, FLAG), false, 'a direct string wins');
});

async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close()); r.setNow(DAY1);
  const siege = await r.importModule('lib/siege-actions.ts'), peace = await r.importModule('lib/war-peace-revert.ts'), zones = await r.importModule('lib/map-zones.ts');
  const nowS = () => Math.floor(r.now / 1000), run = (sql, ...b) => r.db.prepare(sql).bind(...b).run(), one = (sql, ...b) => r.db.prepare(sql).bind(...b).first();
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'pair-w1', 'korund', 'kindle', 'test', nowS() - 5 * D, nowS() - 3 * D);
  const assault = (over, at, env = ON) => { if (at !== undefined) r.setNow(at); return siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', ...over }, nowS(), true, { env }); };
  const fall = async (over, env = ON) => { const id = over.requestId, day1 = r.now; const first = await assault({ ...over, requestId: `${id}-d1` }, day1, env); assert.equal(first.ok, true, JSON.stringify(first)); return assault({ ...over, requestId: id }, day1 + D * 1000, env); };
  const kindle = zones.mvpNations.find(n => n.id === 'kindle');
  return { r, peace, run, one, assault, fall, nowS, out: kindle.outpost, cap: kindle.capital };
}
const person = async (c, id, nation, x, y, extra = {}) => {
  const now = c.nowS();
  await c.run('INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at,last_active_at) VALUES (?,?,?,18,1,\'Good standing\',?,?,?)', id, nation, id, iso(now), iso(now), extra.active ?? iso(now));
  if (x != null) await c.run('INSERT INTO citizen_travel (user_id,nation_id,from_x,from_y,to_x,to_y,departed_at,traveling_until,request_id) VALUES (?,?,?,?,?,?,?,?,?)', id, nation, x, y, x, y, 1, 1, `tr-${id}`);
  if (extra.home) await c.run('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?)', id, nation, extra.home, extra.current ?? extra.home, now);
};
const found = async (c, id, x, y, name, claim = false) => {
  await c.run(`INSERT INTO world_cities (id,nation_id,name,tier,center_x,center_y,authority,founded_by,request_id,founded_at) VALUES (?,?,?,1,?,?,'kindle-charter','alice',?,1)`, id, 'kindle', name, x, y, `rq-${id}`);
  if (claim) { await c.run('UPDATE world_squares SET zone=\'frontier\', owner=\'kindle\', feature=NULL WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?', x - 2, x + 2, y - 2, y + 2); await c.run('UPDATE world_squares SET feature=\'city\' WHERE x=? AND y=?', x, y); }
};
const spot = (c, id) => c.one('SELECT t.to_x AS x, t.to_y AS y, l.home_city_id AS home, l.current_city_id AS current FROM citizen_travel t LEFT JOIN citizen_city_locations l ON l.user_id=t.user_id WHERE t.user_id=?', id);

test('capture evacuates defenders, leaves everyone else, and a replay or a peace revert does not move them again', async t => {
  const c = await setup(t), { out, cap } = c, now = c.nowS();
  assert.equal(dormancyStatus(now - 10 * D, now), 'away'); assert.equal(dormancyStatus(now - 40 * D, now), 'dormant');
  await found(c, 'nearford', out.x + 1, out.y, 'Nearford');
  await found(c, 'a-hold', 2, 7, 'A Hold');
  await found(c, 'tiehold', 2, 4, 'Tiehold', true);
  await person(c, 'nearer', 'kindle', out.x, out.y);
  await person(c, 'away', 'kindle', out.x, out.y, { active: iso(now - 10 * D) });
  await person(c, 'dormant', 'kindle', out.x, out.y, { active: iso(now - 40 * D) });
  await person(c, 'visitor', 'kindle', out.x, out.y, { home: 'forgehaven', current: 'ashby-crossing' });
  await person(c, 'kor', 'korund', out.x, out.y);
  await person(c, 'homed', 'kindle', 2, 4, { home: 'tiehold', current: 'tiehold' });
  await c.run('INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (\'buy-nearer\',\'nearer\',\'buy\',\'food\',2,-100,1)');
  await c.run('INSERT INTO world_square_purchases (request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES (\'sq-nearer\',\'nearer\',\'kindle\',6,5,2500,1)');
  const purse = () => c.one('SELECT quantity_delta AS qty, wallet_delta AS wallet FROM citizen_economy_events WHERE id=\'buy-nearer\'');
  const money = await purse();
  const taken = await c.fall({ requestId: 'req-outpost' });
  assert.equal(taken.ok, true, JSON.stringify(taken)); assert.equal(taken.captured.moved, 1);
  const nearer = { x: out.x + 1, y: out.y };
  for (const id of ['nearer', 'away', 'dormant']) { const row = await spot(c, id); assert.deepEqual({ x: Number(row.x), y: Number(row.y) }, nearer, id); assert.equal(row.home, null, id); }
  const visitor = await spot(c, 'visitor');
  assert.deepEqual({ x: Number(visitor.x), y: Number(visitor.y), home: visitor.home, current: visitor.current }, { x: cap.x, y: cap.y, home: 'forgehaven', current: 'forgehaven' });
  const kor = await spot(c, 'kor'); assert.deepEqual({ x: Number(kor.x), y: Number(kor.y) }, { x: out.x, y: out.y });
  assert.deepEqual(await purse(), money);
  assert.equal((await c.one('SELECT clerk_user_id FROM world_square_purchases WHERE request_id=\'sq-nearer\'')).clerk_user_id, 'nearer');
  assert.equal(Number((await c.one('SELECT COUNT(*) AS n FROM home_city_moves')).n), 0);
  const stamp = () => c.one('SELECT e.evacuated_at AS at, t.request_id AS req FROM citizen_evacuations e JOIN citizen_travel t ON t.user_id=e.user_id WHERE e.user_id=\'nearer\'');
  const marked = await stamp();
  c.r.setNow(DAY1 + 2 * D * 1000);
  const replay = await c.assault({ requestId: 'req-outpost' });
  assert.equal(replay.replay, true); assert.deepEqual(await stamp(), marked); assert.equal(Number((await c.one('SELECT COUNT(*) AS n FROM city_captures')).n), 1);
  const fell = await c.fall({ cityKind: 'founded', cityId: 'tiehold', requestId: 'req-tiehold' });
  assert.equal(fell.ok, true, JSON.stringify(fell));
  const homed = await spot(c, 'homed');
  assert.deepEqual({ x: Number(homed.x), y: Number(homed.y), home: homed.home, current: homed.current }, { x: cap.x, y: cap.y, home: 'forgehaven', current: 'forgehaven' }, 'a tie goes to the capital, and a captured home is updated');
  assert.deepEqual({ x: Number((await spot(c, 'nearer')).x), y: Number((await spot(c, 'nearer')).y) }, nearer, 'the earlier evacuee is not moved by the second capture');
  const parked = await spot(c, 'nearer');
  await c.run('INSERT INTO war_peace_reverts (war_id,status,squares,reverted_at) VALUES (\'w1\',\'pending\',NULL,?)', c.nowS());
  await c.peace.revertPeaceCaptures(c.r.db, 'w1', c.nowS());
  assert.deepEqual(await spot(c, 'nearer'), parked, 'a peace revert does not auto-return evacuees');
  assert.equal((await c.one('SELECT owner FROM world_squares WHERE x=? AND y=?', out.x, out.y)).owner, 'kindle');
  assert.equal(Number((await c.one('SELECT COUNT(*) AS n FROM home_city_moves')).n), 0);
  await found(c, 'flag-evac', 24, 18, 'Flag Evac', true);
  await found(c, 'flag-war', 24, 8, 'Flag War', true);
  await person(c, 'flag-evac', 'kindle', 24, 18);
  await person(c, 'flag-war', 'kindle', 24, 8);
  const stayed = async (id, env) => {
    const done = await c.fall({ cityKind: 'founded', cityId: id, requestId: `cap-${id}` }, env);
    assert.equal(done.ok, true, JSON.stringify(done));
    const row = await spot(c, id); assert.deepEqual({ x: Number(row.x), y: Number(row.y) }, { x: id === 'flag-evac' ? 24 : 24, y: id === 'flag-evac' ? 18 : 8 }, id);
    assert.equal(await c.one('SELECT user_id FROM citizen_evacuations WHERE user_id=?', id), null, id);
  };
  await stayed('flag-evac', { HARIMU_WAR_ENABLED: 'true', HARIMU_WAR_EVACUATION_ENABLED: 'false', HARIMU_ARMY_PACK: '{"HARIMU_WAR_EVACUATION_ENABLED":"true"}' });
  await stayed('flag-war', { HARIMU_WAR_ENABLED: 'false', HARIMU_WAR_EVACUATION_ENABLED: 'true' });
  c.r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true'); c.r.setFixtureEnv('HARIMU_WAR_EVACUATION_ENABLED', 'true');
  const evac = await c.r.importModule('lib/war-evacuation.ts');
  const on = (await c.r.call('citizen', 'nearer')).data;
  assert.deepEqual(on.evacuation.lines, [...evac.evacuationLines('Ashby Crossing', 'Nearford')]);
  assert.match(on.evacuation.lines[0], /^You were evacuated from Ashby Crossing to Nearford\.$/);
  assert.equal(on.evacuation.lines[1], 'Your home was not looted. Your personal items are safe.');
  assert.doesNotMatch(on.evacuation.lines.join(' '), /voucher|buyout|Relocation/);
  c.r.setFixtureEnv('HARIMU_WAR_EVACUATION_ENABLED', 'false');
  assert.equal((await c.r.call('citizen', 'nearer')).data.evacuation, undefined, 'flag off: no notice');
  c.r.setFixtureEnv('HARIMU_WAR_ENABLED', 'false'); c.r.setFixtureEnv('HARIMU_WAR_EVACUATION_ENABLED', 'true');
  assert.equal((await c.r.call('citizen', 'nearer')).data.evacuation, undefined, 'war flag off: no notice');
});

test('the #421 notice shows on desktop (1280px and up) and stays unshown below that', async t => {
  const src = readFileSync('app/evacuation-notice.tsx', 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {}; new Function('exports', 'require', 'module', js)(exports, require, { exports });
  const lines = ['You were evacuated from Ashby Crossing to Nearford.', 'Your home was not looted. Your personal items are safe.'];
  const html = renderToStaticMarkup(React.createElement(exports.EvacuationNotice, { lines }));
  assert.match(html, /You were evacuated from Ashby Crossing to Nearford\./);
  assert.match(html, /Your home was not looted\. Your personal items are safe\./);
  assert.match(html, /@media\(min-width:1280px\)/);
  assert.equal(renderToStaticMarkup(React.createElement(exports.EvacuationNotice, {})), '');
  assert.match(readFileSync('app/page.tsx', 'utf8'), /\{evacuation && <EvacuationNotice lines=\{evacuation\} \/>\}/);
  let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  t.after(() => browser.close());
  for (const [width, shown] of [[1280, 'block'], [1279, 'none'], [390, 'none']]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.setContent(`<!doctype html><meta charset="utf-8"><body>${html}</body>`);
    assert.equal(await page.locator('.war-evac-notice').evaluate(el => getComputedStyle(el).display), shown, String(width));
    await page.close();
  }
});
