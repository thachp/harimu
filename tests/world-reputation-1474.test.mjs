/** #1474: World Reputation per MVP nation is derived from broken treaties and shown on the Foreign affairs panel. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { worldReputation, treatyBreakPenalty, treatyNations } from '../lib/diplomacy-rules.ts';

const D = 86_400;
const zero = { score: 0, brokenPacts: 0 };
const zeros = () => Object.fromEntries(treatyNations.map((nation) => [nation, { ...zero }]));
const emptyRecord = { record: [], earlierBreaks: 0 };
const withRecord = (map, records = {}) => Object.fromEntries(Object.entries(map).map(([nation, value]) => [nation, { ...value, ...(records[nation] ?? emptyRecord) }]));
const napBreak = (epochSeconds, brokenAt, other) => ({ other, kind: 'non-aggression', brokenAt, brokenGameDay: Math.floor(Math.max(0, brokenAt - epochSeconds) * 12 / 86400) + 1, penalty: -10 });

const treaty = (over = {}) => ({ kind: 'non-aggression', status: 'broken', brokenBy: 'aurelle', ...over });

test('#1474 pure helper: baseline 0, −10 per broken NAP, 0 for trade and non-broken statuses, multiple breaks accumulate', () => {
  assert.deepEqual(treatyBreakPenalty['non-aggression'].reputation, -10);
  assert.deepEqual(treatyBreakPenalty.trade.reputation, 0);
  assert.deepEqual(worldReputation([]), zeros());
  assert.deepEqual(worldReputation([treaty()]), { ...zeros(), aurelle: { score: -10, brokenPacts: 1 } });
  assert.deepEqual(worldReputation([treaty({ kind: 'trade' })]), zeros(), 'a broken trade agreement changes no score and no brokenPacts count');
  for (const status of ['in-force', 'expired', 'proposed', 'rejected']) {
    assert.deepEqual(worldReputation([treaty({ status })]), zeros(), `${status} changes no score`);
  }
  assert.deepEqual(
    worldReputation([treaty(), treaty({ brokenBy: 'aurelle' }), treaty({ brokenBy: 'kindle' }), treaty({ kind: 'trade', brokenBy: 'aurelle' })]),
    { ...zeros(), aurelle: { score: -20, brokenPacts: 2 }, kindle: { score: -10, brokenPacts: 1 } },
    'multiple NAP breaks accumulate; a trade break is ignored',
  );
});


async function insertTreaty(r, { id, kind, proposer, other, status, brokenBy, now }) {
  const pair = [proposer, other].sort().join(':');
  const at = now - 10;
  const ended = status === 'broken' ? at + 5 : null;
  await r.db.prepare('INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `r-${id}`, pair, kind, proposer, other, 'AI', at, status, at, at, at + 90 * D, ended, status === 'broken' ? brokenBy : null).run();
}

for (const backend of ['sqlite', 'postgres']) {
  test(`#1474 a broken NAP lowers only the breaker, a trade break and other statuses do not, on citizen and world (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      const now = Math.floor(r.now / 1000);
      await insertTreaty(r, { id: 't-nap', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now });
      await insertTreaty(r, { id: 't-trade', kind: 'trade', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'kindle', now });
      await insertTreaty(r, { id: 't-force', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'in_force', brokenBy: null, now });

      const bobCitizen = await r.call('citizen', 'bob');
      assert.equal(bobCitizen.status, 200);
      assert.equal(bobCitizen.cache, 'private, no-store');
      const expectedAurelle = (clock) => withRecord({ ...zeros(), aurelle: { score: -10, brokenPacts: 1 } }, { aurelle: { record: [napBreak(clock.epochSeconds, now - 5, 'kindle')], earlierBreaks: 0 } });
      assert.deepEqual(bobCitizen.data.simulation.reputation, expectedAurelle(bobCitizen.data.simulation.clock), 'a Kindle viewer of GET /api/citizen scores only the broken NAP against Aurelle');

      const bobWorld = await r.call('world', 'bob');
      assert.equal(bobWorld.status, 200);
      assert.equal(bobWorld.cache, 'private, no-store');
      assert.deepEqual(bobWorld.data.simulation.reputation, expectedAurelle(bobWorld.data.simulation.clock), 'a Kindle viewer of GET /api/world scores only the broken NAP against Aurelle');

      const signedOut = await r.call('world', null);
      assert.deepEqual(signedOut.data.simulation.reputation, expectedAurelle(signedOut.data.simulation.clock), 'a signed-out GET /api/world still includes every nation\'s reputation');
    } finally {
      await r.close();
    }
  });

  test(`#1474 a Korund viewer receives only Korund's reputation entry (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      await insertTreaty(r, { id: 't-foreign-break', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now });
      await insertTreaty(r, { id: 't-korund-break', kind: 'non-aggression', proposer: 'korund', other: 'kindle', status: 'broken', brokenBy: 'korund', now });

      const aliceCitizen = await r.call('citizen', 'alice');
      assert.equal(aliceCitizen.status, 200);
      assert.equal(aliceCitizen.cache, 'private, no-store');
      const korundRecord = (clock) => ({ score: -10, brokenPacts: 1, record: [napBreak(clock.epochSeconds, now - 5, 'kindle')], earlierBreaks: 0 });
      assert.deepEqual(aliceCitizen.data.simulation.reputation.korund, korundRecord(aliceCitizen.data.simulation.clock), 'a Korund viewer keeps Korund\'s reputation entry');
      assert.ok(!('aurelle' in aliceCitizen.data.simulation.reputation) && !('kindle' in aliceCitizen.data.simulation.reputation), 'a Korund viewer does not receive a non-Korund reputation entry');
      assert.deepEqual(Object.keys(aliceCitizen.data.simulation.reputation).sort(), ['korund'], 'a Korund viewer of GET /api/citizen has only the korund reputation key');

      const aliceWorld = await r.call('world', 'alice');
      assert.equal(aliceWorld.status, 200);
      assert.equal(aliceWorld.cache, 'private, no-store');
      assert.deepEqual(aliceWorld.data.simulation.reputation.korund, korundRecord(aliceWorld.data.simulation.clock), 'a Korund viewer of GET /api/world keeps Korund\'s reputation entry');
      assert.ok(!('aurelle' in aliceWorld.data.simulation.reputation) && !('kindle' in aliceWorld.data.simulation.reputation), 'a Korund viewer does not receive a non-Korund reputation entry');
      assert.deepEqual(Object.keys(aliceWorld.data.simulation.reputation).sort(), ['korund'], 'a Korund viewer of GET /api/world has only the korund reputation key');

      const bobCitizen = await r.call('citizen', 'bob');
      const clock = bobCitizen.data.simulation.clock;
      assert.deepEqual(bobCitizen.data.simulation.reputation, {
        aurelle: { score: -10, brokenPacts: 1, record: [napBreak(clock.epochSeconds, now - 5, 'kindle')], earlierBreaks: 0 },
        kindle: { ...zero, ...emptyRecord },
        korund: { score: -10, brokenPacts: 1, record: [napBreak(clock.epochSeconds, now - 5, 'kindle')], earlierBreaks: 0 },
      }, 'a Kindle viewer still receives every nation\'s reputation');
    } finally {
      await r.close();
    }
  });

  test(`#1474 flag off sends no reputation key (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'false');
      const now = Math.floor(r.now / 1000);
      await insertTreaty(r, { id: 't-hidden', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now });
      const world = await r.call('world', null);
      assert.equal(world.status, 200);
      assert.equal('treaties' in world.data.simulation, false, 'no treaty state is sent while the flag is off');
      assert.equal('reputation' in world.data.simulation, false, 'no reputation key is sent while the flag is off');
      const citizen = await r.call('citizen', 'bob');
      assert.equal('reputation' in citizen.data.simulation, false, 'GET /api/citizen also omits reputation while the flag is off');
    } finally {
      await r.close();
    }
  });
}

test('#1474 Foreign affairs panel shows the viewer line and the zero-state copy', async () => {
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
    const html = (reputation, nation = 'kindle', treaties = []) => renderToStaticMarkup(createElement(ForeignAffairsPanel, { treaties, reputation, nationId: nation }));
    const { reputationPanel } = copy;
    assert.equal(reputationPanel.proposal, true);
    assert.equal(reputationPanel.line.proposal, true);
    assert.equal(reputationPanel.zero.proposal, true);
    assert.equal(reputationPanel.line.text, 'World Reputation: {score} ({count} {pacts})');
    assert.equal(reputationPanel.zero.text, 'No broken treaties on record');
    assert.match(html({ score: -10, brokenPacts: 1 }, 'aurelle'), /World Reputation: −10 \(1 broken pact\)/);
    assert.match(html({ score: -20, brokenPacts: 2 }, 'aurelle'), /World Reputation: −20 \(2 broken pacts\)/);
    assert.match(html({ score: 0, brokenPacts: 0 }, 'kindle'), /No broken treaties on record/);
    assert.doesNotMatch(html({ score: 0, brokenPacts: 0 }, 'kindle'), /World Reputation:/);
    assert.doesNotMatch(html(undefined, 'kindle'), /World Reputation:|No broken treaties on record/, 'no reputation prop: the line is omitted, matching flag-off and older callers');
  } finally {
    await rt.close();
  }
});
