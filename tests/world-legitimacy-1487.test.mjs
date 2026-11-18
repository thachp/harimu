/** #1487: Nation Legitimacy per MVP nation, derived from the same uncapped broken-treaty rows as World Reputation. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { worldLegitimacyFromBreaks, worldReputation, worldReputationFromBreaks, withWorldReputationRecord, treatyBreakPenalty, treatyNations } from '../lib/diplomacy-rules.ts';

const D = 86_400;
const gameDaySeconds = D / 12;
const LEG = treatyBreakPenalty['non-aggression'].legitimacy;
const NAP = treatyBreakPenalty['non-aggression'].reputation;
const zeroLegitimacy = () => Object.fromEntries(treatyNations.map((nation) => [nation, 0]));
const breakItem = (over = {}) => ({ kind: 'non-aggression', status: 'broken', brokenBy: 'aurelle', proposer: 'kindle', other: 'aurelle', brokenAt: 100, id: 't', ...over });

test('#1487 pure helper: baseline 0, −5 per broken NAP, 0 for trade, n accumulates past a list cap, invalid rows skipped', () => {
  assert.equal(LEG, -5);
  assert.equal(treatyBreakPenalty.trade.legitimacy, 0);
  assert.deepEqual(worldLegitimacyFromBreaks([]), zeroLegitimacy());
  assert.deepEqual(worldLegitimacyFromBreaks([{ brokenBy: 'aurelle', kind: 'non-aggression', n: 1 }]), { ...zeroLegitimacy(), aurelle: -5 });
  assert.deepEqual(worldLegitimacyFromBreaks([{ brokenBy: 'aurelle', kind: 'trade', n: 4 }]), zeroLegitimacy(), 'a broken trade agreement changes no legitimacy');
  assert.deepEqual(
    worldLegitimacyFromBreaks([
      { brokenBy: 'aurelle', kind: 'non-aggression', n: 2 },
      { brokenBy: 'kindle', kind: 'non-aggression', n: 21 },
      { brokenBy: 'aurelle', kind: 'trade', n: 3 },
      { brokenBy: 'not-a-nation', kind: 'non-aggression', n: 1 },
      { brokenBy: 'korund', kind: 'not-a-kind', n: 1 },
      { brokenBy: 'korund', kind: 'non-aggression', n: 1.9 },
      { brokenBy: 'lume', kind: 'non-aggression', n: -2 },
    ]),
    { ...zeroLegitimacy(), aurelle: -10, kindle: -105, korund: -5 },
    'n is floored, negatives become 0, unknown nations and kinds are skipped, nations do not bleed',
  );
  const twentyOne = worldReputationFromBreaks([{ brokenBy: 'kindle', kind: 'non-aggression', n: 21 }]);
  const legitimacy = worldLegitimacyFromBreaks([{ brokenBy: 'kindle', kind: 'non-aggression', n: 21 }]);
  assert.equal(twentyOne.kindle.score, NAP * 21);
  assert.equal(legitimacy.kindle, LEG * 21, 'legitimacy uses the same uncapped n as the reputation score');
});

test('#1487 withWorldReputationRecord attaches legitimacy from every break, including a trade (0) and breaks past the record cap', () => {
  const epoch = 1_000_000;
  const attached = withWorldReputationRecord(worldReputation([]), [], epoch);
  assert.equal(attached.aurelle.legitimacy, 0);
  assert.equal(attached.kindle.legitimacy, 0);
  assert.equal(attached.korund.legitimacy, 0);

  const older = breakItem({ id: 't-old', brokenAt: epoch + gameDaySeconds });
  const trade = breakItem({ id: 't-trade', kind: 'trade', brokenAt: epoch + 2 * gameDaySeconds, brokenBy: 'kindle', proposer: 'kindle', other: 'korund' });
  const korundAsOther = breakItem({ id: 't-korund-other', proposer: 'aurelle', other: 'korund', brokenBy: 'korund', brokenAt: epoch + 3 * gameDaySeconds });
  const korundAsProposer = breakItem({ id: 't-korund-proposer', proposer: 'korund', other: 'kindle', brokenBy: 'korund', brokenAt: epoch + 4 * gameDaySeconds });
  const mixed = withWorldReputationRecord(worldReputation([older, trade, korundAsOther, korundAsProposer]), [older, trade, korundAsOther, korundAsProposer], epoch);
  assert.equal(mixed.aurelle.legitimacy, -5);
  assert.equal(mixed.kindle.legitimacy, 0, 'a trade break does not change legitimacy');
  assert.equal(mixed.korund.legitimacy, -10, 'both sides of a Korund pair (Korund as other and as proposer) count');

  const many = Array.from({ length: 12 }, (_, i) => breakItem({ id: `t-${String(12 - i).padStart(2, '0')}`, brokenAt: epoch + (12 - i) * gameDaySeconds }));
  const capped = withWorldReputationRecord(worldReputation(many), many, epoch);
  assert.equal(capped.aurelle.record.length, 10);
  assert.equal(capped.aurelle.earlierBreaks, 2);
  assert.equal(capped.aurelle.legitimacy, -60, 'legitimacy still counts all 12 breaks when the visible record is capped at 10');

  const override = withWorldReputationRecord(worldReputation(many), many, epoch, { ...zeroLegitimacy(), aurelle: -99 });
  assert.equal(override.aurelle.legitimacy, -99, 'a caller-supplied map wins over deriving from the treaty list');
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
  test(`#1487 citizen and world include legitimacy from every counting break, including those off LIMIT 20 (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      const now = Math.floor(r.now / 1000);
      const preview = await r.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      for (let i = 0; i < 21; i += 1) {
        await insertTreaty(r, { id: `kindle-break-${i}`, kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'kindle', now, proposedAt: now - 100 + i });
      }
      await insertTreaty(r, { id: 'aurelle-break', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now, proposedAt: now - 1_000 });
      await insertTreaty(r, { id: 'kindle-trade', kind: 'trade', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'kindle', now, proposedAt: now - 50 });

      const bobCitizen = await r.call('citizen', 'bob');
      assert.equal(bobCitizen.status, 200);
      assert.equal(bobCitizen.data.simulation.reputation.kindle.score, NAP * 21);
      assert.equal(bobCitizen.data.simulation.reputation.kindle.legitimacy, LEG * 21, '21 Kindle NAP breaks are all counted, including those off the LIMIT 20 list and past the record cap');
      assert.equal(bobCitizen.data.simulation.reputation.kindle.earlierBreaks, 11);
      assert.equal(bobCitizen.data.simulation.reputation.aurelle.legitimacy, -5);
      assert.equal(bobCitizen.data.simulation.reputation.korund.legitimacy, 0);
      const world = await r.call('world', 'bob');
      assert.equal(world.data.simulation.reputation.kindle.legitimacy, LEG * 21);
      const signedOut = await r.call('world', null);
      assert.equal(signedOut.data.simulation.reputation.kindle.legitimacy, LEG * 21, 'a signed-out GET /api/world still includes legitimacy');
      assert.deepEqual(Object.keys(signedOut.data.simulation.reputation).sort(), ['aurelle', 'kindle', 'korund']);
    } finally {
      await r.close();
    }
  });

  test(`#1487 a Korund viewer keeps only Korund's legitimacy, counting both sides of a Korund pair (${backend})`, async () => {
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
      assert.equal(aliceCitizen.data.simulation.reputation.korund.legitimacy, -10, 'both Korund breaks count (Korund as proposer and as other)');
      assert.equal(aliceCitizen.data.simulation.reputation.korund.score, -20);
      assert.ok(!('aurelle' in aliceCitizen.data.simulation.reputation) && !('kindle' in aliceCitizen.data.simulation.reputation), 'a Korund viewer does not receive a non-Korund reputation entry');
      assert.deepEqual(Object.keys(aliceCitizen.data.simulation.reputation).sort(), ['korund']);

      const aliceWorld = await r.call('world', 'alice');
      assert.equal(aliceWorld.data.simulation.reputation.korund.legitimacy, -10);
      assert.deepEqual(Object.keys(aliceWorld.data.simulation.reputation).sort(), ['korund']);

      const bobCitizen = await r.call('citizen', 'bob');
      assert.equal(bobCitizen.data.simulation.reputation.aurelle.legitimacy, -5, 'a Kindle viewer still receives Aurelle\'s foreign break');
      assert.equal(bobCitizen.data.simulation.reputation.kindle.legitimacy, -5, 'a Kindle viewer still receives Kindle\'s break with Korund');
      assert.equal(bobCitizen.data.simulation.reputation.korund.legitimacy, -10);
    } finally {
      await r.close();
    }
  });

  test(`#1487 21 NAP breaks give legitimacy exactly −105, a plain sum with no floor or decay (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      const now = Math.floor(r.now / 1000);
      for (let i = 0; i < 21; i += 1) {
        await insertTreaty(r, { id: `nap-${i}`, kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'kindle', now, proposedAt: now - 100 + i });
      }
      const world = await r.call('world', null);
      assert.equal(world.status, 200);
      assert.equal(world.data.simulation.treaties.treaties.length, 20, 'the public treaty list stays at LIMIT 20');
      assert.equal(world.data.simulation.reputation.kindle.legitimacy, -105, '21 NAP breaks are a plain sum (−5 each) with no floor or decay, including the break off LIMIT 20');
      assert.equal(world.data.simulation.reputation.kindle.brokenPacts, 21);
      assert.equal(world.data.simulation.reputation.aurelle.legitimacy, 0);
      assert.equal(world.data.simulation.reputation.korund.legitimacy, 0);
      const citizen = await r.call('citizen', 'bob');
      assert.equal(citizen.data.simulation.reputation.kindle.legitimacy, -105);
    } finally {
      await r.close();
    }
  });

  test(`#1487 Korund fog still returns only Korund's reputation entry, legitimacy included (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      const preview = await r.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      await insertTreaty(r, { id: 't-aurelle', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now, proposedAt: epoch + 1, endedAt: epoch + 1 * gameDaySeconds });
      await insertTreaty(r, { id: 't-korund-proposer', kind: 'non-aggression', proposer: 'korund', other: 'kindle', status: 'broken', brokenBy: 'korund', now, proposedAt: epoch + 2, endedAt: epoch + 2 * gameDaySeconds });
      await insertTreaty(r, { id: 't-korund-other', kind: 'non-aggression', proposer: 'aurelle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: epoch + 3, endedAt: epoch + 3 * gameDaySeconds });
      await insertTreaty(r, { id: 't-kindle', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'kindle', now, proposedAt: epoch + 4, endedAt: epoch + 4 * gameDaySeconds });

      const aliceCitizen = await r.call('citizen', 'alice');
      assert.deepEqual(Object.keys(aliceCitizen.data.simulation.reputation).sort(), ['korund'], 'a Korund viewer of GET /api/citizen has only the korund reputation key');
      assert.equal(aliceCitizen.data.simulation.reputation.korund.legitimacy, -10, 'Korund\'s entry includes legitimacy for both sides of the Korund pair');
      assert.equal('aurelle' in aliceCitizen.data.simulation.reputation, false, 'a Korund viewer does not receive Aurelle\'s legitimacy');
      assert.equal('kindle' in aliceCitizen.data.simulation.reputation, false, 'a Korund viewer does not receive Kindle\'s legitimacy');

      const aliceWorld = await r.call('world', 'alice');
      assert.deepEqual(Object.keys(aliceWorld.data.simulation.reputation).sort(), ['korund'], 'a Korund viewer of GET /api/world has only the korund reputation key');
      assert.equal(aliceWorld.data.simulation.reputation.korund.legitimacy, -10);
      assert.equal('aurelle' in aliceWorld.data.simulation.reputation, false);
      assert.equal('kindle' in aliceWorld.data.simulation.reputation, false);

      const bobCitizen = await r.call('citizen', 'bob');
      assert.deepEqual(Object.keys(bobCitizen.data.simulation.reputation).sort(), ['aurelle', 'kindle', 'korund'], 'a Kindle viewer still receives every nation\'s entry, legitimacy included');
      assert.equal(bobCitizen.data.simulation.reputation.aurelle.legitimacy, -5);
      assert.equal(bobCitizen.data.simulation.reputation.kindle.legitimacy, -5);
      assert.equal(bobCitizen.data.simulation.reputation.korund.legitimacy, -10);
    } finally {
      await r.close();
    }
  });

  test(`#1487 flag off sends no reputation key (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'false');
      const now = Math.floor(r.now / 1000);
      await insertTreaty(r, { id: 't-hidden', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now });
      const world = await r.call('world', null);
      assert.equal('reputation' in world.data.simulation, false, 'no reputation key (and so no legitimacy) is sent while the flag is off');
      const citizen = await r.call('citizen', 'bob');
      assert.equal('reputation' in citizen.data.simulation, false);
    } finally {
      await r.close();
    }
  });
}

test('#1487 Foreign affairs panel shows Legitimacy with the Unicode minus, the zero-state copy, and no second record', async () => {
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
    const { legitimacyPanel } = copy;
    assert.equal(legitimacyPanel.proposal, true);
    assert.equal(legitimacyPanel.line.proposal, true);
    assert.equal(legitimacyPanel.zero.proposal, true);
    assert.equal(legitimacyPanel.line.text, 'Legitimacy: {score}');
    assert.equal(legitimacyPanel.zero.text, 'No legitimacy losses on record');
    const one = { score: -10, brokenPacts: 1, earlierBreaks: 0, legitimacy: -5, record: [{ other: 'kindle', kind: 'non-aggression', brokenAt: 10, brokenGameDay: 3, penalty: -10 }] };
    const oneHtml = html(one);
    assert.match(oneHtml, /World Reputation: −10 \(1 broken pact\)/);
    assert.match(oneHtml, /Legitimacy: −5/);
    assert.doesNotMatch(oneHtml, /Legitimacy: -5/, 'the legitimacy score uses the Unicode minus, not the ASCII hyphen');
    assert.match(oneHtml, /non-aggression pact with Kindle, broken on day 3 \(−10\)/);
    assert.equal((oneHtml.match(/broken on day/g) ?? []).length, 1, 'there is no second legitimacy record list');
    assert.match(html({ score: 0, brokenPacts: 0, record: [], earlierBreaks: 0, legitimacy: 0 }, 'kindle'), /No legitimacy losses on record/);
    assert.doesNotMatch(html({ score: 0, brokenPacts: 0, record: [], earlierBreaks: 0, legitimacy: 0 }, 'kindle'), /Legitimacy:/);
    assert.doesNotMatch(html(undefined, 'kindle'), /Legitimacy:|No legitimacy losses on record/, 'no reputation prop: the legitimacy line is omitted, matching flag-off and older callers');
  } finally {
    await rt.close();
  }
});

const mutate = (file, find, replace) => {
  const original = readFileSync(file, 'utf8');
  const next = original.replace(find, replace);
  assert.notEqual(next, original, `mutant did not apply in ${file}: ${find}`);
  writeFileSync(file, next);
  return () => writeFileSync(file, original);
};
const run = (files, pattern) => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  return spawnSync('node', ['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-name-pattern', pattern, ...files], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, env });
};

test('#1487 mutations: dropping * n, using the reputation penalty, zeroing legitimacy, a −100 floor, and dropping the Korund filter all fail', () => {
  const file = 'tests/world-legitimacy-1487.test.mjs';
  const cases = [
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'result[row.brokenBy] += treatyBreakPenalty[row.kind].legitimacy * n;',
      replace: 'result[row.brokenBy] += treatyBreakPenalty[row.kind].legitimacy;',
      pattern: 'n accumulates past a list cap|21 Kindle NAP breaks are all counted',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'result[row.brokenBy] += treatyBreakPenalty[row.kind].legitimacy * n;',
      replace: 'result[row.brokenBy] += treatyBreakPenalty[row.kind].reputation * n;',
      pattern: 'n accumulates past a list cap|−5 per broken NAP',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'legitimacy: derivedLegitimacy[nation] ?? 0',
      replace: 'legitimacy: 0',
      pattern: 'attaches legitimacy from every break|21 Kindle NAP breaks are all counted',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'result[row.brokenBy] += treatyBreakPenalty[row.kind].legitimacy * n;',
      replace: 'result[row.brokenBy] = Math.max(-100, result[row.brokenBy] + treatyBreakPenalty[row.kind].legitimacy * n);',
      pattern: 'exactly −105, a plain sum with no floor',
    },
    {
      file: 'lib/war.ts',
      find: '...(simulation.reputation ? { reputation: simulation.reputation.korund !== undefined ? { korund: simulation.reputation.korund } : {} } : {}),',
      replace: '...(simulation.reputation ? { reputation: simulation.reputation } : {}),',
      pattern: "only Korund's reputation entry, legitimacy included",
    },
  ];
  for (const c of cases) {
    const restore = mutate(c.file, c.find, c.replace);
    try {
      const result = run([file], c.pattern);
      assert.notEqual(result.status, 0, `mutant survived (${c.find}):\n${result.stdout}\n${result.stderr}`);
    } finally { restore(); }
  }
});
