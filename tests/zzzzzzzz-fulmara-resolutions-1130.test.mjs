/** #1130: Fulmara shareholder resolutions on the government read (title, status, share totals).
 *  Flag HARIMU_FULMARA_RESOLUTIONS_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no resolutions key.
 *  The zzzzzzzz- name sorts after zzzzzzz- so Node's --test-shard round-robin does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flagOn } from '../lib/flag-pack.mjs';
import { fulmaraGovernmentSnapshot, fulmaraResolutionsSnapshot, simulateGovernment, withFulmaraResolutions } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { FULMARA_SHARE_REGISTER, fulmaraResolutionStatus, fulmaraResolutions } from '../lib/fulmara-resolutions.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const resolutionKeys = ['id', 'shares', 'status', 'title'];
const shareKeys = ['abstain', 'against', 'for'];
const posted = [
  { id: 'fulmara-kindle-convoy', title: 'Route charter: Kindle convoy', status: 'open', shares: { for: 420, against: 180, abstain: 40 } },
  { id: 'fulmara-arc-share-issue', title: 'Share issue: Arc Exchange expansion', status: 'open', shares: { for: 610, against: 240, abstain: 30 } },
  { id: 'fulmara-reserve-band', title: 'Reserve rule: Bank of the Arc band', status: 'carried', shares: { for: 640, against: 210, abstain: 50 } },
  { id: 'fulmara-meridian-compact', title: 'Alliance: trade compact with Meridian', status: 'lost', shares: { for: 280, against: 510, abstain: 70 } },
];

test('the posted register is four resolutions with titles, status, and share totals inside 1,000 shares', () => {
  assert.equal(FULMARA_SHARE_REGISTER, 1000);
  const rows = fulmaraResolutions();
  assert.deepEqual(rows, posted);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), resolutionKeys);
    assert.deepEqual(Object.keys(row.shares).sort(), shareKeys);
    for (const count of Object.values(row.shares)) assert.equal(Number.isSafeInteger(count) && count >= 0, true);
    assert.ok(row.shares.for + row.shares.against + row.shares.abstain <= FULMARA_SHARE_REGISTER, row.id);
  }
  rows[0].shares.for = 0;
  assert.equal(fulmaraResolutions()[0].shares.for, 420, 'a caller cannot change the posted register');
});

test('a closed share issue needs 2/3 of for and against, abstain does not count, and an open tally stays open', () => {
  assert.equal(fulmaraResolutionStatus(false, 'share_issue', { for: 2, against: 1, abstain: 0 }), 'carried', 'exactly 2/3 carries');
  assert.equal(fulmaraResolutionStatus(false, 'share_issue', { for: 610, against: 240, abstain: 30 }), 'carried');
  assert.equal(fulmaraResolutionStatus(false, 'share_issue', { for: 2, against: 2, abstain: 0 }), 'lost');
  assert.equal(fulmaraResolutionStatus(true, 'share_issue', { for: 610, against: 240, abstain: 30 }), 'open');
  assert.equal(fulmaraResolutionStatus(false, 'charter', { for: 6, against: 5, abstain: 0 }), 'carried');
  assert.equal(fulmaraResolutionStatus(false, 'alliance', { for: 5, against: 5, abstain: 100 }), 'lost', 'a tie is lost and abstain is not a vote for');
  assert.equal(fulmaraResolutionStatus(false, 'reserve_rule', { for: 0, against: 0, abstain: 10 }), 'lost');
});

test('flag off leaves the snapshot unchanged, and other nations gain no resolutions key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'fulmara' }), null);
  assert.equal(fulmaraResolutionsSnapshot(false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : nationId === 'varkand'
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withFulmaraResolutions(snapshot, true), snapshot);
    assert.equal(withFulmaraResolutions(snapshot, false), snapshot);
    assert.equal('resolutions' in snapshot, false);
  }
  const fulmara = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'fulmara' };
  assert.equal(withFulmaraResolutions(fulmara, false), fulmara);
  assert.equal('resolutions' in fulmara, false);
  const on = withFulmaraResolutions(fulmara, true);
  assert.deepEqual(on.resolutions, posted);
  assert.equal('resolutions' in fulmara, false, 'the input snapshot is not mutated');
  assert.equal('grandCouncil' in on, false);
  const read = fulmaraResolutionsSnapshot(true);
  assert.deepEqual(read.resolutions, posted);
  assert.equal(read.decision.proposedSpendMinor, 0);
  assert.equal(read.decision.reason.includes('opens no ballot'), true);
  assert.equal('grandCouncil' in read, false);
  const published = publicGovernmentSnapshot(read);
  assert.deepEqual(published.resolutions, posted);
  assert.deepEqual(Object.keys(published.resolutions[0]).sort(), resolutionKeys);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).resolutions, undefined);
  const councilOnly = fulmaraGovernmentSnapshot(0, true);
  assert.equal('resolutions' in councilOnly, false, 'the Council read is unchanged while this flag is off');
  assert.equal('grandCouncil' in councilOnly, true);
  const both = withFulmaraResolutions(councilOnly, true);
  assert.deepEqual(both.resolutions, posted);
  assert.equal(both.grandCouncil.councilOfTenTermDays, 30);
  assert.equal(both.grandCouncil.lodestarTermDays, 90);
  assert.equal('resolutions' in councilOnly, false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_FULMARA_RESOLUTIONS_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_FULMARA_RESOLUTIONS_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_FULMARA_RESOLUTIONS_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_FULMARA_RESOLUTIONS_ENABLED, 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_FULMARA_RESOLUTIONS_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_FULMARA_RESOLUTIONS_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_FULMARA_RESOLUTIONS_ENABLED: 'false' }, 'HARIMU_FULMARA_RESOLUTIONS_ENABLED'), false, 'a direct string wins');
});

test('flag off: the Fulmara government read is unchanged; flag on posts the resolutions; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  assert.equal(await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const councilOnly = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true });
  assert.equal('resolutions' in councilOnly, false, 'council on, resolutions off: no resolutions key');
  assert.equal('grandCouncil' in councilOnly, true);
  const on = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraResolutions: true });
  assert.deepEqual(on.resolutions, posted);
  assert.equal('grandCouncil' in on, false, 'resolutions alone do not add the Council clocks');
  const both = await gov.readGovernment(r.db, 'fulmara', seconds, 'alice', { readOnly: true, fulmaraCouncil: true, fulmaraResolutions: true });
  assert.deepEqual(both.resolutions, posted);
  assert.equal(both.grandCouncil.councilOfTenNextElectionAt, councilOnly.grandCouncil.councilOfTenNextElectionAt);
  assert.equal(both.grandCouncil.lodestarNextElectionAt, councilOnly.grandCouncil.lodestarNextElectionAt);
  assert.equal(both.grandCouncil.tribuneSessionEndsAt, councilOnly.grandCouncil.tribuneSessionEndsAt);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'ilmar', 'confluence']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, fulmaraResolutions: true });
    assert.equal(other == null || !('resolutions' in other), true, nationId);
  }
  const varkand = await gov.readGovernment(r.db, 'varkand', seconds, 'bob', { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, fulmaraResolutions: true });
  assert.equal('resolutions' in varkand, false);
  assert.equal('directorate' in varkand, true);
  await r.db.prepare("UPDATE citizens SET nation_id='fulmara' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_FULMARA_RESOLUTIONS_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.resolutions, posted);
  assert.equal('grandCouncil' in packed, false);
  r.setFixtureEnv('HARIMU_FULMARA_RESOLUTIONS_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_FULMARA_COUNCIL_ENABLED: 'true', HARIMU_FULMARA_RESOLUTIONS_ENABLED: 'true' }));
  r.setFixtureEnv('HARIMU_FULMARA_RESOLUTIONS_ENABLED', undefined);
  const together = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(together.resolutions, posted);
  assert.equal(together.grandCouncil.tribuneVetoesPerSession, 1);
  r.setFixtureEnv('HARIMU_FULMARA_RESOLUTIONS_ENABLED', 'false');
  const councilPacked = (await r.call('citizen', 'alice')).data.government;
  assert.equal('resolutions' in councilPacked, false, 'flag off leaves the Council read unchanged');
  assert.equal(councilPacked.grandCouncil.councilOfTenTermDays, 30);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('resolutions' in other), true);
});
