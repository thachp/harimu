/** #1102: Fulmara Council of Ten (30 real days), Lodestar (90 real days, no consecutive re-election) and Tribune session (30 real days).
 *  All three clocks use the Varkand Chair anchor (#1087). Flag HARIMU_FULMARA_COUNCIL_ENABLED, packed in HARIMU_GRAY_PACK.
 *  Flag off: no grandCouncil key. The zzzzz- name sorts after zzzz-varkand-plebiscite-1094 so Node's --test-shard
 *  round-robin does not move earlier files between Postgres shards. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flagOn } from '../lib/flag-pack.mjs';
import { fulmaraGovernmentSnapshot, simulateGovernment, withFulmaraCouncil } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { FULMARA_COUNCIL_TERM_DAYS, FULMARA_COUNCIL_TERM_MS, FULMARA_LODESTAR_TERM_DAYS, FULMARA_LODESTAR_TERM_MS, FULMARA_TRIBUNE_SESSION_DAYS, FULMARA_TRIBUNE_SESSION_MS, fulmaraNextCouncilOfTenElectionAt, fulmaraNextLodestarElectionAt, fulmaraTribuneSessionEndsAt } from '../lib/fulmara-council.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const clocks = [fulmaraNextCouncilOfTenElectionAt, fulmaraNextLodestarElectionAt, fulmaraTribuneSessionEndsAt];

test('the Council of Ten and the Tribune session fall on a 30-real-day cycle, and the Lodestar on a 90-real-day cycle, from the Chair anchor', () => {
  assert.equal(FULMARA_COUNCIL_TERM_DAYS, 30);
  assert.equal(FULMARA_TRIBUNE_SESSION_DAYS, 30);
  assert.equal(FULMARA_LODESTAR_TERM_DAYS, 90);
  assert.equal(FULMARA_COUNCIL_TERM_MS, 30 * day);
  assert.equal(FULMARA_TRIBUNE_SESSION_MS, 30 * day);
  assert.equal(FULMARA_LODESTAR_TERM_MS, 90 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(fulmaraNextCouncilOfTenElectionAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + FULMARA_COUNCIL_TERM_MS);
  assert.equal(fulmaraTribuneSessionEndsAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + FULMARA_TRIBUNE_SESSION_MS);
  assert.equal(fulmaraNextLodestarElectionAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + FULMARA_LODESTAR_TERM_MS);
  for (let step = 0; step < 4; step++) {
    const councilAt = VARKAND_CHAIR_ANCHOR_MS + step * FULMARA_COUNCIL_TERM_MS;
    const lodestarAt = VARKAND_CHAIR_ANCHOR_MS + step * FULMARA_LODESTAR_TERM_MS;
    assert.equal(fulmaraNextCouncilOfTenElectionAt(councilAt), councilAt + FULMARA_COUNCIL_TERM_MS);
    assert.equal(fulmaraNextCouncilOfTenElectionAt(councilAt + 1), councilAt + FULMARA_COUNCIL_TERM_MS);
    assert.equal(fulmaraTribuneSessionEndsAt(councilAt), councilAt + FULMARA_TRIBUNE_SESSION_MS);
    assert.equal(fulmaraNextLodestarElectionAt(lodestarAt), lodestarAt + FULMARA_LODESTAR_TERM_MS);
    assert.equal(fulmaraNextLodestarElectionAt(lodestarAt + 1), lodestarAt + FULMARA_LODESTAR_TERM_MS);
  }
});

test('the boundaries at exactly 30 and 90 real days move to the following cycle, and the instant before stays on this one', () => {
  const councilBoundary = VARKAND_CHAIR_ANCHOR_MS + FULMARA_COUNCIL_TERM_MS;
  const lodestarBoundary = VARKAND_CHAIR_ANCHOR_MS + FULMARA_LODESTAR_TERM_MS;
  assert.equal(fulmaraNextCouncilOfTenElectionAt(councilBoundary - 1), councilBoundary);
  assert.equal(fulmaraNextCouncilOfTenElectionAt(councilBoundary), councilBoundary + FULMARA_COUNCIL_TERM_MS);
  assert.equal(fulmaraTribuneSessionEndsAt(councilBoundary - 1), councilBoundary);
  assert.equal(fulmaraTribuneSessionEndsAt(councilBoundary), councilBoundary + FULMARA_TRIBUNE_SESSION_MS);
  assert.equal(fulmaraNextLodestarElectionAt(councilBoundary), lodestarBoundary, 'a 30-day Council boundary is still inside the first Lodestar term');
  assert.equal(fulmaraNextLodestarElectionAt(lodestarBoundary - 1), lodestarBoundary);
  assert.equal(fulmaraNextLodestarElectionAt(lodestarBoundary), lodestarBoundary + FULMARA_LODESTAR_TERM_MS);
  assert.equal(fulmaraNextCouncilOfTenElectionAt(lodestarBoundary), lodestarBoundary + FULMARA_COUNCIL_TERM_MS);
  assert.equal(fulmaraTribuneSessionEndsAt(lodestarBoundary), lodestarBoundary + FULMARA_TRIBUNE_SESSION_MS);
  assert.equal(fulmaraNextCouncilOfTenElectionAt(VARKAND_CHAIR_ANCHOR_MS - 1), councilBoundary);
  assert.equal(fulmaraNextLodestarElectionAt(VARKAND_CHAIR_ANCHOR_MS - 1), lodestarBoundary);
  assert.equal(fulmaraTribuneSessionEndsAt(VARKAND_CHAIR_ANCHOR_MS - 1), councilBoundary);
});

test('the election and session timestamps are always safe integers', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, FULMARA_COUNCIL_TERM_MS, FULMARA_COUNCIL_TERM_MS - 1, FULMARA_LODESTAR_TERM_MS, FULMARA_LODESTAR_TERM_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    for (const clock of clocks) {
      const at = clock(now);
      assert.equal(Number.isSafeInteger(at), true, `${clock.name} ${now}`);
      assert.ok(at > VARKAND_CHAIR_ANCHOR_MS);
    }
    assert.equal(fulmaraNextCouncilOfTenElectionAt(now) % FULMARA_COUNCIL_TERM_MS, 0);
    assert.equal(fulmaraTribuneSessionEndsAt(now) % FULMARA_TRIBUNE_SESSION_MS, 0);
    assert.equal(fulmaraNextLodestarElectionAt(now) % FULMARA_LODESTAR_TERM_MS, 0);
    assert.equal(fulmaraTribuneSessionEndsAt(now), fulmaraNextCouncilOfTenElectionAt(now));
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no grandCouncil key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'fulmara' }), null);
  assert.equal(fulmaraGovernmentSnapshot(FULMARA_COUNCIL_TERM_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'hoarvale']) {
    const snapshot = nationId === 'varkand' || nationId === 'hoarvale'
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
      : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withFulmaraCouncil(snapshot, FULMARA_LODESTAR_TERM_MS, true), snapshot);
    assert.equal(withFulmaraCouncil(snapshot, FULMARA_LODESTAR_TERM_MS, false), snapshot);
    assert.equal('grandCouncil' in snapshot, false);
  }
  const hoarvale = simulateGovernment({ ...baseInput, nationId: 'hoarvale', hoarvaleAssent: true, now: 0 });
  assert.equal(withFulmaraCouncil(hoarvale, FULMARA_COUNCIL_TERM_MS, true), hoarvale);
  assert.equal('grandCouncil' in hoarvale, false);
  assert.equal('bills' in hoarvale, true);
  const fulmara = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'fulmara' };
  assert.equal(withFulmaraCouncil(fulmara, FULMARA_COUNCIL_TERM_MS, false), fulmara);
  assert.equal('grandCouncil' in fulmara, false);
  const on = withFulmaraCouncil(fulmara, FULMARA_COUNCIL_TERM_MS, true);
  assert.equal(on.grandCouncil.councilOfTenNextElectionAt, FULMARA_COUNCIL_TERM_MS + FULMARA_COUNCIL_TERM_MS);
  assert.equal(on.grandCouncil.councilOfTenTermDays, 30);
  assert.equal(on.grandCouncil.lodestarNextElectionAt, FULMARA_LODESTAR_TERM_MS);
  assert.equal(on.grandCouncil.lodestarTermDays, 90);
  assert.equal(on.grandCouncil.lodestarConsecutiveReelection, false);
  assert.equal(on.grandCouncil.tribuneSessionEndsAt, FULMARA_TRIBUNE_SESSION_MS + FULMARA_TRIBUNE_SESSION_MS);
  assert.equal(on.grandCouncil.tribuneVetoesPerSession, 1);
  assert.equal(Number.isSafeInteger(on.grandCouncil.councilOfTenNextElectionAt), true);
  assert.equal(Number.isSafeInteger(on.grandCouncil.lodestarNextElectionAt), true);
  assert.equal(Number.isSafeInteger(on.grandCouncil.tribuneSessionEndsAt), true);
  assert.equal('grandCouncil' in fulmara, false, 'the input snapshot is not mutated');
  assert.equal('directorate' in on, false);
  assert.equal('mandatePlebiscite' in on, false);
  const read = fulmaraGovernmentSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.grandCouncil.councilOfTenNextElectionAt, VARKAND_CHAIR_ANCHOR_MS + FULMARA_COUNCIL_TERM_MS);
  assert.equal(read.grandCouncil.lodestarNextElectionAt, VARKAND_CHAIR_ANCHOR_MS + FULMARA_LODESTAR_TERM_MS);
  assert.equal(read.grandCouncil.tribuneSessionEndsAt, VARKAND_CHAIR_ANCHOR_MS + FULMARA_TRIBUNE_SESSION_MS);
  assert.equal(read.grandCouncil.lodestarConsecutiveReelection, false);
  assert.equal(read.grandCouncil.tribuneVetoesPerSession, 1);
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.grandCouncil.councilOfTenNextElectionAt, read.grandCouncil.councilOfTenNextElectionAt);
  assert.equal(published.grandCouncil.lodestarNextElectionAt, read.grandCouncil.lodestarNextElectionAt);
  assert.equal(published.grandCouncil.tribuneSessionEndsAt, read.grandCouncil.tribuneSessionEndsAt);
  assert.equal(published.grandCouncil.lodestarConsecutiveReelection, false);
  assert.equal(published.grandCouncil.tribuneVetoesPerSession, 1);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).grandCouncil, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_FULMARA_COUNCIL_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_FULMARA_COUNCIL_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_FULMARA_COUNCIL_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_FULMARA_COUNCIL_ENABLED, 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_FULMARA_COUNCIL_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_FULMARA_COUNCIL_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_FULMARA_COUNCIL_ENABLED: 'false' }, 'HARIMU_FULMARA_COUNCIL_ENABLED'), false, 'a direct string wins');
});

test('flag off: the Fulmara government read is unchanged; flag on names the Council, Lodestar and Tribune dates; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const nowMs = seconds * 1000;
  const councilAt = fulmaraNextCouncilOfTenElectionAt(nowMs);
  const lodestarAt = fulmaraNextLodestarElectionAt(nowMs);
  const tribuneAt = fulmaraTribuneSessionEndsAt(nowMs);
  assert.equal(await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const on = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true });
  assert.equal(on.grandCouncil.councilOfTenNextElectionAt, councilAt);
  assert.equal(on.grandCouncil.councilOfTenTermDays, 30);
  assert.equal(on.grandCouncil.lodestarNextElectionAt, lodestarAt);
  assert.equal(on.grandCouncil.lodestarTermDays, 90);
  assert.equal(on.grandCouncil.lodestarConsecutiveReelection, false);
  assert.equal(on.grandCouncil.tribuneSessionEndsAt, tribuneAt);
  assert.equal(on.grandCouncil.tribuneVetoesPerSession, 1);
  assert.equal(Number.isSafeInteger(on.grandCouncil.councilOfTenNextElectionAt), true);
  assert.equal(Number.isSafeInteger(on.grandCouncil.lodestarNextElectionAt), true);
  assert.equal(Number.isSafeInteger(on.grandCouncil.tribuneSessionEndsAt), true);
  assert.equal('directorate' in on, false);
  assert.equal('mandatePlebiscite' in on, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, fulmaraCouncil: true });
    assert.equal(other == null || !('grandCouncil' in other), true, nationId);
  }
  const varkand = await gov.readGovernment(r.db, 'varkand', seconds, 'bob', { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, fulmaraCouncil: true });
  assert.equal('grandCouncil' in varkand, false);
  assert.equal('directorate' in varkand, true);
  assert.equal('mandatePlebiscite' in varkand, true);
  const hoarvale = await gov.readGovernment(r.db, 'hoarvale', seconds, 'bob', { readOnly: true, hoarvaleAssent: true, fulmaraCouncil: true });
  assert.equal('grandCouncil' in hoarvale, false);
  assert.equal('bills' in hoarvale, true);
  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_FULMARA_COUNCIL_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.grandCouncil.councilOfTenNextElectionAt, councilAt);
  assert.equal(packed.grandCouncil.lodestarNextElectionAt, lodestarAt);
  assert.equal(packed.grandCouncil.tribuneSessionEndsAt, tribuneAt);
  assert.equal(packed.grandCouncil.councilOfTenTermDays, 30);
  assert.equal(packed.grandCouncil.lodestarTermDays, 90);
  assert.equal(packed.grandCouncil.lodestarConsecutiveReelection, false);
  assert.equal(packed.grandCouncil.tribuneVetoesPerSession, 1);
  r.setFixtureEnv('HARIMU_FULMARA_COUNCIL_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('grandCouncil' in other), true);
});
