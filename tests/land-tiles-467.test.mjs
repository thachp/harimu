/** #467 slice 1: land lot / tile title / lease tables (migration 0123) behind HARIMU_LAND_TILES_ENABLED. Tables only, no write path. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { LAND_LOT_SIZES, LAND_TILES_FLAG, landTilesEnabled, tileInLot } from '../lib/land-tiles.ts';
import { isDestructive, postgresMigrations, stripComments, transactionProblem } from '../scripts/postgres-migrations.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const TABLES = ['land_lots', 'land_titles', 'land_leases', 'land_lease_tiles', 'land_starter_grants', 'land_title_events', 'citizen_primary_lot'];

test('flag is on only for the exact string "true"; top-level var (not in any pack), preview true and production false', () => {
  assert.equal(LAND_TILES_FLAG, 'HARIMU_LAND_TILES_ENABLED');
  for (const value of [undefined, '', 'false', 'TRUE', 'True', ' true', 'true ', '1', 'yes', true, 1]) assert.equal(landTilesEnabled({ [LAND_TILES_FLAG]: value }), false, String(value));
  assert.equal(landTilesEnabled({}), false); assert.equal(landTilesEnabled(undefined), false); assert.equal(landTilesEnabled('true'), false);
  assert.equal(landTilesEnabled({ [LAND_TILES_FLAG]: 'true' }), true);
  assert.equal(landTilesEnabled({ HARIMU_GRAY_PACK: { [LAND_TILES_FLAG]: 'true' } }), false, 'no pack lookup');
  for (const [pack, names] of Object.entries(FLAG_PACKS)) assert.equal(names.includes(LAND_TILES_FLAG), false, pack);
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  for (const [config, value] of [[preview, 'true'], [prod, 'false']]) {
    assert.equal(config.vars[LAND_TILES_FLAG], value, 'one top-level text binding');
    for (const pack of Object.keys(FLAG_PACKS)) assert.equal(config.vars[pack]?.[LAND_TILES_FLAG], undefined, pack);
    assert.equal(flagOn(config.vars, LAND_TILES_FLAG), value === 'true');
  }
});

test('tileInLot keeps a titled tile inside its lot boundary (design invariant 2)', () => {
  assert.deepEqual(LAND_LOT_SIZES, [10, 20, 30]);
  const lot = { origin_tx: 4, origin_ty: 8, size: 10 };
  for (const [tx, ty] of [[4, 8], [13, 17], [9, 12]]) assert.equal(tileInLot(lot, tx, ty), true, `${tx},${ty}`);
  for (const [tx, ty] of [[3, 8], [4, 7], [14, 8], [4, 18]]) assert.equal(tileInLot(lot, tx, ty), false, `${tx},${ty}`);
});

/** Same invariants against the SQLite (drizzle/) and Postgres (db/postgres/) files. run(sql) rejects when a constraint refuses the write. */
async function invariants(run, label) {
  const ok = sql => run(sql), refused = (sql, why) => assert.rejects(Promise.resolve().then(() => run(sql)), undefined, `${label}: ${why}`);
  const lot = (id, ox = 0, extra = {}) => { const v = { sx: 3, sy: 2, size: 10, kind: "'residential'", ...extra }; return `INSERT INTO land_lots VALUES ('${id}',${v.sx},${v.sy},${ox},0,${v.size},${v.kind},1)`; };
  const title = (tx, extra = {}) => { const v = { lot: "'lot-1'", hk: "'citizen'", tenure: "'freehold'", state: "'active'", via: "'starter'", ...extra }; return `INSERT INTO land_titles VALUES (3,2,${tx},0,${v.lot},${v.hk},'user-1',${v.tenure},${v.state},${v.via},1)`; };
  const lease = (id, extra = {}) => { const v = { rent: 0, state: "'offered'", ...extra }; return `INSERT INTO land_leases VALUES ('${id}','lot-1','citizen','user-1','user-2',1,2,${v.rent},'none','home',${v.state},NULL,NULL)`; };
  await ok(lot('lot-1'));
  await refused(lot('lot-dup'), 'lot origin is unique per square');
  await refused(lot('lot-x', 10, { sx: 999 }), 'lot square must exist in world_squares');
  await refused(lot('lot-s', 10, { size: 15 }), 'lot size CHECK'); await refused(lot('lot-k', 10, { kind: "'business'" }), 'lot kind CHECK');
  await ok(lot('lot-2', 10, { size: 20 })); await ok(lot('lot-3', 30, { size: 30 }));
  await ok(title(0));
  await refused(title(0, { lot: "'lot-2'" }), 'a tile has at most one current title');
  await refused(title(1, { lot: "'no-lot'" }), 'title lot must exist');
  for (const [key, value] of [['hk', "'npc'"], ['tenure', "'lease'"], ['state', "'revoked'"], ['via', "'capture'"]]) await refused(title(2, { [key]: value }), `title ${key} CHECK`);
  await ok(title(3, { hk: "'nation'", tenure: "'state'", state: "'frozen'", via: "'migration'" }));
  await ok(lease('lease-1')); await ok(lease('lease-2', { state: "'ended'" }));
  await refused(lease('lease-3', { rent: -1 }), 'rent_minor >= 0'); await refused(lease('lease-4', { state: "'declined'" }), 'lease state CHECK');
  await ok("INSERT INTO land_lease_tiles VALUES ('lease-1',3,2,0,0)"); await ok("INSERT INTO land_lease_tiles VALUES ('lease-2',3,2,0,0)"); // history is allowed
  await refused("INSERT INTO land_lease_tiles VALUES ('lease-1',3,2,0,0)", 'lease tile PK');
  await ok("INSERT INTO land_starter_grants VALUES ('person-1','user-1','lot-1',1)");
  await refused("INSERT INTO land_starter_grants VALUES ('person-1','user-9','lot-9',1)", 'one starter grant per person_key');
  await refused("INSERT INTO land_starter_grants VALUES ('person-2','user-1','lot-9',1)", 'clerk_user_id unique');
  await refused("INSERT INTO land_starter_grants VALUES ('person-3','user-3','lot-1',1)", 'lot_id unique');
  const event = (id, request, kind) => `INSERT INTO land_title_events VALUES ('${id}',${request},3,2,0,0,'${kind}',NULL,NULL,'citizen','user-1',NULL,1)`;
  await ok(event('ev-1', "'req-1'", 'grant')); await ok(event('ev-2', 'NULL', 'migrate')); await ok(event('ev-3', 'NULL', 'freeze'));
  await refused(event('ev-4', "'req-1'", 'transfer'), 'request_id unique'); await refused(event('ev-5', 'NULL', 'capture'), 'event kind CHECK');
  await ok("INSERT INTO citizen_primary_lot VALUES ('user-1', NULL)"); await refused("INSERT INTO citizen_primary_lot VALUES ('user-1','lot-1')", 'one primary lot row per citizen');
}

test('migration 0123 (drizzle/ + db/postgres/) is additive, creates exactly the slice-1 tables, and enforces the design constraints', async () => {
  const lite = readFileSync('drizzle/0123_land_tiles.sql', 'utf8'), pgSql = readFileSync('db/postgres/0123_land_tiles.sql', 'utf8');
  const migration = postgresMigrations().find(m => m.file === '0123_land_tiles.sql');
  assert.deepEqual(migration.tables, TABLES);
  assert.equal(isDestructive(pgSql), false); assert.equal(isDestructive(lite), false); assert.equal(transactionProblem(pgSql), null);
  for (const sql of [lite, pgSql]) { assert.doesNotMatch(stripComments(sql), /land_title_anchors|amount_minor/); assert.equal((sql.match(/CHECK\(/g) ?? []).length, 9); }
  assert.doesNotMatch(lite, /COLLATE|BIGINT/); assert.doesNotMatch(pgSql.replace(/TEXT COLLATE "C"/g, ''), /\bTEXT\b/);
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync('drizzle/0011_world_squares.sql', 'utf8')); sqlite.exec(lite);
  await invariants(sql => sqlite.exec(sql), 'sqlite');
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(readFileSync('db/postgres/0011_world_squares.sql', 'utf8')); await pg.exec(pgSql);
  await invariants(sql => pg.exec(sql), 'postgres');
  await pg.close();
});

test('flag off and on: no square purchase, capture() or other runtime file reads the flag or the land tables', () => {
  const files = dir => readdirSync(dir).flatMap(name => { const path = `${dir}/${name}`; return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|mjs)$/.test(name) ? [path] : []; });
  const readers = ['app', 'lib', 'worker'].flatMap(files).filter(path => /HARIMU_LAND_TILES_ENABLED|land-tiles|\bland_(lots|titles|leases|lease_tiles|starter_grants|title_events)\b|citizen_primary_lot/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(readers, ['lib/land-tiles.ts']); // the helper only
  for (const path of ['lib/siege-actions.ts', 'lib/world-registry.ts']) assert.doesNotMatch(readFileSync(path, 'utf8'), /land_|LAND_TILES/i, path);
});
