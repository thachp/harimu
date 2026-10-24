/** #738 slice 3: conscription (docs §11.3, §15.4): the Korund lottery and Aurelle levies, one draft per nation per game week, the 14-day
 *  newcomer shield, dormant citizens skipped, a conscript cannot leave before the term ends. Behind HARIMU_ARMIES_ENABLED. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { volunteerNations } from '../lib/army-rules.ts';
const NEWCOMER_SHIELD_DAYS = Number(/export const NEWCOMER_SHIELD_DAYS=(\d+)/.exec(readFileSync('lib/war-protections-copy.ts', 'utf8'))[1]); // the docs' 14 days

const { pickConscripts, DRAFT_WEEK_SECONDS, SERVICE_TERM_SECONDS, NEWCOMER_SHIELD_SECONDS } = await (async () => { const r = await localRuntime(); try { return await r.importModule('lib/army-conscription.ts'); } finally { await r.close(); } })();
const E = (n, city = null, p = 'c') => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, city: typeof city === 'function' ? city(i) : city }));
test('rules: lottery size, one levy per home city, deterministic, Kindle never conscripts, shield = docs 14 days', () => {
  assert.deepEqual([0, 1, 9, 10, 19, 20, 25].map(n => pickConscripts('korund', 5, E(n)).length), [0, 1, 1, 1, 1, 2, 2]);
  assert.deepEqual(pickConscripts('korund', 5, E(30)), pickConscripts('korund', 5, [...E(30)].reverse()), 'order-independent');
  assert.notDeepEqual(Array.from({ length: 8 }, (_, w) => pickConscripts('korund', w, E(10))[0]).filter((x, i, a) => a.indexOf(x) === i).length, 1, 'the draw changes week to week');
  const lev = pickConscripts('aurelle', 5, E(7, i => ['a', 'a', 'a', 'b', 'b', null, null][i]));
  assert.equal(lev.length, 3, 'one per city, homeless citizens share one bucket'); assert.equal(new Set(lev).size, 3);
  assert.deepEqual(pickConscripts('kindle', 5, E(10)), []); assert.deepEqual([...volunteerNations], ['kindle'], 'volunteering stays Kindle-only');
  assert.equal(NEWCOMER_SHIELD_SECONDS, NEWCOMER_SHIELD_DAYS * 86400); assert.equal(SERVICE_TERM_SECONDS, 2 * DRAFT_WEEK_SECONDS);
  assert.deepEqual(pickConscripts('aurelle', 9, E(6, i => `c${i % 3}`)), pickConscripts('aurelle', 9, E(6, i => `c${i % 3}`)), 'a retry of the same nation and week picks the same people');
  const copy = readFileSync('lib/army-copy.ts', 'utf8'); assert.match(copy, /PLACEHOLDER copy, marked for Content[^\n]*\n calledUp:L\(/, 'call-up line is placeholder copy marked for Content');
  const card = readFileSync('app/army-card.tsx', 'utf8'); assert.match(card, /army\.serveUntil \? <><p>\{fill\(unitMembership\.calledUp\.text[^\n]*\{unitMembership\.stayButton\}/); assert.match(card, /fetch\('\/api\/army\/draft'[^\n]*"action":"open"[^\n]*\.then\(\(\) => fetch\('\/api\/army'\)\)/, 'the card posts open before reading');
  assert.match(readFileSync('app/page.tsx', 'utf8'), /<GovernmentPanel [^\n]*\/>\s*<ArmyCard key=\{`army:\$\{citizenSessionKey\}`\}\/>/, 'pin: ArmyCard after GovernmentPanel');
});

const D = 86400;
async function world(t, backend, on = true) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.call('citizen', 'alice');
  r.setFixtureEnv('HARIMU_ARMIES_ENABLED', on ? 'true' : 'false'); r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  const now = Math.floor(r.now / 1000), iso = s => new Date(s * 1000).toISOString();
  const add = async (id, nation, { age = 20, idle = 0, city = null } = {}) => {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at,last_active_at) VALUES (?,?,?,18,0,'Good standing',?,?,?)").bind(id, nation, id, iso(now - age * D), iso(now), iso(now - idle * D)).run();
    if (city) await r.db.prepare('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?)').bind(id, nation, city, city, now).run();
  };
  const n = async (sql) => Number((await r.db.prepare(sql).first()).n);
  const conscripts = () => r.db.prepare('SELECT clerk_user_id AS id FROM army_conscripts ORDER BY clerk_user_id').all().then(x => x.results.map(y => y.id));
  const open = u => r.call('army/draft', u, { action: 'open' });
  return { r, now, add, n, conscripts, open };
}
let k = 0; const rid = () => `req-c738-${String(++k).padStart(4, '0')}`;

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag off: /api/army is 404 before auth with zero prepares, and no draft runs`, async t => {
    const w = await world(t, backend, false);
    for (let i = 0; i < 10; i++) await w.add(`k${i}`, 'korund');
    const prepare = w.r.db.prepare.bind(w.r.db), seen = []; w.r.db.prepare = q => { seen.push(q); return prepare(q); };
    const res = [await w.r.call('army', 'k0'), await w.open('k0'), await w.r.call('army/draft', null, { action: 'open' }), await w.r.call('army', null), await w.r.call('army', 'k0', { action: 'leave', requestId: rid() })];
    w.r.db.prepare = prepare;
    assert.deepEqual(res.map(x => x.status), [404, 404, 404, 404, 404]); assert.deepEqual(seen, []);
    assert.deepEqual([await w.n('SELECT COUNT(*) AS n FROM army_drafts'), await w.n('SELECT COUNT(*) AS n FROM army_members')], [0, 0]);
  });

  test(`${backend}: Korund lottery: eligible only (newcomer shield, dormant, members skipped), once per week, replay, conscript cannot leave`, async t => {
    const w = await world(t, backend);
    for (let i = 0; i < 10; i++) await w.add(`k${i}`, 'korund');
    await w.add('knew', 'korund', { age: 13 }); await w.add('kold', 'korund', { idle: 31 }); await w.add('kok', 'korund', { age: 14 });
    const first = await w.open('k0'); assert.equal(first.status, 200);
    const drafted = await w.conscripts(); assert.equal(drafted.length, 1, '11 eligible draws 1');
    assert.ok(!['knew', 'kold'].includes(drafted[0]), 'shielded and dormant citizens are never drawn');
    assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE unit_id = 'korund-home-guard'`), 1);
    const prepare = w.r.db.prepare.bind(w.r.db), seen = []; w.r.db.prepare = q => { seen.push(q); return prepare(q); };
    try { for (let i = 0; i < 3; i++) await w.open(`k${i}`); } finally { w.r.db.prepare = prepare; }
    assert.deepEqual(seen.filter(q => /AS id FROM citizens|INSERT INTO army_/.test(q)), [], 'a drafted week is not re-read or re-written');
    assert.deepEqual(await w.conscripts(), drafted, 'replay in the same week writes nothing'); assert.equal(await w.n('SELECT COUNT(*) AS n FROM army_drafts'), 1);
    const me = drafted[0], view = await w.r.call('army', me);
    assert.deepEqual([view.data.army.member, view.data.army.unit.id, view.data.army.serveUntil], [true, 'korund-home-guard', w.now + SERVICE_TERM_SECONDS]);
    const leave = await w.r.call('army', me, { action: 'leave', requestId: rid() }); assert.deepEqual([leave.status, leave.data.reason], [409, 'conscripted']);
    assert.equal((await w.r.call('army', me, { action: 'stance', stance: 'advance', requestId: rid() })).status, 200, 'a conscript still picks a stance');
    const vol = await w.r.call('army', 'k1', { action: 'join', unitId: 'korund-home-guard', requestId: rid() }); assert.deepEqual([vol.status, vol.data.reason], [403, 'not_open_yet']);
    w.r.setNow(w.r.now + SERVICE_TERM_SECONDS * 1000);
    assert.equal((await w.r.call('army', me, { action: 'leave', requestId: rid() })).status, 200, 'the term ended: leave is allowed');
    await w.open('k0'); assert.equal(await w.n('SELECT COUNT(*) AS n FROM army_drafts'), 2, 'a new game week drafts again');
    assert.equal(await w.n('SELECT COUNT(*) AS n FROM army_drafts WHERE nation_id <> \'korund\''), 0, 'only the viewer\'s nation');
    assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE clerk_user_id = 'alice'`), 0); await w.open('alice'); assert.equal((await w.r.call('army', 'alice')).data.army.serveUntil, undefined, 'Kindle: no draft');
  });

  test(`${backend}: a citizen already in the unit is never conscripted`, async t => {
    const w = await world(t, backend); await w.add('km', 'korund');
    await w.r.db.prepare("INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) VALUES ('km','korund-home-guard','hold',?, 'fixture-km-0001')").bind(w.now - D).run();
    await w.open('km'); assert.deepEqual(await w.conscripts(), []); assert.equal(await w.n('SELECT drafted AS n FROM army_drafts'), 0);
  });

  test(`${backend}: ARC on #839: GET /api/army makes zero write statements and drafts nothing; the open POST validates input`, async t => {
    const w = await world(t, backend); for (let i = 0; i < 10; i++) await w.add(`k${i}`, 'korund');
    const prepare = w.r.db.prepare.bind(w.r.db), seen = []; w.r.db.prepare = q => { seen.push(q); return prepare(q); };
    let got; try { got = await Promise.all([w.r.call('army', 'k0'), w.r.call('army', 'k1')]); } finally { w.r.db.prepare = prepare; }
    assert.deepEqual(got.map(x => x.status), [200, 200]); assert.deepEqual(seen.filter(q => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(q)), [], 'GET never writes');
    assert.equal(await w.n('SELECT COUNT(*) AS n FROM army_drafts'), 0);
    assert.equal((await w.r.call('army/draft', 'k0', { action: 'draft-everyone' })).status, 400);
    assert.equal((await w.r.call('army/draft', 'k0', { action: 'open' }, 'https://evil.invalid')).status, 403);
    assert.equal((await w.r.call('army/draft', 'k0', { action: 'stay' })).status, 409, 'stay without a term');
  });

  test(`${backend}: ARC on #839: at term end a conscript is released and drafted again in a later week; one who stays is not released`, async t => {
    const w = await world(t, backend); await w.add('k0', 'korund');
    await w.open('k0'); assert.deepEqual(await w.conscripts(), ['k0']);
    w.r.setNow(w.r.now + (SERVICE_TERM_SECONDS - 60) * 1000); await w.open('k0');
    assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE clerk_user_id = 'k0'`), 1, 'still serving before the term ends');
    w.r.setNow(w.r.now + 60 * 1000);
    await w.open('k0'); assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE clerk_user_id = 'k0'`), 0, 'released at term end');
    w.r.setNow(w.r.now + DRAFT_WEEK_SECONDS * 1000);
    const again = await w.open('k0'); assert.equal(again.data.drafted, 1, 'drafted again in a later week');
    assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_conscripts WHERE clerk_user_id = 'k0'`), 2);
    assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE clerk_user_id = 'k0'`), 1);
    w.r.setNow(w.r.now + 60 * 1000); await w.open('k0');
    assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE clerk_user_id = 'k0'`), 1, 'the old expired term does not release the new one');
    await Promise.all([w.open('k0'), w.open('k0')]); assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_conscripts WHERE clerk_user_id = 'k0'`), 2, 'repeat opens are idempotent');
    const late = await world(t, backend); await late.add('k5', 'korund'); await late.open('k5');
    late.r.setNow(late.r.now + SERVICE_TERM_SECONDS * 1000);
    assert.deepEqual(await late.r.call('army/draft', 'k5', { action: 'stay' }).then(r => [r.status, r.data.reason]), [409, 'not_conscripted'], 'stay only during the term: refused with a reason');
    assert.equal((await late.open('k5')).data.drafted, 1, 'a late stay does not stop the release: released, so drafted again');
    const s = await world(t, backend); await s.add('k9', 'korund'); await s.open('k9');
    await s.add('v1', 'kindle'); assert.deepEqual(await s.r.call('army/draft', 'v1', { action: 'stay' }).then(r => [r.status, r.data.reason]), [409, 'not_conscripted'], 'a non-conscript stay is refused');
    assert.deepEqual((await s.r.call('army/draft', 'k9', { action: 'stay' })).data, { stayed: true });
    assert.equal((await s.r.call('army/draft', 'k9', { action: 'stay' })).status, 200, 'stay is idempotent');
    s.r.setNow(s.r.now + SERVICE_TERM_SECONDS * 1000); await s.open('k9');
    assert.equal(await s.n(`SELECT COUNT(*) AS n FROM army_members WHERE clerk_user_id = 'k9'`), 1, 'stayed: not released');
    assert.equal(await s.n(`SELECT COUNT(*) AS n FROM army_conscripts WHERE clerk_user_id = 'k9'`), 1, 'a member is not drafted again');
    assert.equal((await s.r.call('army', 'k9', { action: 'leave', requestId: rid() })).status, 200, 'after the term a stayer may leave');
  });

  test(`${backend}: Aurelle levy: one citizen per home city; concurrent reads draft once`, async t => {
    const w = await world(t, backend);
    for (const [id, city] of [['a1', 'city-a'], ['a2', 'city-a'], ['a3', 'city-a'], ['b1', 'city-b'], ['b2', 'city-b']]) await w.add(id, 'aurelle', { city });
    await Promise.all([w.open('a1'), w.open('b1'), w.open('a2')]);
    const got = await w.conscripts(); assert.equal(got.length, 2); assert.equal(got.filter(x => x.startsWith('a')).length, 1); assert.equal(await w.n('SELECT COUNT(*) AS n FROM army_drafts'), 1);
  });

  test(`${backend}: forced race: a stale loser's draft is fenced by the winner's token and writes no members`, async t => {
    const w = await world(t, backend);
    for (const [id, city] of [['a1', 'city-a'], ['b1', 'city-b'], ['c1', 'city-c']]) await w.add(id, 'aurelle', { city });
    const { runDraft } = await w.r.importModule('lib/army-conscription.ts');
    const prepare = w.r.db.prepare.bind(w.r.db), batch = w.r.db.batch.bind(w.r.db); let arrived = 0, open, staleDone; const gate = new Promise(r => { open = r; }), stale = new Promise(r => { staleDone = r; }); let reads = 0;
    w.r.db.prepare = q => { const st = prepare(q);
      if (/^SELECT 1 AS x FROM army_drafts/.test(q)) return { bind: (...a) => { const b = st.bind(...a); return { first: async () => { const out = await b.first(); if (++arrived === 2) open(); await gate; return out; } }; } };
      if (/^SELECT c\.clerk_user_id AS id/.test(q)) return { bind: (...a) => { const b = st.bind(...a); return { all: async () => { const out = await b.all(); return ++reads === 1 ? { ...out, results: out.results.filter(x => x.id !== 'c1') } : out; } }; } };
      return st; };
    w.r.db.batch = async stmts => { if (stmts.length === 7) await stale; const out = await batch(stmts); if (stmts.length === 5) staleDone(); return out; };
    let res; try { res = await Promise.all([runDraft(w.r.db, 'aurelle', w.now), runDraft(w.r.db, 'aurelle', w.now)]); } finally { w.r.db.prepare = prepare; w.r.db.batch = batch; }
    assert.deepEqual(res.slice().sort(), [2, null], 'one winner (the stale roster), one fenced loser');
    assert.deepEqual(await w.conscripts(), ['a1', 'b1']); assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE unit_id = 'aurelle-home-guard'`), 2);
    assert.equal(await w.n('SELECT drafted AS n FROM army_drafts'), 2, 'members drafted equal the recorded count');
  });
}

test('stay-error (#738, #889 render test): a refused stay shows stayRefused only for 409 not_conscripted; other failures and network errors show the generic note', async () => {
  const { Window } = await import('happy-dom'), ts = (await import('typescript')).default, { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url), w = new Window({ url: 'http://localhost/' }); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const js = ts.transpileModule(readFileSync('app/army-card.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} }; new Function('exports', 'require', 'module', js)(mod.exports, n => n.startsWith('@/lib/') ? require(`../lib/${n.slice(6)}.ts`) : require(n), mod);
  const { unitMembership, armyFailureNote } = require('../lib/army-copy.ts');
  const army = { unit: { id: 'korund-home-guard', name: 'Korund Home Brigade', officer: 'Colonel Veshko', memberCount: 1, openToVolunteers: false }, member: true, stance: 'hold', serveUntil: 9e9 };
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  for (const [stay, expected] of [
    [() => json(409, { reason: 'not_conscripted' }), unitMembership.stayRefused.text.replace('{unit}', army.unit.name)],
    [() => json(409, { reason: 'other' }), armyFailureNote('stance', army.unit.name, '409')],
    [() => json(500, {}), armyFailureNote('stance', army.unit.name, '500')],
    [() => json(401, { reason: 'not_conscripted' }), armyFailureNote('stance', army.unit.name, '401')],
    [() => { throw new Error('offline'); }, armyFailureNote('stance', army.unit.name, 'network')],
    [() => json(200, { stayed: true }), unitMembership.stayed.text.replace('{unit}', army.unit.name)],
  ]) {
    globalThis.fetch = async (url, init) => url === '/api/army' && !init ? json(200, { army }) : url === '/api/army/draft' && init?.body === '{"action":"stay"}' ? stay() : json(200, {});
    const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
    await act(async () => root.render(React.createElement(mod.exports.ArmyCard)));
    const button = [...el.querySelectorAll('button')].find(b => b.textContent === unitMembership.stayButton);
    await act(async () => { button.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await new Promise(r => setTimeout(r, 0)); });
    assert.ok(el.textContent.includes(expected), expected);
    await act(async () => root.unmount()); el.remove();
  }
  assert.match(readFileSync('lib/army-copy.ts', 'utf8'), /PLACEHOLDER copy, marked for Content[^\n]*refused stay[^\n]*\n stayRefused:L\(/);
});
