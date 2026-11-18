/** #1477: World Reputation score and brokenPacts come from a dedicated, uncapped per-nation count, not from readTreaties' LIMIT 20 list. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { worldReputation, worldReputationFromBreaks, worldReputationBreaksSql, treatyBreakPenalty, treatyNations } from '../lib/diplomacy-rules.ts';

const D = 86_400;
const NAP = treatyBreakPenalty['non-aggression'].reputation;
const zero = { score: 0, brokenPacts: 0 };
const zeros = () => Object.fromEntries(treatyNations.map((nation) => [nation, { ...zero }]));
const OLD_LIST_CAP = 20; // readTreaties stays at LIMIT 20; reputation must not.

async function insertTreaty(r, { id, kind, proposer, other, status, brokenBy, now, proposedAt }) {
  const pair = [proposer, other].sort().join(':');
  const at = proposedAt ?? now - 10;
  const ended = status === 'broken' || status === 'expired' ? at + 5 : null;
  await r.db.prepare('INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `r-${id}`, pair, kind, proposer, other, 'AI', at, status, at, at, at + 90 * D, ended, status === 'broken' ? brokenBy : null).run();
}

test('#1477 the count SQL has no LIMIT and the helper is uncapped and per-nation', () => {
  assert.equal(NAP, -10);
  assert.doesNotMatch(worldReputationBreaksSql, /LIMIT/i);
  assert.match(worldReputationBreaksSql, /GROUP BY broken_by, kind/);
  assert.match(worldReputationBreaksSql, /status='broken'/);
  const twentyOne = worldReputationFromBreaks([{ brokenBy: 'aurelle', kind: 'non-aggression', n: OLD_LIST_CAP + 1 }]);
  assert.deepEqual(twentyOne.aurelle, { score: NAP * (OLD_LIST_CAP + 1), brokenPacts: OLD_LIST_CAP + 1 });
  assert.deepEqual(twentyOne.kindle, zero);
  assert.deepEqual(twentyOne.korund, zero);
  const split = worldReputationFromBreaks([
    { brokenBy: 'aurelle', kind: 'non-aggression', n: 2 },
    { brokenBy: 'kindle', kind: 'non-aggression', n: OLD_LIST_CAP + 1 },
    { brokenBy: 'aurelle', kind: 'trade', n: 9 },
  ]);
  assert.deepEqual(split, { ...zeros(), aurelle: { score: NAP * 2, brokenPacts: 2 }, kindle: { score: NAP * (OLD_LIST_CAP + 1), brokenPacts: OLD_LIST_CAP + 1 } }, 'nations do not bleed; trade count is ignored');
  // #1474 helper still agrees when given one row per break
  const listed = Array.from({ length: OLD_LIST_CAP + 1 }, () => ({ kind: 'non-aggression', status: 'broken', brokenBy: 'aurelle' }));
  assert.deepEqual(worldReputation(listed), twentyOne);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`#1477 an older break still counts once more than ${OLD_LIST_CAP} newer treaties exist (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      const now = Math.floor(r.now / 1000);
      await insertTreaty(r, { id: 'old-break', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now, proposedAt: now - 1_000 });
      for (let i = 0; i < OLD_LIST_CAP; i++) {
        await insertTreaty(r, { id: `newer-${i}`, kind: 'trade', proposer: 'kindle', other: 'korund', status: 'expired', brokenBy: null, now, proposedAt: now - 10 + i });
      }
      const world = await r.call('world', null);
      assert.equal(world.status, 200);
      assert.equal(world.data.simulation.treaties.treaties.length, OLD_LIST_CAP, 'the public treaty list stays capped');
      assert.equal(world.data.simulation.treaties.treaties.some((t) => t.id === 'old-break'), false, 'the older break is off the LIMIT 20 list');
      assert.deepEqual(world.data.simulation.reputation, { ...zeros(), aurelle: { score: NAP, brokenPacts: 1 } }, 'the older break still counts toward reputation');
    } finally {
      await r.close();
    }
  });

  test(`#1477 ${OLD_LIST_CAP + 1} breaks are uncapped and do not bleed across nations (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      const now = Math.floor(r.now / 1000);
      for (let i = 0; i < OLD_LIST_CAP + 1; i++) {
        await insertTreaty(r, { id: `kindle-break-${i}`, kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'kindle', now, proposedAt: now - 100 + i });
      }
      await insertTreaty(r, { id: 'aurelle-break', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now, proposedAt: now - 200 });
      const world = await r.call('world', null);
      assert.equal(world.status, 200);
      assert.deepEqual(world.data.simulation.reputation.kindle, { score: NAP * (OLD_LIST_CAP + 1), brokenPacts: OLD_LIST_CAP + 1 });
      assert.deepEqual(world.data.simulation.reputation.aurelle, { score: NAP, brokenPacts: 1 });
      assert.deepEqual(world.data.simulation.reputation.korund, zero);
      const citizen = await r.call('citizen', 'bob');
      assert.deepEqual(citizen.data.simulation.reputation, world.data.simulation.reputation);
    } finally {
      await r.close();
    }
  });

  test(`#1477 flag off still omits reputation when many breaks exist (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'false');
      const now = Math.floor(r.now / 1000);
      await insertTreaty(r, { id: 'hidden-break', kind: 'non-aggression', proposer: 'kindle', other: 'aurelle', status: 'broken', brokenBy: 'aurelle', now });
      const world = await r.call('world', null);
      assert.equal('reputation' in world.data.simulation, false);
      assert.equal('treaties' in world.data.simulation, false);
    } finally {
      await r.close();
    }
  });
}

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

test('#1477 mutations: re-adding the list cap, a wrong nation key, and an off-by-one on n all fail', () => {
  const file = 'tests/world-reputation-1477.test.mjs';
  const cases = [
    {
      file: 'lib/world-simulation.ts',
      finds: [
        ["import type { WorldReputationMap } from './diplomacy-rules'; // #1474", "import { worldReputation, type WorldReputationMap } from './diplomacy-rules'; // #1474"],
        ['...(options.diplomacy?{treaties:treaties!,reputation:reputation!}:{}),', '...(options.diplomacy?{treaties:treaties!,reputation:worldReputation(treaties!.treaties)}:{}),'],
      ],
      pattern: 'older break still counts',
    },
    {
      file: 'lib/diplomacy.ts',
      find: 'worldReputationFromBreaks(rows.map(row => ({ brokenBy: row.broken_by, kind: row.kind, n: Number(row.n) })))',
      replace: "worldReputationFromBreaks(rows.map(row => ({ brokenBy: 'kindle', kind: row.kind, n: Number(row.n) })))",
      pattern: 'do not bleed across nations',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'result[row.brokenBy].score += penalty * n;\n    if (penalty !== 0) result[row.brokenBy].brokenPacts += n;',
      replace: 'result[row.brokenBy].score += penalty;\n    if (penalty !== 0) result[row.brokenBy].brokenPacts += 1;',
      pattern: 'the count SQL has no LIMIT|do not bleed across nations',
    },
  ];
  for (const c of cases) {
    const steps = c.finds ?? [[c.find, c.replace]];
    const restores = [];
    try {
      for (const [find, replace] of steps) restores.push(mutate(c.file, find, replace));
      const result = run([file], c.pattern);
      assert.notEqual(result.status, 0, `mutant survived (${JSON.stringify(steps)}):\n${result.stdout}\n${result.stderr}`);
    } finally { while (restores.length) restores.pop()(); }
  }
});
