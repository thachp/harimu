/** #1113: Confluence Four Pillars and the next Party Congress on a fixed 150-real-day cycle
 *  from the Varkand Chair anchor (#1085). Flag HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED, packed in
 *  HARIMU_GRAY_PACK. Flag off: no party key. The zzzzzz- name sorts after zzzzz-ilmar-sanctum-1107
 *  so Node's --test-shard round-robin does not move earlier files between Postgres shards. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFLUENCE_CONGRESS_INTERVAL_DAYS, CONFLUENCE_CONGRESS_MS, CONFLUENCE_PILLARS, CONFLUENCE_TERM_LIMIT_CONGRESSES, confluenceNextPartyCongressAt } from '../lib/confluence-party.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { confluencePartySnapshot, simulateGovernment, withConfluenceParty } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const pillars = ['general_secretary', 'president', 'premier', 'assembly_chair'];

test('the next Party Congress falls on a 150-real-day cycle from the Chair anchor', () => {
  assert.equal(CONFLUENCE_CONGRESS_INTERVAL_DAYS, 150);
  assert.equal(CONFLUENCE_CONGRESS_MS, 150 * day);
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.deepEqual([...CONFLUENCE_PILLARS], pillars);
  assert.equal(CONFLUENCE_TERM_LIMIT_CONGRESSES, 2);
  assert.equal(confluenceNextPartyCongressAt(VARKAND_CHAIR_ANCHOR_MS), VARKAND_CHAIR_ANCHOR_MS + CONFLUENCE_CONGRESS_MS);
  for (let step = 0; step < 4; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * CONFLUENCE_CONGRESS_MS;
    assert.equal(confluenceNextPartyCongressAt(at), at + CONFLUENCE_CONGRESS_MS);
    assert.equal(confluenceNextPartyCongressAt(at + 1), at + CONFLUENCE_CONGRESS_MS);
  }
});

test('the boundary at exactly 150 real days moves to the following cycle, and the instant before stays on this one', () => {
  const boundary = VARKAND_CHAIR_ANCHOR_MS + CONFLUENCE_CONGRESS_MS;
  assert.equal(confluenceNextPartyCongressAt(boundary - 1), boundary);
  assert.equal(confluenceNextPartyCongressAt(boundary), boundary + CONFLUENCE_CONGRESS_MS);
  assert.equal(confluenceNextPartyCongressAt(boundary + CONFLUENCE_CONGRESS_MS - 1), boundary + CONFLUENCE_CONGRESS_MS);
  assert.equal(confluenceNextPartyCongressAt(VARKAND_CHAIR_ANCHOR_MS - 1), boundary);
});

test('nextCongressAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, CONFLUENCE_CONGRESS_MS, CONFLUENCE_CONGRESS_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const nextCongressAt = confluenceNextPartyCongressAt(now);
    assert.equal(Number.isSafeInteger(nextCongressAt), true, String(now));
    assert.ok(nextCongressAt > VARKAND_CHAIR_ANCHOR_MS);
    assert.equal(nextCongressAt % CONFLUENCE_CONGRESS_MS, 0);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no party key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'confluence' }), null);
  assert.equal(confluencePartySnapshot(CONFLUENCE_CONGRESS_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar', 'hoarvale']) {
    const snapshot = nationId === 'hoarvale'
      ? simulateGovernment({ ...baseInput, nationId, hoarvaleAssent: true, now: 0 })
      : nationId === 'varkand' || nationId === 'veldwood' || nationId === 'ilmar'
        ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
        : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withConfluenceParty(snapshot, CONFLUENCE_CONGRESS_MS, true), snapshot);
    assert.equal(withConfluenceParty(snapshot, CONFLUENCE_CONGRESS_MS, false), snapshot);
    assert.equal('party' in snapshot, false);
  }
  const confluence = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'confluence' };
  assert.equal(withConfluenceParty(confluence, day, false), confluence);
  assert.equal('party' in confluence, false);
  const on = withConfluenceParty(confluence, day, true);
  assert.deepEqual([...on.party.pillars], pillars);
  assert.equal(on.party.termLimitCongresses, 2);
  assert.equal(on.party.congressIntervalDays, 150);
  assert.equal(on.party.nextCongressAt, CONFLUENCE_CONGRESS_MS);
  assert.equal(Number.isSafeInteger(on.party.nextCongressAt), true);
  assert.equal('party' in confluence, false, 'the input snapshot is not mutated');
  assert.equal('sanctum' in on, false);
  assert.equal('federalCouncil' in on, false);
  assert.equal('directorate' in on, false);
  const read = confluencePartySnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.deepEqual([...read.party.pillars], pillars);
  assert.equal(read.party.termLimitCongresses, 2);
  assert.equal(read.party.congressIntervalDays, 150);
  assert.equal(read.party.nextCongressAt, VARKAND_CHAIR_ANCHOR_MS + CONFLUENCE_CONGRESS_MS);
  assert.deepEqual(read.roles.map(role => role.name), ['General Secretary', 'President', 'Premier', "Chair of the People's Assembly"]);
  const published = publicGovernmentSnapshot(read);
  assert.deepEqual([...published.party.pillars], pillars);
  assert.equal(published.party.termLimitCongresses, 2);
  assert.equal(published.party.nextCongressAt, read.party.nextCongressAt);
  assert.equal(published.party.congressIntervalDays, 150);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).party, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED, 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED: 'false' }, 'HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED'), false, 'a direct string wins');
});

test('flag off: the Confluence government read is unchanged; flag on names the Four Pillars and the next Congress; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const nextCongressAt = confluenceNextPartyCongressAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const on = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceParty: true });
  assert.deepEqual([...on.party.pillars], pillars);
  assert.equal(on.party.termLimitCongresses, 2);
  assert.equal(on.party.congressIntervalDays, 150);
  assert.equal(on.party.nextCongressAt, nextCongressAt);
  assert.equal(Number.isSafeInteger(on.party.nextCongressAt), true);
  assert.equal('sanctum' in on, false);
  assert.equal('federalCouncil' in on, false);
  assert.equal('directorate' in on, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'varkand', 'veldwood', 'ilmar']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, confluenceParty: true });
    assert.equal(other == null || !('party' in other), true, nationId);
  }
  const ilmar = await gov.readGovernment(r.db, 'ilmar', seconds, 'bob', { readOnly: true, ilmarSanctum: true, confluenceParty: true });
  assert.equal('party' in ilmar, false);
  assert.equal(ilmar.sanctum.oracleTerm, 'life');
  const veldwood = await gov.readGovernment(r.db, 'veldwood', seconds, 'bob', { readOnly: true, veldwoodCouncil: true, confluenceParty: true });
  assert.equal('party' in veldwood, false);
  assert.equal('federalCouncil' in veldwood, true);
  const varkand = await gov.readGovernment(r.db, 'varkand', seconds, 'bob', { readOnly: true, varkandDirectorate: true, varkandPlebiscite: true, confluenceParty: true });
  assert.equal('party' in varkand, false);
  assert.equal('directorate' in varkand, true);
  assert.equal('mandatePlebiscite' in varkand, true);
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.party.pillars, pillars);
  assert.equal(packed.party.termLimitCongresses, 2);
  assert.equal(packed.party.congressIntervalDays, 150);
  assert.equal(packed.party.nextCongressAt, nextCongressAt);
  r.setFixtureEnv('HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('party' in other), true);
});
