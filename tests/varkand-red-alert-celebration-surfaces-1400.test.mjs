/** #1400: at Red Alert, player-facing Varkand festival surfaces show no upcoming celebration and no date (docs §7.8).
 *  Reuses the #1220 gate (HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED + HARIMU_VARKAND_ALERT_ENABLED + stored red).
 *  No new flag. withVarkandRedAlertCancels still marks rows canceled and still keeps dates.
 *  Atlas skip is #1239. There is no Varkand festivalHosts row on origin/dev; the city helper is tested with a synthetic note. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withVarkandLanternWatch, withVarkandMusterDay, withVarkandPlebiscite, withVarkandRedAlertCancels, withVarkandRotationDay } from '../lib/government.ts';
import { VARKAND_CANCELED_CELEBRATION_NAMES, varkandCelebrationsCanceled, varkandFestivalHostFields, varkandPlayerFacingCelebrations } from '../lib/varkand-red-alert-cancels.ts';
import { varkandNextLanternWatchAt } from '../lib/varkand-lantern-watch.ts';
import { varkandNextMusterDayAt } from '../lib/varkand-muster-day.ts';
import { varkandNextPlebisciteAt } from '../lib/varkand-plebiscite.ts';
import { varkandNextRotationDayAt } from '../lib/varkand-rotation-day.ts';
import { worldFestivalSources, worldNextFestival } from '../lib/world-atlas-reads.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const CANCELS = 'HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED';
const ALERT = 'HARIMU_VARKAND_ALERT_ENABLED';
const HOST = 'HARIMU_CITY_FESTIVAL_HOST_NOTE_ENABLED';
const MUSTER = 'HARIMU_VARKAND_MUSTER_DAY_ENABLED';
const ROTATION = 'HARIMU_VARKAND_ROTATION_DAY_ENABLED';
const LANTERN = 'HARIMU_VARKAND_LANTERN_WATCH_ENABLED';
const PLEB = 'HARIMU_VARKAND_PLEBISCITE_ENABLED';
const DIRECTORATE = 'HARIMU_VARKAND_DIRECTORATE_ENABLED';
const ATLAS = 'HARIMU_WORLD_ATLAS_READS_ENABLED';
const NOTE = 'Hosts Lantern Watch';
const day = 86_400_000;
const canceled = VARKAND_CANCELED_CELEBRATION_NAMES;
const pack = { [MUSTER]: 'true', [ROTATION]: 'true', [LANTERN]: 'true', [PLEB]: 'true', [DIRECTORATE]: 'true', [ALERT]: 'true', [CANCELS]: 'true', [ATLAS]: 'true' };
const rows = { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, varkandMusterDay: true, varkandRotationDay: true, varkandLanternWatch: true, varkandAlert: true, varkandRedAlertCancels: true };
const absentHost = data => { assert.equal('festivalHostNote' in data, false); assert.equal('festivalHostNextAt' in data, false); };
const absentCelebrations = government => {
  assert.equal('musterDay' in government, false);
  assert.equal('rotationDay' in government, false);
  assert.equal('lanternWatch' in government, false);
};
const show = async (r, user, nationId, cityId) => {
  await r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(nationId, user).run();
  const view = await r.call('city', user);
  if (view.status === 200 && view.data.currentCityId === cityId) return view;
  const travel = await r.call('city', user, { action: 'travel', cityId });
  assert.equal(travel.status, 200, JSON.stringify(travel.data));
  return travel;
};

test('#1400 helpers: dates stay on #1220; player-facing omit is only at Red; other nations are unchanged', () => {
  assert.equal(varkandCelebrationsCanceled('red'), true);
  assert.equal(varkandCelebrationsCanceled('green'), false);
  const snapshot = withVarkandLanternWatch(withVarkandRotationDay(withVarkandMusterDay(withVarkandPlebiscite({ ...simulateGovernment({ availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, nationId: 'kindle' }), nationId: 'varkand' }, day, true), day, true), day, true), day, true);
  const marked = withVarkandRedAlertCancels(snapshot, true, 'red');
  assert.equal(marked.musterDay.canceled, true);
  assert.equal(marked.musterDay.nextAt, varkandNextMusterDayAt(day));
  assert.equal(marked.rotationDay.nextAt, varkandNextRotationDayAt(day));
  assert.equal(marked.lanternWatch.nextAt, varkandNextLanternWatchAt(day));
  const facing = varkandPlayerFacingCelebrations(marked);
  absentCelebrations(facing);
  assert.equal(facing.mandatePlebiscite, snapshot.mandatePlebiscite);
  assert.equal(facing.mandatePlebiscite.nextAt, varkandNextPlebisciteAt(day));
  assert.equal(varkandPlayerFacingCelebrations(snapshot), snapshot);
  assert.equal(varkandPlayerFacingCelebrations(withVarkandRedAlertCancels(snapshot, true, 'green')), snapshot);
  assert.deepEqual(publicGovernmentSnapshot(facing).mandatePlebiscite, facing.mandatePlebiscite);
  assert.equal('musterDay' in publicGovernmentSnapshot(facing), false);
  const host = { festivalHostNote: NOTE, festivalHostNextAt: varkandNextLanternWatchAt(day) };
  assert.deepEqual(varkandFestivalHostFields('varkand', host, 'red', true, true), {});
  assert.equal(varkandFestivalHostFields('varkand', host, 'green', true, true), host);
  assert.equal(varkandFestivalHostFields('varkand', host, 'amber', true, true), host);
  assert.equal(varkandFestivalHostFields('varkand', host, 'red', false, true), host, 'cancels flag off');
  assert.equal(varkandFestivalHostFields('varkand', host, 'red', true, false), host, 'alert flag off');
  assert.equal(varkandFestivalHostFields('hoarvale', host, 'red', true, true), host);
});

test('#1400 government, city, and atlas: Red hides Varkand celebrations and dates; Green/Amber or flag off is unchanged', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  await r.db.prepare("INSERT INTO varkand_alert_levels (id, level, set_at) VALUES (1, 'red', 1)").run();
  r.setFixtureEnv(HOST, 'true');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify(pack));

  const on = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', rows);
  absentCelebrations(on);
  assert.equal(typeof on.mandatePlebiscite.nextAt, 'number');
  assert.ok(on.mandatePlebiscite.nextAt > 0);
  assert.equal(typeof on.directorate.nextRotationAt, 'number');
  const off = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { ...rows, varkandRedAlertCancels: false });
  assert.equal(off.musterDay.nextAt, varkandNextMusterDayAt(seconds * 1000));
  assert.equal(off.lanternWatch.nextAt, varkandNextLanternWatchAt(seconds * 1000));
  assert.equal(off.rotationDay.nextAt, varkandNextRotationDayAt(seconds * 1000));
  assert.equal(off.rotationDay.canceled, true, '#1207 still marks Rotation Day when the cancels flag is off');
  assert.equal('canceled' in off.musterDay, false);

  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  const citizen = (await r.call('citizen', 'alice')).data.government;
  absentCelebrations(citizen);
  assert.equal(citizen.mandatePlebiscite.nextAt, on.mandatePlebiscite.nextAt);

  const clock = (await r.call('world')).data.simulation.clock;
  const names = (clock.nextFestival?.festivals ?? []).map(item => item.name);
  const varkandFlags = { [MUSTER]: 'true', [ROTATION]: 'true', [LANTERN]: 'true', [PLEB]: 'true' };
  assert.equal(names.some(name => canceled.includes(name)), false);
  assert.deepEqual(clock.nextFestival, worldNextFestival(clock.nowSeconds * 1000, varkandFlags, worldFestivalSources, canceled));
  assert.equal(names.includes('Mandate Plebiscite'), true);

  for (const cityId of ['watchfast', 'voren-light', 'moorhald']) {
    absentHost((await show(r, 'alice', 'varkand', cityId)).data);
  }
  r.setFixtureEnv('HARIMU_HOARVALE_AURORA_NIGHT_ENABLED', 'true');
  const isling = await show(r, 'alice', 'hoarvale', 'isling-springs');
  assert.equal(isling.data.festivalHostNote, 'Hosts Aurora Night');
  assert.ok(isling.data.festivalHostNextAt > 0);

  for (const level of ['green', 'amber']) {
    await r.db.prepare('UPDATE varkand_alert_levels SET level=? WHERE id=1').bind(level).run();
    const plain = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', rows);
    assert.equal('canceled' in plain.musterDay, false, level);
    assert.equal(plain.musterDay.nextAt, varkandNextMusterDayAt(seconds * 1000), level);
    assert.equal(plain.lanternWatch.nextAt, varkandNextLanternWatchAt(seconds * 1000), level);
    assert.equal(plain.rotationDay.nextAt, varkandNextRotationDayAt(seconds * 1000), level);
    await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
    const citizenLevel = (await r.call('citizen', 'alice')).data.government;
    assert.equal(citizenLevel.musterDay.nextAt, plain.musterDay.nextAt, level);
    const levelClock = (await r.call('world')).data.simulation.clock;
    assert.equal((levelClock.nextFestival?.festivals ?? []).some(item => canceled.includes(item.name)), true, level);
  }

  await r.db.prepare("UPDATE varkand_alert_levels SET level='red' WHERE id=1").run();
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ ...pack, [CANCELS]: 'false' }));
  const cancelsOff = (await r.call('citizen', 'alice')).data.government;
  assert.equal(cancelsOff.musterDay.nextAt, varkandNextMusterDayAt(seconds * 1000));
  assert.equal('canceled' in cancelsOff.musterDay, false);
  assert.equal(cancelsOff.rotationDay.canceled, true);
  const cancelsOffClock = (await r.call('world')).data.simulation.clock;
  assert.equal((cancelsOffClock.nextFestival?.festivals ?? []).some(item => canceled.includes(item.name)), true, 'cancels flag off: atlas unchanged');
});
