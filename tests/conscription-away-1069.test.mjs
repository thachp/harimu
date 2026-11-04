/** #1069 (docs §17.4 Away row, §15.4): with HARIMU_DORMANCY_ENABLED on, conscription skips Away (7+ real days idle) as well as Dormant;
 *  flag off keeps the #738 30-day cutoff. Aurelle levy with one citizen per home city, so every eligible citizen is drafted. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400;
async function draft(t, backend, dormancy, after) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.call('citizen', 'alice');
  r.setFixtureEnv('HARIMU_ARMIES_ENABLED', 'true'); r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_DORMANCY_ENABLED', dormancy ? 'true' : 'false');
  const now = Math.floor(r.now / 1000), iso = s => new Date(s * 1000).toISOString();
  const people = { active6: { idle: 6 }, away7: { idle: 7 }, under7: { idle: 7 - 1 / D }, away8: { idle: 8 }, away29: { idle: 29 }, dormant31: { idle: 31 }, newcomer: { age: 13 } };
  for (const [id, { age = 20, idle = 0 }] of Object.entries(people)) {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at,last_active_at) VALUES (?,?,?,18,0,'Good standing',?,?,?)").bind(id, 'aurelle', id, iso(now - age * D), iso(now), iso(now - Math.round(idle * D))).run();
    await r.db.prepare('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?)').bind(id, 'aurelle', `city-${id}`, `city-${id}`, now).run();
  }
  const res = await r.call('army/draft', 'active6', { action: 'open' }); assert.equal(res.status, 200);
  if (after) await after(r, now, iso);
  return (await r.db.prepare('SELECT clerk_user_id AS id FROM army_conscripts ORDER BY clerk_user_id').all()).results.map(x => x.id);
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag on: Away (exactly 7, 8, 29 days) and Dormant skipped, active (6 days, 7 days minus 1 s) drafted, newcomer shield holds`, async t => {
    assert.deepEqual(await draft(t, backend, true), ['active6', 'under7']);
  });
  test(`${backend}: flag on: a returning Away citizen is drafted again the following week`, async t => {
    const got = await draft(t, backend, true, async (r, now, iso) => {
      const { runDraft, DRAFT_WEEK_SECONDS } = await r.importModule('lib/army-conscription.ts');
      const next = now + DRAFT_WEEK_SECONDS;
      await r.db.prepare('UPDATE citizens SET last_active_at = ? WHERE clerk_user_id = ?').bind(iso(next - 60), 'away8').run();
      assert.equal(await runDraft(r.db, 'aurelle', next, true), 1, 'only the returning citizen: the week-1 conscripts are members, the rest are still Away or Dormant');
    });
    assert.ok(got.includes('away8') && !got.includes('away29'));
  });
  test(`${backend}: flag off: old behaviour, Away citizens still drafted, Dormant and newcomers skipped`, async t => {
    assert.deepEqual(await draft(t, backend, false), ['active6', 'away29', 'away7', 'away8', 'under7']);
  });
}
