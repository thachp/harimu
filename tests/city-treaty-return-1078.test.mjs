/** #1078: a treaty writes one city-history return ("returned to X by treaty"). Ceded, surrender, re-run, and flag off add none. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const SECRET = 'a-very-long-server-only-secret';
const read = file => readFileSync(file, 'utf8');
const day = at => new Date(at * 1000).toISOString().slice(0, 10);

test('migration 0116, both trees, after 0112 (#1068), 0114 (dev) and 0115 (#1071)', () => {
  assert.equal(existsSync('db/postgres/0116_city_treaty_returns.sql'), true);
  assert.equal(existsSync('drizzle/0116_city_treaty_returns.sql'), true);
  assert.equal(existsSync('db/postgres/0115_city_treaty_returns.sql'), false);
  assert.match(read('app/api/city/route.ts'), /peaceRevertEnabled/);
  assert.match(read('app/scene-panels-v2.tsx'), /treatyReturnLine/);
});

async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS() - 60 * 86400));
  const actions = await r.importModule('lib/war-actions.ts'), endings = await r.importModule('lib/war-endings.ts'), peace = await r.importModule('lib/war-peace-revert.ts'), history = await r.importModule('lib/city-capture-history.ts');
  const command = (body, { peaceRevert = false, endings: on = false } = {}) => actions.handleWarCommand(r.db, { enabled: true, endings: on, peaceRevert, secret: SECRET, authorization: `Bearer ${SECRET}`, body: { requestId: randomUUID(), ...body }, now: nowS() });
  const run = (sql, ...bind) => r.db.prepare(sql).bind(...bind).run();
  const frontier = (await r.db.prepare("SELECT x,y FROM world_squares WHERE zone='frontier' ORDER BY x,y LIMIT 4").all()).results.map(s => ({ x: Number(s.x), y: Number(s.y) }));
  const squares = { siege: frontier[0], ceded: frontier[2], other: frontier[3] };
  const rows = async warId => (await r.db.prepare('SELECT capture_id, city_key, returned_to, returned_at FROM city_treaty_returns WHERE war_id=? ORDER BY capture_id').bind(warId).all()).results;
  return { r, command, endings, peace, history, run, squares, nowS, rows };
}
async function openWar(c) {
  c.r.setNow(c.r.now + 11 * 86400 * 1000);
  const declared = await c.command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' });
  assert.equal(declared.ok, true, JSON.stringify(declared));
  return declared.war;
}
async function seize(c, { warId, id, square, from, to, at, city = 'forgehaven' }) {
  const siege = `siege-${id}`;
  await c.run('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at,captured_at) VALUES (?,?,?,?,?,?,?,?,?,?)', siege, warId, `city:${city}`, 'founded', square.x, square.y, to, from, at, at);
  await c.run('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)', id, siege, warId, `rq-${id}`, to, from, 1, 0, at);
  await c.run('INSERT INTO city_capture_squares (capture_id,x,y,from_nation,to_nation) VALUES (?,?,?,?,?)', id, square.x, square.y, from, to);
  await c.run('UPDATE world_squares SET owner=? WHERE x=? AND y=?', to, square.x, square.y);
}

test('treaty adds one return; ceded, surrender, re-run, and flag off add none; the panel shows it after the capture', async t => {
  const c = await setup(t);
  let at = c.nowS();
  let war = await openWar(c); at = c.nowS();
  await seize(c, { warId: war.id, id: 'cap-1078', square: c.squares.siege, from: 'kindle', to: 'korund', at });
  await c.command({ action: 'propose-end', nation: 'korund', role: 'Chairman', warId: war.id, kind: 'peace' });
  const acceptId = randomUUID();
  const ended = await c.command({ action: 'accept-end', nation: 'kindle', role: 'President', warId: war.id, requestId: acceptId }, { peaceRevert: true });
  assert.equal(ended.ok, true, JSON.stringify(ended));
  const once = await c.rows(war.id);
  assert.equal(once.length, 1, 'a reverted city adds one return entry');
  assert.deepEqual({ city: once[0].city_key, to: once[0].returned_to, at: Number(once[0].returned_at) }, { city: 'city:forgehaven', to: 'kindle', at });
  const prepare = c.r.db.prepare.bind(c.r.db), seen = [];
  c.r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  const again = await c.peace.revertPeaceCaptures(c.r.db, war.id, at);
  c.r.db.prepare = prepare;
  assert.equal(again.replay, true);
  assert.equal(seen.some(sql => /INSERT INTO city_treaty_returns/i.test(sql)), false, 're-run writes no second return entry');
  assert.equal((await c.rows(war.id)).length, 1);

  c.r.setFixtureEnv('HARIMU_CITY_CAPTURE_HISTORY_ENABLED', 'true');
  c.r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  c.r.setFixtureEnv('HARIMU_WAR_PEACE_REVERT_ENABLED', 'true');
  const shown = await c.r.call('city', 'alice');
  assert.equal(shown.data.captureHistory.capturedFrom, 'Kindle');
  assert.deepEqual(shown.data.captureHistory.treatyReturn, { returnedTo: 'Kindle', returnedAt: at });
  assert.equal(c.history.treatyReturnLine(shown.data.captureHistory.treatyReturn), `Returned to Kindle by treaty on ${day(at)}.`);
  c.r.setFixtureEnv('HARIMU_WAR_PEACE_REVERT_ENABLED', 'false');
  const offSql = [];
  c.r.db.prepare = sql => { offSql.push(sql); return prepare(sql); };
  const hidden = await c.r.call('city', 'alice');
  c.r.db.prepare = prepare;
  assert.equal('treatyReturn' in hidden.data.captureHistory, false, 'flag off leaves the capture history unchanged');
  assert.equal(hidden.data.captureHistory.capturedFrom, 'Kindle');
  assert.equal(offSql.some(sql => /city_treaty_returns/.test(sql)), false, 'flag off does not read the return');

  war = await openWar(c); at = c.nowS();
  await seize(c, { warId: war.id, id: 'cap-back', square: c.squares.other, from: 'korund', to: 'kindle', at, city: 'kolt-savanna' });
  await seize(c, { warId: war.id, id: 'cap-cede', square: c.squares.ceded, from: 'aurelle', to: 'kindle', at, city: 'lumen-harbor' });
  assert.equal((await c.command({ action: 'concede', nation: 'kindle', role: 'President', warId: war.id, squares: [c.squares.ceded] }, { endings: true })).status, 'proposed');
  assert.equal(await c.endings.decideWarEndings(c.r.db, at + 60, { peaceRevert: true }), 1);
  const mixed = await c.rows(war.id);
  assert.deepEqual(mixed.map(row => row.city_key), ['city:kolt-savanna'], 'the ceded city adds none; the returned city adds one');
  assert.equal(mixed[0].returned_to, 'korund');

  war = await openWar(c); at = c.nowS();
  await seize(c, { warId: war.id, id: 'cap-surrender', square: c.squares.siege, from: 'kindle', to: 'korund', at, city: 'ash-landing' });
  assert.equal((await c.command({ action: 'surrender', nation: 'kindle', role: 'President', warId: war.id }, { endings: true })).status, 'proposed');
  assert.equal(await c.endings.decideWarEndings(c.r.db, at + 60, { peaceRevert: true }), 1);
  assert.deepEqual(await c.rows(war.id), [], 'surrender adds none');

  war = await openWar(c); at = c.nowS();
  await seize(c, { warId: war.id, id: 'cap-off', square: c.squares.other, from: 'korund', to: 'kindle', at, city: 'off-ford' });
  const flagOff = [];
  c.r.db.prepare = sql => { flagOff.push(sql); return prepare(sql); };
  await c.command({ action: 'propose-end', nation: 'korund', role: 'Chairman', warId: war.id, kind: 'peace' });
  const offEnd = await c.command({ action: 'accept-end', nation: 'kindle', role: 'President', warId: war.id });
  c.r.db.prepare = prepare;
  assert.equal(offEnd.war.endKind, 'treaty');
  assert.deepEqual(await c.rows(war.id), [], 'flag off adds none');
  assert.equal(flagOff.some(sql => /city_treaty_returns/.test(sql)), false);
});

test('CitySummary shows the capture line, then returned to X by treaty', async () => {
  const { build } = await import('esbuild');
  const out = await build({
    stdin: { contents: "export { CitySummary } from './app/scene-panels-v2.tsx';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external',
    alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    loader: { '.css': 'empty' }, logLevel: 'silent',
    plugins: [{ name: 'css-modules', setup(b) { b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'm', namespace: 'cssm' })); b.onLoad({ filter: /.*/, namespace: 'cssm' }, () => ({ contents: 'export default new Proxy({}, { get: (_, k) => String(k) })' })); } }],
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"false"' },
  });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const at = Math.floor(Date.UTC(2026, 9, 10) / 1000), back = at + 2 * 86400;
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven', currency: 'Spark', government: 'Republic', economy: 'e', religion: 'r' };
  const destinations = [{ id: 'household', label: 'Household', detail: 'Home' }];
  const html = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    captureHistory: { heldBy: 'Korund', capturedFrom: 'Kindle', capturedAt: at, treatyReturn: { returnedTo: 'Kindle', returnedAt: back } },
  }));
  const captured = html.indexOf('captured from Kindle');
  const returned = html.toLowerCase().indexOf('returned to kindle by treaty');
  assert.ok(captured !== -1 && returned > captured, html);
  assert.ok(html.includes(day(back)));
  const plain = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    captureHistory: { heldBy: 'Korund', capturedFrom: 'Kindle', capturedAt: at },
  }));
  assert.equal(plain.toLowerCase().includes('returned to'), false);
});
