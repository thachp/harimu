/** #1239: atlas nextFestival skips Varkand celebrations canceled at Red Alert (#1220/#1227).
 *  No new flag. Recounted after origin/dev e9677548: GRAY 70, #1243 Kite Festival last, red-alert cancels at -3.
 *  Architect ruling: SKIP (do not mark canceled) in simulation.clock.nextFestival.
 *  Skipped names match #1220: Muster Day, Rotation Day, Lantern Watch. Mandate Plebiscite stays.
 *  Gate: HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED on AND HARIMU_VARKAND_ALERT_ENABLED on AND stored level red.
 *  Flag off, or green/amber: nextFestival identical to today. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { VARKAND_CANCELED_CELEBRATION_NAMES, varkandAtlasCanceledFestivalNames, varkandCelebrationsCanceled } from '../lib/varkand-red-alert-cancels.ts';
import { varkandNextLanternWatchAt } from '../lib/varkand-lantern-watch.ts';
import { varkandNextMusterDayAt } from '../lib/varkand-muster-day.ts';
import { varkandNextPlebisciteAt } from '../lib/varkand-plebiscite.ts';
import { varkandNextRotationDayAt } from '../lib/varkand-rotation-day.ts';
import { worldAtlasClockFields, worldFestivalSources, worldNextFestival } from '../lib/world-atlas-reads.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const F = 'HARIMU_WORLD_ATLAS_READS_ENABLED';
const CANCELS = 'HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED';
const ALERT = 'HARIMU_VARKAND_ALERT_ENABLED';
const MUSTER = 'HARIMU_VARKAND_MUSTER_DAY_ENABLED';
const ROTATION = 'HARIMU_VARKAND_ROTATION_DAY_ENABLED';
const LANTERN = 'HARIMU_VARKAND_LANTERN_WATCH_ENABLED';
const PLEB = 'HARIMU_VARKAND_PLEBISCITE_ENABLED';
const DAY = 86_400_000;
const canceled = VARKAND_CANCELED_CELEBRATION_NAMES;
const varkandOn = { [MUSTER]: 'true', [ROTATION]: 'true', [LANTERN]: 'true', [PLEB]: 'true' };

test('#1239: reused cancel helper identity and celebration names match #1220', () => {
  assert.equal(varkandCelebrationsCanceled('red'), true);
  assert.equal(varkandCelebrationsCanceled('green'), false);
  assert.equal(varkandCelebrationsCanceled('amber'), false);
  assert.deepEqual([...VARKAND_CANCELED_CELEBRATION_NAMES], ['Muster Day', 'Rotation Day', 'Lantern Watch']);
  assert.equal(varkandAtlasCanceledFestivalNames, varkandAtlasCanceledFestivalNames);
  assert.deepEqual(varkandAtlasCanceledFestivalNames('red'), VARKAND_CANCELED_CELEBRATION_NAMES);
  assert.deepEqual(varkandAtlasCanceledFestivalNames('green'), []);
  assert.deepEqual(varkandAtlasCanceledFestivalNames('amber'), []);
  assert.equal(varkandAtlasCanceledFestivalNames('red'), VARKAND_CANCELED_CELEBRATION_NAMES, 'red returns the same const array');
  for (const name of VARKAND_CANCELED_CELEBRATION_NAMES) {
    const source = worldFestivalSources.find(s => s.name === name);
    assert.equal(source.nationId, 'varkand', name);
  }
  assert.equal(worldFestivalSources.find(s => s.name === 'Mandate Plebiscite').nationId, 'varkand');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 72, '#1239 adds no flag');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), CANCELS);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_VELDWOOD_RING_MOOT_ENABLED');
  assert.equal(flagOn({ [CANCELS]: 'true' }, CANCELS), true);
});

test('#1239 pure: at Red, canceled names never win nextFestival even when earliest; Plebiscite stays', () => {
  const now = 1; // just after the Varkand anchor: Muster+Lantern at 30d, Rotation at 60d, Plebiscite at 150d
  assert.equal(varkandNextMusterDayAt(now), 30 * DAY);
  assert.equal(varkandNextLanternWatchAt(now), 30 * DAY);
  assert.equal(varkandNextRotationDayAt(now), 60 * DAY);
  assert.equal(varkandNextPlebisciteAt(now), 150 * DAY);

  const baseline = worldNextFestival(now, varkandOn);
  assert.deepEqual(baseline, {
    at: 30 * 86_400,
    festivals: [
      { nationId: 'varkand', name: 'Muster Day' },
      { nationId: 'varkand', name: 'Lantern Watch' },
    ],
  });

  const skipped = worldNextFestival(now, varkandOn, worldFestivalSources, canceled);
  assert.deepEqual(skipped, { at: 150 * 86_400, festivals: [{ nationId: 'varkand', name: 'Mandate Plebiscite' }] });
  assert.equal(skipped.festivals.some(item => canceled.includes(item.name)), false);
  assert.equal(JSON.stringify(worldNextFestival(now, varkandOn, worldFestivalSources, [])), JSON.stringify(baseline));
  assert.equal(JSON.stringify(worldNextFestival(now, varkandOn, worldFestivalSources, varkandAtlasCanceledFestivalNames('green'))), JSON.stringify(baseline));
  assert.equal(JSON.stringify(worldNextFestival(now, varkandOn, worldFestivalSources, varkandAtlasCanceledFestivalNames('amber'))), JSON.stringify(baseline));

  // Mid-cycle: Muster, Rotation, and Lantern share the 60-day boundary; skip falls to Plebiscite.
  const mid = 45 * DAY;
  assert.equal(varkandNextMusterDayAt(mid), 60 * DAY);
  assert.equal(varkandNextRotationDayAt(mid), 60 * DAY);
  assert.equal(varkandNextLanternWatchAt(mid), 60 * DAY);
  const midBase = worldNextFestival(mid, varkandOn);
  assert.deepEqual(midBase.festivals.map(item => item.name), ['Muster Day', 'Rotation Day', 'Lantern Watch']);
  assert.deepEqual(worldNextFestival(mid, varkandOn, worldFestivalSources, canceled), {
    at: 150 * 86_400,
    festivals: [{ nationId: 'varkand', name: 'Mandate Plebiscite' }],
  });

  // Rotation-only earliest when Muster/Lantern are off: still skipped at Red.
  const rotationOnly = { [ROTATION]: 'true', [PLEB]: 'true' };
  assert.deepEqual(worldNextFestival(now, rotationOnly), { at: 60 * 86_400, festivals: [{ nationId: 'varkand', name: 'Rotation Day' }] });
  assert.deepEqual(worldNextFestival(now, rotationOnly, worldFestivalSources, canceled), {
    at: 150 * 86_400,
    festivals: [{ nationId: 'varkand', name: 'Mandate Plebiscite' }],
  });

  const seconds = Math.floor(now / 1000);
  assert.deepEqual(worldAtlasClockFields(seconds, { ...varkandOn, [F]: 'true' }, canceled), { nextFestival: skipped });
  assert.deepEqual(worldAtlasClockFields(seconds, { ...varkandOn, [F]: 'true' }), { nextFestival: baseline });
  assert.deepEqual(worldAtlasClockFields(seconds, { ...varkandOn, [F]: 'false' }, canceled), {});
});

test('#1239: stored Red + both flags on skips celebrations on /api/world; green/amber or either flag off is unchanged', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const pack = {
    [F]: 'true',
    [MUSTER]: 'true',
    [ROTATION]: 'true',
    [LANTERN]: 'true',
    [PLEB]: 'true',
    [ALERT]: 'true',
    [CANCELS]: 'true',
  };
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify(pack));
  await r.db.prepare("INSERT INTO varkand_alert_levels (id, level, set_at) VALUES (1, 'red', 1)").run();

  const names = clock => (clock.nextFestival?.festivals ?? []).map(item => item.name);
  const hasCanceled = clock => names(clock).some(name => canceled.includes(name));
  const baselineAt = nowMs => worldNextFestival(nowMs, varkandOn);
  const skippedAt = nowMs => worldNextFestival(nowMs, varkandOn, worldFestivalSources, canceled);

  let clock = (await r.call('world')).data.simulation.clock;
  const nowMs = clock.nowSeconds * 1000;
  assert.equal('nextFestival' in clock, true);
  assert.equal(hasCanceled(clock), false, 'red + both flags: celebrations skipped');
  assert.equal(names(clock).includes('Mandate Plebiscite'), true, 'Plebiscite still present at red');
  assert.deepEqual(clock.nextFestival, skippedAt(nowMs));
  assert.notDeepEqual(skippedAt(nowMs), baselineAt(nowMs), 'skip actually changes the winner');

  for (const level of ['green', 'amber']) {
    await r.db.prepare('UPDATE varkand_alert_levels SET level=? WHERE id=1').bind(level).run();
    clock = (await r.call('world')).data.simulation.clock;
    assert.deepEqual(clock.nextFestival, baselineAt(clock.nowSeconds * 1000), `${level}: unchanged`);
    assert.equal(hasCanceled(clock), true, `${level}: celebrations remain`);
  }

  await r.db.prepare("UPDATE varkand_alert_levels SET level='red' WHERE id=1").run();
  const redSkipped = (await r.call('world')).data.simulation.clock;

  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ ...pack, [CANCELS]: 'false' }));
  clock = (await r.call('world')).data.simulation.clock;
  assert.deepEqual(clock.nextFestival, baselineAt(clock.nowSeconds * 1000), 'cancels flag off at red: unchanged');
  assert.equal(hasCanceled(clock), true);

  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ ...pack, [ALERT]: 'false' }));
  clock = (await r.call('world')).data.simulation.clock;
  assert.deepEqual(clock.nextFestival, baselineAt(clock.nowSeconds * 1000), 'alert flag off at red: unchanged (no DB cancel read)');
  assert.equal(hasCanceled(clock), true);

  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify(pack));
  clock = (await r.call('world')).data.simulation.clock;
  assert.deepEqual(clock.nextFestival, redSkipped.nextFestival, 'restored red+both flags still skips');
  assert.deepEqual(clock.nextFestival, skippedAt(clock.nowSeconds * 1000));

  // Citizen simulation clock uses the same readWorldSimulation path.
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  const citizenClock = (await r.call('citizen', 'alice')).data.simulation.clock;
  assert.deepEqual(citizenClock.nextFestival, skippedAt(citizenClock.nowSeconds * 1000), 'citizen clock also skips at red');
  assert.equal(hasCanceled(citizenClock), false);
  assert.equal(names(citizenClock).includes('Mandate Plebiscite'), true);
});
