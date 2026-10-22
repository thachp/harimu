/** #491 (Stage 0e): mvpNations derives from the registry, a nation with no capital never throws, and a new nation's squares can be added idempotently. No new capital is added here. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';

const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Hashes of the pre-#491 output on dev 4b132ab (literal mvpNations): the three live nations must be byte-identical.
const golden = { squares: '3de830d42986320bed706eb7586ec5b312fa9ea3c4f7930d3d7a670be76767d4', seedSql: 'c5887b1252b5a9b811ed24386c121c0016bb68e35041f591a954143cc58d8ed1',
  seedSqlPg: 'b24b8b1459eeb07b52a81ad9b3d2c98d4e6bf0c9852ee98dd80c56ca05452ff7', mvp: '008db0ede7d1c2c864f9a56375a1986f080989837422f1c64b2e34b071293474' };
const load = async t => { const r = await localRuntime(); t.after(() => r.close()); return { r, z: await r.importModule('lib/map-zones.ts'), reg: await r.importModule('lib/nation-openings.ts') }; };
// A hypothetical new nation (test only; NOT added to the registry): a free 7x7 block at the bottom left, clear of the three live blocks and the Commons.
const hypothetical = { id: 'confluence', capital: { x: 3, y: 14 }, outpost: { x: 6, y: 11 }, biome: ['plains', 'wetland', 'river edge'] };
const rowsOf = db => db.prepare('SELECT x,y,zone,owner,terrain,resource,feature FROM world_squares ORDER BY y,x').all().map(r => ({ ...r }));
const seeded = z => { const db = new DatabaseSync(':memory:'); db.exec(z.worldSquaresSchema); for (const sql of z.worldSquaresSeedSql()) db.exec(sql); return db; };

test('derived mvpNations: same ids, order, capitals, outposts and biomes as before; every output of the three live nations is byte-identical', async t => {
  const { z, reg } = await load(t);
  assert.deepEqual(z.mvpNations.map(n => n.id), ['kindle', 'korund', 'aurelle']);
  assert.equal(sha(z.mvpNations), golden.mvp, 'mvpNations is identical to the old literal');
  assert.equal(sha(z.seedWorldSquares()), golden.squares, 'all 432 squares are byte-identical');
  assert.equal(sha(z.worldSquaresSeedSql()), golden.seedSql); assert.equal(sha(z.worldSquaresSeedSql(200, 'postgres')), golden.seedSqlPg);
  assert.deepEqual(reg.nationOpenings.filter(o => o.capital).map(o => o.id), ['kindle', 'confluence', 'korund', 'aurelle'], '#487: Confluence is the only new capital');
  for (const o of reg.nationOpenings.filter(o => o.openingFlag !== null && o.id !== 'confluence')) assert.deepEqual([o.capital, o.outpost, o.biome], [undefined, undefined, undefined], o.id);
  assert.deepEqual(z.bootNationSquaresSql(), z.nationSquaresUpsertSql('confluence'), '#487: the boot step adds only Confluence');
});

test('capital spacing still holds (seedCapitalsSpaced), a nation with no capital is simply absent, and blocks never overlap', async t => {
  const { r, z } = await load(t);
  const founding = await r.importModule('lib/city-founding.ts');
  assert.equal(founding.seedCapitalsSpaced(), true);
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  for (const a of z.mvpNations) for (const b of z.mvpNations) if (a !== b) assert.ok(cheb(a.capital, b.capital) >= 7, 'frontier blocks (radius 3) do not touch');
  assert.equal(z.mvpNations.find(n => n.id === 'confluence'), undefined, '#487: Confluence is mapped but not a live (travel/missionary) nation');
  assert.deepEqual(z.nationBlockSquares('meridian'), [], 'no capital: no squares');
  assert.deepEqual(z.nationSquaresUpsertSql('meridian'), []);
});

test('a nation with no capital never throws: missionary travel is "not available" and travel has no city squares', async t => {
  const { r } = await load(t);
  const missions = await r.importModule('lib/missionaries.ts'), travel = await r.importModule('lib/travel.ts');
  assert.equal(typeof missions.missionTravelSeconds('kindle', 'aurelle'), 'number'); assert.ok(missions.missionTravelSeconds('kindle', 'aurelle') > 0);
  assert.equal(missions.missionTravelSeconds('kindle', 'kindle'), 0);
  for (const closed of ['confluence', 'meridian', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara']) {
    assert.doesNotThrow(() => missions.missionTravelSeconds(closed, 'kindle')); assert.equal(missions.missionTravelSeconds(closed, 'kindle'), null, closed);
    assert.equal(missions.missionTravelSeconds('kindle', closed), null, closed); assert.equal(missions.missionTravelSeconds(closed, closed), null);
    assert.deepEqual(await travel.citySquares(r.db, closed), [], closed);
  }
  assert.ok((await travel.citySquares(r.db, 'kindle')).length >= 2, 'live nations keep capital and outpost');
  const actions = await (await import('node:fs/promises')).readFile(new URL('../lib/missionary-actions.ts', import.meta.url), 'utf8');
  assert.match(actions, /travel === null\) return fail\(409, 'not_available'/, 'accepting a mission to a nation without a capital is refused, not thrown');
  assert.doesNotMatch(await (await import('node:fs/promises')).readFile(new URL('../lib/missionaries.ts', import.meta.url), 'utf8'), /\.find\([^)]*\)!\.capital/, 'no non-null assertion on a capital');
});

test('adding a capital changes only that nation\'s block; the three live nations stay byte-identical (the guard for the opening PR)', async t => {
  const { z } = await load(t);
  const nations = [...z.mvpNations, hypothetical];
  const before = z.seedWorldSquares(), after = z.seedWorldSquares(nations);
  const block = new Set(z.nationBlockSquares('confluence', nations).map(s => `${s.x},${s.y}`));
  assert.equal(block.size, 49);
  const changed = after.filter((s, i) => JSON.stringify(s) !== JSON.stringify(before[i]));
  assert.deepEqual(new Set(changed.map(s => `${s.x},${s.y}`)), block, 'exactly the new block changes');
  for (const id of ['kindle', 'korund', 'aurelle']) assert.deepEqual(z.nationBlockSquares(id, nations), z.nationBlockSquares(id), `${id}: block squares identical`);
  assert.equal(sha(after.filter(s => !block.has(`${s.x},${s.y}`))), sha(before.filter(s => !block.has(`${s.x},${s.y}`))));
  assert.deepEqual(z.nationBlockConflicts('confluence', nations, before), [], 'the hypothetical site is clean');
  // Bad sites are reported: overlapping Aurelle, touching the Commons, clipped by the grid edge.
  for (const capital of [{ x: 9, y: 14 }, { x: 12, y: 8 }, { x: 1, y: 1 }]) assert.ok(z.nationBlockConflicts('x', [...z.mvpNations, { ...hypothetical, id: 'x', capital }], before).length > 0, JSON.stringify(capital));
  assert.deepEqual(z.nationBlockConflicts('kindle', z.mvpNations, z.seedWorldSquares([])), [], 'a live nation block over an empty (all Wildlands/Commons-free) seed is clean');
});

test('idempotent upsert on SQLite: adds only the new block, twice is a no-op, nothing owned or featured is overwritten, the three live nations are untouched', async t => {
  const { z } = await load(t);
  const nations = [...z.mvpNations, hypothetical];
  const db = seeded(z);
  // a purchased square and a founded city inside the future block must survive
  db.exec("UPDATE world_squares SET owner='kindle' WHERE x=1 AND y=12"); db.exec("UPDATE world_squares SET owner='kindle', zone='frontier', feature='city' WHERE x=2 AND y=16");
  const before = rowsOf(db), run = () => z.nationSquaresUpsertSql('confluence', nations).forEach(sql => db.exec(sql));
  run(); const once = rowsOf(db); run(); const twice = rowsOf(db);
  assert.deepEqual(twice, once, 'a second run changes nothing'); assert.equal(once.length, mapWidth() , 'still one row per square');
  const block = new Map(z.nationBlockSquares('confluence', nations).map(s => [`${s.x},${s.y}`, s]));
  for (const row of once) {
    const key = `${row.x},${row.y}`, old = before.find(b => b.x === row.x && b.y === row.y);
    if (key === '1,12' || key === '2,16') assert.deepEqual(row, old, `${key}: owned or founded square never overwritten`);
    else if (block.has(key)) assert.deepEqual(row, { ...block.get(key) }, `${key}: new block square`);
    else assert.deepEqual(row, old, `${key}: outside the block is untouched`);
  }
  const clean = seeded(z); z.nationSquaresUpsertSql('confluence', nations).forEach(sql => clean.exec(sql));
  assert.equal(sha(rowsOf(clean)), sha(z.seedWorldSquares(nations).map(s => ({ ...s }))), 'on an untouched table the upsert equals a fresh seed that already had the nation');
  assert.equal(sha(z.bootNationSquaresSql(nations)), sha(z.nationSquaresUpsertSql('confluence', nations)), 'the boot step is exactly that upsert');
  function mapWidth() { return z.mapWidth * z.mapHeight; }
});

test('the same upsert runs on Postgres (PGlite) and is idempotent there', async t => {
  const { z } = await load(t);
  const nations = [...z.mvpNations, hypothetical];
  const pg = new PGlite(); t.after(() => pg.close());
  await pg.exec(z.postgresWorldSquaresMigration());
  const read = async () => (await pg.query('SELECT x,y,zone,owner,terrain,resource,feature FROM world_squares ORDER BY y,x')).rows;
  const base = await read(); assert.equal(base.length, z.mapWidth * z.mapHeight);
  for (const sql of z.nationSquaresUpsertSql('confluence', nations)) await pg.exec(sql);
  const once = await read();
  for (const sql of z.nationSquaresUpsertSql('confluence', nations)) await pg.exec(sql);
  assert.deepEqual(await read(), once);
  assert.equal(sha(once), sha(z.seedWorldSquares(nations)), 'equals a fresh seed that already had the nation');
});

test('the shipped local runtime seeds the original grid plus, via the boot step, only Confluence\'s block (#487)', async t => {
  const { r, z } = await load(t);
  const { squares, source } = await z.readWorldSquares(r.db);
  assert.equal(source, 'table'); assert.equal(sha(squares), sha(z.seedWorldSquares(z.mappedNations)));
  const block = new Set(z.nationBlockSquares('confluence').map(s => `${s.x},${s.y}`));
  assert.equal(sha(squares.filter(s => !block.has(`${s.x},${s.y}`))), sha(z.seedWorldSquares().filter(s => !block.has(`${s.x},${s.y}`))), 'outside the block: the original grid');
});

test('plain-Node importers: the zone vocabulary lives in an import-free file, so a component test that loads app/world-zones.tsx never needs the registry (CI regression on #550)', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
  assert.doesNotMatch(await read('lib/map-zone-labels.ts'), /^\s*import\s/m);
  const zones = await read('app/world-zones.tsx');
  assert.match(zones, /from '@\/lib\/map-zone-labels'/);
  assert.doesNotMatch(zones, /^import (?!type)[^\n]*from '@\/lib\/map-zones'/m, 'only a type import of map-zones (erased) is allowed in the component');
  const labels = await import('../lib/map-zone-labels.ts'), zonesLib = await localRuntime().then(async r => { try { return await r.importModule('lib/map-zones.ts'); } finally { await r.close(); } });
  assert.deepEqual([zonesLib.zoneOrder, zonesLib.zoneLabels, zonesLib.acquisitionRules], [labels.zoneOrder, labels.zoneLabels, labels.acquisitionRules], 'map-zones still re-exports the same values');
});
