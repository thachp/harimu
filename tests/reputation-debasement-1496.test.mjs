/** #1496: Aurelle Crown debasement decrees in the last 3 Crown game years lower Aurelle's World Reputation. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createElement } from 'react';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';
import { crownConfig, gameYear } from '../lib/crown-debasement-rules.ts';
import {
  debasementCountInWindow, debasementReputationMaxCount, debasementReputationPenalty, debasementReputationWindowYears,
  treatyBreakPenalty, treatyNations, withDebasementReputation, worldReputation,
} from '../lib/diplomacy-rules.ts';

const zeroScore = () => Object.fromEntries(treatyNations.map((nation) => [nation, { score: 0, brokenPacts: 0 }]));

test('#1496 pure helper: 0 decrees leave Aurelle unchanged; 2 in-window lower the score by 10; Kindle and Korund are never charged; broken-pact penalties add up', () => {
  assert.equal(debasementReputationPenalty, -5);
  assert.equal(debasementReputationWindowYears, 3);
  assert.equal(debasementReputationMaxCount, 3);
  const none = withDebasementReputation(zeroScore(), debasementCountInWindow([], 5));
  assert.deepEqual(none.aurelle, { score: 0, brokenPacts: 0, debasements: 0 });
  assert.deepEqual(none.kindle, { score: 0, brokenPacts: 0, debasements: 0 });
  assert.deepEqual(none.korund, { score: 0, brokenPacts: 0, debasements: 0 });

  const two = withDebasementReputation(zeroScore(), debasementCountInWindow([5, 4], 5));
  assert.equal(two.aurelle.score, -10);
  assert.equal(two.aurelle.debasements, 2);
  assert.equal(two.kindle.score, 0);
  assert.equal(two.kindle.debasements, 0);
  assert.equal(two.korund.score, 0);
  assert.equal(two.korund.debasements, 0);

  const broken = worldReputation([{ kind: 'non-aggression', status: 'broken', brokenBy: 'aurelle' }]);
  assert.equal(broken.aurelle.score, treatyBreakPenalty['non-aggression'].reputation);
  const combined = withDebasementReputation(broken, 2);
  assert.equal(combined.aurelle.score, -20, 'a broken pact and two decrees add: −10 + −10');
  assert.equal(combined.aurelle.brokenPacts, 1);
  assert.equal(combined.aurelle.debasements, 2);
});

test('#1496 window: just inside (current − 2) counts, just outside (current − 3) and older do not; 4+ decrees cap the score at −15', () => {
  const current = 10;
  assert.equal(debasementCountInWindow([current - 2], current), 1, 'just inside the window');
  assert.equal(debasementCountInWindow([current - 3], current), 0, 'just outside the window');
  assert.equal(debasementCountInWindow([current - 4], current), 0, 'a decree older than 3 game years does not count');
  assert.equal(debasementCountInWindow([current + 1], current), 0, 'a future-year decree does not count');
  assert.equal(debasementCountInWindow([current, current + 1], current), 1, 'a current-year decree still counts next to a future one');
  assert.equal(debasementCountInWindow([current, current - 1, current - 2, current - 3], current), 3);
  assert.equal(withDebasementReputation(zeroScore(), 4).aurelle.score, -15, 'a raw count of 4 is capped at −15');
  assert.equal(withDebasementReputation(zeroScore(), 4).aurelle.debasements, 3);
  const years = [current, current - 1, current - 2, current - 3];
  const capped = withDebasementReputation(zeroScore(), debasementCountInWindow(years, current));
  assert.equal(capped.aurelle.debasements, 3);
  assert.equal(capped.aurelle.score, -15);
});

const insertDecree = async (r, { id, year, at = 1 }) => {
  await r.db.prepare('INSERT INTO crown_decrees (id,request_id,game_year,percent_bp,parity_before,parity_after,confidence_before,confidence_after,decreed_by,decreed_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `req-${id}`.padEnd(12, 'x'), year, 1000, 1000, 1100, 100, 90, 'Monarch', at).run();
};

const atYear = (epoch, year) => epoch + (year - 1) * crownConfig.gameYearSeconds + 86400;

const insertBreak = async (r, { id, brokenBy = 'aurelle', proposer = 'kindle', other = 'aurelle', now, endedAt }) => {
  const pair = [proposer, other].sort().join(':');
  const at = now - 10;
  const ended = endedAt ?? at + 5;
  await r.db.prepare('INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `r-${id}`, pair, 'non-aggression', proposer, other, 'AI', at, 'broken', at, at, at + 90 * 86400, ended, brokenBy).run();
};

for (const backend of ['sqlite', 'postgres']) {
  test(`#1496 GET /api/world and GET /api/citizen include Aurelle's windowed debasements and score (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_REPUTATION_DEBASEMENT_ENABLED', 'true');
      const preview = await r.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      const current = 5;
      r.setNow(atYear(epoch, current) * 1000);
      assert.equal(gameYear(Math.floor(r.now / 1000), epoch), current);
      await insertDecree(r, { id: 'd-now', year: current });
      await insertDecree(r, { id: 'd-in', year: current - 2 });
      await insertDecree(r, { id: 'd-out', year: current - 3 });
      await insertDecree(r, { id: 'd-future', year: current + 1 });
      const world = await r.call('world', 'bob');
      assert.equal(world.status, 200);
      const aurelle = world.data.simulation.reputation.aurelle;
      assert.equal(aurelle.debasements, 2, 'decrees older than the window or in a future year are omitted');
      assert.equal(aurelle.score, -10);
      assert.equal(world.data.simulation.reputation.kindle.debasements, 0);
      assert.equal(world.data.simulation.reputation.korund.debasements, 0);
      assert.equal(world.data.simulation.reputation.kindle.score, 0);
      const citizen = await r.call('citizen', 'bob');
      assert.equal(citizen.status, 200);
      assert.equal(citizen.data.simulation.reputation.aurelle.debasements, 2);
      assert.equal(citizen.data.simulation.reputation.aurelle.score, -10);
    } finally {
      await r.close();
    }
  });

  test(`#1496 four decrees cap the score at −15 because the fourth is outside the window (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_REPUTATION_DEBASEMENT_ENABLED', 'true');
      const preview = await r.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      const current = 8;
      r.setNow(atYear(epoch, current) * 1000);
      for (const year of [current, current - 1, current - 2, current - 3]) {
        await insertDecree(r, { id: `d-${year}`, year });
      }
      const world = await r.call('world', null);
      assert.equal(world.data.simulation.reputation.aurelle.debasements, 3);
      assert.equal(world.data.simulation.reputation.aurelle.score, -15);
      await insertBreak(r, { id: 't-nap', now: Math.floor(r.now / 1000) });
      const combined = await r.call('world', null);
      assert.equal(combined.data.simulation.reputation.aurelle.score, -25);
      assert.equal(combined.data.simulation.reputation.aurelle.brokenPacts, 1);
      assert.equal(combined.data.simulation.reputation.aurelle.debasements, 3);
    } finally {
      await r.close();
    }
  });

  test(`#1496 a Korund viewer receives no Aurelle entry, including debasements (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_REPUTATION_DEBASEMENT_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const preview = await r.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      const current = 4;
      r.setNow(atYear(epoch, current) * 1000);
      await insertDecree(r, { id: 'd-fog', year: current });
      const aliceWorld = await r.call('world', 'alice');
      assert.deepEqual(Object.keys(aliceWorld.data.simulation.reputation).sort(), ['korund']);
      assert.equal(aliceWorld.data.simulation.reputation.korund.debasements, 0);
      assert.ok(!('aurelle' in aliceWorld.data.simulation.reputation));
      const aliceCitizen = await r.call('citizen', 'alice');
      assert.deepEqual(Object.keys(aliceCitizen.data.simulation.reputation).sort(), ['korund']);
      const bob = await r.call('world', 'bob');
      assert.equal(bob.data.simulation.reputation.aurelle.debasements, 1);
      assert.equal(bob.data.simulation.reputation.aurelle.score, -5);
    } finally {
      await r.close();
    }
  });

  test(`#1496 flag off leaves Reputation unchanged and does not read crown_decrees (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_REPUTATION_DEBASEMENT_ENABLED', 'false');
      const preview = await r.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      r.setNow(atYear(epoch, 3) * 1000);
      await insertBreak(r, { id: `t-off-${backend}`, now: Math.floor(r.now / 1000) });
      const baseline = (await r.call('world', 'bob')).data.simulation.reputation;
      await insertDecree(r, { id: 'd-off', year: 3 });
      const world = await r.call('world', 'bob');
      assert.deepEqual(world.data.simulation.reputation, baseline, 'flag off leaves the whole reputation map equal to the pre-decree baseline');
      assert.equal('debasements' in world.data.simulation.reputation.aurelle, false, 'flag off omits the field');
      assert.equal(baseline.aurelle.score, treatyBreakPenalty['non-aggression'].reputation);
    } finally {
      await r.close();
    }
  });
}

test('#1496 flag off: readWorldReputation does not query crown_decrees; flag on issues one uncapped year read', async () => {
  const r = await localRuntime();
  try {
    const { readWorldReputation } = await r.importModule('lib/diplomacy.ts');
    const sqls = [];
    const db = {
      prepare(sql) {
        sqls.push(sql);
        return { all: async () => ({ results: [] }), first: async () => null, bind() { return this; } };
      },
    };
    await readWorldReputation(db, 1_000, { debasement: false });
    assert.equal(sqls.some((sql) => /crown_decrees/i.test(sql)), false);
    sqls.length = 0;
    await readWorldReputation(db, 1_000, { debasement: true });
    const decreeSql = sqls.filter((sql) => /crown_decrees/i.test(sql));
    assert.equal(decreeSql.length, 1, 'at most one extra query');
    assert.match(decreeSql[0], /SELECT game_year FROM crown_decrees/i);
    assert.doesNotMatch(decreeSql[0], /LIMIT/i);
  } finally {
    await r.close();
  }
  const src = readFileSync(new URL('../lib/diplomacy.ts', import.meta.url), 'utf8');
  assert.match(src, /options\.debasement\s*\?[\s\S]*crown_decrees[\s\S]*Promise\.all\(\s*\[\s*breakQuery,\s*decreeQuery\s*\]\)/, 'when the flag is on, the year read starts with the breaks query, not after it');
  assert.match(src, /: \[await breakQuery, undefined\]/, 'flag off does not start a crown_decrees query');
});

// #584: DROP TABLE fails on the PGlite fixture; pin the missing-table case to SQLite.
test('#1496 a database without crown_decrees reads as 0 and does not throw', async () => {
  const r = await localRuntime({ backend: 'sqlite' });
  try {
    r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
    r.setFixtureEnv('HARIMU_REPUTATION_DEBASEMENT_ENABLED', 'true');
    await r.db.prepare('DROP TABLE crown_decrees').run();
    const world = await r.call('world', 'bob');
    assert.equal(world.status, 200);
    assert.equal(world.data.simulation.reputation.aurelle.debasements, 0);
    assert.equal(world.data.simulation.reputation.aurelle.score, 0);
  } finally {
    await r.close();
  }
});

test('#1496 Foreign affairs panel shows the windowed copy only when n > 0 on Aurelle', async () => {
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
    const html = (reputation, nation = 'aurelle') => renderToStaticMarkup(createElement(ForeignAffairsPanel, { treaties: [], reputation, nationId: nation }));
    assert.equal(copy.debasementReputationPanel.line.text, 'Crown debasements in the last 3 years: {n}');
    assert.equal(copy.debasementReputationPanel.line.proposal, true);
    const withCount = { score: -10, brokenPacts: 0, record: [], earlierBreaks: 0, legitimacy: 0, debasements: 2 };
    assert.match(html(withCount), /Crown debasements in the last 3 years: 2/);
    assert.match(html(withCount), /World Reputation: −10 \(0 broken pacts\)/);
    assert.doesNotMatch(html({ ...withCount, debasements: 0 }), /Crown debasements in the last 3 years/);
    assert.doesNotMatch(html({ ...withCount, debasements: undefined }), /Crown debasements in the last 3 years/);
    assert.doesNotMatch(html(withCount, 'kindle'), /Crown debasements in the last 3 years/);
    assert.doesNotMatch(html(withCount, 'korund'), /Crown debasements in the last 3 years/);
  } finally {
    await rt.close();
  }
});

test('#1496 mutation tests: window bounds, cap, nation, and unfiltered counts fail the assertions above', () => {
  const file = 'tests/reputation-debasement-1496.test.mjs';
  const cases = [
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'currentYear - (debasementReputationWindowYears - 1)',
      replace: 'currentYear - debasementReputationWindowYears',
      pattern: '#1496 window',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'Math.min(debasementReputationMaxCount, Math.floor(Number(count) || 0))',
      replace: 'Math.floor(Number(count) || 0)',
      pattern: '#1496 window',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: `kindle: { ...map.kindle, debasements: 0 },
    korund: { ...map.korund, debasements: 0 },
    aurelle: { ...map.aurelle, score: (map.aurelle?.score ?? 0) + debasementReputationPenalty * n, debasements: n },`,
      replace: `kindle: { ...map.kindle, score: (map.kindle?.score ?? 0) + debasementReputationPenalty * n, debasements: n },
    korund: { ...map.korund, debasements: 0 },
    aurelle: { ...map.aurelle, debasements: 0 },`,
      pattern: '#1496 pure helper',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'if (y >= oldest && y <= currentYear) n += 1;',
      replace: 'n += 1;',
      pattern: '#1496 window',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'if (y >= oldest && y <= currentYear) n += 1;',
      replace: 'if (y >= oldest) n += 1;',
      pattern: '#1496 window',
    },
  ];
  const tree = mutantTree(); // #1508: never mutate the shared tree that parallel test files read
  try {
    for (const c of cases) {
      const restore = tree.mutate(c.file, c.find, c.replace);
      try {
        const result = tree.run([file], c.pattern);
        assert.notEqual(result.status, 0, `mutant survived (${c.find} -> ${c.replace}):\n${result.stdout}\n${result.stderr}`);
      } finally { restore(); }
    }
  } finally { tree.close(); }
});
