/** #1098: Veldwood Federal Council term (120 real days) and rotating Council Speaker (seat 0-6 every 30 real days).
 *  Both clocks use the Varkand Chair anchor (#1085). Flag HARIMU_VELDWOOD_COUNCIL_ENABLED, packed in HARIMU_GRAY_PACK.
 *  Flag off: no federalCouncil key. The zzzz- name sorts after zzzz-varkand-plebiscite-1094 so Node's --test-shard
 *  round-robin does not move earlier files between Postgres shards. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, veldwoodCouncilSnapshot, withVeldwoodCouncil } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { VELDWOOD_COUNCIL_SEATS, VELDWOOD_COUNCIL_TERM_DAYS, VELDWOOD_COUNCIL_TERM_MS, VELDWOOD_SPEAKER_ROTATION_DAYS, VELDWOOD_SPEAKER_ROTATION_MS, veldwoodCouncilSpeakerSeat, veldwoodNextCouncilElectionAt } from '../lib/veldwood-council.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;

test('the next Council election falls on a 120-real-day cycle from the Chair anchor', () => {
  assert.equal(VELDWOOD_COUNCIL_TERM_DAYS, 120);
  assert.equal(VELDWOOD_COUNCIL_TERM_MS, 120 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(veldwoodNextCouncilElectionAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + VELDWOOD_COUNCIL_TERM_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * VELDWOOD_COUNCIL_TERM_MS;
    assert.equal(veldwoodNextCouncilElectionAt(at), at + VELDWOOD_COUNCIL_TERM_MS);
    assert.equal(veldwoodNextCouncilElectionAt(at + 1), at + VELDWOOD_COUNCIL_TERM_MS);
  }
});

test('the boundary at exactly 120 real days moves to the following term, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + VELDWOOD_COUNCIL_TERM_MS;
  assert.equal(veldwoodNextCouncilElectionAt(boundary - 1), boundary);
  assert.equal(veldwoodNextCouncilElectionAt(boundary), boundary + VELDWOOD_COUNCIL_TERM_MS);
  assert.equal(veldwoodNextCouncilElectionAt(boundary + VELDWOOD_COUNCIL_TERM_MS - 1), boundary + VELDWOOD_COUNCIL_TERM_MS);
  assert.equal(veldwoodNextCouncilElectionAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('the Speaker seat advances at exactly 30 real days and wraps from 6 to 0', () => {
  assert.equal(VELDWOOD_SPEAKER_ROTATION_DAYS, 30);
  assert.equal(VELDWOOD_SPEAKER_ROTATION_MS, 30 * day);
  assert.equal(VELDWOOD_COUNCIL_SEATS, 7);
  const first = VARKAND_CHAIR_ANCHOR_MS + VELDWOOD_SPEAKER_ROTATION_MS;
  assert.equal(veldwoodCouncilSpeakerSeat(first - 1), 0);
  assert.equal(veldwoodCouncilSpeakerSeat(first), 1);
  assert.equal(veldwoodCouncilSpeakerSeat(VARKAND_CHAIR_ANCHOR_MS - 1), 0);
  const wrap = VARKAND_CHAIR_ANCHOR_MS + VELDWOOD_COUNCIL_SEATS * VELDWOOD_SPEAKER_ROTATION_MS;
  assert.equal(veldwoodCouncilSpeakerSeat(wrap - 1), 6);
  assert.equal(veldwoodCouncilSpeakerSeat(wrap), 0);
  assert.equal(veldwoodCouncilSpeakerSeat(wrap + VELDWOOD_SPEAKER_ROTATION_MS - 1), 0);
  for (let seat = 0; seat < VELDWOOD_COUNCIL_SEATS; seat++) {
    assert.equal(veldwoodCouncilSpeakerSeat(VARKAND_CHAIR_ANCHOR_MS + seat * VELDWOOD_SPEAKER_ROTATION_MS), seat);
  }
  assert.equal(veldwoodCouncilSpeakerSeat(VELDWOOD_COUNCIL_TERM_MS), 4, 'a Council term is four Speaker turns and does not reset the seat');
});

test('nextElectionAt is always a safe integer, and the Speaker seat stays in 0..6', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, VELDWOOD_COUNCIL_TERM_MS, VELDWOOD_COUNCIL_TERM_MS - 1, VELDWOOD_SPEAKER_ROTATION_MS, VELDWOOD_SPEAKER_ROTATION_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextElectionAt = veldwoodNextCouncilElectionAt(now);
    const speakerSeat = veldwoodCouncilSpeakerSeat(now);
    assert.equal(Number.isSafeInteger(nextElectionAt), true, String(now));
    assert.ok(nextElectionAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextElectionAt % VELDWOOD_COUNCIL_TERM_MS, 0);
    assert.equal(Number.isSafeInteger(speakerSeat), true, String(now));
    assert.ok(speakerSeat >= 0 && speakerSeat < VELDWOOD_COUNCIL_SEATS);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no federalCouncil key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'veldwood' }), null);
  assert.equal(veldwoodCouncilSnapshot(VELDWOOD_COUNCIL_TERM_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand']) {
    const snapshot = nationId === 'varkand'
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
      : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withVeldwoodCouncil(snapshot, VELDWOOD_COUNCIL_TERM_MS, true), snapshot);
    assert.equal(withVeldwoodCouncil(snapshot, VELDWOOD_COUNCIL_TERM_MS, false), snapshot);
    assert.equal('federalCouncil' in snapshot, false);
  }
  const veldwood = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'veldwood' };
  assert.equal(withVeldwoodCouncil(veldwood, VELDWOOD_SPEAKER_ROTATION_MS, false), veldwood);
  assert.equal('federalCouncil' in veldwood, false);
  const on = withVeldwoodCouncil(veldwood, VELDWOOD_SPEAKER_ROTATION_MS, true);
  assert.equal(on.federalCouncil.nextElectionAt, VELDWOOD_COUNCIL_TERM_MS);
  assert.equal(on.federalCouncil.termDays, 120);
  assert.equal(on.federalCouncil.speakerSeat, 1);
  assert.equal(on.federalCouncil.speakerRotationDays, 30);
  assert.equal(Number.isSafeInteger(on.federalCouncil.nextElectionAt), true);
  assert.equal('federalCouncil' in veldwood, false, 'the input snapshot is not mutated');
  assert.equal('directorate' in on, false);
  assert.equal('mandatePlebiscite' in on, false);
  const read = veldwoodCouncilSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.federalCouncil.nextElectionAt, VARKAND_CHAIR_ANCHOR_MS + VELDWOOD_COUNCIL_TERM_MS);
  assert.equal(read.federalCouncil.speakerSeat, 0);
  assert.equal(read.federalCouncil.termDays, 120);
  assert.equal(read.federalCouncil.speakerRotationDays, 30);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.federalCouncil.nextElectionAt, read.federalCouncil.nextElectionAt);
  assert.equal(published.federalCouncil.speakerSeat, 0);
  assert.equal(published.federalCouncil.termDays, 120);
  assert.equal(published.federalCouncil.speakerRotationDays, 30);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).federalCouncil, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_VELDWOOD_COUNCIL_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_VELDWOOD_COUNCIL_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_VELDWOOD_COUNCIL_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_VELDWOOD_COUNCIL_ENABLED, 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_VELDWOOD_COUNCIL_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_VELDWOOD_COUNCIL_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_VELDWOOD_COUNCIL_ENABLED: 'false' }, 'HARIMU_VELDWOOD_COUNCIL_ENABLED'), false, 'a direct string wins');
});

test('flag off: the Veldwood government read is unchanged; flag on names the next election and the Speaker seat; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const nowMs = seconds * 1000;
  const nextElectionAt = veldwoodNextCouncilElectionAt(nowMs);
  const speakerSeat = veldwoodCouncilSpeakerSeat(nowMs);
  assert.equal(await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const on = await gov.readGovernment(r.db, 'veldwood', seconds, 'alice', { readOnly: true, veldwoodCouncil: true });
  assert.equal(on.federalCouncil.nextElectionAt, nextElectionAt);
  assert.equal(on.federalCouncil.termDays, 120);
  assert.equal(on.federalCouncil.speakerSeat, speakerSeat);
  assert.equal(on.federalCouncil.speakerRotationDays, 30);
  assert.equal(Number.isSafeInteger(on.federalCouncil.nextElectionAt), true);
  assert.equal('directorate' in on, false);
  assert.equal('mandatePlebiscite' in on, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, veldwoodCouncil: true });
    assert.equal(other == null || !('federalCouncil' in other), true, nationId);
  }
  const varkand = await gov.readGovernment(r.db, 'varkand', seconds, 'bob', { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, veldwoodCouncil: true });
  assert.equal('federalCouncil' in varkand, false);
  assert.equal('directorate' in varkand, true);
  assert.equal('mandatePlebiscite' in varkand, true);
  await r.db.prepare("UPDATE citizens SET nation_id='veldwood' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_VELDWOOD_COUNCIL_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.federalCouncil.nextElectionAt, nextElectionAt);
  assert.equal(packed.federalCouncil.speakerSeat, speakerSeat);
  assert.equal(packed.federalCouncil.termDays, 120);
  assert.equal(packed.federalCouncil.speakerRotationDays, 30);
  r.setFixtureEnv('HARIMU_VELDWOOD_COUNCIL_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('federalCouncil' in other), true);
});
