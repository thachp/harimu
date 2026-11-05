/** #1169: Confluence next Quota Day, once per game year (30 real days) from the Varkand Chair anchor (#1085).
 *  Flag HARIMU_CONFLUENCE_QUOTA_DAY_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no quotaDay key.
 *  The read states no quota, target, or bonus. It rides on an existing Confluence read (Party schedule or
 *  People's Assembly), the same wiring as #1165. The zzzzzzzzzzzz- name sorts after zzzzzzzzzzz-. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFLUENCE_QUOTA_DAY_CYCLE_DAYS, CONFLUENCE_QUOTA_DAY_CYCLE_MS, confluenceNextQuotaDayAt } from '../lib/confluence-quota-day.ts';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withConfluenceQuotaDay } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = CONFLUENCE_QUOTA_DAY_CYCLE_MS;
const key = 'HARIMU_CONFLUENCE_QUOTA_DAY_ENABLED';
const block = nextAt => ({ nextAt, cycleDays: 30 });
const banned = ['target', 'bonus', 'amount', 'output', 'fulfilled', 'figure'];

test('the next Quota Day falls once per game year (30 real days) from the Chair anchor', () => {
  assert.equal(anchor, 0);
  assert.equal(CONFLUENCE_QUOTA_DAY_CYCLE_DAYS, 30);
  assert.equal(CONFLUENCE_QUOTA_DAY_CYCLE_DAYS, realDaysPerGameYear, 'once per the existing world-clock game year');
  assert.equal(cycle, 30 * day);
  assert.equal(confluenceNextQuotaDayAt(anchor), anchor + cycle);
  assert.equal(confluenceNextQuotaDayAt(anchor - 1), anchor + cycle);
  assert.equal(confluenceNextQuotaDayAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(confluenceNextQuotaDayAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(confluenceNextQuotaDayAt(anchor + cycle + 1), anchor + 2 * cycle);
  assert.equal(confluenceNextQuotaDayAt(anchor + 29 * day), anchor + cycle, 'day 29 is still this game year');
});

test('Quota Day timestamps are safe integers on the 30-day cycle', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity, 1_793_000_000_000]) {
    const nextAt = confluenceNextQuotaDayAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
    if (Number.isFinite(now) && now >= 0 && now < Number.MAX_SAFE_INTEGER - cycle) assert.ok(nextAt > now && nextAt - now <= cycle, String(now));
  }
});

test('flag off leaves the Confluence snapshot unchanged, and other nations gain no quotaDay key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'confluence' }), null);
  const confluence = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'confluence' };
  assert.equal(withConfluenceQuotaDay(confluence, cycle, false), confluence);
  assert.equal('quotaDay' in confluence, false);
  const on = withConfluenceQuotaDay(confluence, cycle, true);
  assert.deepEqual(on.quotaDay, block(2 * cycle));
  assert.deepEqual(Object.keys(on.quotaDay).sort(), ['cycleDays', 'nextAt']);
  for (const word of banned) assert.equal(JSON.stringify(on.quotaDay).includes(word), false, word);
  assert.equal(on.decision, confluence.decision, 'the proposal is not rewritten');
  assert.equal('quotaDay' in confluence, false, 'the input is not mutated');
  assert.equal('party' in on, false);
  assert.equal('assemblyElection' in on, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'hoarvale', 'fulmara', 'veldwood']) {
    const snapshot = ['kindle', 'korund', 'aurelle', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withConfluenceQuotaDay(snapshot, day, true), snapshot, nationId);
    assert.equal(withConfluenceQuotaDay(snapshot, day, false), snapshot, nationId);
    assert.equal('quotaDay' in snapshot, false, nationId);
  }
  const published = publicGovernmentSnapshot(on);
  assert.deepEqual(published.quotaDay, on.quotaDay);
  assert.equal('quotaDay' in publicGovernmentSnapshot(confluence), false);
  assert.equal('quotaDay' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-4), key, '#1170/#1175/#1178 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-4), key);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-5), 'HARIMU_CONFLUENCE_CANAL_FESTIVAL_ENABLED');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-3), 'HARIMU_KORUND_PEOPLES_CONGRESS_ENABLED');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-2), 'HARIMU_MERIDIAN_TURBINE_DAY_ENABLED');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-1), 'HARIMU_FULMARA_GRAND_REGATTA_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Confluence government read is unchanged; flag on adds quotaDay; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(confluenceNextQuotaDayAt(seconds * 1000));
  assert.equal(await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true }), null, 'flag off');
  assert.equal(await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceQuotaDay: true }), null, 'Quota Day alone does not open a Confluence read');
  const partyOnly = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceParty: true });
  assert.equal('quotaDay' in partyOnly, false, 'party on, Quota Day off: no quotaDay key');
  assert.equal('party' in partyOnly, true);
  const assemblyOnly = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceAssemblyElection: true });
  assert.equal('quotaDay' in assemblyOnly, false, 'assembly on, Quota Day off: no quotaDay key');
  const onParty = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceParty: true, confluenceQuotaDay: true });
  assert.deepEqual(onParty.quotaDay, expected);
  assert.equal(Number.isSafeInteger(onParty.quotaDay.nextAt), true);
  assert.deepEqual(Object.keys(onParty.quotaDay).sort(), ['cycleDays', 'nextAt']);
  for (const word of banned) assert.equal(JSON.stringify(onParty.quotaDay).includes(word), false, word);
  assert.equal(onParty.party.nextCongressAt, partyOnly.party.nextCongressAt);
  assert.equal('assemblyElection' in onParty, false);
  const onAssembly = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceAssemblyElection: true, confluenceQuotaDay: true });
  assert.deepEqual(onAssembly.quotaDay, expected);
  assert.equal(onAssembly.assemblyElection.nextElectionAt, assemblyOnly.assemblyElection.nextElectionAt);
  assert.equal('party' in onAssembly, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'fulmara', 'veldwood', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, confluenceQuotaDay: true });
    assert.equal(other == null || !('quotaDay' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED: 'true' }));
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('quotaDay' in before), true, 'flag off leaves the citizen read without quotaDay');
  assert.equal('party' in before, true);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED: 'true', [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.quotaDay, expected);
  assert.equal(packed.party.nextCongressAt, partyOnly.party.nextCongressAt);
  r.setFixtureEnv(key, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('quotaDay' in direct), true, 'a direct false wins over the pack');
  assert.equal(direct.party.nextCongressAt, partyOnly.party.nextCongressAt);
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_CONFLUENCE_ASSEMBLY_ELECTION_ENABLED: 'true', [key]: 'true' }));
  r.setFixtureEnv(key, undefined);
  const assemblyPacked = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(assemblyPacked.quotaDay, expected);
  assert.equal(assemblyPacked.assemblyElection.nextElectionAt, assemblyOnly.assemblyElection.nextElectionAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('quotaDay' in other), true);
});
