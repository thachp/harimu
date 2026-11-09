/** #1183: Confluence next Congress Lanterns, once per game year (30 real days) from the Varkand Chair anchor.
 *  No offset. The helper takes nowMs only and returns the next date only.
 *  Flag HARIMU_CONFLUENCE_CONGRESS_LANTERNS_ENABLED in HARIMU_GRAY_PACK; #1187 follows.
 *  Flag off: no congressLanterns key. Date only: no lantern count, delegate list, or Party text.
 *  It rides on an existing Confluence read (Party schedule or People's Assembly), the same wiring as #1169.
 *  The zzzzzzzzzzzzz- name sorts after zzzzzzzzzzzz- files so --test-shard does not move earlier files. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONFLUENCE_CONGRESS_LANTERNS_CYCLE_DAYS, CONFLUENCE_CONGRESS_LANTERNS_CYCLE_MS, confluenceNextCongressLanternsAt } from '../lib/confluence-congress-lanterns.ts';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { simulateGovernment, withConfluenceCongressLanterns } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };
const day = 86_400_000;
const anchor = VARKAND_CHAIR_ANCHOR_MS;
const cycle = CONFLUENCE_CONGRESS_LANTERNS_CYCLE_MS;
const key = 'HARIMU_CONFLUENCE_CONGRESS_LANTERNS_ENABLED';
const block = nextAt => ({ nextAt, cycleDays: 30 });
const banned = ['count', 'delegate', 'persona', 'pillar', 'secretary', 'window', 'endsAt'];

test('the next Congress Lanterns falls once per game year (30 real days) from the Chair anchor, with no offset', () => {
  assert.equal(anchor, 0);
  assert.equal(CONFLUENCE_CONGRESS_LANTERNS_CYCLE_DAYS, 30);
  assert.equal(CONFLUENCE_CONGRESS_LANTERNS_CYCLE_DAYS, realDaysPerGameYear);
  assert.equal(cycle, 30 * day);
  assert.equal(confluenceNextCongressLanternsAt(anchor), anchor + cycle);
  assert.equal(confluenceNextCongressLanternsAt(anchor - 1), anchor + cycle);
  assert.equal(confluenceNextCongressLanternsAt(anchor + cycle - 1), anchor + cycle);
  assert.equal(confluenceNextCongressLanternsAt(anchor + cycle), anchor + 2 * cycle);
  assert.equal(confluenceNextCongressLanternsAt(anchor + 29 * day), anchor + cycle);
  assert.equal(confluenceNextCongressLanternsAt.length, 1, 'nowMs only');
});

test('Congress Lanterns timestamps are safe integers on the 30-day cycle and store no window', () => {
  for (const now of [anchor, cycle, cycle - 1, cycle + 0.5, 0.9, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, -Infinity]) {
    const nextAt = confluenceNextCongressLanternsAt(now);
    assert.equal(Number.isSafeInteger(nextAt), true, String(now));
    assert.equal(nextAt % cycle, 0, String(now));
    assert.ok(nextAt > anchor, String(now));
    assert.equal(typeof nextAt, 'number');
  }
});

test('flag off leaves the Confluence snapshot unchanged, and other nations gain no congressLanterns key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'confluence' }), null);
  const confluence = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'confluence' };
  assert.equal(withConfluenceCongressLanterns(confluence, cycle, false), confluence);
  assert.equal('congressLanterns' in confluence, false);
  const on = withConfluenceCongressLanterns(confluence, cycle, true);
  assert.deepEqual(on.congressLanterns, block(2 * cycle));
  assert.deepEqual(Object.keys(on.congressLanterns).sort(), ['cycleDays', 'nextAt']);
  for (const word of banned) assert.equal(JSON.stringify(on.congressLanterns).includes(word), false, word);
  assert.equal(on.decision, confluence.decision);
  assert.equal('congressLanterns' in confluence, false, 'the input is not mutated');
  assert.equal('party' in on, false);
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'hoarvale', 'fulmara', 'veldwood']) {
    const snapshot = ['kindle', 'korund', 'aurelle', 'hoarvale'].includes(nationId)
      ? simulateGovernment({ ...baseInput, nationId, ...(nationId === 'hoarvale' ? { hoarvaleAssent: true, now: 0 } : {}) })
      : { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId };
    assert.equal(withConfluenceCongressLanterns(snapshot, day, true), snapshot, nationId);
    assert.equal('congressLanterns' in snapshot, false, nationId);
  }
  const published = publicGovernmentSnapshot(on);
  assert.deepEqual(published.congressLanterns, on.congressLanterns);
  assert.equal('congressLanterns' in publicGovernmentSnapshot(confluence), false);
  assert.equal('congressLanterns' in publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })), false);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[key], undefined, 'not its own text binding');
  assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[key], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-6), key, '#1187 and #1189 follow this flag');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-6), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-6), key);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), 'HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), 'HARIMU_AURELLE_CORONATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, key), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, key), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [key]: 'false' }, key), false, 'a direct string wins');
});

test('flag off: the Confluence government read is unchanged; flag on adds congressLanterns; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = block(confluenceNextCongressLanternsAt(seconds * 1000));
  assert.equal(await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true }), null, 'flag off');
  assert.equal(await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceCongressLanterns: true }), null, 'Congress Lanterns alone does not open a Confluence read');
  const partyOnly = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceParty: true });
  assert.equal('congressLanterns' in partyOnly, false, 'party on, lanterns off: no congressLanterns key');
  const onParty = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceParty: true, confluenceCongressLanterns: true });
  assert.deepEqual(onParty.congressLanterns, expected);
  assert.equal(onParty.party.nextCongressAt, partyOnly.party.nextCongressAt, 'the 150-day Party Congress is unchanged');
  assert.equal('quotaDay' in onParty, false);
  assert.equal('canalFestival' in onParty, false);
  const onAssembly = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceAssemblyElection: true, confluenceCongressLanterns: true });
  assert.deepEqual(onAssembly.congressLanterns, expected);
  assert.equal('party' in onAssembly, false);
  const together = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceParty: true, confluenceCanalFestival: true, confluenceQuotaDay: true, confluenceCongressLanterns: true });
  assert.deepEqual(together.congressLanterns, expected);
  assert.equal(together.party.nextCongressAt, partyOnly.party.nextCongressAt);
  assert.equal(together.quotaDay.cycleDays, 30);
  assert.equal(together.canalFestival.hostCity, 'Lanu Terraces');
  for (const nationId of ['kindle', 'korund', 'aurelle', 'meridian', 'varkand', 'ilmar', 'fulmara', 'veldwood', 'hoarvale']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, confluenceCongressLanterns: true });
    assert.equal(other == null || !('congressLanterns' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED: 'true' }));
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('congressLanterns' in before), true, 'flag off leaves the citizen read without congressLanterns');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED: 'true', [key]: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.deepEqual(packed.congressLanterns, expected);
  for (const word of banned) assert.equal(JSON.stringify(packed.congressLanterns).includes(word), false, word);
  r.setFixtureEnv(key, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('congressLanterns' in direct), true, 'a direct false wins over the pack');
  assert.equal(direct.party.nextCongressAt, partyOnly.party.nextCongressAt);
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal(other == null || !('congressLanterns' in other), true);
});
