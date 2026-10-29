/** #1028: captured-city history on the city panel. HARIMU_CITY_CAPTURE_HISTORY_ENABLED off leaves /api/city unchanged and does not read city_captures. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = file => readFileSync(file, 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const T1 = Math.floor(Date.UTC(2026, 9, 10) / 1000), T2 = Math.floor(Date.UTC(2026, 9, 12) / 1000);
const line = (heldBy, capturedFrom, at) => `Held by ${heldBy} since ${new Date(at * 1000).toISOString().slice(0, 10)}, captured from ${capturedFrom}.`;

test('flag pinned: folded into HARIMU_CITY_PACK, preview "true", production "false"', () => {
  const preview = strip(read('wrangler.jsonc')), prod = strip(read('wrangler.prod.jsonc'));
  assert.equal(preview.vars.HARIMU_CITY_PACK.HARIMU_CITY_CAPTURE_HISTORY_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_CITY_PACK.HARIMU_CITY_CAPTURE_HISTORY_ENABLED, 'false');
  assert.equal('HARIMU_CITY_CAPTURE_HISTORY_ENABLED' in preview.vars, false);
  assert.equal('HARIMU_CITY_CAPTURE_HISTORY_ENABLED' in prod.vars, false);
  assert.equal(FLAG_PACKS.HARIMU_CITY_PACK.length, 11);
  assert.ok(FLAG_PACKS.HARIMU_CITY_PACK.includes('HARIMU_CITY_CAPTURE_HISTORY_ENABLED'));
  assert.match(read('lib/siege.ts'), /idx_city_sieges_city_key ON city_sieges\(city_key\)/);
});

const captureReads = sqls => sqls.filter(sql => /^\s*SELECT\b/i.test(sql) && /city_captures/i.test(sql));

for (const backend of ['sqlite', 'postgres']) {
  test(`GET /api/city (${backend}): no row omits the field; latest capture wins; flag off does not read`, async t => {
    const r = await localRuntime(backend === 'postgres' ? { backend } : {}); t.after(() => r.close());
    const prepare = r.db.prepare.bind(r.db), sqls = [];
    r.db.prepare = sql => { sqls.push(sql); return prepare(sql); };
    const off = await r.call('city', 'alice');
    assert.equal(off.status, 200);
    assert.equal('captureHistory' in off.data, false);
    assert.deepEqual(captureReads(sqls), [], 'flag off does not read city_captures');

    r.setFixtureEnv('HARIMU_CITY_CAPTURE_HISTORY_ENABLED', 'true');
    sqls.length = 0;
    const empty = await r.call('city', 'alice');
    assert.equal('captureHistory' in empty.data, false);
    assert.equal(captureReads(sqls).length, 1, 'flag on is one capture read');
    assert.equal(empty.data.currentCityId, 'forgehaven');

    const run = (sql, ...bind) => r.db.prepare(sql).bind(...bind).run();
    const war = (id, attacker, defender) => run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,?,?,?)', id, `rq-${id}`, `pair-${id}`, attacker, defender, 'test', T1, T1 + 172800);
    const cap = async (id, siege, warId, key, attacker, defender, at, kind = 'founded') => {
      await run('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES (?,?,?,?,?,?,?,?,?)', siege, warId, key, kind, 3, 4, attacker, defender, at);
      await run('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)', id, siege, warId, `rq-${id}`, attacker, defender, 1, 0, at);
    };
    await war('w1', 'korund', 'kindle'); await war('w2', 'aurelle', 'korund'); await war('w3', 'kindle', 'aurelle');
    await cap('c1', 's1', 'w1', 'city:forgehaven', 'korund', 'kindle', T1);
    const one = await r.call('city', 'alice');
    assert.deepEqual(one.data.captureHistory, { heldBy: 'Korund', capturedFrom: 'Kindle', capturedAt: T1 });
    await cap('c2', 's2', 'w2', 'city:forgehaven', 'aurelle', 'korund', T2);
    await cap('c-other', 's3', 'w3', 'city:kolt-savanna', 'kindle', 'aurelle', T2 + 86400);
    const two = await r.call('city', 'alice');
    assert.deepEqual(two.data.captureHistory, { heldBy: 'Aurelle', capturedFrom: 'Korund', capturedAt: T2 }, 'latest capture for this city wins');
    await cap('c-out', 's4', 'w1', 'outpost:kindle', 'korund', 'kindle', T2 + 2 * 86400, 'outpost');
    const still = await r.call('city', 'alice');
    assert.equal(still.data.captureHistory.capturedAt, T2, 'an outpost capture is not the capital\'s history');
    const history = await r.importModule('lib/city-capture-history.ts');
    assert.equal(history.captureHistoryLine({ heldBy: 'Korund', capturedFrom: 'Kindle', capturedAt: T1 }), line('Korund', 'Kindle', T1));
    assert.deepEqual(history.captureCityKeys('kindle', 'forgehaven'), ['city:forgehaven', 'city:forgehaven']);
    assert.deepEqual(history.captureCityKeys('kindle', 'ashby-crossing'), ['city:ashby-crossing', 'outpost:kindle']); // [ASSUMPTION] outpost siege key is outpost:{nation}
    const outpost = await history.latestCityCapture(r.db, 'kindle', 'ashby-crossing');
    assert.deepEqual(outpost, { heldBy: 'Korund', capturedFrom: 'Kindle', capturedAt: T2 + 2 * 86400 });

    const moved = await r.call('city', 'alice', { action: 'travel', cityId: 'kolt-savanna' });
    assert.equal(moved.status, 200, JSON.stringify(moved.data));
    assert.deepEqual(moved.data.captureHistory, { heldBy: 'Kindle', capturedFrom: 'Aurelle', capturedAt: T2 + 86400 });

    if (backend === 'sqlite') {
      const plan = r.db.sqlite.prepare('EXPLAIN QUERY PLAN SELECT c.id FROM city_sieges s JOIN city_captures c ON c.siege_id = s.id WHERE s.city_key IN (?, ?) ORDER BY c.captured_at DESC, c.id DESC LIMIT 1').all('city:forgehaven', 'city:forgehaven');
      assert.match(JSON.stringify(plan), /idx_city_sieges_city_key/);
    }
    r.setFixtureEnv('HARIMU_CITY_CAPTURE_HISTORY_ENABLED', 'false');
    sqls.length = 0;
    const again = await r.call('city', 'alice');
    assert.equal('captureHistory' in again.data, false);
    assert.deepEqual(captureReads(sqls), []);
  });
}

test('CitySummary: flag-off shape unchanged; history line renders when provided', async () => {
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
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven', currency: 'Spark', government: 'Republic', economy: 'e', religion: 'r' };
  const destinations = [{ id: 'household', label: 'Household', detail: 'Home' }, { id: 'workplace', label: 'Workplace', detail: 'Work' }];
  const base = renderToStaticMarkup(React.createElement(mod.CitySummary, { cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {} }));
  assert.ok(base.includes('Forgehaven'));
  assert.equal(base.includes('Held by'), false);
  const shown = renderToStaticMarkup(React.createElement(mod.CitySummary, {
    cityName: 'Forgehaven', city: { capital: true }, nation, destinations, onView: () => {},
    captureHistory: { heldBy: 'Korund', capturedFrom: 'Kindle', capturedAt: T1 },
  }));
  assert.ok(shown.includes('History'));
  assert.ok(shown.includes(line('Korund', 'Kindle', T1)));
});
