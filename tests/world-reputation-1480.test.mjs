/** #1480: World Reputation shows the broken-treaty record behind each nation's score. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { worldReputation, withWorldReputationRecord, worldReputationRecordLimit, worldReputationGameDay, treatyBreakPenalty, treatyNations } from '../lib/diplomacy-rules.ts';

const D = 86_400;
const zero = { score: 0, brokenPacts: 0, record: [], earlierBreaks: 0 };
const zeros = () => Object.fromEntries(treatyNations.map((nation) => [nation, { ...zero, record: [] }]));
const gameDaySeconds = D / 12;
const breakItem = (over = {}) => ({ kind: 'non-aggression', status: 'broken', brokenBy: 'aurelle', proposer: 'kindle', other: 'aurelle', brokenAt: 100, id: 't', ...over });
const expectedBreak = (epoch, brokenAt, other) => ({ other, kind: 'non-aggression', brokenAt, brokenGameDay: worldReputationGameDay(epoch, brokenAt), penalty: -10 });

test('#1480 pure helper: newest first, trade excluded, cap of 10 with overflow, both sides of a pair, game day from the clock', () => {
  assert.equal(worldReputationRecordLimit, 10);
  assert.equal(treatyBreakPenalty['non-aggression'].reputation, -10);
  assert.equal(treatyBreakPenalty.trade.reputation, 0);
  const epoch = 1_000_000;
  assert.equal(worldReputationGameDay(epoch, epoch), 1);
  assert.equal(worldReputationGameDay(epoch, epoch + gameDaySeconds), 2);
  assert.deepEqual(withWorldReputationRecord(worldReputation([]), [], epoch), zeros());

  const older = breakItem({ id: 't-old', brokenAt: epoch + gameDaySeconds, brokenBy: 'aurelle' });
  const newer = breakItem({ id: 't-new', brokenAt: epoch + 5 * gameDaySeconds, brokenBy: 'aurelle' });
  const trade = breakItem({ id: 't-trade', kind: 'trade', brokenAt: epoch + 9 * gameDaySeconds, brokenBy: 'aurelle' });
  const kindleAsOther = breakItem({ id: 't-korund-proposer', proposer: 'korund', other: 'kindle', brokenBy: 'korund', brokenAt: epoch + 2 * gameDaySeconds });
  const kindleAsProposer = breakItem({ id: 't-korund-other', proposer: 'kindle', other: 'korund', brokenBy: 'korund', brokenAt: epoch + 3 * gameDaySeconds });
  const kindleBroke = breakItem({ id: 't-kindle-broke', proposer: 'kindle', other: 'korund', brokenBy: 'kindle', brokenAt: epoch + 4 * gameDaySeconds });
  const attached = withWorldReputationRecord(worldReputation([older, newer, trade, kindleAsOther, kindleAsProposer, kindleBroke]), [older, newer, trade, kindleAsOther, kindleAsProposer, kindleBroke], epoch);
  assert.deepEqual(attached.aurelle.record, [
    expectedBreak(epoch, newer.brokenAt, 'kindle'),
    expectedBreak(epoch, older.brokenAt, 'kindle'),
  ], 'newest first; a trade break is omitted');
  assert.equal(attached.aurelle.score, -20);
  assert.equal(attached.aurelle.brokenPacts, 2);
  assert.equal(attached.aurelle.earlierBreaks, 0);
  assert.deepEqual(attached.korund.record, [
    expectedBreak(epoch, kindleAsProposer.brokenAt, 'kindle'),
    expectedBreak(epoch, kindleAsOther.brokenAt, 'kindle'),
  ], 'Korund as other and Korund as proposer both appear, with Kindle as the counterparty');
  assert.deepEqual(attached.kindle.record, [expectedBreak(epoch, kindleBroke.brokenAt, 'korund')], 'the other direction (Kindle broke with Korund) is on Kindle, not Korund');
  assert.equal(attached.korund.record.some((item) => item.other === 'aurelle'), false);

  const many = Array.from({ length: 12 }, (_, i) => breakItem({ id: `t-${String(12 - i).padStart(2, '0')}`, brokenAt: epoch + (12 - i) * gameDaySeconds, brokenBy: 'aurelle' }));
  const scored = worldReputation(many);
  assert.equal(scored.aurelle.score, -120);
  assert.equal(scored.aurelle.brokenPacts, 12);
  const capped = withWorldReputationRecord(scored, many, epoch);
  assert.equal(capped.aurelle.score, -120, 'the score still counts all 12 breaks');
  assert.equal(capped.aurelle.brokenPacts, 12);
  assert.equal(capped.aurelle.record.length, 10);
  assert.deepEqual(capped.aurelle.record.map((item) => item.brokenGameDay), [13, 12, 11, 10, 9, 8, 7, 6, 5, 4], 'the 10 most recent game days are kept');
  assert.equal(capped.aurelle.earlierBreaks, 2);
  assert.equal(capped.kindle.earlierBreaks, 0);
  assert.deepEqual(capped.kindle.record, []);
});

async function insertTreaty(r, { id, kind, proposer, other, status, brokenBy, proposedAt, endedAt, now }) {
  const pair = [proposer, other].sort().join(':');
  const at = proposedAt ?? now - 10;
  const ended = status === 'broken' ? (endedAt ?? at + 5) : null;
  const ends = at + 90 * D;
  await r.db.prepare('INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `r-${id}`, pair, kind, proposer, other, 'AI', at, status, at, at, ends, ended, status === 'broken' ? brokenBy : null).run();
}

for (const backend of ['sqlite', 'postgres']) {
  test(`#1480 citizen and world include the ordered record, exclude a trade break, and cap at 10 with overflow (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      const now = Math.floor(r.now / 1000);
      const preview = await r.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      for (let day = 1; day <= 12; day += 1) {
        await insertTreaty(r, { id: `t-aurelle-${String(day).padStart(2, '0')}`, kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now, proposedAt: epoch + day, endedAt: epoch + day * gameDaySeconds });
      }
      await insertTreaty(r, { id: 't-trade', kind: 'trade', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'kindle', now, proposedAt: epoch + 20, endedAt: epoch + 20 * gameDaySeconds });

      const bobCitizen = await r.call('citizen', 'bob');
      assert.equal(bobCitizen.status, 200);
      assert.equal(bobCitizen.cache, 'private, no-store');
      const aurelle = bobCitizen.data.simulation.reputation.aurelle;
      assert.equal(aurelle.score, -120, 'the score still counts all 12 NAP breaks');
      assert.equal(aurelle.brokenPacts, 12);
      assert.equal(aurelle.record.length, 10);
      assert.deepEqual(aurelle.record.map((item) => item.brokenGameDay), [13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
      assert.deepEqual(aurelle.record[0], expectedBreak(epoch, epoch + 12 * gameDaySeconds, 'kindle'));
      assert.equal(aurelle.earlierBreaks, 2);
      assert.deepEqual(bobCitizen.data.simulation.reputation.kindle.record, [], 'a trade break is not in the record');
      assert.equal(bobCitizen.data.simulation.reputation.kindle.score, 0);
      assert.equal(bobCitizen.data.simulation.reputation.kindle.brokenPacts, 0);

      const bobWorld = await r.call('world', 'bob');
      assert.deepEqual(bobWorld.data.simulation.reputation.aurelle.record.map((item) => item.brokenGameDay), [13, 12, 11, 10, 9, 8, 7, 6, 5, 4], 'GET /api/world uses the same 10-cap record');
      assert.equal(bobWorld.data.simulation.reputation.aurelle.earlierBreaks, 2);
      const signedOut = await r.call('world', null);
      assert.equal(signedOut.data.simulation.reputation.aurelle.earlierBreaks, 2, 'a signed-out GET /api/world still includes the record');
      assert.deepEqual(Object.keys(signedOut.data.simulation.reputation).sort(), ['aurelle', 'kindle', 'korund']);
    } finally {
      await r.close();
    }
  });

  test(`#1480 a Korund viewer keeps only Korund's record, including both sides of a Korund pair (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      const preview = await r.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      await insertTreaty(r, { id: 't-foreign', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now, proposedAt: epoch + 1, endedAt: epoch + 1 * gameDaySeconds });
      await insertTreaty(r, { id: 't-korund-proposer', kind: 'non-aggression', proposer: 'korund', other: 'kindle', status: 'broken', brokenBy: 'korund', now, proposedAt: epoch + 2, endedAt: epoch + 2 * gameDaySeconds });
      await insertTreaty(r, { id: 't-korund-other', kind: 'non-aggression', proposer: 'aurelle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: epoch + 3, endedAt: epoch + 3 * gameDaySeconds });
      await insertTreaty(r, { id: 't-kindle-broke', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'kindle', now, proposedAt: epoch + 4, endedAt: epoch + 4 * gameDaySeconds });

      const aliceCitizen = await r.call('citizen', 'alice');
      assert.equal(aliceCitizen.status, 200);
      assert.equal(aliceCitizen.cache, 'private, no-store');
      const korund = aliceCitizen.data.simulation.reputation.korund;
      assert.deepEqual(korund.record, [
        expectedBreak(epoch, epoch + 3 * gameDaySeconds, 'aurelle'),
        expectedBreak(epoch, epoch + 2 * gameDaySeconds, 'kindle'),
      ], 'a Korund viewer keeps both Korund breaks (Korund as other and as proposer)');
      assert.equal(korund.score, -20);
      assert.equal(korund.brokenPacts, 2);
      assert.ok(!('aurelle' in aliceCitizen.data.simulation.reputation) && !('kindle' in aliceCitizen.data.simulation.reputation), 'a Korund viewer does not receive a non-Korund reputation record');
      assert.deepEqual(Object.keys(aliceCitizen.data.simulation.reputation).sort(), ['korund']);

      const aliceWorld = await r.call('world', 'alice');
      assert.deepEqual(aliceWorld.data.simulation.reputation.korund.record, [
        expectedBreak(epoch, epoch + 3 * gameDaySeconds, 'aurelle'),
        expectedBreak(epoch, epoch + 2 * gameDaySeconds, 'kindle'),
      ], 'a Korund viewer of GET /api/world keeps both Korund breaks');
      assert.deepEqual(Object.keys(aliceWorld.data.simulation.reputation).sort(), ['korund']);

      const bobCitizen = await r.call('citizen', 'bob');
      assert.deepEqual(bobCitizen.data.simulation.reputation.aurelle.record, [expectedBreak(epoch, epoch + 1 * gameDaySeconds, 'kindle')], 'a Kindle viewer still receives Aurelle\'s foreign break');
      assert.deepEqual(bobCitizen.data.simulation.reputation.kindle.record, [expectedBreak(epoch, epoch + 4 * gameDaySeconds, 'korund')], 'a Kindle viewer still receives Kindle\'s break with Korund');
      assert.deepEqual(bobCitizen.data.simulation.reputation.korund.record, [
        expectedBreak(epoch, epoch + 3 * gameDaySeconds, 'aurelle'),
        expectedBreak(epoch, epoch + 2 * gameDaySeconds, 'kindle'),
      ]);
    } finally {
      await r.close();
    }
  });

  test(`#1480 an older counting break off the LIMIT 20 list still appears in the record (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      const now = Math.floor(r.now / 1000);
      const preview = await r.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      await insertTreaty(r, { id: 'old-break', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now, proposedAt: now - 1_000, endedAt: now - 995 });
      for (let i = 0; i < 20; i += 1) {
        await insertTreaty(r, { id: `newer-expired-${i}`, kind: 'trade', proposer: 'kindle', other: 'korund', status: 'expired', brokenBy: null, now, proposedAt: now - 10 + i });
      }
      const world = await r.call('world', 'bob');
      assert.equal(world.data.simulation.treaties.treaties.length, 20, 'the public treaty list stays capped');
      assert.equal(world.data.simulation.treaties.treaties.some((t) => t.id === 'old-break'), false, 'the older break is off the LIMIT 20 list');
      assert.deepEqual(world.data.simulation.reputation.aurelle, {
        score: -10, brokenPacts: 1, earlierBreaks: 0,
        record: [expectedBreak(epoch, now - 995, 'kindle')],
      }, 'the older break is still in the uncapped record');
      const citizen = await r.call('citizen', 'bob');
      assert.deepEqual(citizen.data.simulation.reputation.aurelle.record, [expectedBreak(epoch, now - 995, 'kindle')]);
    } finally {
      await r.close();
    }
  });

  test(`#1480 flag off sends no reputation key (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'false');
      const now = Math.floor(r.now / 1000);
      await insertTreaty(r, { id: 't-hidden', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now });
      const world = await r.call('world', null);
      assert.equal(world.status, 200);
      assert.equal('reputation' in world.data.simulation, false, 'no reputation key is sent while the flag is off');
      const citizen = await r.call('citizen', 'bob');
      assert.equal('reputation' in citizen.data.simulation, false, 'GET /api/citizen also omits reputation while the flag is off');
    } finally {
      await r.close();
    }
  });
}

test('#1480 Foreign affairs panel lists the record, the overflow line, and keeps the zero-state copy', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const require = createRequire(import.meta.url);
  const rt = await localRuntime();
  try {
    const rules = await rt.importModule('lib/diplomacy-rules.ts');
    const copy = await rt.importModule('lib/diplomacy-copy.ts');
    const embargoCopy = await rt.importModule('lib/embargo-copy.ts');
    const exports = {};
    const src = await readFile(new URL('../app/foreign-affairs-panel.tsx', import.meta.url), 'utf8');
    new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports, (name) => ({
      '@/lib/diplomacy-copy': copy,
      '@/lib/diplomacy-rules': rules,
      '@/lib/embargo-copy': embargoCopy,
      './display-preferences': { useDisplayTimestamp: () => (value) => `T${value}` },
    })[name] ?? require(name));
    const { ForeignAffairsPanel } = exports;
    const html = (reputation, nation = 'aurelle', treaties = []) => renderToStaticMarkup(createElement(ForeignAffairsPanel, { treaties, reputation, nationId: nation }));
    const { reputationPanel } = copy;
    assert.equal(reputationPanel.record.proposal, true);
    assert.equal(reputationPanel.earlier.proposal, true);
    assert.equal(reputationPanel.record.text, '{treaty} with {nation}, broken on day {day} ({penalty})');
    assert.equal(reputationPanel.earlier.text, 'and {count} earlier {breaks}');
    const one = { score: -10, brokenPacts: 1, earlierBreaks: 0, record: [{ other: 'kindle', kind: 'non-aggression', brokenAt: 10, brokenGameDay: 3, penalty: -10 }] };
    assert.match(html(one), /World Reputation: −10 \(1 broken pact\)/);
    assert.match(html(one), /non-aggression pact with Kindle, broken on day 3 \(−10\)/);
    assert.doesNotMatch(html(one), /earlier/);
    const overflow = { score: -120, brokenPacts: 12, earlierBreaks: 2, record: [
      { other: 'kindle', kind: 'non-aggression', brokenAt: 20, brokenGameDay: 13, penalty: -10 },
      { other: 'korund', kind: 'non-aggression', brokenAt: 19, brokenGameDay: 12, penalty: -10 },
    ] };
    const overflowHtml = html(overflow);
    assert.match(overflowHtml, /World Reputation: −120 \(12 broken pacts\)/);
    assert.match(overflowHtml, /non-aggression pact with Kindle, broken on day 13 \(−10\)/);
    assert.match(overflowHtml, /non-aggression pact with Korund, broken on day 12 \(−10\)/);
    assert.match(overflowHtml, /and 2 earlier breaks/);
    const singular = { score: -110, brokenPacts: 11, earlierBreaks: 1, record: [{ other: 'kindle', kind: 'non-aggression', brokenAt: 20, brokenGameDay: 13, penalty: -10 }] };
    assert.match(html(singular), /and 1 earlier break/);
    assert.doesNotMatch(html(singular), /and 1 earlier breaks/);
    assert.match(html({ score: 0, brokenPacts: 0, record: [], earlierBreaks: 0 }, 'kindle'), /No broken treaties on record/);
    assert.doesNotMatch(html({ score: 0, brokenPacts: 0, record: [{ other: 'kindle', kind: 'non-aggression', brokenAt: 1, brokenGameDay: 1, penalty: -10 }], earlierBreaks: 0 }, 'kindle'), /broken on day|earlier/);
    assert.doesNotMatch(html(undefined, 'kindle'), /World Reputation:|No broken treaties on record|broken on day|earlier/, 'no reputation prop: the line and record are omitted');
  } finally {
    await rt.close();
  }
});
