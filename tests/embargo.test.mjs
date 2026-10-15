/** #363: embargo PoC (bilateral trade cut) behind HARIMU_EMBARGO_ENABLED. §13.1 trade-rule ratification by the imposing nation, a trade guard, flag off is a no-op. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { embargoPairKey, embargoRatification, embargoStatus } from '../lib/embargo-rules.ts';

const D = 86400;
const seats = (s, o, d) => ({ 'steady-hand': s, 'open-ledger': o, 'dockside-builders': d });

test('pure rules: Kindle needs a simple majority (more than half), Korund and Aurelle ratify on one AI actor, only the imposer votes', () => {
  // aurelle stance: steady-hand and dockside yes, open-ledger no.
  assert.equal(embargoRatification('kindle', 'aurelle', seats(5, 8, 5)).passed, true, '10 of 18 is more than half');
  assert.equal(embargoRatification('kindle', 'aurelle', seats(5, 9, 4)).passed, false, '9 of 18 is half, not more than half');
  assert.deepEqual(embargoRatification('kindle', 'aurelle', seats(7, 6, 5)), { nation: 'kindle', body: 'Assembly', passed: true, rule: 'simple-majority', yes: 12, total: 18 });
  // korund stance: only dockside yes.
  assert.equal(embargoRatification('kindle', 'korund', seats(7, 6, 5)).passed, false, '5 of 18');
  assert.equal(embargoRatification('kindle', 'korund', seats(1, 1, 3)).passed, true, '3 of 5');
  assert.equal(embargoRatification('kindle', 'korund', seats(0, 0, 0)).passed, false, 'an empty Assembly ratifies nothing');
  assert.deepEqual(embargoRatification('korund', 'kindle', seats(0, 0, 0)), { nation: 'korund', body: 'Chairman', passed: true, rule: 'sole' });
  assert.deepEqual(embargoRatification('aurelle', 'kindle', seats(0, 0, 0)), { nation: 'aurelle', body: 'Crown', passed: true, rule: 'sole' });
  assert.equal(embargoPairKey('korund', 'kindle'), embargoPairKey('kindle', 'korund'));
  assert.equal(embargoStatus('in_force'), 'in-force'); assert.equal(embargoStatus('rejected'), 'rejected');
});

test('the flag defaults to "false", migration 0039 only adds a table, and no route can propose, decide or lift an embargo', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_EMBARGO_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  for (const file of ['../drizzle/0039_embargoes.sql', '../db/postgres/0039_embargoes.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file); assert.match(sql, /CREATE TABLE IF NOT EXISTS embargoes/);
  }
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname)) assert.doesNotMatch(await readFile(file, 'utf8'), /proposeEmbargo|liftEmbargo|decideProposedEmbargoes|runEmbargo/, file.pathname);
});

async function setup(t, { flag = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  if (flag) r.setFixtureEnv('HARIMU_EMBARGO_ENABLED', 'true');
  const e = await r.importModule('lib/embargo.ts');
  const propose = (over = {}, now = nowS(), options = {}) => e.proposeEmbargo(r.db, { actor: 'kindle', target: 'aurelle', proposedBy: 'AI President', requestId: randomUUID(), ...over }, now, { enabled: flag, ...options });
  const rows = async () => (await r.db.prepare('SELECT * FROM embargoes ORDER BY proposed_at,id').all()).results.map(x => ({ ...x }));
  const decide = (now = nowS()) => e.runEmbargo(r.db, now);
  // A fixture cross-nation trade path: there is no real one yet (the order book is one Kindle city). It calls the guard like a real path would.
  const trade = async (from, to, kind = 'post') => { const gate = await e.checkTrade(r.db, from, to, kind, flag); return gate.ok ? { ok: true } : gate; };
  return { r, e, propose, rows, decide, nowS, trade };
}

test('flag off: nothing is proposed, decided, read, shown or blocked', async t => {
  const { r, e, propose, rows, trade } = await setup(t, { flag: false });
  const res = await propose(); assert.equal(res.ok, false); assert.equal(res.reason, 'disabled'); assert.deepEqual(await rows(), []);
  assert.equal((await e.liftEmbargo(r.db, 'x', 'kindle', Math.floor(r.now / 1000), false)).reason, 'disabled');
  const world = await r.call('world', null);
  assert.equal(world.status, 200); assert.equal('embargoes' in world.data.simulation, false, 'no embargo state is sent while the flag is off');
  await r.db.prepare("INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at) VALUES ('e-x','req-xxxxxxxx','aurelle:kindle','kindle','aurelle','AI',1)").run();
  await r.call('world', null);
  assert.equal((await rows())[0].status, 'proposed', 'with the flag off the tick decides nothing');
  await r.db.prepare("UPDATE embargoes SET status='in_force',decided_at=1,imposed_at=1 WHERE id='e-x'").run();
  assert.deepEqual(await trade('kindle', 'aurelle'), { ok: true }, 'flag off: an old row blocks nothing');
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kim','kindle','Kim',18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z')").run();
  assert.ok(!(await r.call('news', 'kim')).data.items.some(i => i.id.startsWith('embargo:')));
});

test('ratification per nation: Kindle needs a simple majority of the Assembly, Korund and Aurelle ratify on one AI actor', async t => {
  const { r, propose, rows, decide, nowS } = await setup(t);
  const no = await propose({ actor: 'kindle', target: 'korund' }); assert.equal(no.ok, true); assert.equal(no.embargo.status, 'proposed');
  const yes = await propose({ actor: 'kindle', target: 'aurelle' }); await decide();
  let all = await rows();
  const refused = all.find(x => x.id === no.embargo.id); assert.equal(refused.status, 'rejected'); assert.deepEqual(JSON.parse(refused.ratification_json), [{ nation: 'kindle', body: 'Assembly', passed: false, rule: 'simple-majority', yes: 5, total: 18 }]);
  const passed = all.find(x => x.id === yes.embargo.id); assert.equal(passed.status, 'in_force'); assert.equal(Number(passed.imposed_at), nowS()); assert.deepEqual(JSON.parse(passed.ratification_json), [{ nation: 'kindle', body: 'Assembly', passed: true, rule: 'simple-majority', yes: 12, total: 18 }]);
  const korund = await propose({ actor: 'korund', target: 'kindle' }); const crown = await propose({ actor: 'aurelle', target: 'korund' }); await decide();
  all = await rows();
  assert.deepEqual(JSON.parse(all.find(x => x.id === korund.embargo.id).ratification_json).map(x => [x.body, x.rule, x.passed]), [['Chairman', 'sole', true]]);
  assert.deepEqual(JSON.parse(all.find(x => x.id === crown.embargo.id).ratification_json).map(x => [x.body, x.rule, x.passed]), [['Crown', 'sole', true]]);
  assert.ok(all.filter(x => x.status === 'in_force').length === 3);
  // A counted Assembly result replaces the incumbent tables: dockside-builders hold almost nothing, so the Aurelle embargo would fail now.
  await r.db.prepare("INSERT INTO assembly_elections (id,nation_id,policy,opens_at,closes_at,closed_at,result_json) VALUES ('a1','kindle','preview-citizen-v1',?,?,?,?)").bind(nowS() - 4 * D, nowS() - D, nowS() - D, JSON.stringify({ totals: { after: seats(2, 15, 1) } })).run();
  await r.db.prepare("UPDATE embargoes SET status='lifted',lifted_at=? WHERE id=?").bind(nowS(), passed.id).run();
  const again = await propose({ actor: 'kindle', target: 'aurelle' }); await decide();
  assert.equal((await rows()).find(x => x.id === again.embargo.id).status, 'rejected', '3 of 18 yes');
});

test('activeEmbargo and the trade guard block a fixture trade path both ways while in force, and clear after lift', async t => {
  const { r, e, propose, trade, decide, nowS } = await setup(t);
  assert.deepEqual(await trade('kindle', 'aurelle'), { ok: true }); assert.equal(await e.activeEmbargo(r.db, 'kindle', 'aurelle'), false);
  const made = await propose({ actor: 'kindle', target: 'aurelle' });
  assert.deepEqual(await trade('kindle', 'aurelle'), { ok: true }, 'a proposal alone blocks nothing');
  await decide();
  assert.equal(await e.activeEmbargo(r.db, 'kindle', 'aurelle'), true); assert.equal(await e.activeEmbargo(r.db, 'aurelle', 'kindle'), true, 'either direction');
  const post = await trade('kindle', 'aurelle', 'post'); assert.equal(post.ok, false); assert.equal(post.status, 403); assert.equal(post.reason, 'embargo'); assert.equal(post.error, 'You cannot post this order. Trade with Aurelle is closed.');
  const fill = await trade('aurelle', 'kindle', 'fill'); assert.equal(fill.ok, false); assert.equal(fill.error, 'You cannot fill this order. Trade with Kindle is closed.', 'the target is blocked too');
  assert.deepEqual(await trade('kindle', 'korund'), { ok: true }, 'another pair is open'); assert.deepEqual(await trade('korund', 'aurelle'), { ok: true });
  assert.deepEqual(await trade('kindle', 'kindle'), { ok: true }, 'same nation');
  // Only the imposing nation lifts it.
  assert.equal((await e.liftEmbargo(r.db, made.embargo.id, 'aurelle', nowS() + 10, true)).reason, 'not_actor');
  assert.equal(await e.activeEmbargo(r.db, 'kindle', 'aurelle'), true);
  const lifted = await e.liftEmbargo(r.db, made.embargo.id, 'kindle', nowS() + 10, true); assert.equal(lifted.ok, true); assert.equal(lifted.embargo.status, 'lifted'); assert.equal(lifted.embargo.liftedAt, nowS() + 10);
  assert.equal(await e.activeEmbargo(r.db, 'kindle', 'aurelle'), false); assert.deepEqual(await trade('aurelle', 'kindle', 'fill'), { ok: true }, 'clears after lift');
  assert.equal((await e.liftEmbargo(r.db, made.embargo.id, 'kindle', nowS() + 20, true)).reason, 'not_in_force');
  assert.equal((await e.liftEmbargo(r.db, 'nope', 'kindle', nowS(), true)).reason, 'not_found');
  // A lifted embargo can be proposed again.
  assert.equal((await propose({ actor: 'kindle', target: 'aurelle' })).ok, true);
});

test('proposal checks: idempotent request id, bad input, one live embargo per direction, an embargo each way, reads never write', async t => {
  const { r, e, propose, rows, decide, nowS } = await setup(t);
  const requestId = randomUUID();
  const first = await propose({ requestId, proposedBy: '<b>AI   President</b>' }); assert.equal(first.ok, true); assert.doesNotMatch(first.embargo.proposedBy, /[<>]/);
  assert.equal((await propose({ requestId })).replay, true); assert.equal((await propose({ requestId, target: 'korund' })).reason, 'request_reused');
  assert.equal((await propose({ target: 'kindle' })).reason, 'bad_nations'); assert.equal((await propose({ target: 'varkand' })).reason, 'bad_nations');
  assert.equal((await propose({ requestId: 'short' })).reason, 'bad_request'); assert.equal((await propose({ proposedBy: ' ' })).reason, 'bad_request');
  assert.equal((await propose({ actor: 'kindle', target: 'aurelle' })).reason, 'embargo_exists', 'one live embargo per direction');
  assert.equal((await propose({ actor: 'aurelle', target: 'kindle' })).ok, true, 'the other direction is its own embargo');
  await decide(); const before = JSON.stringify(await rows()); await decide(nowS() + 5); assert.equal(JSON.stringify(await rows()), before, 'a repeated tick decides nothing twice');
  const writes = []; const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 50)); return prepare(sql); };
  r.db.batch = s => { writes.push('batch'); return batch(s); };
  try { assert.equal((await e.readEmbargoes(r.db)).embargoes.length, 2); await e.activeEmbargo(r.db, 'kindle', 'aurelle'); await e.checkTrade(r.db, 'kindle', 'aurelle', 'post', true); e.embargoNewsItems((await e.readEmbargoes(r.db)).embargoes, 'kindle'); }
  finally { r.db.prepare = prepare; r.db.batch = batch; }
  assert.deepEqual(writes, [], 'reads never write');
});

test('the world tick decides proposals; news and world state show embargoes in each nation\'s voice only while the flag is on', async t => {
  const { r, e, propose } = await setup(t);
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kim','kindle','Kim',18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z'),('kai','korund','Kai',18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z'),('ava','aurelle','Ava',18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z')").run();
  const made = await propose({ actor: 'kindle', target: 'aurelle' }); assert.equal(made.embargo.status, 'proposed');
  const world = await r.call('world', null);
  const embargo = world.data.simulation.embargoes.embargoes.find(x => x.id === made.embargo.id); assert.equal(embargo.status, 'in-force', 'the tick on the world visit decided it'); assert.equal(embargo.liftedAt, null);
  const lines = async user => (await r.call('news', user)).data.items.filter(i => i.id.startsWith('embargo:'));
  const kindle = await lines('kim'); assert.equal(kindle.length, 1); assert.equal(kindle[0].title, 'A trade embargo is imposed'); assert.equal(kindle[0].text, 'Embargo: Kindle ends all trade with Aurelle.'); assert.equal(kindle[0].kind, 'template');
  const aurelle = await lines('ava'); assert.equal(aurelle[0].title, 'The Court notes an embargo'); assert.equal(aurelle[0].text, 'Court Gazette: Kindle embargoes Aurelle.');
  assert.deepEqual(await lines('kai'), [], 'a third nation has no line on its own edition');
  const crown = await propose({ actor: 'aurelle', target: 'korund' }); await r.call('world', null);
  assert.equal(crown.ok, true); const crownLine = (await lines('ava')).find(i => i.id.includes(crown.embargo.id)); assert.equal(crownLine.kind, 'decree'); assert.equal(crownLine.text, 'Be it known: the Crown embargoes Korund.');
  await e.liftEmbargo(r.db, made.embargo.id, 'kindle', Math.floor(r.now / 1000) + 5, true);
  assert.equal((await lines('kim')).filter(i => i.id.endsWith(':lifted')).length, 1); assert.equal((await lines('kim')).find(i => i.id.endsWith(':lifted')).title, 'A trade embargo is lifted');
});

test('foreign affairs panel: embargoes show for both parties; nothing renders when the server sends neither', async t => {
  const rt = await localRuntime(); t.after(() => rt.close());
  const { renderToStaticMarkup } = await import('react-dom/server');
  const require = createRequire(import.meta.url);
  const load = async (file, stubs) => { const exports = {}; const src = await readFile(new URL(file, import.meta.url), 'utf8');
    new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports, name => name in stubs ? stubs[name] : require(name)); return exports; };
  const rules = await rt.importModule('lib/diplomacy-rules.ts'), copy = await rt.importModule('lib/diplomacy-copy.ts'), embargoCopy = await rt.importModule('lib/embargo-copy.ts');
  const { ForeignAffairsPanel } = await load('../app/foreign-affairs-panel.tsx', { '@/lib/diplomacy-copy': copy, '@/lib/diplomacy-rules': rules, '@/lib/embargo-copy': embargoCopy, './display-preferences': { useDisplayTimestamp: () => value => `T${value}` } });
  const base = { id: 'e1', actor: 'kindle', target: 'aurelle', proposedBy: 'AI President', proposedAt: 1, status: 'in-force', imposedAt: 2, liftedAt: null, ratifications: [] };
  const html = (embargoes, nation, treaties = undefined) => renderToStaticMarkup(ForeignAffairsPanel({ treaties, embargoes, nationId: nation }));
  assert.match(html([base], 'kindle'), /The embargo on Aurelle is in force\./); assert.match(html([base], 'aurelle'), /State Media|Court Gazette: Kindle embargoes Aurelle\./);
  assert.doesNotMatch(html([base], 'kindle'), /No treaties in force/); assert.match(html([base], 'korund'), /No treaties in force/, 'a third nation sees the empty state');
  assert.doesNotMatch(html([{ ...base, status: 'lifted', liftedAt: 5 }], 'kindle'), /embargo on Aurelle/i, 'a lifted embargo is not listed');
  assert.equal(html(undefined, 'kindle'), '', 'flag off: nothing sent, nothing rendered');
});

test('#308 trade agreement: refused while an embargo is in force between the pair (either direction); a pact, other pairs and a lifted embargo are not affected', async t => {
  const { r, e, propose, decide, nowS } = await setup(t);
  const d = await r.importModule('lib/diplomacy.ts');
  const trade = (over = {}, options = { enabled: true, embargo: true }) => d.proposeTreaty(r.db, { proposer: 'kindle', other: 'aurelle', kind: 'trade', proposedBy: 'AI President', requestId: randomUUID(), ...over }, nowS(), options);
  const made = await propose({ actor: 'kindle', target: 'aurelle' });
  assert.equal((await trade()).ok, true, 'a proposal alone does not block');
  await r.db.prepare('DELETE FROM treaties').run(); await decide();
  const refused = await trade(); assert.equal(refused.ok, false); assert.equal(refused.status, 409); assert.equal(refused.reason, 'embargo');
  assert.equal((await trade({ proposer: 'aurelle', other: 'kindle' })).reason, 'embargo', 'the other direction too');
  assert.equal((await trade({}, { enabled: true })).ok, true, 'flag off for embargoes (not passed): not checked');
  await r.db.prepare('DELETE FROM treaties').run();
  assert.equal((await trade({ other: 'korund' })).ok, true, 'another pair is open');
  assert.equal((await d.proposeTreaty(r.db, { proposer: 'kindle', other: 'aurelle', kind: 'non-aggression', proposedBy: 'AI President', requestId: randomUUID() }, nowS(), { enabled: true, embargo: true })).ok, true, 'a non-aggression pact is not a trade agreement');
  await r.db.prepare('DELETE FROM treaties').run();
  await e.liftEmbargo(r.db, made.embargo.id, 'kindle', nowS() + 1, true);
  assert.equal((await trade()).ok, true, 'allowed again after the embargo is lifted');
});
