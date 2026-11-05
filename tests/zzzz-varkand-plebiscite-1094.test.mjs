/** #1094: Varkand Mandate Plebiscite on a fixed 150-real-day cycle from the Chair anchor (#1085).
 *  Flag HARIMU_VARKAND_PLEBISCITE_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no mandatePlebiscite key.
 *  The zzzz- prefix sorts this file after zzz-varkand-directorate-1085 so Node's --test-shard
 *  round-robin does not move earlier files between Postgres shards. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, varkandGovernmentSnapshot, varkandPlebisciteSnapshot, withVarkandPlebiscite } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { VARKAND_PLEBISCITE_CYCLE_DAYS, VARKAND_PLEBISCITE_MS, varkandNextPlebisciteAt } from '../lib/varkand-plebiscite.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };

test('the next Mandate Plebiscite falls on a 150-real-day cycle from the Chair anchor', () => {
  assert.equal(VARKAND_PLEBISCITE_CYCLE_DAYS, 150);
  assert.equal(VARKAND_PLEBISCITE_MS, 150 * 86_400_000);
  assert.equal(varkandNextPlebisciteAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + VARKAND_PLEBISCITE_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * VARKAND_PLEBISCITE_MS;
    assert.equal(varkandNextPlebisciteAt(at), at + VARKAND_PLEBISCITE_MS);
    assert.equal(varkandNextPlebisciteAt(at + 1), at + VARKAND_PLEBISCITE_MS);
  }
});

test('the boundary at exactly 150 real days moves to the following cycle, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + VARKAND_PLEBISCITE_MS;
  assert.equal(varkandNextPlebisciteAt(boundary - 1), boundary);
  assert.equal(varkandNextPlebisciteAt(boundary), boundary + VARKAND_PLEBISCITE_MS);
  assert.equal(varkandNextPlebisciteAt(boundary + VARKAND_PLEBISCITE_MS - 1), boundary + VARKAND_PLEBISCITE_MS);
  assert.equal(varkandNextPlebisciteAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, VARKAND_PLEBISCITE_MS, VARKAND_PLEBISCITE_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextAt = varkandNextPlebisciteAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.ok(nextAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextAt % VARKAND_PLEBISCITE_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no mandatePlebiscite key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'varkand' }), null);
  assert.equal(varkandPlebisciteSnapshot(VARKAND_PLEBISCITE_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle']) {
    const snapshot = simulateGovernment({ ...baseInput, nationId });
    assert.equal(withVarkandPlebiscite(snapshot, VARKAND_PLEBISCITE_MS, true), snapshot);
    assert.equal(withVarkandPlebiscite(snapshot, VARKAND_PLEBISCITE_MS, false), snapshot);
    assert.equal('mandatePlebiscite' in snapshot, false);
  }
  const varkand = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'varkand' };
  assert.equal(withVarkandPlebiscite(varkand, VARKAND_PLEBISCITE_MS, false), varkand);
  assert.equal('mandatePlebiscite' in varkand, false);
  const on = withVarkandPlebiscite(varkand, VARKAND_PLEBISCITE_MS, true);
  assert.equal(on.mandatePlebiscite.nextAt, VARKAND_PLEBISCITE_MS + VARKAND_PLEBISCITE_MS);
  assert.equal(on.mandatePlebiscite.cycleDays, 150);
  assert.equal('mandatePlebiscite' in varkand, false, 'the input snapshot is not mutated');
  assert.equal('directorate' in on, false);
  const read = varkandPlebisciteSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.mandatePlebiscite.nextAt, VARKAND_CHAIR_ANCHOR_MS + VARKAND_PLEBISCITE_MS);
  assert.equal(read.mandatePlebiscite.cycleDays, 150);
  assert.equal('directorate' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.mandatePlebiscite.nextAt, read.mandatePlebiscite.nextAt);
  assert.equal(published.mandatePlebiscite.cycleDays, 150);
  const directorateOnly = varkandGovernmentSnapshot(VARKAND_PLEBISCITE_MS, true);
  assert.equal('mandatePlebiscite' in directorateOnly, false, 'the Directorate read is unchanged while this flag is off');
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).mandatePlebiscite, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_VARKAND_PLEBISCITE_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_VARKAND_PLEBISCITE_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_VARKAND_PLEBISCITE_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_VARKAND_PLEBISCITE_ENABLED, 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_VARKAND_PLEBISCITE_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_VARKAND_PLEBISCITE_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_VARKAND_PLEBISCITE_ENABLED: 'false' }, 'HARIMU_VARKAND_PLEBISCITE_ENABLED'), false, 'a direct string wins');
});

test('flag off: the Varkand government read is unchanged; flag on names the next Mandate Plebiscite; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = varkandNextPlebisciteAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const directorateOnly = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandDirectorate: true });
  assert.equal('mandatePlebiscite' in directorateOnly, false, 'directorate on, plebiscite off: no mandatePlebiscite key');
  assert.equal('directorate' in directorateOnly, true);
  const on = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandPlebiscite: true });
  assert.equal(on.mandatePlebiscite.nextAt, expected);
  assert.equal(on.mandatePlebiscite.cycleDays, 150);
  assert.equal(Number.isSafeInteger(on.mandatePlebiscite.nextAt), true);
  assert.equal('directorate' in on, false, 'plebiscite alone does not add the Directorate');
  const both = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true });
  assert.equal(both.mandatePlebiscite.nextAt, expected);
  assert.equal(both.mandatePlebiscite.cycleDays, 150);
  assert.equal(both.directorate.chair.command, directorateOnly.directorate.chair.command);
  const kindle = await gov.readGovernment(r.db, 'kindle', seconds, 'bob', { readOnly: true, varkandPlebiscite: true });
  assert.equal('mandatePlebiscite' in kindle, false);
  const korund = await gov.readGovernment(r.db, 'korund', seconds, 'bob', { readOnly: true, varkandPlebiscite: true });
  assert.equal('mandatePlebiscite' in korund, false);
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_VARKAND_PLEBISCITE_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.mandatePlebiscite.nextAt, expected);
  assert.equal(packed.mandatePlebiscite.cycleDays, 150);
  assert.equal('directorate' in packed, false);
  r.setFixtureEnv('HARIMU_VARKAND_PLEBISCITE_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_VARKAND_DIRECTORATE_ENABLED: 'true', HARIMU_VARKAND_PLEBISCITE_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_VARKAND_PLEBISCITE_ENABLED', undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.equal(together.mandatePlebiscite.nextAt, expected);
  assert.equal(together.directorate.chair.command, directorateOnly.directorate.chair.command);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal('mandatePlebiscite' in other, false);
});
