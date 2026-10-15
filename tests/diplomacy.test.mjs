/** #308: AI treaties PoC (non-aggression pact, trade agreement) behind HARIMU_DIPLOMACY_ENABLED. §13.1 ratification per nation, game-time terms, flag off is a no-op. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { decideTreaty, kindleRatification, soleRatification, treatyPairKey, treatyStatus, treatyTermSeconds, cleanTreatyLabel } from '../lib/diplomacy-rules.ts';
import { gameTimeCompression } from '../lib/game-time.ts';

const D = 86400;
const seats = (s, o, d) => ({ 'steady-hand': s, 'open-ledger': o, 'dockside-builders': d });

test('pure rules: terms in game time at the 12x clock, derived status exact at the boundary', () => {
  assert.equal(gameTimeCompression, 12);
  assert.equal(treatyTermSeconds('non-aggression', 12), 2 * 365 * D / 12, 'NAP: 2 game years');
  assert.equal(treatyTermSeconds('trade', 12), 365 * D / 12);
  const row = { status: 'in_force', endsAt: 1000 };
  assert.equal(treatyStatus(row, 999), 'in-force'); assert.equal(treatyStatus(row, 1000), 'expired', 'expired from the second the term ends');
  assert.equal(treatyStatus({ status: 'proposed', endsAt: null }, 5), 'proposed'); assert.equal(treatyStatus({ status: 'broken', endsAt: 2000 }, 5), 'broken'); assert.equal(treatyStatus({ status: 'rejected', endsAt: null }, 5), 'rejected');
  assert.equal(treatyPairKey('korund', 'aurelle'), treatyPairKey('aurelle', 'korund'));
  assert.equal(cleanTreatyLabel(' <b>AI</b>\nLeader ', 60), 'b AI /b Leader');
});

test('Kindle ratification: a NAP needs two-thirds of the seats, a trade deal a simple majority, integers only', () => {
  // korund NAP stance: steady-hand and open-ledger yes, dockside no.
  assert.equal(kindleRatification('non-aggression', 'korund', seats(6, 6, 6)).passed, true, '12 of 18 is exactly two-thirds');
  assert.equal(kindleRatification('non-aggression', 'korund', seats(6, 5, 7)).passed, false, '11 of 18 is short');
  assert.equal(kindleRatification('non-aggression', 'korund', seats(1, 1, 0)).passed, true, '2 of 2');
  assert.equal(kindleRatification('non-aggression', 'korund', seats(7, 0, 4)).passed, false, '7 of 11 is below 2/3 (7.33)');
  assert.deepEqual(kindleRatification('non-aggression', 'korund', seats(6, 6, 6)), { nation: 'kindle', body: 'Assembly', passed: true, rule: 'two-thirds', yes: 12, total: 18 });
  // korund trade stance: steady-hand and dockside yes, open-ledger no.
  assert.equal(kindleRatification('trade', 'korund', seats(5, 8, 5)).passed, true, '10 of 18 is a simple majority');
  assert.equal(kindleRatification('trade', 'korund', seats(4, 10, 4)).passed, false, '8 of 18');
  assert.equal(kindleRatification('trade', 'korund', seats(5, 9, 4)).passed, false, '9 of 18 is half, not more than half');
  assert.equal(kindleRatification('trade', 'korund', seats(5, 8, 5)).rule, 'simple-majority');
  assert.equal(kindleRatification('non-aggression', 'korund', seats(0, 0, 0)).passed, false, 'an empty Assembly ratifies nothing');
  assert.equal(soleRatification('korund').body, 'Chairman'); assert.equal(soleRatification('aurelle').body, 'Crown');
  assert.equal(soleRatification('korund').passed, true);
  const both = decideTreaty('non-aggression', 'kindle', 'korund', seats(6, 6, 6)); assert.equal(both.approved, true); assert.deepEqual(both.ratifications.map(r => r.nation), ['kindle', 'korund']);
  assert.equal(decideTreaty('non-aggression', 'aurelle', 'kindle', seats(6, 6, 6)).approved, false, 'either side refusing stops it');
  assert.equal(decideTreaty('non-aggression', 'korund', 'aurelle', seats(0, 0, 0)).approved, true, 'Chairman and Crown alone: no Assembly needed');
});

test('the flag defaults to "false", migration 0037 only adds a table, and no route can propose, ratify or break a treaty', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_DIPLOMACY_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  for (const file of ['../drizzle/0037_treaties.sql', '../db/postgres/0037_treaties.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file); assert.match(sql, /CREATE TABLE IF NOT EXISTS treaties/);
  }
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname)) assert.doesNotMatch(await readFile(file, 'utf8'), /proposeTreaty|breakTreaty|decideProposedTreaties|runDiplomacy/, file.pathname);
});

async function setup(t, { flag = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  if (flag) r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
  const d = await r.importModule('lib/diplomacy.ts');
  const propose = (over = {}, now = nowS(), options = {}) => d.proposeTreaty(r.db, { proposer: 'kindle', other: 'korund', kind: 'non-aggression', proposedBy: 'AI President', requestId: randomUUID(), ...over }, now, { enabled: flag, ...options });
  const rows = async () => (await r.db.prepare('SELECT * FROM treaties ORDER BY proposed_at,id').all()).results.map(x => ({ ...x }));
  const decide = (now = nowS()) => d.runDiplomacy(r.db, now);
  return { r, d, propose, rows, decide, nowS };
}

test('flag off: nothing is proposed, decided, read or shown', async t => {
  const { r, d, propose, rows } = await setup(t, { flag: false });
  const res = await propose(); assert.equal(res.ok, false); assert.equal(res.reason, 'disabled'); assert.deepEqual(await rows(), []);
  assert.equal((await d.breakTreaty(r.db, { treatyId: 'x', breaker: 'kindle' }, Math.floor(r.now / 1000), false)).reason, 'disabled');
  const world = await r.call('world', null);
  assert.equal(world.status, 200); assert.equal('treaties' in world.data.simulation, false, 'no treaty state is sent while the flag is off');
  await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at) VALUES ('t-x','req-xxxxxxxx','korund:kindle','non-aggression','kindle','korund','AI',1)").run();
  await r.call('world', null);
  assert.equal((await rows())[0].status, 'proposed', 'with the flag off the tick decides nothing');
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kim','kindle','Kim',18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z')").run();
  assert.ok(!(await r.call('news', 'kim')).data.items.some(i => i.id.startsWith('treaty:')));
});

test('Kindle NAP: fails without two-thirds of the Assembly (default seats), passes when the counted Assembly gives them', async t => {
  const { r, propose, rows, decide, nowS } = await setup(t);
  const bad = await propose({ other: 'aurelle', kind: 'non-aggression' }); assert.equal(bad.ok, true); assert.equal(bad.treaty.status, 'proposed');
  await decide();
  let [row] = await rows(); assert.equal(row.status, 'rejected', 'incumbent seats 7 of 18 for Aurelle are short of 12');
  assert.deepEqual(JSON.parse(row.ratification_json)[0], { nation: 'kindle', body: 'Assembly', passed: false, rule: 'two-thirds', yes: 7, total: 18 });
  assert.equal(row.ratified_at, null);
  // The Korund NAP: incumbents give steady-hand 7 + open-ledger 6 = 13 of 18, two-thirds is 12.
  const ok = await propose({ other: 'korund', kind: 'non-aggression' }); assert.equal(ok.ok, true); await decide();
  row = (await rows()).find(x => x.pair_key === 'kindle:korund'); assert.equal(row.status, 'in_force'); assert.equal(Number(row.ends_at) - Number(row.ratified_at), 2 * 365 * D / 12);
  assert.deepEqual(JSON.parse(row.ratification_json).map(x => [x.nation, x.body, x.passed]), [['kindle', 'Assembly', true], ['korund', 'Chairman', true]]);
  // A counted Assembly result replaces the incumbent tables: dockside-builders sweep it, so the Korund NAP fails.
  await r.db.prepare("INSERT INTO assembly_elections (id,nation_id,policy,opens_at,closes_at,closed_at,result_json) VALUES ('a1','kindle','preview-citizen-v1',?,?,?,?)").bind(nowS() - 4 * D, nowS() - D, nowS() - D, JSON.stringify({ totals: { after: seats(4, 4, 10) } })).run();
  const again = await propose({ proposer: 'korund', other: 'kindle', kind: 'trade' }); assert.equal(again.ok, true); await decide();
  assert.equal((await rows()).find(x => x.id === again.treaty.id).status, 'in_force', 'trade stance korund: steady-hand+dockside yes = 14 of 18, a simple majority');
});

test('Kindle trade deal passes at a simple majority; Aurelle trade fails it; Korund and Aurelle ratify on one AI actor', async t => {
  const { r, propose, rows, decide } = await setup(t);
  const trade = await propose({ other: 'korund', kind: 'trade' }); await decide();
  let row = (await rows()).find(x => x.id === trade.treaty.id); assert.equal(row.status, 'in_force'); assert.equal(Number(row.ends_at) - Number(row.ratified_at), 365 * D / 12);
  assert.deepEqual(JSON.parse(row.ratification_json)[0], { nation: 'kindle', body: 'Assembly', passed: true, rule: 'simple-majority', yes: 12, total: 18 });
  const no = await propose({ other: 'aurelle', kind: 'trade' }); await decide();
  assert.equal((await rows()).find(x => x.id === no.treaty.id).status, 'rejected', 'steady-hand and dockside say no: 6 of 18 only');
  const sole = await propose({ proposer: 'korund', other: 'aurelle', kind: 'non-aggression' }); await decide();
  row = (await rows()).find(x => x.id === sole.treaty.id); assert.equal(row.status, 'in_force');
  assert.deepEqual(JSON.parse(row.ratification_json).map(x => [x.body, x.rule]), [['Chairman', 'sole'], ['Crown', 'sole']]);
  void r;
});

test('a treaty expires at the end of its game-time term; reads derive the status without writing; a new proposal is then allowed', async t => {
  const { r, d, propose, rows, decide, nowS } = await setup(t);
  const made = await propose({ other: 'korund', kind: 'non-aggression' }); await decide();
  const at = nowS(), end = at + 2 * 365 * D / 12;
  const writes = []; const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 50)); return prepare(sql); };
  r.db.batch = s => { writes.push('batch'); return batch(s); };
  try {
    assert.equal((await d.readTreaties(r.db, end - 1)).treaties[0].status, 'in-force');
    assert.equal((await d.readTreaties(r.db, end)).treaties[0].status, 'expired', 'expired at exactly the end of 2 game years');
    assert.equal(await d.activeNonAggressionPact(r.db, 'korund', 'kindle', end - 1), true); assert.equal(await d.activeNonAggressionPact(r.db, 'kindle', 'korund', end), false);
    d.treatyNewsItems((await d.readTreaties(r.db, at)).treaties, 'kindle');
  } finally { r.db.prepare = prepare; r.db.batch = batch; }
  assert.deepEqual(writes, [], 'reads never write');
  assert.equal((await propose({ other: 'korund', kind: 'non-aggression' }, end - 1)).reason, 'treaty_exists', 'one live treaty per pair and kind');
  assert.equal((await rows())[0].status, 'in_force');
  const next = await propose({ other: 'korund', kind: 'non-aggression' }, end); assert.equal(next.ok, true, JSON.stringify(next));
  const all = await rows(); assert.equal(all.find(x => x.id === made.treaty.id).status, 'expired'); assert.equal(Number(all.find(x => x.id === made.treaty.id).ended_at), end);
  await r.db.prepare('SELECT 1').first();
});

test('proposal checks: idempotent request id, bad input, one live treaty per pair and kind, no treaty during a war, breaking', async t => {
  const { r, d, propose, rows, decide, nowS } = await setup(t);
  const requestId = randomUUID();
  const first = await propose({ requestId, proposedBy: '<b>AI   President</b>' }); assert.equal(first.ok, true); assert.doesNotMatch(first.treaty.proposedBy, /[<>]/);
  assert.equal((await propose({ requestId })).replay, true); assert.equal((await propose({ requestId, other: 'aurelle' })).reason, 'request_reused');
  assert.equal((await propose({ other: 'kindle' })).reason, 'bad_nations'); assert.equal((await propose({ other: 'varkand' })).reason, 'bad_nations');
  assert.equal((await propose({ kind: 'embargo' })).reason, 'bad_kind'); assert.equal((await propose({ requestId: 'short' })).reason, 'bad_request'); assert.equal((await propose({ proposedBy: ' ' })).reason, 'bad_request');
  assert.equal((await propose({ proposer: 'korund', other: 'kindle' })).reason, 'treaty_exists', 'either direction, same kind');
  assert.equal((await propose({ proposer: 'korund', other: 'kindle', kind: 'trade' })).ok, true, 'another kind is independent');
  await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES ('w1','war-req-0001','aurelle:kindle','kindle','aurelle','AI',?,?)").bind(nowS(), nowS() + 172800).run();
  assert.equal((await propose({ other: 'aurelle' })).reason, 'at_war');
  assert.equal(await d.nationsAtPeace(r.db, 'kindle', 'aurelle'), false); assert.equal(await d.nationsAtPeace(r.db, 'kindle', 'korund'), true);
  await decide();
  const live = (await rows()).find(x => x.pair_key === 'kindle:korund' && x.kind === 'non-aggression'); assert.equal(live.status, 'in_force');
  const broken = await d.breakTreaty(r.db, { treatyId: live.id, breaker: 'korund' }, nowS() + 100, true); assert.equal(broken.ok, true); assert.equal(broken.treaty.status, 'broken'); assert.equal(broken.treaty.brokenAt, nowS() + 100); assert.equal(broken.treaty.brokenBy, 'korund');
  assert.equal(await d.activeNonAggressionPact(r.db, 'kindle', 'korund', nowS() + 101), false);
  assert.equal((await d.breakTreaty(r.db, { treatyId: 'nope', breaker: 'kindle' }, nowS(), true)).reason, 'not_found');
  // A repeated tick decides nothing twice.
  const before = JSON.stringify(await rows()); await decide(nowS() + 5); assert.equal(JSON.stringify(await rows()), before);
});

test('the world tick decides proposals and the news and world state show treaties only while the flag is on', async t => {
  const { r, d, propose, nowS } = await setup(t);
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kim','kindle','Kim',18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z'),('kai','korund','Kai',18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z'),('ava','aurelle','Ava',18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z')").run();
  const made = await propose({ other: 'korund', kind: 'non-aggression' }); assert.equal(made.treaty.status, 'proposed');
  const world = await r.call('world', null);
  const treaty = world.data.simulation.treaties.treaties.find(x => x.id === made.treaty.id); assert.equal(treaty.status, 'in-force', 'the tick on the world visit decided it'); assert.equal(treaty.endsAt - treaty.ratifiedAt, 2 * 365 * D / 12);
  const titles = async user => (await r.call('news', user)).data.items.filter(i => i.id.startsWith('treaty:'));
  const kindle = await titles('kim'); assert.equal(kindle.length, 1); assert.equal(kindle[0].title, 'The Assembly ratifies a treaty'); assert.match(kindle[0].text, /Assembly ratified the non-aggression pact between Kindle and Korund by a two-thirds vote/); assert.equal(kindle[0].kind, 'template');
  const korund = await titles('kai'); assert.equal(korund[0].title, 'The Chairman ratifies a treaty'); assert.match(korund[0].text, /Chairman has ratified the non-aggression pact with Kindle/);
  assert.deepEqual(await titles('ava'), [], 'a third nation has no line on its own edition');
  const aurelle = await propose({ proposer: 'aurelle', other: 'korund', kind: 'non-aggression' }); await r.call('world', null);
  assert.equal(aurelle.ok, true); const ava = await titles('ava'); assert.equal(ava[0].kind, 'decree'); assert.match(ava[0].text, /Crown ratifies the non-aggression pact with Korund by royal decree/);
  const view = await d.readTreaties(r.db, nowS()); assert.equal(view.treaties.length, 2);
});

test('foreign affairs panel: this nation\'s treaties with their terms; empty state; flag off renders nothing', async t => {
  const rt = await localRuntime(); t.after(() => rt.close());
  const { renderToStaticMarkup } = await import('react-dom/server');
  const require = createRequire(import.meta.url);
  const load = async (file, stubs) => { const exports = {}; const src = await readFile(new URL(file, import.meta.url), 'utf8');
    new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports, name => name in stubs ? stubs[name] : require(name)); return exports; };
  const rules = await rt.importModule('lib/diplomacy-rules.ts'), copy = await rt.importModule('lib/diplomacy-copy.ts'); const embargoCopy = await rt.importModule('lib/embargo-copy.ts');
  const { ForeignAffairsPanel } = await load('../app/foreign-affairs-panel.tsx', { '@/lib/diplomacy-copy': copy, '@/lib/diplomacy-rules': rules, '@/lib/embargo-copy': embargoCopy, './display-preferences': { useDisplayTimestamp: () => value => `T${value}` } });
  const base = { id: 't1', kind: 'non-aggression', proposer: 'kindle', other: 'korund', proposedBy: 'AI President', proposedAt: 1, status: 'in-force', ratifiedAt: 2, endsAt: 5000, brokenAt: null, brokenBy: null, breakPenalty: null, ratifications: [] };
  const html = (treaties, nation) => renderToStaticMarkup(ForeignAffairsPanel({ treaties, nationId: nation }));
  assert.match(html([base], 'kindle'), /Foreign affairs/); assert.match(html([base], 'kindle'), /In force until T5000000: non-aggression pact between Kindle and Korund/); assert.match(html([base], 'kindle'), /No war declarations between the signatories/);
  assert.match(html([base], 'korund'), /between Korund and Kindle/); assert.match(html([base], 'kindle'), /Every negotiator and ratifying body is an AI/);
  assert.match(html([base], 'aurelle'), /No treaties in force/, 'a nation with no treaty sees the empty state');
  assert.equal(html(undefined, 'kindle'), '', 'flag off: no treaties are sent, nothing renders'); assert.equal(html([base], 'ilmar'), '');
  assert.match(html([{ ...base, kind: 'trade', status: 'proposed', endsAt: null }], 'kindle'), /Proposed: trade agreement/);
});
