/** #1211: Varkand next Lantern Watch, once per 30 real days from the Chair anchor.
 *  No offset. The helper takes nowMs only and returns the next date only.
 *  Flag HARIMU_VARKAND_LANTERN_WATCH_ENABLED, GRAY 65 in HARIMU_GRAY_PACK; #1212 follows.
 *  Flag off: no lanternWatch key. Date only: no host, Red Alert cancellation, or holiday effect.
 *  The block is separate from Muster Day, Rotation Day, and the Plebiscite. The zzzzzzzzzzzzzzz- name
 *  sorts after zzzzzzzzzzzzzz- files so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, varkandLanternWatchSnapshot, withVarkandLanternWatch, withVarkandMusterDay, withVarkandPlebiscite } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { VARKAND_LANTERN_WATCH_CYCLE_DAYS, VARKAND_LANTERN_WATCH_CYCLE_MS, varkandNextLanternWatchAt } from '../lib/varkand-lantern-watch.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: 0 };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = VARKAND_LANTERN_WATCH_CYCLE_MS;
const key = 'HARIMU_VARKAND_LANTERN_WATCH_ENABLED';
const block = nextAt => ({ nextAt, cycleDays: 30 });
const banned = ['alert', 'cancel', 'host', 'voren', 'effect', 'festival'];

test('the next Lantern Watch falls once per 30 real days from the Chair anchor, with no offset', () => {
  assert.equal(anchor, 0);
  assert.equal(VARKAND_LANTERN_WATCH_CYCLE_DAYS, 30);
  assert.equal(VARKAND_LANTERN_WATCH_CYCLE_DAYS, realDaysPerGameYear);
  assert.equal(cycle, 30 * day);
  assert.equal(varkandNextLanternWatchAt(anchor), anchor + cycle);
  assert.equal(varkandNextLanternWatchAt(anchor - 1), anchor + cycle);
  assert.equal(varkandNextLanternWatchAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(varkandNextLanternWatchAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(varkandNextLanternWatchAt(anchor + 29 * day), anchor + cycle);
  assert.equal(varkandNextLanternWatchAt.length, 1, 'nowMs only');
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity]) {
    const nextAt = varkandNextLanternWatchAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
  }
});

test('flag off leaves the Varkand snapshot unchanged, and other nations gain no lanternWatch key', () => {
  const varkand = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'varkand' };
  assert.equal(withVarkandLanternWatch(varkand, cycle, false), varkand);
  assert.equal('lanternWatch' in varkand, false);
  const on = withVarkandLanternWatch(varkand, cycle, true);
  assert.deepEqual(on.lanternWatch, block(2 * cycle));
  assert.deepEqual(Object.keys(on.lanternWatch).sort(), ['cycleDays', 'nextAt']);
  for (const word of banned) assert.equal(JSON.stringify(on.lanternWatch).includes(word), false, word);
  assert.equal('lanternWatch' in varkand, false, 'the input is not mutated');
  assert.equal(on.decision, varkand.decision);
  const muster = withVarkandMusterDay(varkand, cycle, true);
  const both = withVarkandLanternWatch(muster, cycle, true);
  assert.deepEqual(both.musterDay, muster.musterDay);
  assert.deepEqual(both.lanternWatch, block(2 * cycle));
  assert.equal('lanternWatch' in muster, false);
  const plebiscite = withVarkandPlebiscite(varkand, cycle, true);
  const withVote = withVarkandLanternWatch(plebiscite, cycle, true);
  assert.deepEqual(withVote.mandatePlebiscite, plebiscite.mandatePlebiscite);
  assert.deepEqual(withVote.lanternWatch, block(2 * cycle));
  for (const nationId of ['kindle', 'korund', 'meridian', 'aurelle', 'veldwood', 'ilmar', 'hoarvale', 'fulmara', 'confluence']) {
    const snapshot = ['kindle', 'korund', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withVarkandLanternWatch(snapshot, day, true), snapshot, nationId);
    assert.equal('lanternWatch' in snapshot, false, nationId);
  }
  assert.equal(varkandLanternWatchSnapshot(cycle, false), null);
  assert.deepEqual(varkandLanternWatchSnapshot(cycle, true).lanternWatch, block(2 * cycle));
  assert.equal('directorate' in varkandLanternWatchSnapshot(cycle, true), false);
  assert.equal('musterDay' in varkandLanternWatchSnapshot(cycle, true), false);
  assert.equal('mandatePlebiscite' in varkandLanternWatchSnapshot(cycle, true), false);
  assert.deepEqual(publicGovernmentSnapshot(on).lanternWatch, on.lanternWatch);
  assert.equal('lanternWatch' in publicGovernmentSnapshot(varkand), false);
  assert.equal(readFileSync('lib/game-season.ts', 'utf8').includes('lanternWatch'), false);
  assert.equal(readFileSync('lib/varkand-lantern-watch.ts', 'utf8').includes('varkand-alert'), false);
});

test('the flag is preview true and production false, GRAY 65 inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(key), 64);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(key), 64);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(key), 64);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_HOARVALE_MOOT_OPENING_ENABLED'), 63);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_VARKAND_ROTATION_DAY_ENABLED'), 62);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_ILMAR_ASSEMBLY_ELECTION_DAY_ENABLED'), 65);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/varkand-lantern-watch\.ts/);
});

test('flag off: the Varkand government read is unchanged; flag on adds lanternWatch; Muster Day, Rotation Day, and the Plebiscite stay', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(varkandNextLanternWatchAt(seconds * 1000));
  const opts = { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, varkandMusterDay: true, varkandRotationDay: true };
  assert.equal(await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true }), null);
  assert.equal(await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandLanternWatch: false }), null);
  const off = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', opts);
  const offFlag = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { ...opts, varkandLanternWatch: false });
  assert.equal(JSON.stringify(offFlag), JSON.stringify(off));
  assert.equal('lanternWatch' in off, false);
  const on = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { ...opts, varkandLanternWatch: true });
  assert.deepEqual(on.lanternWatch, expected);
  assert.deepEqual(on.directorate, off.directorate);
  assert.deepEqual(on.mandatePlebiscite, off.mandatePlebiscite);
  assert.deepEqual(on.musterDay, off.musterDay);
  assert.deepEqual(on.rotationDay, off.rotationDay);
  assert.equal('lanternWatch' in off.rotationDay, false);
  const rest = { ...on };
  delete rest.lanternWatch;
  assert.deepEqual(rest, off);
  const alone = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandLanternWatch: true });
  assert.deepEqual(alone.lanternWatch, expected);
  assert.equal('directorate' in alone, false);
  assert.equal('musterDay' in alone, false);
  assert.equal('mandatePlebiscite' in alone, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'veldwood', 'ilmar', 'fulmara', 'confluence', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, varkandLanternWatch: true });
    assert.equal(other == null || !('lanternWatch' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  const varkandPack = { HARIMU_VARKAND_DIRECTORATE_ENABLED: 'true', HARIMU_VARKAND_PLEBISCITE_ENABLED: 'true', HARIMU_VARKAND_MUSTER_DAY_ENABLED: 'true', HARIMU_VARKAND_ROTATION_DAY_ENABLED: 'true' };
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify(varkandPack));
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal('lanternWatch' in before, false, 'flag off');
  assert.equal(JSON.stringify(before.directorate), JSON.stringify(off.directorate));
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ ...varkandPack, [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.lanternWatch, expected);
  assert.deepEqual(packed.directorate, before.directorate);
  assert.deepEqual(packed.mandatePlebiscite, before.mandatePlebiscite);
  assert.deepEqual(packed.musterDay, before.musterDay);
  assert.deepEqual(packed.rotationDay, before.rotationDay);
  for (const word of banned) assert.equal(JSON.stringify(packed.lanternWatch).includes(word), false, word);
  r.setFixtureEnv(key, 'false');
  assert.equal('lanternWatch' in (await r.call('citizen', 'alice')).data.government, false, 'a direct false wins over the pack');
});
