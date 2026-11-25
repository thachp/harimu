/** #1495: a low World Reputation score makes a non-aggression pact harder to ratify. Flag HARIMU_NAP_REPUTATION_GATE_ENABLED (GRAY 99). */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createElement } from 'react';
import ts from 'typescript';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { decideTreaty, pactReputationFloor, napReputationGateFlag, treatyBreakPenalty, treatyNations } from '../lib/diplomacy-rules.ts';
import { worldReputationBreaksSql } from '../lib/diplomacy-rules.ts';

const D = 86_400;
const NAP = treatyBreakPenalty['non-aggression'].reputation;
const seats = (s, o, d) => ({ 'steady-hand': s, 'open-ledger': o, 'dockside-builders': d });
const even = seats(6, 6, 6);
const scores = (over = {}) => Object.fromEntries(treatyNations.map((nation) => [nation, { score: 0, ...over[nation] }]));
const FLAG = napReputationGateFlag;

async function insertTreaty(r, { id, kind, proposer, other, status, brokenBy, now, proposedAt }) {
  const pair = [proposer, other].sort().join(':');
  const at = proposedAt ?? now - 10;
  const ended = status === 'broken' || status === 'expired' ? at + 5 : null;
  await r.db.prepare('INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `r-${id}`, pair, kind, proposer, other, 'AI', at, status, status === 'proposed' ? null : at, status === 'proposed' ? null : at, status === 'proposed' ? null : at + 90 * D, ended, status === 'broken' ? brokenBy : null).run();
}

async function seedSeats(r, now) {
  await r.db.prepare("INSERT INTO assembly_elections (id,nation_id,policy,opens_at,closes_at,closed_at,result_json) VALUES ('a-1495','kindle','preview-citizen-v1',?,?,?,?)")
    .bind(now - 4 * D, now - D, now - D, JSON.stringify({ totals: { after: even } })).run();
}

test('#1495 floor is −20; omitted scores match today; −20 refuses, −19/−10/0 pass; own score is ignored; trade is not gated; a stance no stays a stance no', () => {
  assert.equal(pactReputationFloor, -20);
  assert.equal(NAP, -10);
  assert.equal(FLAG, 'HARIMU_NAP_REPUTATION_GATE_ENABLED');
  assert.equal(decideTreaty('non-aggression', 'kindle', 'korund', even).approved, true, 'omitted scores is today\'s rule');
  assert.equal(decideTreaty('non-aggression', 'kindle', 'korund', even, null).approved, true);
  assert.equal(decideTreaty('non-aggression', 'kindle', 'korund', even, scores()).approved, true);
  const atFloor = decideTreaty('non-aggression', 'kindle', 'korund', even, scores({ korund: { score: pactReputationFloor } }));
  assert.equal(atFloor.approved, false);
  assert.deepEqual(atFloor.ratifications.find((row) => row.nation === 'kindle'), { nation: 'kindle', body: 'Assembly', passed: false, rule: 'two-thirds', yes: 12, total: 18, reason: 'low_reputation' });
  assert.equal(atFloor.ratifications.find((row) => row.nation === 'korund').passed, true, 'Chairman still yes: Kindle is at 0');
  assert.equal(decideTreaty('non-aggression', 'kindle', 'korund', even, scores({ korund: { score: -19 } })).approved, true);
  assert.equal(decideTreaty('non-aggression', 'kindle', 'korund', even, scores({ korund: { score: -10 } })).approved, true);
  const ownLow = decideTreaty('non-aggression', 'kindle', 'korund', even, scores({ kindle: { score: pactReputationFloor } }));
  assert.equal(ownLow.approved, false, 'Chairman looks at Kindle, not at Korund');
  assert.equal(ownLow.ratifications.find((row) => row.nation === 'kindle').passed, true, 'Assembly looks at Korund (0), not at Kindle');
  assert.equal(ownLow.ratifications.find((row) => row.nation === 'korund').reason, 'low_reputation');
  assert.equal(decideTreaty('trade', 'kindle', 'korund', seats(5, 8, 5), scores({ korund: { score: pactReputationFloor }, kindle: { score: pactReputationFloor } })).approved, true, 'trade is never gated');
  const stanceNo = decideTreaty('non-aggression', 'kindle', 'aurelle', even, scores({ aurelle: { score: pactReputationFloor } }));
  assert.equal(stanceNo.approved, false);
  assert.equal(stanceNo.ratifications.find((row) => row.nation === 'kindle').reason, undefined, 'an Assembly no stays a stance failure');
  assert.equal(stanceNo.ratifications.find((row) => row.nation === 'kindle').passed, false);
  const sole = decideTreaty('non-aggression', 'korund', 'aurelle', seats(0, 0, 0), scores({ aurelle: { score: pactReputationFloor } }));
  assert.equal(sole.approved, false);
  assert.equal(sole.ratifications.find((row) => row.nation === 'korund').reason, 'low_reputation');
  assert.equal(decideTreaty('non-aggression', 'korund', 'aurelle', seats(0, 0, 0), scores()).approved, true);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`#1495 refuses a Kindle–Korund NAP when Korund is at the floor, stores the reason, and leaves a citizen GET unwritten (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      r.setFixtureEnv(FLAG, 'true');
      const now = Math.floor(r.now / 1000);
      await seedSeats(r, now);
      await insertTreaty(r, { id: 'k-break-1', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: now - 200 });
      await insertTreaty(r, { id: 'k-break-2', kind: 'non-aggression', proposer: 'aurelle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: now - 180 });
      await insertTreaty(r, { id: 'k-nap', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'proposed', now, proposedAt: now - 1 });
      const citizen = await r.call('citizen', 'bob');
      assert.equal(citizen.status, 200);
      const still = await r.db.prepare("SELECT status FROM treaties WHERE id='k-nap'").first();
      assert.equal(still.status, 'proposed', 'GET /api/citizen does not decide a proposed pact');
      const world = await r.call('world', null);
      assert.equal(world.status, 200);
      const row = await r.db.prepare("SELECT status, ratification_json FROM treaties WHERE id='k-nap'").first();
      assert.equal(row.status, 'rejected');
      const json = JSON.parse(row.ratification_json);
      assert.equal(json.find((item) => item.nation === 'kindle').reason, 'low_reputation');
      assert.equal(world.data.simulation.treaties.treaties.some((item) => item.id === 'k-nap'), false, 'rejected pacts stay off the public list');
      const refusals = world.data.simulation.napReputationRefusals;
      assert.ok(refusals.some((item) => item.id === 'k-nap' && item.bodies.some((body) => body.nation === 'kindle' && body.body === 'Assembly')));
      assert.equal(world.data.simulation.reputation.korund.score, pactReputationFloor);
    } finally {
      await r.close();
    }
  });

  test(`#1495 two older Korund breaks still refuse once 20 newer treaties fill the public list (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      r.setFixtureEnv(FLAG, 'true');
      const now = Math.floor(r.now / 1000);
      await seedSeats(r, now);
      await insertTreaty(r, { id: 'old-1', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: now - 1_000 });
      await insertTreaty(r, { id: 'old-2', kind: 'non-aggression', proposer: 'aurelle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: now - 900 });
      for (let i = 0; i < 20; i++) {
        await insertTreaty(r, { id: `newer-${i}`, kind: 'trade', proposer: 'kindle', other: 'aurelle', status: 'expired', now, proposedAt: now - 40 + i });
      }
      await insertTreaty(r, { id: 'late-nap', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'proposed', now, proposedAt: now - 1 });
      const listed = (await r.db.prepare("SELECT id FROM treaties WHERE status<>'rejected' ORDER BY proposed_at DESC, id LIMIT 20").all()).results.map((row) => row.id);
      assert.equal(listed.includes('old-1') || listed.includes('old-2'), false, 'the two breaks are off the LIMIT 20 list');
      const world = await r.call('world', null);
      assert.equal(world.status, 200);
      const row = await r.db.prepare("SELECT status, ratification_json FROM treaties WHERE id='late-nap'").first();
      assert.equal(row.status, 'rejected', 'the uncapped score still gates the pact');
      assert.equal(JSON.parse(row.ratification_json).find((item) => item.nation === 'kindle').reason, 'low_reputation');
      assert.equal(world.data.simulation.reputation.korund.score, pactReputationFloor);
    } finally {
      await r.close();
    }
  });

  test(`#1495 flag off ratifies the same Kindle–Korund fixture and omits the refusal key (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      r.setFixtureEnv(FLAG, 'false');
      const now = Math.floor(r.now / 1000);
      await seedSeats(r, now);
      await insertTreaty(r, { id: 'k-break-1', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: now - 200 });
      await insertTreaty(r, { id: 'k-break-2', kind: 'non-aggression', proposer: 'aurelle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: now - 180 });
      await insertTreaty(r, { id: 'k-nap', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'proposed', now, proposedAt: now - 1 });
      const world = await r.call('world', null);
      assert.equal(world.status, 200);
      const row = await r.db.prepare("SELECT status FROM treaties WHERE id='k-nap'").first();
      assert.equal(row.status, 'in_force', 'flag off is identical to current dev: the pact ratifies');
      assert.equal('napReputationRefusals' in world.data.simulation, false);
    } finally {
      await r.close();
    }
  });
}

test('#1495 one uncapped reputation read per decideProposedTreaties; trade still ratifies at the floor', async () => {
  const r = await localRuntime({ backend: 'sqlite' });
  try {
    r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
    r.setFixtureEnv(FLAG, 'true');
    const now = Math.floor(r.now / 1000);
    await seedSeats(r, now);
    await insertTreaty(r, { id: 'k-break-1', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: now - 200 });
    await insertTreaty(r, { id: 'k-break-2', kind: 'non-aggression', proposer: 'aurelle', other: 'korund', status: 'broken', brokenBy: 'korund', now, proposedAt: now - 180 });
    await insertTreaty(r, { id: 'k-nap', kind: 'non-aggression', proposer: 'kindle', other: 'korund', status: 'proposed', now, proposedAt: now - 2 });
    await insertTreaty(r, { id: 'k-trade', kind: 'trade', proposer: 'kindle', other: 'korund', status: 'proposed', now, proposedAt: now - 1 });
    const d = await r.importModule('lib/diplomacy.ts');
    let reads = 0;
    const original = r.db.prepare.bind(r.db);
    r.db.prepare = (sql, ...rest) => {
      if (sql === worldReputationBreaksSql) reads += 1;
      return original(sql, ...rest);
    };
    await d.runDiplomacy(r.db, now, { napReputationGate: true });
    assert.equal(reads, 1, 'scores are read once, not per proposal');
    assert.equal((await r.db.prepare("SELECT status FROM treaties WHERE id='k-nap'").first()).status, 'rejected');
    assert.equal((await r.db.prepare("SELECT status FROM treaties WHERE id='k-trade'").first()).status, 'in_force', 'trade is not gated');
  } finally {
    await r.close();
  }
});

test('#1495 Korund fog hides a Kindle–Aurelle refusal; the panel shows the refusal line', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const require = createRequire(import.meta.url);
  const rt = await localRuntime();
  try {
    const { presentKorundWorldSimulation } = await rt.importModule('lib/war.ts');
    const hidden = presentKorundWorldSimulation({
      napReputationRefusals: [
        { id: 'ka', proposer: 'kindle', other: 'aurelle', decidedAt: 1, bodies: [{ nation: 'kindle', body: 'Assembly' }] },
        { id: 'kk', proposer: 'kindle', other: 'korund', decidedAt: 2, bodies: [{ nation: 'kindle', body: 'Assembly' }] },
      ],
    }, 'korund');
    assert.deepEqual(hidden.napReputationRefusals.map((item) => item.id), ['kk']);
    assert.deepEqual(presentKorundWorldSimulation({ napReputationRefusals: [{ id: 'ka', proposer: 'kindle', other: 'aurelle' }] }, 'kindle').napReputationRefusals.map((item) => item.id), ['ka']);
    const rules = await rt.importModule('lib/diplomacy-rules.ts');
    const copy = await rt.importModule('lib/diplomacy-copy.ts');
    const embargoCopy = await rt.importModule('lib/embargo-copy.ts');
    const exports = {};
    const src = readFileSync(new URL('../app/foreign-affairs-panel.tsx', import.meta.url), 'utf8');
    new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports, (name) => ({
      '@/lib/diplomacy-copy': copy,
      '@/lib/diplomacy-rules': rules,
      '@/lib/embargo-copy': embargoCopy,
      './display-preferences': { useDisplayTimestamp: () => (value) => `T${value}` },
    })[name] ?? require(name));
    const html = renderToStaticMarkup(createElement(exports.ForeignAffairsPanel, {
      treaties: [],
      nationId: 'kindle',
      napReputationRefusals: [{ id: 'k-nap', proposer: 'kindle', other: 'korund', decidedAt: 1, bodies: [{ nation: 'kindle', body: 'Assembly' }] }],
    }));
    assert.match(html, /The Assembly refused a non-aggression pact with Korund because of low World Reputation\./);
    assert.equal(copy.napReputationRefusal.proposal, true);
  } finally {
    await rt.close();
  }
});

const mutate = (file, find, replace) => {
  const original = readFileSync(file, 'utf8');
  const next = original.replace(find, replace);
  assert.notEqual(next, original, `mutant did not apply in ${file}: ${String(find)}`);
  writeFileSync(file, next);
  return () => writeFileSync(file, original);
};
const run = (files, pattern) => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  return spawnSync('node', ['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-name-pattern', pattern, ...files], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, env });
};

test('#1495 mutations: floor off-by-one, own score, trade gating, the LIMIT 20 list, and ignoring the flag all fail', () => {
  const file = 'tests/nap-reputation-gate-1495.test.mjs';
  const cases = [
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'if (score > pactReputationFloor) return ratification;',
      replace: 'if (score >= pactReputationFloor) return ratification;',
      pattern: 'floor is −20|refuses a Kindle–Korund NAP when Korund is at the floor',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'const counterpart = index === 0 ? b : a;',
      replace: 'const counterpart = index === 0 ? a : b;',
      pattern: 'own score is ignored',
    },
    {
      file: 'lib/diplomacy-rules.ts',
      find: 'if (kind !== \'non-aggression\' || !scores || !ratification.passed) return ratification;',
      replace: 'if (!scores || !ratification.passed) return ratification;',
      pattern: 'trade is not gated|trade still ratifies at the floor',
    },
    {
      file: 'lib/diplomacy.ts',
      finds: [
        ['worldReputationFromBreaks, worldLegitimacyFromBreaks, withWorldReputationRecord', 'worldReputation, worldReputationFromBreaks, worldLegitimacyFromBreaks, withWorldReputationRecord'],
        ['const scores = options.napReputationGate ? await readWorldReputation(db, now) : null;', 'const scores = options.napReputationGate ? worldReputation((await readTreaties(db, now)).treaties) : null;'],
      ],
      pattern: 'two older Korund breaks still refuse',
    },
    {
      file: 'lib/world-simulation.ts',
      find: 'runDiplomacy(db, now, { napReputationGate: options.napReputationGate === true })',
      replace: 'runDiplomacy(db, now, { napReputationGate: true })',
      pattern: 'flag off ratifies the same Kindle–Korund fixture',
    },
  ];
  for (const c of cases) {
    const steps = c.finds ?? [[c.find, c.replace]];
    const restores = [];
    try {
      for (const [find, replace] of steps) restores.push(mutate(c.file, find, replace));
      const result = run([file], c.pattern);
      assert.notEqual(result.status, 0, `mutant survived (${c.find ?? c.finds[0][0]}):\n${result.stdout}\n${result.stderr}`);
    } finally {
      for (const restore of restores.reverse()) restore();
    }
  }
});
