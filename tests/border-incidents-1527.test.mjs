/** #1527: border incidents (docs §13.5). A purchase or city founding next to another MVP nation's land records one incident per neighbouring nation; the
 *  declared-on nation's incidents against the declarer in the last 30 real days feed the casus belli grievance score (+10 each, cap +30). Flag
 *  HARIMU_BORDER_INCIDENTS_ENABLED (GRAY 105). Off: no border_incidents write or read. Migration 0137. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';

const FLAG = 'HARIMU_BORDER_INCIDENTS_ENABLED', D = 86400, ON = { [FLAG]: 'true' };
const spy = db => { const seen = []; return { seen, db: new Proxy(db, { get(t, k) { if (k === 'prepare') return sql => { seen.push(sql); return t.prepare(sql); }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } }) }; };
const touches = seen => seen.filter(sql => /border_incidents/.test(sql));
/** The same database, but border_incidents does not exist (migration 0137 not applied): every statement naming it hits a real missing-relation error. */
const noTable = db => new Proxy(db, { get: (t, k) => k === 'prepare' ? sql => t.prepare(sql.replace(/\bborder_incidents\b/g, 'border_incidents_missing_1527')) : typeof t[k] === 'function' ? t[k].bind(t) : t[k] });

test('#1527 flag: GRAY 105 at index 103, preview "true", production "false"; migration 0137 is additive, identical, and matches the bootstrap', () => {
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 103); // after #1515 war-loss confidence (index 102)
  for (const [file, value] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) assert.deepEqual([...readFileSync(file, 'utf8').matchAll(/"HARIMU_BORDER_INCIDENTS_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), [value], file);
  const d1 = readFileSync('drizzle/0137_border_incidents.sql', 'utf8');
  assert.equal(readFileSync('db/postgres/0137_border_incidents.sql', 'utf8'), d1);
  assert.doesNotMatch(d1, /\b(DROP|DELETE|UPDATE|ALTER)\b/i);
  const bootstrap = [...readFileSync('lib/border-incidents.ts', 'utf8').matchAll(/`(CREATE (?:TABLE|INDEX) IF NOT EXISTS border_incidents[^`]*)`/g)].map(m => m[1]);
  assert.equal(bootstrap.length, 2);
  for (const sql of bootstrap) assert.ok(d1.includes(`${sql};`), sql);
});

test('#1527 pure helper: distinct neighbouring MVP nations, edge or corner, never the actor or a non-war nation', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { borderIncidentTargets: targets } = await r.importModule('lib/border-incidents.ts');
  const sq = [{ x: 4, y: 5, owner: 'korund' }, { x: 6, y: 6, owner: 'kindle' }, { x: 6, y: 4, owner: 'kindle' }, { x: 5, y: 6, owner: 'aurelle' }, { x: 7, y: 5, owner: 'aurelle' }, { x: 4, y: 4, owner: 'confluence' }, { x: 5, y: 4, owner: null }];
  assert.deepEqual(targets(sq, 'korund', [{ x: 5, y: 5 }]), ['aurelle', 'kindle'], 'one per nation, corner counts, distance 2 and non-war owners do not');
  assert.deepEqual(targets(sq, 'kindle', [{ x: 5, y: 5 }]), ['aurelle', 'korund']);
  assert.deepEqual(targets(sq, 'korund', [{ x: 9, y: 9 }]), []);
  assert.deepEqual(targets(sq, 'korund', [{ x: 9, y: 9 }, { x: 8, y: 5 }]), ['aurelle'], 'any claimed square of the block counts');
});

for (const backend of ['sqlite', 'postgres']) {
  async function setup(t) {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const nowS = Math.floor(r.now / 1000), iso = new Date(r.now).toISOString();
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kara','korund','kara',18,0,'Good standing',?,?)").bind(iso, iso).run();
    const tessera = async minor => { await r.db.prepare("DELETE FROM citizen_tessera_ledger WHERE clerk_user_id='kara'").run(); if (minor) await r.db.prepare("INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at) VALUES (?,'kara',?,'starter-grant',0)").bind(randomUUID(), minor).run(); };
    const site = async owners => {
      await r.db.prepare('DELETE FROM world_square_purchases').run();
      await r.db.prepare("UPDATE world_squares SET owner=NULL, zone='wildlands', feature=NULL WHERE x BETWEEN 16 AND 26 AND y BETWEEN 8 AND 18").run();
      for (const [nation, x, y] of owners) await r.db.prepare("UPDATE world_squares SET owner=?, zone='frontier' WHERE x=? AND y=?").bind(nation, x, y).run();
    };
    const registry = await r.importModule('lib/world-registry.ts'), founding = await r.importModule('lib/city-founding.ts');
    const buy = (env, requestId = randomUUID(), db = r.db) => registry.buySquare(db, 'kara', { action: 'buy-square', x: 21, y: 13, requestId }, nowS, true, env);
    const found = (env, requestId = `found-${randomUUID().slice(0, 8)}`, db = r.db) => founding.foundCity(db, 'kara', 'korund', { action: 'korund-chairman-order', x: 21, y: 13, name: 'Steelmark', requestId }, nowS, true, env);
    const rows = async () => (await r.db.prepare('SELECT actor_nation,target_nation,x,y,kind FROM border_incidents ORDER BY target_nation').all()).results.map(x => ({ ...x, x: Number(x.x), y: Number(x.y) }));
    const incident = (actor, target, at) => r.db.prepare("INSERT INTO border_incidents (id,request_id,actor_nation,target_nation,x,y,kind,occurred_at) VALUES (?,?,?,?,1,1,'purchase',?)").bind(randomUUID(), randomUUID(), actor, target, at).run();
    return { r, nowS, tessera, site, buy, found, rows, incident };
  }

  test(`#1527 ${backend}: flag off, purchase and founding behave as today and never touch border_incidents`, async t => {
    const c = await setup(t); await c.tessera(5000);
    await c.site([['korund', 20, 13], ['kindle', 22, 14]]);
    const s = spy(c.r.db), bought = await c.buy({}, randomUUID(), s.db);
    assert.equal(bought.ok, true, JSON.stringify(bought)); assert.equal(bought.priceMinor, 2500);
    await c.site([['kindle', 24, 13]]);
    assert.equal((await c.found({}, undefined, s.db)).ok, true);
    assert.deepEqual(touches(s.seen), []); assert.deepEqual(await c.rows(), []);
  });

  test(`#1527 ${backend}: flag on, a purchase records one incident per neighbouring nation; none for no foreign neighbour, a refusal, or a replay`, async t => {
    const c = await setup(t); await c.tessera(20000);
    await c.site([['korund', 20, 13], ['kindle', 22, 14]]);
    const id = randomUUID();
    assert.equal((await c.buy(ON, id)).ok, true);
    assert.deepEqual(await c.rows(), [{ actor_nation: 'korund', target_nation: 'kindle', x: 21, y: 13, kind: 'purchase' }]);
    assert.equal((await c.buy(ON, id)).replay, true); assert.equal((await c.rows()).length, 1, 'a replayed request id writes nothing new');
    await c.r.db.prepare('DELETE FROM border_incidents').run();
    await c.site([['korund', 20, 13], ['kindle', 22, 13], ['aurelle', 21, 14]]);
    assert.equal((await c.buy(ON)).ok, true);
    assert.deepEqual((await c.rows()).map(x => `${x.actor_nation}>${x.target_nation}`), ['korund>aurelle', 'korund>kindle'], 'one each for Kindle and Aurelle');
    await c.r.db.prepare('DELETE FROM border_incidents').run();
    await c.site([['korund', 20, 13], ['kindle', 23, 13]]);
    assert.equal((await c.buy(ON)).ok, true); assert.deepEqual(await c.rows(), [], 'two squares away is not a border');
    await c.site([['korund', 20, 13], ['kindle', 22, 13]]); await c.tessera(0);
    assert.equal((await c.buy(ON)).reason, 'insufficient_tessera'); assert.deepEqual(await c.rows(), [], 'a refused purchase records nothing');
  });

  test(`#1527 ${backend}: each INSERT is guarded in SQL: no action row, or the target no longer on the border, writes nothing`, async t => {
    const c = await setup(t), bi = await c.r.importModule('lib/border-incidents.ts');
    await c.site([['kindle', 22, 13]]);
    const write = (requestId, radius) => c.r.db.batch(bi.borderIncidentStatements(c.r.db, { kind: 'purchase', requestId, actor: 'korund', x: 21, y: 13, at: c.nowS, radius, targets: ['kindle'],
      action: { sql: 'SELECT 1 FROM world_square_purchases WHERE request_id=?', binds: [requestId] } }));
    await write('never-written', 1); assert.deepEqual(await c.rows(), [], 'a purchase row that does not exist (refused or raced) records nothing');
    await c.site([['kindle', 23, 13]]); await c.r.db.prepare("INSERT INTO world_square_purchases(request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES ('p-1527','kara','korund',21,13,2500,0)").run();
    await write('p-1527', 1); assert.deepEqual(await c.rows(), [], 'the target moved off the border before the batch');
    await write('p-1527', 2); await write('p-1527', 2); assert.equal((await c.rows()).length, 1, 'written once; the unique key absorbs a second write');
  });

  test(`#1527 ${backend}: flag on with no border_incidents table (0137 not applied): purchase and founding still succeed and record nothing`, async t => {
    const c = await setup(t); await c.tessera(5000);
    await c.site([['korund', 20, 13], ['kindle', 22, 14]]);
    const bought = await c.buy(ON, randomUUID(), noTable(c.r.db));
    assert.equal(bought.ok, true, JSON.stringify(bought));
    assert.equal((await c.r.db.prepare('SELECT owner FROM world_squares WHERE x=21 AND y=13').first()).owner, 'korund', 'the whole purchase batch committed');
    await c.site([['kindle', 24, 12]]);
    const founded = await c.found(ON, undefined, noTable(c.r.db));
    assert.equal(founded.ok, true, JSON.stringify(founded)); assert.equal(founded.claimed, 25);
    assert.deepEqual(await c.rows(), [], 'no incident written anywhere');
  });

  test(`#1527 ${backend}: flag on, a city founding records one incident per nation touching the claimed block, at the centre; replay writes nothing`, async t => {
    const c = await setup(t);
    await c.site([['kindle', 24, 12], ['aurelle', 25, 13]]);
    const id = 'found-border-1527';
    assert.equal((await c.found(ON, id)).ok, true);
    assert.deepEqual(await c.rows(), [{ actor_nation: 'korund', target_nation: 'kindle', x: 21, y: 13, kind: 'city_founding' }], 'Aurelle, 4 squares from the centre, does not touch the block');
    assert.equal((await c.found(ON, id)).replay, true); assert.equal((await c.rows()).length, 1);
  });

  test(`#1527 ${backend}: grievance counts the target's incidents in 30 days (cap +30); 3 alone are refused, plus an embargo clears the gate; flag off reads nothing`, async t => {
    const c = await setup(t), r = c.r, now = c.nowS;
    r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(now - 60 * D)); r.setFixtureEnv(FLAG, 'true');
    const war = await r.importModule('lib/war.ts');
    const count = async () => (await war.readGrievanceInputs(r.db, 'kindle', 'korund', now)).borderIncidents;
    for (let i = 1; i <= 3; i++) await c.incident('korund', 'kindle', now - i * D);
    await c.incident('korund', 'kindle', now - 30 * D); await c.incident('kindle', 'korund', now - D); await c.incident('aurelle', 'kindle', now - D);
    assert.equal(await count(), 3, 'exactly 30 days old, Kindle→Korund and Aurelle→Kindle add nothing');
    await c.incident('korund', 'kindle', now - 30 * D + 1); assert.equal(await count(), 4);
    assert.equal(war.grievanceScore(await war.readGrievanceInputs(r.db, 'kindle', 'korund', now)), 30, 'capped at +30');
    const declare = () => war.declareWar(r.db, { attacker: 'kindle', defender: 'korund', casusBelli: 'Border incidents', declaredBy: 'AI President', requestId: randomUUID() }, now, { enabled: true, limits: true });
    assert.equal((await declare()).reason, 'casus_belli_insufficient', '+30 alone is below 40');
    r.setFixtureEnv(FLAG, 'false');
    const s = spy(r.db);
    assert.equal((await war.readGrievanceInputs(s.db, 'kindle', 'korund', now)).borderIncidents, 0); assert.deepEqual(touches(s.seen), [], 'flag off: no read');
    r.setFixtureEnv(FLAG, 'true');
    await r.db.prepare("INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at,lifted_at) VALUES ('e1','e1','kindle:korund','korund','kindle','AI Chair',?,'in_force',?,?,NULL)").bind(now - 10, now, now).run();
    const ok = await declare(); assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal((await war.readGrievanceInputs(noTable(r.db), 'kindle', 'korund', now, true)).borderIncidents, 0, 'a missing table reads as 0, no throw');
  });

  test(`#1527 ${backend}: national news carries one plain wire line per incident for the actor and the target; off, nothing`, async t => {
    const c = await setup(t);
    await c.r.db.prepare("INSERT INTO border_incidents (id,request_id,actor_nation,target_nation,x,y,kind,occurred_at) VALUES ('bi-1','r1','korund','kindle',21,13,'purchase',?)").bind(c.nowS - 60).run();
    const news = await c.r.importModule('lib/national-news.ts');
    const lines = async (nation, borderIncidents) => (await news.readNationalNews(c.r.db, nation, c.r.now, { borderIncidents })).items.filter(i => i.title === 'Border incident').map(i => i.text);
    assert.deepEqual(await lines('kindle', true), ['Korund expanded to the border with Kindle at 21, 13.']);
    assert.deepEqual(await lines('korund', true), ['Korund expanded to the border with Kindle at 21, 13.']);
    assert.deepEqual(await lines('aurelle', true), []); assert.deepEqual(await lines('kindle', false), []);
    assert.equal(news.newsEditionOptions(ON, 'u').borderIncidents, true); assert.equal(news.newsEditionOptions({}, 'u').borderIncidents, undefined);
  });
}

test('#1527 mutants: dropping a write guard, the missing-table tolerance, the window boundary or the grievance direction fails the SQLite tests', { timeout: 600_000 }, () => {
  const cases = [
    { file: 'lib/border-incidents.ts', find: 'WHERE EXISTS (${a.action.sql}) AND EXISTS', replace: 'WHERE EXISTS' },
    { file: 'lib/border-incidents.ts', find: 'AND occurred_at>?', replace: 'AND occurred_at>=?' },
    { file: 'lib/war.ts', find: 'borderIncidentCount(db, defender, attacker, now)', replace: 'borderIncidentCount(db, attacker, defender, now)' },
    { file: 'lib/world-registry.ts', find: "borderIncidentTargets(squares, nationId, [{ x, y }])", replace: '[]' },
    { file: 'lib/border-incidents.ts', find: 'if (isMissingRelation(error)) return false; throw error;', replace: 'throw error;' }, // ARC #1536: the missing-table tolerance
    { file: 'lib/world-registry.ts', find: 'borderIncidentsEnabled(env) && await borderIncidentTableReady(db) ?', replace: 'borderIncidentsEnabled(env) ?' },
    { file: 'lib/city-founding.ts', find: 'borderIncidentsEnabled(env) && await borderIncidentTableReady(db) ?', replace: 'borderIncidentsEnabled(env) ?' },
  ];
  const tree = mutantTree();
  try {
    for (const c of cases) {
      const restore = tree.mutate(c.file, c.find, c.replace);
      try { assert.notEqual(tree.run(['tests/border-incidents-1527.test.mjs'], '#1527 sqlite').status, 0, `mutant survived: ${c.find}`); } finally { restore(); }
    }
  } finally { tree.close(); }
});
