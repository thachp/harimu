/** #1220: Varkand celebrations on the government read are marked canceled at Red Alert (docs §7.8).
 *  Flag HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED, packed last in HARIMU_GRAY_PACK. Flag off: the read is unchanged.
 *  Muster Day, Rotation Day, and Lantern Watch are the celebration rows. The Mandate Plebiscite is not marked.
 *  The Mandate Plebiscite is a vote and is not marked. Dates stay on the nowMs helpers.
 *  The zzzzzzzzzzzzzzzz- name sorts after zzzzzzzzzzzzzzz-varkand-rotation-day-1207. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withVarkandLanternWatch, withVarkandMusterDay, withVarkandPlebiscite, withVarkandRedAlertCancels, withVarkandRotationDay } from '../lib/government.ts';
import { varkandCelebrationsCanceled } from '../lib/varkand-red-alert-cancels.ts';
import { varkandNextLanternWatchAt } from '../lib/varkand-lantern-watch.ts';
import { varkandNextMusterDayAt } from '../lib/varkand-muster-day.ts';
import { varkandNextRotationDayAt } from '../lib/varkand-rotation-day.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = 'HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED';
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;

const row = (snapshot, name) => {
  const copy = { ...snapshot };
  delete copy.musterDay;
  delete copy.rotationDay;
  delete copy.lanternWatch;
  delete copy.mandatePlebiscite;
  return name === 'rest' ? copy : snapshot[name];
};

test('celebrations are canceled only at Red Alert', () => {
  assert.equal(varkandCelebrationsCanceled('red'), true);
  assert.equal(varkandCelebrationsCanceled('green'), false);
  assert.equal(varkandCelebrationsCanceled('amber'), false);
  for (const level of [null, undefined, '', 'Red', 'RED']) assert.equal(varkandCelebrationsCanceled(level), false, String(level));
});

test('flag off leaves the snapshot unchanged; Red marks celebration rows and leaves the plebiscite', () => {
  const kindle = simulateGovernment({ ...baseInput, nationId: 'kindle' });
  const varkand = withVarkandLanternWatch(withVarkandPlebiscite(withVarkandRotationDay(withVarkandMusterDay({ ...kindle, nationId: 'varkand' }, day, true), day, true), day, true), day, true);
  assert.equal(withVarkandRedAlertCancels(varkand, false, 'red'), varkand);
  assert.equal(withVarkandRedAlertCancels(varkand, true, 'green'), varkand);
  assert.equal(withVarkandRedAlertCancels(varkand, true, 'amber'), varkand);
  assert.equal('canceled' in varkand.musterDay, false);
  const red = withVarkandRedAlertCancels(varkand, true, 'red');
  assert.equal(red.musterDay.canceled, true);
  assert.equal(red.rotationDay.canceled, true);
  assert.equal(red.lanternWatch.canceled, true);
  assert.equal(red.musterDay.nextAt, varkandNextMusterDayAt(day));
  assert.equal(red.rotationDay.nextAt, varkandNextRotationDayAt(day));
  assert.equal(red.lanternWatch.nextAt, varkandNextLanternWatchAt(day));
  assert.deepEqual({ ...red.musterDay, canceled: undefined }, { ...varkand.musterDay, canceled: undefined });
  assert.equal(red.musterDay.nextAt, varkand.musterDay.nextAt);
  assert.equal(red.rotationDay.nextAt, varkand.rotationDay.nextAt);
  assert.equal(red.rotationDay.cycleDays, varkand.rotationDay.cycleDays);
  assert.equal(red.lanternWatch.nextAt, varkand.lanternWatch.nextAt);
  assert.equal(red.lanternWatch.cycleDays, 30);
  assert.equal('canceled' in red.mandatePlebiscite, false);
  assert.equal(red.mandatePlebiscite, varkand.mandatePlebiscite);
  assert.deepEqual(row(red, 'rest'), row(varkand, 'rest'));
  assert.equal('musterDay' in varkand, true);
  assert.equal(varkand.musterDay.canceled, undefined);
  const again = withVarkandRedAlertCancels(red, true, 'red');
  assert.equal(again, red, 'already canceled stays the same object');
  const bare = { ...kindle, nationId: 'varkand' };
  assert.equal(withVarkandRedAlertCancels(bare, true, 'red'), bare, 'no celebration row is invented');
  for (const nationId of ['kindle', 'korund', 'meridian', 'aurelle', 'veldwood', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'hoarvale', 'aurelle'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...kindle, nationId };
    assert.equal(withVarkandRedAlertCancels(snapshot, true, 'red'), snapshot, nationId);
  }
  assert.deepEqual(publicGovernmentSnapshot(red).musterDay, red.musterDay);
  assert.deepEqual(publicGovernmentSnapshot(red).rotationDay, red.rotationDay);
  assert.equal('canceled' in publicGovernmentSnapshot(red).mandatePlebiscite, false);
});

test('the flag is preview true and production false, last in HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-1), key);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-1), key);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-2), 'HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 68);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/varkand-red-alert-cancels\.ts/);
});

test('flag off: the Varkand government read matches today; flag on marks celebrations only at Red', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const rows = { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, varkandMusterDay: true, varkandRotationDay: true, varkandLanternWatch: true, varkandAlert: true };
  const read = options => gov.readGovernment(r.db, 'varkand', seconds, 'alice', options);
  await r.db.prepare("INSERT INTO varkand_alert_levels (id, level, set_at) VALUES (1, 'red', 1)").run();
  const today = await read(rows);
  const off = await read({ ...rows, varkandRedAlertCancels: false });
  assert.deepEqual(off, today, 'flag off matches the read without the option');
  assert.equal(today.rotationDay.canceled, true, 'Rotation Day already cancels on a stored Red Alert');
  assert.equal('canceled' in today.musterDay, false);
  assert.equal('canceled' in today.lanternWatch, false);
  assert.equal('canceled' in today.mandatePlebiscite, false);
  assert.equal(await read({ readOnly: true, varkandRedAlertCancels: true, varkandAlert: true }), null, 'the flag does not open a Varkand read');
  const on = await read({ ...rows, varkandRedAlertCancels: true });
  assert.deepEqual(on.musterDay, { ...today.musterDay, canceled: true });
  assert.deepEqual(on.lanternWatch, { ...today.lanternWatch, canceled: true });
  assert.deepEqual(on.rotationDay, today.rotationDay);
  assert.equal(on.musterDay.nextAt, today.musterDay.nextAt);
  assert.equal(on.rotationDay.nextAt, today.rotationDay.nextAt);
  assert.deepEqual(on.mandatePlebiscite, today.mandatePlebiscite);
  assert.equal('canceled' in on.mandatePlebiscite, false);
  assert.equal(on.directorate.chair.id, today.directorate.chair.id);
  assert.deepEqual(publicGovernmentSnapshot(on).musterDay, on.musterDay);
  const ignored = await read({ ...rows, varkandAlert: false, varkandRedAlertCancels: true });
  const ignoredOff = await read({ ...rows, varkandAlert: false });
  assert.deepEqual(ignored, ignoredOff, 'alert flag off: a stored Red row is not read');
  assert.equal('canceled' in ignored.musterDay, false);
  assert.equal('canceled' in ignored.lanternWatch, false);
  assert.equal('canceled' in ignored.rotationDay, false);
  for (const level of ['amber', 'green']) {
    await r.db.prepare('UPDATE varkand_alert_levels SET level=? WHERE id=1').bind(level).run();
    const plain = await read(rows);
    const marked = await read({ ...rows, varkandRedAlertCancels: true });
    assert.deepEqual(marked, plain, level);
    assert.equal('canceled' in marked.musterDay, false, level);
    assert.equal('canceled' in marked.lanternWatch, false, level);
    assert.equal('canceled' in marked.rotationDay, false, level);
  }
  await r.db.prepare("UPDATE varkand_alert_levels SET level='red' WHERE id=1").run();
  for (const nationId of ['kindle', 'korund', 'meridian', 'aurelle', 'veldwood', 'ilmar', 'fulmara', 'confluence', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { ...rows, varkandRedAlertCancels: true, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true } : {}) });
    assert.equal(other == null || (!('musterDay' in other) && !('rotationDay' in other)), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  const pack = { HARIMU_VARKAND_DIRECTORATE_ENABLED: 'true', HARIMU_VARKAND_PLEBISCITE_ENABLED: 'true', HARIMU_VARKAND_MUSTER_DAY_ENABLED: 'true', HARIMU_VARKAND_ROTATION_DAY_ENABLED: 'true', HARIMU_VARKAND_LANTERN_WATCH_ENABLED: 'true', HARIMU_VARKAND_ALERT_ENABLED: 'true' };
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify(pack));
  const citizenToday = (await r.call('citizen', 'alice')).data.government;
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ ...pack, [key]: 'false' }));
  const citizenOff = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(citizenOff, citizenToday, 'flag off leaves the citizen read unchanged');
  assert.equal('canceled' in citizenToday.musterDay, false);
  assert.equal('canceled' in citizenToday.lanternWatch, false);
  assert.equal(citizenToday.rotationDay.canceled, true);
  assert.equal('canceled' in citizenToday.mandatePlebiscite, false);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ ...pack, [key]: 'true' }));
  const citizenOn = (await r.call('citizen', 'alice')).data.government;
  assert.equal(citizenOn.musterDay.canceled, true);
  assert.equal(citizenOn.lanternWatch.canceled, true);
  assert.equal(citizenOn.rotationDay.canceled, true);
  assert.equal(citizenOn.musterDay.nextAt, citizenToday.musterDay.nextAt);
  assert.equal(citizenOn.rotationDay.nextAt, citizenToday.rotationDay.nextAt);
  assert.equal('canceled' in citizenOn.mandatePlebiscite, false);
  assert.deepEqual(citizenOn.mandatePlebiscite, citizenToday.mandatePlebiscite);
  r.setFixtureEnv(key, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(direct, citizenToday, 'a direct false wins over the pack');
  r.setFixtureEnv(key, undefined);
  await r.db.prepare("UPDATE varkand_alert_levels SET level='green' WHERE id=1").run();
  const citizenGreen = (await r.call('citizen', 'alice')).data.government;
  assert.equal('canceled' in citizenGreen.musterDay, false);
  assert.equal('canceled' in citizenGreen.lanternWatch, false);
  assert.equal('canceled' in citizenGreen.rotationDay, false);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('musterDay' in other), true);
});
