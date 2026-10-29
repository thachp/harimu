/** #1034 (docs §17.1 "seasons ... affect sea lanes"): winter storms slow freight done from a port / trade-zone city.
 *  HARIMU_SEASON_SEA_LANES_ENABLED (HARIMU_CITY_PACK) off: freight output and /api/city unchanged. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gameSeasonAt, seaFreightQuantity, seaLanesStormNote, seaLanesStormy, seasonLengthMs, seasonOrder } from '../lib/game-season.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const jsonc = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const FLAG = 'HARIMU_SEASON_SEA_LANES_ENABLED';

test('multiplier: winter port freight ×0.8 rounded down, floor 1; inland and other seasons unchanged', () => {
  for (const season of seasonOrder) {
    for (const q of [1, 2, 5, 10, 211]) {
      assert.equal(seaFreightQuantity(q, season, false), q, `inland ${season} ${q}`);
      assert.equal(seaFreightQuantity(q, season, true), season === 'winter' ? Math.max(1, Math.floor(q * 0.8)) : q, `port ${season} ${q}`);
    }
  }
  assert.deepEqual([1, 2, 5, 10, 211].map(q => seaFreightQuantity(q, 'winter', true)), [1, 1, 4, 8, 168]);
  assert.equal(seaFreightQuantity(2, null, true), 2);
  assert.equal(seaLanesStormy('winter', true), true);
  assert.equal(seaLanesStormy('winter', false), false);
  assert.equal(seaLanesStormy('autumn', true), false);
});

test('storm note: only for a port in winter, counted from a non-zero world epoch', () => {
  const epoch = Date.UTC(2026, 3, 5, 6, 0, 0);
  const winterStart = epoch + 3 * seasonLengthMs;
  assert.equal(gameSeasonAt(epoch, winterStart).season, 'winter');
  assert.equal(seaLanesStormNote(epoch, winterStart, true), 'Winter storms: sea freight slowed until spring (7d 12h left).');
  assert.equal(seaLanesStormNote(epoch, winterStart + seasonLengthMs - 30 * 60_000, true), 'Winter storms: sea freight slowed until spring (1h left).');
  assert.equal(seaLanesStormNote(epoch, winterStart, false), null, 'inland');
  assert.equal(seaLanesStormNote(epoch, winterStart - 1, true), null, 'last moment of autumn');
  assert.equal(seaLanesStormNote(epoch, winterStart + seasonLengthMs, true), null, 'spring');
  // Mutant: counting from 0 instead of the world epoch would give a different season at this instant.
  assert.notEqual(gameSeasonAt(0, winterStart).season, 'winter');
});

test('flag: in HARIMU_CITY_PACK, "true" in preview and "false" in production', () => {
  assert.ok(FLAG_PACKS.HARIMU_CITY_PACK.includes(FLAG));
  assert.equal(jsonc('wrangler.jsonc').vars.HARIMU_CITY_PACK[FLAG], 'true');
  assert.equal(jsonc('wrangler.prod.jsonc').vars.HARIMU_CITY_PACK[FLAG], 'false');
});

test('route: winter port freight pays less only with the flag on; inland, summer and flag off are unchanged', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE work_orders SET nation_id='confluence' WHERE id='freight'").run(); // fixture: freight from a Confluence port
  const at = async (user, cityId, season, flag) => {
    r.setFixtureEnv(FLAG, flag);
    const epochSec = Math.floor((r.now - (seasonOrder.indexOf(season) * seasonLengthMs + 3_600_000)) / 1000);
    await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(epochSec).run();
    await r.db.prepare("UPDATE citizens SET nation_id='confluence', capacity=100 WHERE clerk_user_id=?").bind(user).run();
    await r.db.prepare('UPDATE work_shifts SET claimed_at=? WHERE clerk_user_id=? AND claimed_at IS NULL').bind(new Date(r.now).toISOString(), user).run(); // free the one active shift
    const moved = await r.call('city', user, { action: 'travel', cityId });
    assert.equal(moved.data.currentCityId, cityId, JSON.stringify(moved.data));
    const panel = (await r.call('city', user)).data;
    const started = await r.call('citizen', user, { action: 'commit-work', workOrderId: 'freight' });
    assert.equal(started.status, 200, JSON.stringify(started.data));
    return { quantity: started.data.shifts.find(s => !s.claimedAt).rewardQuantity, note: panel.seaLanesNote };
  };
  const port = await at('alice', 'oalin-harbor', 'winter', 'true');
  assert.equal(port.quantity, 1);
  assert.match(port.note, /^Winter storms: sea freight slowed until spring \(.+ left\)\.$/);
  assert.deepEqual(await at('bob', 'lanu-terraces', 'winter', 'true'), { quantity: 2, note: undefined }, 'inland');
  assert.deepEqual(await at('alice', 'oalin-harbor', 'summer', 'true'), { quantity: 2, note: undefined }, 'summer');
  assert.deepEqual(await at('bob', 'oalin-harbor', 'winter', 'false'), { quantity: 2, note: undefined }, 'flag off');
});
