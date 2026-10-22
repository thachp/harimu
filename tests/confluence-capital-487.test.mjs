/** #487 slice 2: Meetwater (Confluence capital) on the map, migration 0060, live nations byte-identical, no travel/missionaries; plus the wage-fund re-check under concurrent claims. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';

const sha = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const load = async t => { const r = await localRuntime(); t.after(() => r.close()); return { r, z: await r.importModule('lib/map-zones.ts') }; };

test('(4,13) is a clean site: a full 49-square block, no conflict with the live blocks, the Commons or the grid edge; live nations byte-identical', async t => {
  const { z } = await load(t);
  const meet = z.mappedNations.find(n => n.id === 'confluence');
  assert.deepEqual([meet.capital, meet.outpost], [{ x: 4, y: 13 }, { x: 7, y: 10 }]);
  assert.equal(z.nationBlockSquares('confluence').length, 49);
  assert.deepEqual(z.nationBlockConflicts('confluence', z.mappedNations, z.seedWorldSquares()), []);
  for (const id of ['kindle', 'korund', 'aurelle']) assert.equal(sha(z.nationBlockSquares(id, z.mappedNations)), sha(z.nationBlockSquares(id, z.mvpNations)), id);
  assert.deepEqual(z.mvpNations.map(n => n.id), ['kindle', 'korund', 'aurelle'], 'travel, missionaries, sieges and the original seed see only the live nations');
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  for (const n of z.mvpNations) assert.ok(cheb(n.capital, meet.capital) >= 7, n.id);
});

test('migration 0060 is exactly the generated upsert, additive, and idempotent on Postgres; live squares untouched', async t => {
  const { z } = await load(t);
  const sql = await readFile(new URL('../db/postgres/0060_confluence_capital.sql', import.meta.url), 'utf8');
  assert.equal(sql.split('\n').filter(l => !l.startsWith('--')).join('\n'), [...z.nationSquaresUpsertSql('confluence').map(s => s + ';'), ''].join('\n'));
  const { isDestructive } = await import('../scripts/postgres-migrations.mjs'); assert.equal(isDestructive(sql), false);
  const pg = new PGlite(); t.after(() => pg.close());
  await pg.exec(z.postgresWorldSquaresMigration());
  const read = async () => (await pg.query('SELECT x,y,zone,owner,terrain,resource,feature FROM world_squares ORDER BY y,x')).rows;
  await pg.exec(sql); const once = await read(); await pg.exec(sql);
  assert.deepEqual(await read(), once, 'a second run changes nothing');
  assert.equal(sha(once), sha(z.seedWorldSquares(z.mappedNations)));
  assert.equal(once.filter(s => s.owner === 'confluence').length, 26, 'Heartland 25 + the outpost');
});

test('no travel or missionaries to or from Confluence yet', async t => {
  const { r } = await load(t);
  const missions = await r.importModule('lib/missionaries.ts'), travel = await r.importModule('lib/travel.ts');
  assert.equal(missions.missionTravelSeconds('kindle', 'confluence'), null); assert.equal(missions.missionTravelSeconds('confluence', 'kindle'), null);
  assert.deepEqual(await travel.citySquares(r.db, 'confluence'), []);
});

test('wage fund re-check: parallel claims by two citizens can never pay more than the fund holds', async t => {
  const { r } = await load(t);
  await r.call('world', null);
  await r.db.prepare("UPDATE citizens SET nation_id='confluence'").run();
  const m = await r.importModule('lib/nation-work.ts');
  const job = { id: 'confluence-test-harvest', name: 'Test', capacityCost: 4, hours: 2, wageMinor: 800, output: 'Test' };
  const options = { enabled: true, bindings: { HARIMU_CONFLUENCE_ENABLED: 'true', HARIMU_QA_TEST_CITIZENS: 'true', NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_QA_TEST_CITIZEN_IDS: 'alice,bob' },
    openings: [{ id: 'confluence', openingFlag: 'HARIMU_CONFLUENCE_ENABLED', currency: { code: 'CUR', name: 'Current' }, wage: { fundMinor: 800 }, jobs: [job] }] };
  const sec = () => Math.floor(r.now / 1000), ids = { alice: randomUUID(), bob: randomUUID() };
  for (const u of ['alice', 'bob']) assert.equal((await m.executeNationWork(r.db, u, { action: 'nation-start-work', requestId: ids[u], jobId: job.id }, sec(), options)).status, 200, u);
  r.setNow(r.now + 2 * 3600 * 1000);
  const results = await Promise.all(['alice', 'bob', 'alice', 'bob'].map(u => m.executeNationWork(r.db, u, { action: 'nation-claim-work', shiftId: ids[u] }, sec(), options)));
  const paid = Number((await r.db.prepare('SELECT COALESCE(SUM(wage_minor),0) AS n FROM nation_wage_settlements').first()).n);
  assert.equal(paid, 800, `one shift paid, never two: ${JSON.stringify(results.map(x => x.status))}`);
  assert.equal((await m.readNationWork(r.db, 'alice', options)).fundMinor, 0, 'the fund never goes negative');
});
