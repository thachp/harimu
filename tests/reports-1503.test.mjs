/** #1503: report a square poster on HARIMU_REPORTS_ENABLED, with a slogan snapshot that survives a later replace. SQLite and HARIMU_TEST_STORAGE=postgres. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';

const POSTERS = 'HARIMU_SQUARE_POSTERS_ENABLED';
const FOG = 'HARIMU_KORUND_MAP_FOG_ENABLED';
const REPORTS = 'HARIMU_REPORTS_ENABLED';
const own = (r, user, nation, x, y) => r.db.prepare('INSERT INTO world_square_purchases(request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES (?,?,?,?,?,2500,1)').bind(`buy-${user}-${x}-${y}`, user, nation, x, y).run();
const place = (r, user, over = {}) => r.call('world/registry', user, {action: 'place-poster', x: 9, y: 8, frameId: 'kindle-frame-billboard', sloganId: 'kindle-slogan-01', requestId: 'poster-req-report01', ...over});
const read = (r, user, q = '?x=9&y=8') => r.call('world/registry', user, undefined, 'https://fixture.invalid', q);
const report = (r, user, body) => r.call('reports', user, {requestId: randomUUID(), ...body});
const stored = async db => (await db.prepare('SELECT reporter_id,target_kind,target_id,reason_id,note,target_snapshot FROM moderation_reports ORDER BY created_at,id').all()).results.map(row => ({...row}));

test('migration 0135 keeps existing rows, widens target_kind and adds target_snapshot on SQLite and Postgres', async () => {
  const kept = "INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at) VALUES ('row-1','req-1','alice','citizen-message','11111111-1111-4111-8111-111111111111','hate-harassment','kept',10)";
  const next = (id, request, kind, target, snapshot) => `INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at,target_snapshot) VALUES ('${id}','${request}','alice','${kind}','${target}','spam-other',NULL,11,${snapshot === null ? 'NULL' : `'${snapshot}'`})`;
  const {DatabaseSync} = await import('node:sqlite');
  const lite = new DatabaseSync(':memory:');
  lite.exec(readFileSync('drizzle/0070_moderation_reports.sql', 'utf8'));
  lite.exec(readFileSync('drizzle/0133_report_ai_targets.sql', 'utf8'));
  lite.exec(kept);
  assert.throws(() => lite.exec(next('nope', 'req-x', 'square-poster', '9,8', 'Strike your own spark.')));
  lite.exec(readFileSync('drizzle/0135_report_square_poster.sql', 'utf8'));
  lite.exec(next('row-2', 'req-2', 'square-poster', '9,8', 'Strike your own spark.'));
  assert.throws(() => lite.exec(next('dup', 'req-3', 'citizen-message', '11111111-1111-4111-8111-111111111111', null)));
  assert.throws(() => lite.exec(next('bad', 'req-4', 'poster', '9,8', 'x')));
  assert.deepEqual(lite.prepare('SELECT id,target_kind,target_id,note,target_snapshot FROM moderation_reports ORDER BY id').all().map(row => ({...row})), [
    {id: 'row-1', target_kind: 'citizen-message', target_id: '11111111-1111-4111-8111-111111111111', note: 'kept', target_snapshot: null},
    {id: 'row-2', target_kind: 'square-poster', target_id: '9,8', note: null, target_snapshot: 'Strike your own spark.'},
  ]);
  assert.ok(lite.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_moderation_reports_reporter'").get());
  lite.exec(next('cap-ok', 'req-cap-ok', 'square-poster', '1,1', 'x'.repeat(280)));
  assert.throws(() => lite.exec(next('cap-bad', 'req-cap-bad', 'square-poster', '1,2', 'x'.repeat(281))));
  const {PGlite} = await import('@electric-sql/pglite');
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(readFileSync('db/postgres/0070_moderation_reports.sql', 'utf8'));
  await pg.exec(readFileSync('db/postgres/0133_report_ai_targets.sql', 'utf8'));
  await pg.exec(kept);
  await assert.rejects(pg.exec(next('nope', 'req-x', 'square-poster', '9,8', 'Strike your own spark.')));
  await pg.exec(readFileSync('db/postgres/0135_report_square_poster.sql', 'utf8'));
  await pg.exec(next('row-2', 'req-2', 'square-poster', '9,8', 'Strike your own spark.'));
  await assert.rejects(pg.exec(next('dup', 'req-3', 'citizen-message', '11111111-1111-4111-8111-111111111111', null)));
  await assert.rejects(pg.exec(next('bad', 'req-4', 'name', '9,8', 'x')));
  assert.deepEqual((await pg.query('SELECT id,target_kind,note,target_snapshot FROM moderation_reports ORDER BY id')).rows, [
    {id: 'row-1', target_kind: 'citizen-message', note: 'kept', target_snapshot: null},
    {id: 'row-2', target_kind: 'square-poster', note: null, target_snapshot: 'Strike your own spark.'},
  ]);
  assert.ok((await pg.query("SELECT 1 AS ok FROM pg_indexes WHERE indexname='idx_moderation_reports_reporter'")).rows.length === 1);
  await pg.exec(next('cap-ok', 'req-cap-ok', 'square-poster', '1,1', 'x'.repeat(280)));
  await assert.rejects(pg.exec(next('cap-bad', 'req-cap-bad', 'square-poster', '1,2', 'x'.repeat(281))));
  await pg.close();
});

test('reports flag off: registry has no button flag and POST /api/reports refuses', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv(POSTERS, 'true');
  r.setFixtureEnv(REPORTS, 'false');
  await own(r, 'alice', 'kindle', 9, 8);
  assert.equal((await place(r, 'alice')).status, 200);
  const listing = await read(r, 'bob');
  assert.equal(listing.data.poster.text, 'Strike your own spark.');
  assert.equal(listing.data.reportsEnabled, false);
  assert.equal((await report(r, 'bob', {targetKind: 'square-poster', targetId: '9,8', reasonId: 'spam-other'})).status, 404);
  assert.deepEqual(await stored(r.db), []);
});

test('a citizen reports another citizen\'s poster; a later replace keeps the original slogan for moderators', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv(POSTERS, 'true');
  r.setFixtureEnv(REPORTS, 'true');
  await own(r, 'alice', 'kindle', 9, 8);
  assert.equal((await place(r, 'alice')).status, 200);
  const listing = await read(r, 'bob');
  assert.equal(listing.data.reportsEnabled, true);
  assert.equal(listing.data.poster.mine, false);
  assert.equal(listing.data.poster.text, 'Strike your own spark.');
  assert.equal((await read(r, 'alice')).data.poster.mine, true);
  const body = {requestId: randomUUID(), targetKind: 'square-poster', targetId: '9,8', reasonId: 'hate-harassment', note: '  slurs  '};
  assert.equal((await r.call('reports', 'bob', body)).status, 201);
  assert.equal((await r.call('reports', 'bob', body)).status, 201, 'replay');
  const dup = await report(r, 'bob', {targetKind: 'square-poster', targetId: '9,8', reasonId: 'spam-other'});
  assert.equal(dup.status, 409); assert.equal(dup.data.duplicate, true);
  assert.equal((await report(r, 'alice', {targetKind: 'square-poster', targetId: '9,8', reasonId: 'spam-other'})).status, 404, 'owner cannot self-report');
  assert.equal((await report(r, 'bob', {targetKind: 'square-poster', targetId: '09,8', reasonId: 'spam-other'})).status, 400);
  assert.equal((await report(r, 'bob', {targetKind: 'square-poster', targetId: '9, 8', reasonId: 'spam-other'})).status, 400);
  assert.equal((await report(r, 'bob', {targetKind: 'square-poster', targetId: 'abc', reasonId: 'spam-other'})).status, 400);
  assert.equal((await report(r, 'bob', {targetKind: 'square-poster', targetId: '9,8', reasonId: 'ai-inappropriate'})).status, 400);
  assert.equal((await report(r, 'bob', {targetKind: 'square-poster', targetId: '4,4', reasonId: 'spam-other'})).status, 404, 'no poster');
  const replaced = await place(r, 'alice', {sloganId: 'kindle-slogan-04', requestId: 'poster-req-report02'});
  assert.equal(replaced.data.poster.text, 'Many voices, one plaza.');
  assert.equal((await read(r, 'bob')).data.poster.text, 'Many voices, one plaza.');
  assert.deepEqual(await stored(r.db), [{reporter_id: 'bob', target_kind: 'square-poster', target_id: '9,8', reason_id: 'hate-harassment', note: 'slurs', target_snapshot: 'Strike your own spark.'}]);
  const lib = await r.importModule('lib/reports.ts');
  const listed = await lib.listModerationReports(r.db);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].target_kind, 'square-poster');
  assert.equal(listed[0].target_id, '9,8');
  assert.equal(listed[0].target_snapshot, 'Strike your own spark.');
  r.setFixtureEnv(POSTERS, 'false');
  assert.equal('poster' in (await read(r, 'bob')).data, false);
  assert.equal((await report(r, 'bob', {targetKind: 'square-poster', targetId: '3,3', reasonId: 'spam-other'})).status, 404);
});

test('a fog-hidden poster is not reportable; a visible one is', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv(POSTERS, 'true');
  r.setFixtureEnv(REPORTS, 'true');
  r.setFixtureEnv(FOG, 'true');
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  const squares = (await r.call('world/squares', 'bob')).data.squares;
  const owned = new Set(squares.filter(s => s.owner === 'korund').map(s => `${s.x},${s.y}`));
  const visible = square => owned.has(`${square.x},${square.y}`) || [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => (dx || dy) && owned.has(`${square.x + dx},${square.y + dy}`)));
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const minDist = p => Math.min(...[...owned].map(k => {const [x, y] = k.split(',').map(Number); return cheb(p, {x, y});}));
  const inside = squares.find(s => owned.has(`${s.x},${s.y}`));
  const far = squares.find(s => !visible(s) && minDist(s) >= 2);
  assert.ok(inside && far);
  await r.db.prepare('INSERT INTO square_posters(x,y,clerk_user_id,nation_id,frame_id,slogan_id,request_id,placed_at) VALUES (?,?,?,?,?,?,?,1)')
    .bind(inside.x, inside.y, 'bob', 'kindle', 'kindle-frame-billboard', 'kindle-slogan-01', 'poster-fog-in').run();
  await r.db.prepare('INSERT INTO square_posters(x,y,clerk_user_id,nation_id,frame_id,slogan_id,request_id,placed_at) VALUES (?,?,?,?,?,?,?,1)')
    .bind(far.x, far.y, 'bob', 'kindle', 'kindle-frame-billboard', 'kindle-slogan-01', 'poster-fog-far').run();
  assert.equal((await read(r, 'alice', `?x=${far.x}&y=${far.y}`)).data.poster, null);
  assert.equal((await report(r, 'alice', {targetKind: 'square-poster', targetId: `${far.x},${far.y}`, reasonId: 'spam-other'})).status, 404, 'fog-hidden');
  assert.equal((await report(r, 'alice', {targetKind: 'square-poster', targetId: `${inside.x},${inside.y}`, reasonId: 'spam-other'})).status, 201);
  assert.equal((await stored(r.db))[0].target_snapshot, 'Strike your own spark.');
});
