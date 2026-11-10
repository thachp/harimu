/** #1207: Varkand next Rotation Day. Reuses the #1085 Chair term (60 real days, 2 game years) from the Chair anchor.
 *  Flag HARIMU_VARKAND_ROTATION_DAY_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no rotationDay key.
 *  The block is the next date only. `canceled` is present only while a stored Red Alert holds (#1081).
 *  The zzzzzzzzzzzzzzz- name sorts after zzzzzzzzzzzzzz-aurelle-coronation-day-1191 so --test-shard
 *  does not move earlier files. After merging origin/dev 74a29631 (GRAY 65), Rotation Day is GRAY 63; #1212 is last at 66. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, varkandRotationDaySnapshot, withVarkandDirectorate, withVarkandRotationDay } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS, VARKAND_ROTATION_MS, varkandChairAt } from '../lib/varkand-directorate.ts';
import { VARKAND_ROTATION_DAY_CYCLE_DAYS, VARKAND_ROTATION_DAY_CYCLE_MS, varkandNextRotationDayAt } from '../lib/varkand-rotation-day.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = VARKAND_ROTATION_DAY_CYCLE_MS;
const key = 'HARIMU_VARKAND_ROTATION_DAY_ENABLED';
const calendarKeys = ['cycleDays', 'nextAt'];
const block = nextAt => ({ nextAt, cycleDays: 60 });
const banned = ['marshal', 'ceremony', 'bastion', 'kell', 'dasken', 'korr', 'vask', 'venn'];

test('the next Rotation Day reuses the Chair term (60 real days) from the Chair anchor', () => {
  assert.equal(anchor, 0);
  assert.equal(VARKAND_ROTATION_MS, 60 * day);
  assert.equal(VARKAND_ROTATION_DAY_CYCLE_DAYS, 60);
  assert.equal(VARKAND_ROTATION_DAY_CYCLE_DAYS, VARKAND_ROTATION_MS / day);
  assert.equal(cycle, 60 * day);
  assert.equal(varkandNextRotationDayAt(anchor), anchor + cycle, 'zero offset: the first Rotation Day is one term after the anchor');
  assert.equal(varkandNextRotationDayAt(anchor - 1), anchor + cycle);
  assert.equal(varkandNextRotationDayAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(varkandNextRotationDayAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(varkandNextRotationDayAt(anchor + cycle + 1), anchor + 2 * cycle);
  assert.equal(varkandNextRotationDayAt(anchor + 59 * day), anchor + cycle, 'day 59 is still this term');
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const nextAt = varkandNextRotationDayAt(now);
    assert.equal(nextAt, varkandChairAt(now).nextRotationAt, String(now));
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(nextAt > now && nextAt - now <= cycle, String(now));
  }
});

test('flag off leaves the Varkand snapshot unchanged, and other nations gain no rotationDay key', () => {
  const kindle = simulateGovernment({ ...baseInput, nationId: 'kindle' });
  const varkand = { ...kindle, nationId: 'varkand' };
  assert.equal(withVarkandRotationDay(varkand, cycle, false), varkand);
  assert.equal('rotationDay' in varkand, false);
  const on = withVarkandRotationDay(varkand, cycle, true);
  assert.deepEqual(on.rotationDay, block(2 * cycle));
  assert.deepEqual(Object.keys(on.rotationDay).sort(), calendarKeys);
  assert.equal('canceled' in on.rotationDay, false);
  for (const word of banned) assert.equal(JSON.stringify(on.rotationDay).includes(word), false, word);
  assert.equal(on.decision, varkand.decision, 'the proposal is not rewritten');
  assert.equal('rotationDay' in varkand, false, 'the input is not mutated');
  assert.equal('directorate' in on, false, 'Rotation Day does not add the directorate');
  assert.equal('musterDay' in on, false);
  const red = withVarkandRotationDay(varkand, cycle, true, true);
  assert.deepEqual(red.rotationDay, { ...block(2 * cycle), canceled: true });
  assert.equal(red.rotationDay.nextAt, on.rotationDay.nextAt, 'a Red Alert does not move the date');
  const directed = withVarkandDirectorate(varkand, cycle, true);
  const together = withVarkandRotationDay(directed, cycle, true);
  assert.equal(together.rotationDay.nextAt, together.directorate.nextRotationAt);
  assert.equal(together.directorate.chair, directed.directorate.chair, 'the Chair roster stays on the directorate flag');
  assert.equal('rotationDay' in directed, false);
  for (const nationId of ['kindle', 'korund', 'meridian', 'aurelle', 'veldwood', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'hoarvale', 'aurelle'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...kindle, nationId };
    assert.equal(withVarkandRotationDay(snapshot, day, true), snapshot, nationId);
    assert.equal(withVarkandRotationDay(snapshot, day, false), snapshot, nationId);
    assert.equal('rotationDay' in snapshot, false, nationId);
  }
  assert.equal(varkandRotationDaySnapshot(cycle, false), null);
  const alone = varkandRotationDaySnapshot(cycle, true);
  assert.deepEqual(alone.rotationDay, block(2 * cycle));
  assert.equal('directorate' in alone, false);
  assert.equal('mandatePlebiscite' in alone, false);
  assert.equal(alone.decision.proposedSpendMinor, 0);
  const published = publicGovernmentSnapshot(on);
  assert.deepEqual(published.rotationDay, on.rotationDay);
  assert.equal('rotationDay' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
  assert.deepEqual(publicGovernmentSnapshot(red).rotationDay, red.rotationDay);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-17), key, 'GRAY 63; #1208, #1211, then #1212 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-17), key);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-18), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-17), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 79);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/varkand-rotation-day\.ts/);
});

test('flag off: the Varkand government read is unchanged; flag on names the next Rotation Day; Red Alert marks it canceled', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(varkandNextRotationDayAt(seconds * 1000));
  assert.equal(await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true }), null, 'flag off');
  assert.equal(await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandMusterDay: true }), null, 'Muster Day still does not open a read');
  const on = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandRotationDay: true });
  assert.deepEqual(on.rotationDay, expected);
  assert.equal(Number.isSafeInteger(on.rotationDay.nextAt), true);
  assert.deepEqual(Object.keys(on.rotationDay).sort(), calendarKeys);
  for (const word of banned) assert.equal(JSON.stringify(on.rotationDay).includes(word), false, word);
  assert.equal('directorate' in on, false);
  assert.equal('musterDay' in on, false);
  assert.equal('mandatePlebiscite' in on, false);
  assert.equal(on.decision.proposedSpendMinor, 0);
  const directed = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandDirectorate: true });
  assert.equal('rotationDay' in directed, false, 'directorate flag does not add rotationDay');
  const both = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, varkandMusterDay: true, varkandRotationDay: true });
  assert.deepEqual(both.rotationDay, expected);
  assert.equal(both.rotationDay.nextAt, both.directorate.nextRotationAt);
  assert.equal('musterDay' in both, true);
  assert.equal('mandatePlebiscite' in both, true);
  assert.equal(both.directorate.chair.id, directed.directorate.chair.id);
  await r.db.prepare("INSERT INTO varkand_alert_levels (id, level, set_at) VALUES (1, 'red', 1)").run();
  const storedRedIgnored = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandRotationDay: true });
  assert.deepEqual(storedRedIgnored.rotationDay, expected, 'alert flag off: a stored Red row is not read');
  const red = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandRotationDay: true, varkandAlert: true });
  await r.db.prepare("UPDATE varkand_alert_levels SET level='amber' WHERE id=1").run();
  const amberRead = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandRotationDay: true, varkandAlert: true });
  assert.deepEqual(red.rotationDay, { ...expected, canceled: true }, 'red holds: the date stays and the day is marked canceled');
  assert.deepEqual(amberRead.rotationDay, expected, 'Amber is not a Red Alert');
  await r.db.prepare("UPDATE varkand_alert_levels SET level='green' WHERE id=1").run();
  assert.deepEqual((await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandRotationDay: true, varkandAlert: true })).rotationDay, expected);
  for (const nationId of ['kindle', 'korund', 'meridian', 'aurelle', 'veldwood', 'ilmar', 'fulmara', 'confluence', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, varkandRotationDay: true, varkandAlert: true, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true } : {}) });
    assert.equal(other == null || !('rotationDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  const citizenOff = (await r.call('citizen', 'alice')).data.government;
  assert.equal(citizenOff == null || !('rotationDay' in citizenOff), true, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.rotationDay, expected);
  assert.equal('directorate' in packed, false, 'Rotation Day does not turn on the directorate');
  assert.equal('canceled' in packed.rotationDay, false);
  r.setFixtureEnv(key, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('rotationDay' in direct), true, 'a direct false wins over the pack');
  r.setFixtureEnv(key, undefined);
  await r.db.prepare("UPDATE varkand_alert_levels SET level='red' WHERE id=1").run();
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [key]: 'true', HARIMU_VARKAND_ALERT_ENABLED: 'true', HARIMU_VARKAND_DIRECTORATE_ENABLED: 'true' }));
  const redCitizen = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(redCitizen.rotationDay, { ...expected, canceled: true });
  assert.equal(redCitizen.rotationDay.nextAt, redCitizen.directorate.nextRotationAt);
  assert.equal('musterDay' in redCitizen, false);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('rotationDay' in other), true);
});
