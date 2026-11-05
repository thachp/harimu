/** #1165: Confluence next Canal Festival once per game year (30 real days) from the Chair anchor (#1085).
 *  Flag HARIMU_CONFLUENCE_CANAL_FESTIVAL_ENABLED in HARIMU_GRAY_PACK. Flag off: no canalFestival key.
 *  Holds no festival, harvest yield, or bonus. Host city Lanu Terraces may be named.
 *  [ASSUMPTION] cadence = 30 real days; zero post-harvest offset. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { realDaysPerGameYear } from '../lib/election-calendars.ts';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, withConfluenceCanalFestival } from '../lib/government.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import {
  CONFLUENCE_CANAL_FESTIVAL_HOST_CITY,
  CONFLUENCE_CANAL_FESTIVAL_INTERVAL_DAYS,
  CONFLUENCE_CANAL_FESTIVAL_MS,
  confluenceNextCanalFestivalAt,
} from '../lib/confluence-canal-festival.ts';
import { VARKAND_CHAIR_ANCHOR_MS } from '../lib/varkand-directorate.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now: 0 };
const day = 86_400_000;
const F = 'HARIMU_CONFLUENCE_CANAL_FESTIVAL_ENABLED';
const cycle = 30 * day;
const expected = { nextAt: cycle, intervalDays: 30, hostCity: 'Lanu Terraces', holdsFestival: false };

test('Canal Festival is once per game year (30 real days) on the Chair anchor', () => {
  assert.equal(VARKAND_CHAIR_ANCHOR_MS, 0);
  assert.equal(CONFLUENCE_CANAL_FESTIVAL_INTERVAL_DAYS, 30);
  assert.equal(CONFLUENCE_CANAL_FESTIVAL_INTERVAL_DAYS, realDaysPerGameYear);
  assert.equal(CONFLUENCE_CANAL_FESTIVAL_MS, cycle);
  assert.equal(CONFLUENCE_CANAL_FESTIVAL_HOST_CITY, 'Lanu Terraces');
  assert.equal(confluenceNextCanalFestivalAt(VARKAND_CHAIR_ANCHOR_MS), cycle);
  assert.equal(confluenceNextCanalFestivalAt(cycle - 1), cycle);
  assert.equal(confluenceNextCanalFestivalAt(cycle), 2 * cycle);
  assert.equal(confluenceNextCanalFestivalAt(cycle + 1), 2 * cycle);
  assert.equal(confluenceNextCanalFestivalAt(-1), cycle);
  for (const now of [0, cycle * 3 + 7, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, 0.9, NaN, Infinity, -Infinity]) {
    const next = confluenceNextCanalFestivalAt(now);
    assert.equal(Number.isSafeInteger(next), true, String(now));
    assert.equal(next % cycle, 0, String(now));
    assert.ok(next > VARKAND_CHAIR_ANCHOR_MS, String(now));
  }
});

test('flag off leaves the snapshot unchanged; other nations gain no canalFestival key', () => {
  for (const nationId of ['hoarvale', 'korund', 'aurelle', 'kindle', 'veldwood', 'ilmar', 'meridian', 'varkand', 'fulmara']) {
    const snapshot = ['veldwood', 'ilmar', 'meridian', 'varkand', 'fulmara'].includes(nationId)
      ? { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId }
      : simulateGovernment({ ...baseInput, nationId });
    assert.equal(withConfluenceCanalFestival(snapshot, day, true), snapshot, nationId);
    assert.equal('canalFestival' in snapshot, false);
  }
  const confluence = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'confluence' };
  assert.equal(withConfluenceCanalFestival(confluence, day, false), confluence);
  const on = withConfluenceCanalFestival(confluence, day, true);
  assert.deepEqual(on.canalFestival, expected);
  assert.equal('canalFestival' in confluence, false, 'input not mutated');
  assert.deepEqual({ ...on, canalFestival: undefined }, { ...confluence, canalFestival: undefined }, 'holds no festival');
  assert.deepEqual(publicGovernmentSnapshot(on).canalFestival, on.canalFestival);
  assert.equal('canalFestival' in publicGovernmentSnapshot(confluence), false);
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

test('government read: flag off unchanged, flag on adds canalFestival, other nations unaffected', async t => {
  // Canal Festival rides on an existing Confluence read (Party schedule here); with every Confluence flag off the read stays null.
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const next = confluenceNextCanalFestivalAt(seconds * 1000);
  const off = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceParty: true });
  assert.equal(await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceCanalFestival: true }), null, 'no Confluence read: still null');
  assert.equal(off != null && 'canalFestival' in off, false, 'flag off');
  const on = await gov.readGovernment(r.db, 'confluence', seconds, 'alice', { readOnly: true, confluenceParty: true, confluenceCanalFestival: true });
  assert.deepEqual(on.canalFestival, { nextAt: next, intervalDays: 30, hostCity: 'Lanu Terraces', holdsFestival: false });
  assert.deepEqual({ ...on, canalFestival: undefined }, { ...off, canalFestival: undefined });
  for (const nationId of ['hoarvale', 'korund', 'aurelle', 'kindle', 'ilmar']) {
    const other = await gov.readGovernment(r.db, nationId, seconds, 'bob', { readOnly: true, confluenceCanalFestival: true });
    assert.equal(other == null || !('canalFestival' in other), true, nationId);
  }
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED: 'true' }));
  const before = (await r.call('citizen', 'alice')).data.government;
  assert.equal(before == null || !('canalFestival' in before), true, 'flag off');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED: 'true', [F]: 'true' }));
  assert.equal((await r.call('citizen', 'alice')).data.government.canalFestival.nextAt, next);
  assert.equal((await r.call('citizen', 'alice')).data.government.canalFestival.hostCity, 'Lanu Terraces');
  r.setFixtureEnv(F, 'false');
  const direct = (await r.call('citizen', 'alice')).data.government;
  assert.equal(direct == null || !('canalFestival' in direct), true, 'a direct false wins');
});
