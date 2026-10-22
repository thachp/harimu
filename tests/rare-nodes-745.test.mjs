// #745: every map-design §6.2 rare node type is seeded on at least one square of the 24x18 grid (migration 0067 on both backends, the boot seed and the in-code fallback).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { localRuntime } from './helpers/local-runtime.mjs';
import { WORLD_GRID } from '../lib/globe-mapping.ts';
const zones = await (async () => { const r = await localRuntime(); try { return await r.importModule('lib/map-zones.ts'); } finally { await r.close(); } })();
const RARE = ['Emberstone', 'Riverpearl', 'Ironroot', 'Skysilk', 'Geotherm core', 'Sunglass', 'Frostcore', 'Hazequartz', 'Heartwood', 'Stormcells']; // map-design §6.2
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

function migrated() { // 0011 then 0067, exactly as a database that already has the seed gets them
  const db = new DatabaseSync(':memory:');
  return read('drizzle/0011_world_squares.sql').then(async s0011 => { db.exec(s0011); db.exec(await read('drizzle/0067_rare_nodes.sql')); return db; });
}

test('after migration 0067 every §6.2 rare type is on at least one in-bounds square, and no existing node changed', async () => {
  const db = await migrated(), rows = db.prepare('SELECT x,y,zone,owner,resource,feature FROM world_squares').all();
  for (const type of RARE) {
    const on = rows.filter(r => r.resource === type);
    assert.ok(on.length >= 1, `${type} is seeded`);
    assert.ok(on.every(r => r.x >= 0 && r.y >= 0 && r.x < WORLD_GRID.width && r.y < WORLD_GRID.height), `${type} in bounds`);
  }
  const before = zones.seedWorldSquares(), changed = rows.filter(r => before.find(b => b.x === r.x && b.y === r.y).resource !== r.resource);
  assert.deepEqual(changed.map(r => `${r.x},${r.y}:${r.resource}`).sort(), zones.rareNodePlacements.map(p => `${p.x},${p.y}:${p.resource}`).sort(), 'only the seven placements change');
  assert.ok(changed.every(r => r.owner === null && r.feature === null && before.find(b => b.x === r.x && b.y === r.y).resource === null), 'only empty, unowned squares');
  db.exec(await read('drizzle/0067_rare_nodes.sql')); assert.equal(db.prepare('SELECT COUNT(*) n FROM world_squares WHERE resource IS NOT NULL').get().n, rows.filter(r => r.resource).length, 'idempotent');
});

test('placements: the seven missing types, each on the grid, on an empty square of its zone; a taken square is left alone', () => {
  assert.deepEqual(zones.rareNodePlacements.map(p => p.resource).sort(), ['Frostcore', 'Geotherm core', 'Hazequartz', 'Heartwood', 'Ironroot', 'Stormcells', 'Sunglass']);
  const seed = zones.seedWorldSquares();
  for (const p of zones.rareNodePlacements) { const s = seed.find(q => q.x === p.x && q.y === p.y); assert.ok(s && s.zone === p.zone && !s.owner && !s.resource && !s.feature, `${p.resource} at ${p.x},${p.y}`); }
  const taken = zones.withRareNodes(seed.map(s => (s.x === 12 && s.y === 5 ? { ...s, owner: 'kindle' } : s)));
  assert.equal(taken.find(s => s.x === 12 && s.y === 5).resource, null, 'an owned square keeps its resource');
});

test('0067 is generated (identical in drizzle/ and db/postgres/), additive, and the boot seed and fallback apply the same placements', async () => {
  for (const f of ['drizzle/0067_rare_nodes.sql', 'db/postgres/0067_rare_nodes.sql']) assert.equal(await read(f), zones.rareNodesMigration(), f);
  assert.doesNotMatch(zones.rareNodesMigration(), /DROP|DELETE|TRUNCATE/i); assert.equal((zones.rareNodesMigration().match(/INSERT/g) ?? []).length, 1, 'the only INSERT is the post-seed check');
  assert.match(await read('lib/db.ts'), /\.\.\.rareNodesSql\(\)\.map\(sql => database\.prepare\(sql\)\)/);
  const db = new DatabaseSync(':memory:'); db.exec(zones.worldSquaresSchema); for (const s of zones.worldSquaresSeedSql()) db.exec(s); for (const s of zones.rareNodesSql()) db.exec(s);
  const { squares, source } = await zones.readWorldSquares({ prepare: q => ({ all: async () => ({ results: db.prepare(q).all() }) }) });
  assert.equal(source, 'table'); assert.ok(RARE.every(t => squares.some(s => s.resource === t)), 'boot seed path');
  const fallback = await zones.readWorldSquares({ prepare: () => ({ all: async () => { throw new Error('no table'); } }) });
  assert.equal(fallback.source, 'seed'); assert.ok(RARE.every(t => fallback.squares.some(s => s.resource === t)), 'in-code fallback');
});

// ARC on #751: 0067 lands before 0066 (#725, insert-only grid growth). The bootstrap, the guard and the schema_migrations record must accept the gap, and apply 0066 cleanly once it lands.
{
  const { mkdtempSync, copyFileSync, writeFileSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { PGlite } = await import('@electric-sql/pglite');
  const m = await import('../scripts/postgres-migrations.mjs');
  const adapter = pg => ({ query: (t, p) => pg.query(t, p), exec: t => pg.exec(t) });
  const late0066 = "-- stand-in for #725's insert-only 0066\nINSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES (24,0,'wildlands',NULL,'wetland',NULL,NULL) ON CONFLICT (x,y) DO NOTHING;\n";
  test('ARC on #751: bootstrap/guard/record accept a missing 0066 and apply it cleanly when it lands after 0067', async t => {
    const dir = mkdtempSync(join(tmpdir(), 'pg745-'));
    for (const f of readdirSync('db/postgres').filter(f => f.endsWith('.sql'))) copyFileSync(join('db/postgres', f), join(dir, f));
    assert.ok(!readdirSync(dir).some(f => f.startsWith('0066')) && readdirSync(dir).includes('0067_rare_nodes.sql'), 'the gap is real');
    const pg = new PGlite(); t.after(() => pg.close()); const db = adapter(pg);
    await m.bootstrapEmptyPostgres(db, { dir });
    const ids = async () => (await pg.query('SELECT id FROM schema_migrations ORDER BY id')).rows.map(r => r.id);
    assert.ok((await ids()).includes('0067_rare_nodes') && !(await ids()).some(id => id.startsWith('0066')));
    await m.assertPostgresMigrationsApplied(db, m.postgresMigrations(dir)); await m.assertDatabaseNotAhead(db, m.postgresMigrations(dir));
    const before = (await pg.query('SELECT x,y,resource FROM world_squares WHERE x<24 AND y<18 ORDER BY y,x')).rows;
    writeFileSync(join(dir, '0066_world_grid_30x24.sql'), late0066);
    await assert.rejects(m.assertPostgresMigrationsApplied(db, m.postgresMigrations(dir)), /0066_world_grid_30x24\.sql \(not applied\)/, 'the guard sees the late 0066 as pending');
    const run = await m.applyPostgresMigrations(db, m.postgresMigrations(dir));
    assert.deepEqual(run.applied, ['0066_world_grid_30x24.sql'], 'only 0066 runs; 0067 is not re-run');
    await m.assertPostgresMigrationsApplied(db, m.postgresMigrations(dir)); await m.assertDatabaseNotAhead(db, m.postgresMigrations(dir));
    assert.deepEqual((await pg.query('SELECT x,y,resource FROM world_squares WHERE x<24 AND y<18 ORDER BY y,x')).rows, before, 'rare nodes untouched');
    assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM world_squares WHERE x=24 AND y=0')).rows[0].n, 1);
    assert.deepEqual((await m.applyPostgresMigrations(db, m.postgresMigrations(dir))).applied, [], 'a second run applies nothing');
    const fresh = new PGlite(); t.after(() => fresh.close()); await m.bootstrapEmptyPostgres(adapter(fresh), { dir }); // a new database gets both, in file order
    assert.ok((await fresh.query("SELECT COUNT(*)::int AS n FROM schema_migrations WHERE id IN ('0066_world_grid_30x24','0067_rare_nodes')")).rows[0].n === 2);
  });
}

// QA3 + ARC on #751: 0067's guards, nearest-square fallback and post-seed check, on SQLite and PGlite.
async function world(backend, t) {
  if (backend === 'sqlite') {
    const db = new DatabaseSync(':memory:'); db.exec(await read('drizzle/0011_world_squares.sql'));
    return { exec: async s => db.exec(s), all: async () => db.prepare('SELECT x,y,zone,owner,terrain,resource,feature FROM world_squares ORDER BY y,x').all().map(r => ({ ...r })), sql: await read('drizzle/0067_rare_nodes.sql') };
  }
  const { PGlite } = await import('@electric-sql/pglite'); const pg = new PGlite(); t.after(() => pg.close()); await pg.exec(zones.postgresWorldSquaresMigration());
  return { exec: s => pg.exec(s), all: async () => (await pg.query('SELECT x,y,zone,owner,terrain,resource,feature FROM world_squares ORDER BY y,x')).rows, sql: await read('db/postgres/0067_rare_nodes.sql') };
}
const placed = rows => Object.fromEntries(rows.filter(r => zones.rareNodePlacements.some(p => p.resource === r.resource)).map(r => [r.resource, `${r.x},${r.y}`]));
for (const backend of ['sqlite', 'pglite']) {
  test(`0067 guards (${backend}): owned, resourced and city target squares are untouched across two runs; the second run is a no-op`, async t => {
    const w = await world(backend, t), [owned, resourced, city] = zones.rareNodePlacements;
    await w.exec(`UPDATE world_squares SET owner='kindle' WHERE x=${owned.x} AND y=${owned.y}`); await w.exec(`UPDATE world_squares SET resource='stone' WHERE x=${resourced.x} AND y=${resourced.y}`);
    await w.exec(`UPDATE world_squares SET feature='city' WHERE x=${city.x} AND y=${city.y}`);
    const at = (rows, p) => rows.find(r => r.x === p.x && r.y === p.y), before = await w.all();
    await w.exec(w.sql); const once = await w.all();
    for (const p of [owned, resourced, city]) assert.deepEqual(at(once, p), at(before, p), `${p.x},${p.y} unchanged`);
    assert.equal(Object.keys(placed(once)).length, 7, 'all seven types still placed');
    assert.deepEqual(placed(once), placed(zones.withRareNodes(before)), 'SQL and the in-code fallback agree');
    await w.exec(w.sql); assert.deepEqual(await w.all(), once, 'second run is a no-op');
  });
  test(`0067 fallback (${backend}): an occupied target moves its type to the nearest eligible square (fixed tie-break)`, async t => {
    const w = await world(backend, t); await w.exec("UPDATE world_squares SET owner='kindle' WHERE x=12 AND y=5");
    await w.exec(w.sql);
    assert.deepEqual(placed(await w.all()), { Ironroot: '12,4', Frostcore: '13,4', Hazequartz: '10,6', Sunglass: '13,6', 'Geotherm core': '12,7', Heartwood: '14,7', Stormcells: '12,8' },
      'Ironroot: (12,4) wins the distance-1 tie on y; Frostcore, displaced, takes (13,4)');
    const v = await world(backend, t); await v.exec("UPDATE world_squares SET owner='kindle' WHERE x=13 AND y=6"); await v.exec(v.sql);
    assert.equal(placed(await v.all()).Sunglass, '14,5', 'Sunglass: of the diagonal ties, lowest y first (x-first would pick another)');
  });
  test(`0067 check (${backend}): with no eligible square left, the migration errors`, async t => {
    const w = await world(backend, t); await w.exec("UPDATE world_squares SET owner='kindle' WHERE x BETWEEN 10 AND 14 AND y BETWEEN 4 AND 8");
    await assert.rejects(w.exec(w.sql), /NOT NULL|null value/i);
  });
}
