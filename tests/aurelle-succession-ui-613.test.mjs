/** #613 slice 2: the succession state and named heir on GET /api/citizen (Aurelle only, flag HARIMU_AURELLE_SUCCESSION_ENABLED, read-only), the acceded ruler as the leader panel's crown, and the leader-panel line. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
const require = createRequire(import.meta.url);
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');

const SECRET = 'succession-test-secret-0123456789';
async function scene(t, backend, on = true) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_AURELLE_SUCCESSION_ENABLED', on ? 'true' : undefined); r.setFixtureEnv('HARIMU_AURELLE_SUCCESSION_ADMIN_SECRET', SECRET);
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('ava','aurelle','ava',18,0,'Good standing',?,?)").bind(at, at).run();
  const send = action => r.call('aurelle-succession', null, { action, requestId: `req-ui-613-${action}-${Math.random().toString(36).slice(2, 8)}` }, undefined, '', { Authorization: `Bearer ${SECRET}` });
  const gov = async user => (await r.call('citizen', user)).data.government;
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kor','korund','kor',18,0,'Good standing',?,?)").bind(at, at).run();
  return { r, send, gov };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`flag off: the Aurelle government read has no succession field and no extra keys (${backend})`, async t => {
    const off = await scene(t, backend, false), g = await off.gov('ava');
    assert.equal('succession' in g, false); assert.equal(g.crown, undefined);
    const on = await scene(t, backend, true), h = await on.gov('ava');
    assert.deepEqual(Object.keys(h).filter(k => !(k in g)), ['succession'], 'the flag adds exactly one key');
    for (const k of Object.keys(g)) assert.deepEqual(h[k], g[k], k);
  });

  test(`flag on: status and named heir for Aurelle only; an accession shows the ruler as the crown; a later coup replaces it (${backend})`, async t => {
    const c = await scene(t, backend);
    assert.deepEqual((await c.gov('ava')).succession, { status: 'reigning', heir: { name: 'Princess Elowen Solenne', named: true } });
    assert.equal((await c.gov('ava')).crown, undefined);
    assert.equal('succession' in (await c.gov('alice')), false, 'a Kindle citizen sees nothing');
    assert.equal('succession' in (await c.gov('kor')), false, 'a Korund citizen sees nothing');
    for (const a of ['illness']) assert.equal((await c.send(a)).status, 200);
    assert.equal((await c.gov('ava')).succession.status, 'ailing');
    for (const a of ['vacate', 'accede']) assert.equal((await c.send(a)).status, 200);
    const g = await c.gov('ava');
    assert.deepEqual(g.succession, { status: 'acceded', heir: { name: 'Prince Aldric Solenne', named: false } });
    assert.deepEqual([g.crown.name, g.crown.house, g.crown.how], ['Princess Elowen Solenne', 'House Solenne', 'succession']);
    const at = g.crown.crownedAt;
    await c.r.db.prepare("INSERT INTO aurelle_coups (id,formed_at,ruler_id,ruler_name,house,window_opened_at,window_closes_at,resolved_at,outcome) VALUES ('coup-ui',?,'ashgrove','Lord Maren Ashgrove','House Ashgrove',?,?,?,'succeeded')").bind(at, at, at + 100, at + 200).run();
    const after = await c.gov('ava');
    assert.deepEqual([after.crown.name, after.crown.how], ['Lord Maren Ashgrove', 'coup']); assert.deepEqual(after.succession, { status: 'reigning', heir: { name: 'Lady Tess Ashgrove', named: false } });
  });

  test(`flag off: GET /api/citizen runs queries but none touch the succession table, for an Aurelle and a Korund citizen (${backend})`, async t => {
    const spy = async (c, user) => {
      const sqls = [], prepare = c.r.db.prepare.bind(c.r.db);
      c.r.db.prepare = sql => { sqls.push(sql); return prepare(sql); };
      try { return { sqls, government: (await c.r.call('citizen', user)).data.government }; } finally { c.r.db.prepare = prepare; }
    };
    const off = await scene(t, backend, false);
    for (const user of ['ava', 'kor']) {
      const { sqls, government } = await spy(off, user);
      assert.ok(sqls.length > 0, `${user}: the spy saw queries, so it is not vacuous`);
      assert.deepEqual(sqls.filter(q => /succession/i.test(q)), [], `${user}: no query mentions succession`);
      assert.equal('succession' in government, false, `${user}: no succession key`);
    }
    const on = await scene(t, backend, true);
    assert.ok((await spy(on, 'ava')).sqls.some(q => /aurelle_succession/i.test(q)), 'flag on: the same spy does see the succession read, so the flag-off result is meaningful');
  });

  test(`GET /api/citizen with the succession on writes nothing (${backend})`, async t => {
    const c = await scene(t, backend); await c.send('illness');
    const writes = [], prepare = c.r.db.prepare.bind(c.r.db), batch = c.r.db.batch.bind(c.r.db);
    c.r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); }; c.r.db.batch = x => { writes.push('batch'); return batch(x); };
    await c.r.call('citizen', 'ava'); c.r.db.prepare = prepare; c.r.db.batch = batch;
    assert.deepEqual(writes, []);
  });
}

// ---- leader panel (real React) ----
const rt = await localRuntime(); test.after(() => rt.close());
const { simulateGovernment } = await rt.importModule('lib/government.ts');
const disclosure = await rt.importModule('lib/government-disclosure.ts'), personas = await rt.importModule('lib/leader-personas.ts');
async function loadPanel() {
  const src = await readFile(new URL('../app/leader-panel.tsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'module', js)(exports, name => ({
    './nation-document': { NationDocument: ({ children }) => React.createElement('div', null, children) }, '../lib/leader-personas': personas, '../lib/government-disclosure': disclosure,
    './game-timer': { GameTimer: () => null }, './ai-disclosure': { AiBadge: () => null, AiTextTag: () => null },
  })[name] ?? require(name), { exports });
  return exports.LeaderPanel;
}
const LeaderPanel = await loadPanel();
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

test('leader panel: the succession line, the acceded ruler, and nothing when the server sends no succession', async () => {
  const snapshot = simulateGovernment({ nationId: 'aurelle', petitionCounts: {}, stability: 60, unrest: 10, foodStock: 100, treasuryMinor: 1000 });
  assert.ok(snapshot, 'an Aurelle snapshot');
  const none = text(renderToStaticMarkup(React.createElement(LeaderPanel, { snapshot })));
  assert.doesNotMatch(none, /Named heir|Heir by seniority|Succession|throne stands vacant/); assert.match(none, /Maera Solenne/);
  const line = s => text(renderToStaticMarkup(React.createElement(LeaderPanel, { snapshot: { ...snapshot, succession: s } })));
  assert.match(line({ status: 'reigning', heir: { name: 'Princess Elowen Solenne', named: true } }), /The Monarch reigns\. Named heir: Princess Elowen Solenne\./);
  assert.match(line({ status: 'ailing', heir: { name: 'Lord Tamsin Solenne', named: false } }), /The Monarch is ailing\. Heir by seniority: Lord Tamsin Solenne\./);
  assert.match(line({ status: 'vacant', heir: null }), /The throne stands vacant\. No heir remains: the Great Council elects a new house\./);
  assert.ok(line({ status: 'vacant', heir: null }).match(/The throne stands vacant\..*elects a new house\./)[0].length <= 80, 'the vacant line fits 80 characters');
  const crowned = text(renderToStaticMarkup(React.createElement(LeaderPanel, { snapshot: { ...snapshot, crown: { claimantId: 'succession:House Solenne', name: 'Princess Elowen Solenne', house: 'House Solenne', motto: '', color: '#c7af75', crownedAt: 5, how: 'succession' }, succession: { status: 'acceded', heir: null } } })));
  assert.match(crowned, /Princess Elowen Solenne/); assert.match(crowned, /House Solenne · acceded by succession/); assert.match(crowned, /hereditary succession/); assert.doesNotMatch(crowned, /Rising|palace coup/);
});

test('the succession fields are attached in the citizen route only behind the flag, and the lib stays read-only', async () => {
  const route = await readFile(new URL('../app/api/citizen/route.ts', import.meta.url), 'utf8');
  assert.match(route, /successionOn \? readSuccession\(database\) : null/); assert.match(route, /succession && profile\?\.nation_id === 'aurelle'/);
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_AURELLE_SUCCESSION_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
});
