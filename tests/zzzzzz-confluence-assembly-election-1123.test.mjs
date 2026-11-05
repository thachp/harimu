/** #1123: Confluence People's Assembly election window every 150 real days from the Chair anchor (#1085),
 *  the same anchor family as the #1113 Party Congress. Flag HARIMU_CONFLUENCE_ASSEMBLY_ELECTION_ENABLED in
 *  HARIMU_GRAY_PACK. Flag off: no assemblyElection key. Opens no ballot; leadership does not heed the result. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFLUENCE_ASSEMBLY_INTERVAL_DAYS, CONFLUENCE_ASSEMBLY_MS, confluenceLastAssemblyElectionAt, confluenceNextAssemblyElectionAt } from '../lib/confluence-assembly-election.ts';
import { CONFLUENCE_CONGRESS_MS, confluenceNextPartyCongressAt } from '../lib/confluence-party.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { confluencePartySnapshot, simulateGovernment, withConfluenceAssemblyElection } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const F = 'HARIMU_CONFLUENCE_ASSEMBLY_ELECTION_ENABLED';

test('the Assembly window is 150 real days on the Chair anchor, and the boundary moves to the next cycle', () => {
  assert.equal(CONFLUENCE_ASSEMBLY_INTERVAL_DAYS, 150);
  assert.equal(CONFLUENCE_ASSEMBLY_MS, 150 * day);
  assert.equal(CONFLUENCE_ASSEMBLY_MS, CONFLUENCE_CONGRESS_MS, 'same anchor family as the Party Congress');
  const b = VARKAND_CHAIR_ANCHOR_MS + CONFLUENCE_ASSEMBLY_MS;
  assert.equal(confluenceNextAssemblyElectionAt(VARKAND_CHAIR_ANCHOR_MS), b);
  assert.equal(confluenceNextAssemblyElectionAt(b - 1), b);
  assert.equal(confluenceNextAssemblyElectionAt(b), b + CONFLUENCE_ASSEMBLY_MS);
  assert.equal(confluenceLastAssemblyElectionAt(b - 1), VARKAND_CHAIR_ANCHOR_MS);
  assert.equal(confluenceLastAssemblyElectionAt(b), b);
  assert.equal(confluenceNextAssemblyElectionAt(-1), b);
  for (const now of [0, b * 3 + 7, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.9, NaN, Infinity, -Infinity]) {
    const next = confluenceNextAssemblyElectionAt(now), last = confluenceLastAssemblyElectionAt(now);
    assert.equal(Number.isSafeInteger(next) && Number.isSafeInteger(last), true, String(now));
    assert.equal(next - last, CONFLUENCE_ASSEMBLY_MS);
    assert.equal(next, confluenceNextPartyCongressAt(now));
  }
});

test('flag off leaves the snapshot unchanged; other nations gain no assemblyElection key', () => {
  assert.equal(confluencePartySnapshot(day, false, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle']) {
    const s = simulateGovernment({ ...baseInput, nationId });
    assert.equal(withConfluenceAssemblyElection(s, day, true), s);
  }
  const conf = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'confluence' };
  assert.equal(withConfluenceAssemblyElection(conf, day, false), conf);
  const on = withConfluenceAssemblyElection(conf, day, true);
  assert.deepEqual(on.assemblyElection, { cycleStartedAt: 0, nextElectionAt: CONFLUENCE_ASSEMBLY_MS, intervalDays: 150, ballotOpen: false, leadershipHeedsResult: false });
  assert.equal('assemblyElection' in conf, false, 'input not mutated');
  const only = confluencePartySnapshot(day, false, true);
  assert.equal('party' in only, false);
  assert.equal(only.assemblyElection.nextElectionAt, CONFLUENCE_ASSEMBLY_MS);
  const both = confluencePartySnapshot(day, true, true);
  assert.equal(both.party.nextCongressAt, both.assemblyElection.nextElectionAt);
  assert.deepEqual(publicGovernmentSnapshot(both).assemblyElection, both.assemblyElection);
  assert.equal('assemblyElection' in confluencePartySnapshot(day, true, false), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[F], undefined);
  assert.equal(prod.vars[F], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[F], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[F], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, F), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [F]: 'false' }, F), false);
});

test('government read: flag off unchanged, flag on adds the window, other nations unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const next = confluenceNextAssemblyElectionAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true }), null);
  const party = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceParty: true });
  assert.equal('assemblyElection' in party, false);
  const on = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceAssemblyElection: true });
  assert.equal(on.assemblyElection.nextElectionAt, next);
  assert.equal(on.assemblyElection.ballotOpen, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'ilmar']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, confluenceAssemblyElection: true });
    assert.equal(other == null || !('assemblyElection' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [F]: 'true' }));
  assert.equal((await r.call('citizen', 'alice')).data.government.assemblyElection.nextElectionAt, next);
  r.setFixtureEnv(F, 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins');
});
