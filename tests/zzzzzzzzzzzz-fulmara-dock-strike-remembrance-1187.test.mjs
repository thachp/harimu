/** #1187: Fulmara next Dock Strike remembrance once per game year (30 real days) from the Chair anchor (#1085).
 *  Flag HARIMU_FULMARA_DOCK_STRIKE_REMEMBRANCE_ENABLED in HARIMU_GRAY_PACK. Flag off: no dockStrikeRemembrance key.
 *  Date only: no strike text, Tribune veto counts, or Toll Coupon figures.
 *  The zzzzzzzzzzzz- name sorts after the earlier Fulmara files so Node's --test-shard round-robin stays stable.
 *  [ASSUMPTION] cadence = 30 real days; zero anniversary offset (Architect pre-accepted). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import {
  FULMARA_DOCK_STRIKE_REMEMBRANCE_INTERVAL_DAYS,
  FULMARA_DOCK_STRIKE_REMEMBRANCE_MS,
  fulmaraNextDockStrikeRemembranceAt,
} from '../lib/fulmara-dock-strike-remembrance.ts';
import {
  fulmaraDockStrikeRemembranceSnapshot,
  fulmaraExchangeBellSnapshot,
  fulmaraGovernmentSnapshot,
  fulmaraGrandRegattaSnapshot,
  simulateGovernment,
  withFulmaraDockStrikeRemembrance,
} from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const F = 'HARIMU_FULMARA_DOCK_STRIKE_REMEMBRANCE_ENABLED';
const cycle = 30 * day;
const block = nextAt => ({ nextAt, intervalDays: 30, holdsRemembrance: false });

test('Dock Strike remembrance is once per game year (30 real days) on the Chair anchor', () => {
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(FULMARA_DOCK_STRIKE_REMEMBRANCE_INTERVAL_DAYS, 30);
  assert.equal(FULMARA_DOCK_STRIKE_REMEMBRANCE_INTERVAL_DAYS, realDaysPerGameYear);
  assert.equal(FULMARA_DOCK_STRIKE_REMEMBRANCE_MS, cycle);
  assert.equal(fulmaraNextDockStrikeRemembranceAt(0), cycle);
  assert.equal(fulmaraNextDockStrikeRemembranceAt(cycle - 1), cycle);
  assert.equal(fulmaraNextDockStrikeRemembranceAt(cycle), 2 * cycle);
  assert.equal(fulmaraNextDockStrikeRemembranceAt(cycle + 1), 2 * cycle);
  assert.equal(fulmaraNextDockStrikeRemembranceAt(-1), cycle);
  for (const now of [0, cycle * 3 + 7, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.9, NaN, Infinity, -Infinity]) {
    const next = fulmaraNextDockStrikeRemembranceAt(now);
    assert.equal(Number.isSafeInteger(next), true, String(now));
    assert.equal(next % cycle, 0, String(now));
    assert.ok(next > VARKAND_CHAIR_ANCHOR_MS, String(now));
  }
});

test('flag off leaves the snapshot unchanged; other nations gain no key; date only', () => {
  assert.equal(fulmaraDockStrikeRemembranceSnapshot(cycle, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'confluence', 'ilmar']) {
    const snapshot = ['varkand', 'confluence', 'ilmar'].includes(nationId)
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId } : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withFulmaraDockStrikeRemembrance(snapshot, cycle, true), snapshot, nationId);
  }
  const fulmara = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'fulmara' };
  assert.equal(withFulmaraDockStrikeRemembrance(fulmara, day, false), fulmara);
  const on = withFulmaraDockStrikeRemembrance(fulmara, day, true);
  assert.deepEqual(on.dockStrikeRemembrance, block(cycle));
  assert.deepEqual(Object.keys(on.dockStrikeRemembrance).sort(), ['holdsRemembrance', 'intervalDays', 'nextAt']);
  assert.equal('dockStrikeRemembrance' in fulmara, false, 'input not mutated');
  assert.deepEqual({ ...on, dockStrikeRemembrance: undefined }, { ...fulmara, dockStrikeRemembrance: undefined });
  assert.deepEqual(publicGovernmentSnapshot(on).dockStrikeRemembrance, on.dockStrikeRemembrance);
  assert.equal('dockStrikeRemembrance' in publicGovernmentSnapshot(fulmara), false);
  const read = fulmaraDockStrikeRemembranceSnapshot(0, true);
  assert.deepEqual(read.dockStrikeRemembrance, block(cycle));
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.doesNotMatch(JSON.stringify(read), /veto|coupon|toll/i, 'no strike text, veto counts, or Toll Coupon figures');
  for (const peer of [fulmaraGovernmentSnapshot(0, true), fulmaraExchangeBellSnapshot(0, true), fulmaraGrandRegattaSnapshot(0, true)]) {
    assert.equal('dockStrikeRemembrance' in peer, false, 'peer reads unchanged while this flag is off');
  }
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[F], undefined, 'not its own text binding');
  assert.equal(prod.vars[F], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[F], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[F], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-6), F, '#1189 Congress Week, #1191 Coronation Day, #1196 Great Pilgrimage, #1197 Charter Fair, then #1193');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-6), F);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-6), F);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), 'HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), 'HARIMU_AURELLE_CORONATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), 'HARIMU_WORLD_ATLAS_READS_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, F), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [F]: 'false' }, F), false);
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/fulmara-dock-strike-remembrance\.ts/);
});

test('government read: flag off unchanged, flag on adds dockStrikeRemembrance, other nations unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const next = fulmaraNextDockStrikeRemembranceAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const regattaOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraGrandRegatta: true });
  assert.equal('dockStrikeRemembrance' in regattaOnly, false);
  const on = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraDockStrikeRemembrance: true });
  assert.deepEqual(on.dockStrikeRemembrance, block(next));
  for (const k of ['grandCouncil', 'resolutions', 'exchangeBell', 'grandRegatta']) assert.equal(k in on, false, k);
  const all = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', {
    readOnly: true, fulmaraCouncil: true, fulmaraResolutions: true, fulmaraExchangeBell: true, fulmaraGrandRegatta: true, fulmaraDockStrikeRemembrance: true,
  });
  assert.deepEqual(all.dockStrikeRemembrance, block(next));
  for (const k of ['grandCouncil', 'resolutions', 'exchangeBell', 'grandRegatta']) assert.equal(k in all, true, k);
  const regattaPlus = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraGrandRegatta: true, fulmaraDockStrikeRemembrance: true });
  assert.deepEqual(regattaPlus.dockStrikeRemembrance, block(next));
  assert.deepEqual(regattaPlus.grandRegatta, regattaOnly.grandRegatta);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'ilmar', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, fulmaraDockStrikeRemembrance: true });
    assert.equal(other == null || !('dockStrikeRemembrance' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [F]: 'true' }));
  assert.deepEqual((await r.call('citizen', 'alice')).data.government.dockStrikeRemembrance, block(next));
  r.setFixtureEnv(F, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
});
