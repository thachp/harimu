/** #1515: enacted Aurelle surrender or ceding concession lowers Crown Currency Confidence at read time. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';
import {
  crownConfidenceWithWarLosses, WAR_LOSS_CONFIDENCE_CAP, WAR_LOSS_CONFIDENCE_DROP, crownConfig,
} from '../lib/crown-debasement-rules.ts';

const tickSeconds = 7200;
const mobilization = 172800;

test('#1515 curve: −10 per lost war, term capped at −30, floored at 0, never positive', () => {
  assert.equal(WAR_LOSS_CONFIDENCE_DROP, 10);
  assert.equal(WAR_LOSS_CONFIDENCE_CAP, 30);
  assert.equal(crownConfidenceWithWarLosses(100, 0), 100);
  assert.equal(crownConfidenceWithWarLosses(100, 1), 90);
  assert.equal(crownConfidenceWithWarLosses(90, 2), 70);
  assert.equal(crownConfidenceWithWarLosses(10, 3), 0);
  assert.equal(crownConfidenceWithWarLosses(100, 3), 70);
  assert.equal(crownConfidenceWithWarLosses(100, 4), 70, 'the war-loss term is capped at −30');
  assert.equal(crownConfidenceWithWarLosses(200, 1), 90, 'decree Confidence is clamped to 100');
  assert.equal(crownConfidenceWithWarLosses(-5, 0), 0);
  assert.equal(crownConfidenceWithWarLosses(Number.NaN, 1), 90);
  assert.equal(crownConfidenceWithWarLosses(100, -2), 100);
  assert.equal(crownConfidenceWithWarLosses(100, 1.5), 100);
  for (let n = 0; n <= 6; n++) assert.ok(crownConfidenceWithWarLosses(100, n) <= 100 && crownConfidenceWithWarLosses(100, n) >= 0);
});

const setLossFlags = (r, { loss = true, debasement = true, endings = true, stability = false } = {}) => {
  r.setFixtureEnv('HARIMU_CROWN_CONFIDENCE_WAR_LOSS_ENABLED', loss ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_CROWN_DEBASEMENT_ENABLED', debasement ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_WAR_ENDINGS_ENABLED', endings ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_CROWN_CONFIDENCE_STABILITY_ENABLED', stability ? 'true' : undefined);
};

const insertDecree = async (r, { id, year, at, confidenceAfter }) => {
  await r.db.prepare('INSERT INTO crown_decrees (id,request_id,game_year,percent_bp,parity_before,parity_after,confidence_before,confidence_after,decreed_by,decreed_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `req-${id}`.padEnd(12, 'x'), year, 1000, 1000, 1100, crownConfig.baselineConfidence, confidenceAfter, 'Monarch', at).run();
};

const insertWar = async (r, { id, attacker = 'kindle', defender = 'aurelle', at, endedAt }) => {
  const pair = [attacker, defender].sort().join(':');
  await r.db.prepare('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `rw-${id}`, pair, attacker, defender, '', 'AI', at, at + mobilization, endedAt ?? null, endedAt == null ? null : 'treaty').run();
};

const insertEnding = async (r, { id, warId, kind = 'surrender', proposer = 'aurelle', other = 'kindle', status = 'enacted', at, squares }) => {
  const squaresJson = kind === 'concession' ? JSON.stringify(squares ?? [{ x: 1, y: 1 }]) : null;
  await r.db.prepare('INSERT INTO war_end_terms (id,request_id,war_id,kind,proposer_nation,other_nation,squares_json,proposed_at,status,decided_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `re-${id}`, warId, kind, proposer, other, squaresJson, at, status, status === 'proposed' ? null : at).run();
};

const insertAurelleLoss = async (r, { id, at, kind = 'surrender' }) => {
  await insertWar(r, { id: `w-${id}`, at, endedAt: at });
  await insertEnding(r, { id, warId: `w-${id}`, kind, at });
};

const spySql = async (r, fn) => {
  const seen = [];
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = (sql, ...rest) => { seen.push(String(sql)); return prepare(sql, ...rest); };
  try { return { value: await fn(), seen }; } finally { r.db.prepare = prepare; }
};

const aurelleScore = (world) => world.data.simulation.stability.find((row) => row.nationId === 'aurelle');
const nationRow = async (r, nationId, tick = 1) => {
  const row = await r.db.prepare('SELECT nation_id,tick,stability,unrest,inputs_json,breakdown_json FROM nation_stability_scores WHERE nation_id=? AND tick=?').bind(nationId, tick).first();
  return row && { ...row, inputs: JSON.parse(row.inputs_json), breakdown: JSON.parse(row.breakdown_json) };
};

const previewTick = async (r) => {
  const preview = await r.call('world', null);
  return { epoch: preview.data.simulation.clock.epochSeconds, tickAt: preview.data.simulation.clock.epochSeconds + tickSeconds };
};

for (const backend of ['sqlite', 'postgres']) {
  test(`#1515 flags on: an enacted Aurelle surrender or ceding concession lowers mint Confidence by 10; stored decree Confidence is unchanged (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setLossFlags(r);
      await r.db.prepare("UPDATE citizens SET nation_id='aurelle'").run();
      const { epoch } = await previewTick(r);
      const crown = await r.importModule('lib/crown-debasement.ts');
      assert.equal((await crown.readCrownMint(r.db, epoch + 10, { warLoss: true })).currencyConfidence, 100);
      await insertAurelleLoss(r, { id: 'surr', at: epoch + 1 });
      const mint = await crown.readCrownMint(r.db, epoch + 10, { warLoss: true });
      assert.equal(mint.currencyConfidence, 90);
      assert.equal(mint.lastDecree, null);
      r.setNow((epoch + 10) * 1000);
      const citizen = await r.call('citizen', 'alice');
      assert.equal(citizen.data.aurellePlan.mint.currencyConfidence, 90);
      await insertWar(r, { id: 'w-cede', attacker: 'korund', defender: 'aurelle', at: epoch + 2, endedAt: epoch + 2 });
      await insertEnding(r, { id: 'cede', warId: 'w-cede', kind: 'concession', proposer: 'aurelle', other: 'korund', at: epoch + 2 });
      assert.equal((await crown.readCrownMint(r.db, epoch + 10, { warLoss: true })).currencyConfidence, 80);
      await insertDecree(r, { id: 'd-90', year: 1, at: epoch, confidenceAfter: 90 });
      const afterDecree = await crown.readCrownMint(r.db, epoch + 10, { warLoss: true });
      assert.equal(afterDecree.currencyConfidence, 70);
      assert.equal(afterDecree.lastDecree.confidenceAfter, 90);
      await insertDecree(r, { id: 'd-10', year: 2, at: epoch + 3, confidenceAfter: 10 });
      const floored = await crown.readCrownMint(r.db, epoch + 10, { warLoss: true });
      assert.equal(floored.currencyConfidence, 0, 'Confidence is floored at 0');
      assert.equal(floored.lastDecree.confidenceAfter, 10);
    } finally { await r.close(); }
  });

  test(`#1515 non-Aurelle and non-loss endings are ignored (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setLossFlags(r);
      const { epoch } = await previewTick(r);
      const crown = await r.importModule('lib/crown-debasement.ts');
      await insertWar(r, { id: 'w-k', attacker: 'aurelle', defender: 'kindle', at: epoch + 1, endedAt: epoch + 1 });
      await insertEnding(r, { id: 'k-surr', warId: 'w-k', kind: 'surrender', proposer: 'kindle', other: 'aurelle', at: epoch + 1 });
      await insertWar(r, { id: 'w-recv', attacker: 'kindle', defender: 'aurelle', at: epoch + 2, endedAt: epoch + 2 });
      await insertEnding(r, { id: 'recv', warId: 'w-recv', kind: 'concession', proposer: 'kindle', other: 'aurelle', at: epoch + 2 });
      await insertWar(r, { id: 'w-prop', attacker: 'korund', defender: 'aurelle', at: epoch + 3, endedAt: null });
      await insertEnding(r, { id: 'prop', warId: 'w-prop', status: 'proposed', at: epoch + 3 });
      await insertWar(r, { id: 'w-rej', attacker: 'korund', defender: 'aurelle', at: epoch + 4, endedAt: epoch + 4 });
      await insertEnding(r, { id: 'rej', warId: 'w-rej', status: 'rejected', at: epoch + 4 });
      assert.equal((await crown.readCrownMint(r.db, epoch + 20, { warLoss: true })).currencyConfidence, 100);
    } finally { await r.close(); }
  });

  test(`#1515 four lost wars cap the term at −30; a later decided_at is ignored as of the earlier time (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setLossFlags(r);
      const { epoch } = await previewTick(r);
      const crown = await r.importModule('lib/crown-debasement.ts');
      for (let i = 0; i < 4; i++) await insertAurelleLoss(r, { id: `cap${i}`, at: epoch + 1 + i });
      assert.equal((await crown.readCrownMint(r.db, epoch + 20, { warLoss: true })).currencyConfidence, 70);
      await insertAurelleLoss(r, { id: 'future', at: epoch + 50 });
      assert.equal((await crown.readCrownMint(r.db, epoch + 20, { warLoss: true })).currencyConfidence, 70, 'a loss decided after the as-of time does not count');
      assert.equal((await crown.readCrownMint(r.db, epoch + 50, { warLoss: true })).currencyConfidence, 70, 'a fifth loss is still capped at −30');
    } finally { await r.close(); }
  });

  test(`#1515 Stability uses the same as-of war-loss Confidence; a later decided_at is ignored (${backend})`, async () => {
    const on = await localRuntime({ backend });
    const lost = await localRuntime({ backend });
    try {
      setLossFlags(on, { stability: true });
      setLossFlags(lost, { stability: true });
      const basePreview = await previewTick(on);
      on.setNow((basePreview.tickAt + 5) * 1000);
      const baseWorld = await on.call('world', null);
      assert.equal(baseWorld.status, 200);
      const baseRow = await nationRow(on, 'aurelle');
      assert.equal(baseRow.inputs.crownConfidence, 100);

      const { epoch, tickAt } = await previewTick(lost);
      await insertAurelleLoss(lost, { id: 's1', at: epoch + 1 });
      await insertAurelleLoss(lost, { id: 's2', at: tickAt });
      await insertAurelleLoss(lost, { id: 'future', at: tickAt + 1 });
      lost.setNow((tickAt + 5) * 1000);
      const world = await lost.call('world', null);
      assert.equal(world.status, 200);
      const row = await nationRow(lost, 'aurelle');
      assert.equal(row.inputs.crownConfidence, 80, 'two in-window losses; the later decided_at is ignored');
      assert.deepEqual(row.breakdown.stability.find((item) => item.input === 'currency'), { input: 'currency', points: -2, detail: 'Crown Currency Confidence 80/100' });
      assert.equal(row.stability, baseRow.stability - 2);
      assert.equal(aurelleScore(world).stability, row.stability);
    } finally { await on.close(); await lost.close(); }
  });

  test(`#1515 flag off: mint and Stability JSON are byte-identical to the flag-off baseline and war_end_terms is not read (${backend})`, async () => {
    const baseline = await localRuntime({ backend });
    const off = await localRuntime({ backend });
    try {
      setLossFlags(baseline, { loss: false, stability: true });
      setLossFlags(off, { loss: false, stability: true });
      await baseline.db.prepare("UPDATE citizens SET nation_id='aurelle'").run();
      await off.db.prepare("UPDATE citizens SET nation_id='aurelle'").run();
      const basePreview = await previewTick(baseline);
      await insertAurelleLoss(baseline, { id: 'surr', at: basePreview.epoch + 1 });
      baseline.setNow((basePreview.tickAt + 5) * 1000);
      const baseWorld = await baseline.call('world', null);
      const baseMint = (await baseline.call('citizen', 'alice')).data.aurellePlan.mint;
      const baseRow = await nationRow(baseline, 'aurelle');

      const preview = await previewTick(off);
      await insertAurelleLoss(off, { id: 'surr', at: preview.epoch + 1 });
      off.setNow((preview.tickAt + 5) * 1000);
      const { value: world, seen } = await spySql(off, () => off.call('world', null));
      assert.equal(world.status, 200);
      const { value: citizen, seen: mintSeen } = await spySql(off, () => off.call('citizen', 'alice'));
      assert.deepEqual(await nationRow(off, 'aurelle'), baseRow);
      assert.deepEqual(aurelleScore(world), aurelleScore(baseWorld));
      assert.deepEqual(citizen.data.aurellePlan.mint, baseMint);
      assert.equal(baseMint.currencyConfidence, 100);
      assert.equal([...seen, ...mintSeen].some((sql) => /war_end_terms/i.test(sql)), false);
    } finally { await baseline.close(); await off.close(); }
  });

  test(`#1515 WAR_ENDINGS off: no term and no read even when the war-loss flag is on (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setLossFlags(r, { endings: false, stability: true });
      await r.db.prepare("UPDATE citizens SET nation_id='aurelle'").run();
      const { epoch, tickAt } = await previewTick(r);
      await insertAurelleLoss(r, { id: 'surr', at: epoch + 1 });
      r.setNow((tickAt + 5) * 1000);
      const { value: world, seen } = await spySql(r, () => r.call('world', null));
      const { value: citizen, seen: mintSeen } = await spySql(r, () => r.call('citizen', 'alice'));
      assert.equal(world.status, 200);
      assert.equal((await nationRow(r, 'aurelle')).inputs.crownConfidence, 100);
      assert.equal(citizen.data.aurellePlan.mint.currencyConfidence, 100);
      assert.equal([...seen, ...mintSeen].some((sql) => /war_end_terms/i.test(sql)), false);
    } finally { await r.close(); }
  });
}

test('#1515 a missing war_end_terms table leaves the decree-only value and does not throw (sqlite)', async () => {
  const r = await localRuntime({ backend: 'sqlite' });
  try {
    setLossFlags(r, { stability: true });
    await r.db.prepare("UPDATE citizens SET nation_id='aurelle'").run();
    const preview = await r.call('world', null);
    const epoch = preview.data.simulation.clock.epochSeconds;
    await r.db.prepare('DROP TABLE war_end_terms').run();
    const crown = await r.importModule('lib/crown-debasement.ts');
    assert.equal((await crown.readCrownMint(r.db, epoch + 10, { warLoss: true })).currencyConfidence, 100);
    r.setNow((epoch + tickSeconds + 5) * 1000);
    const world = await r.call('world', null);
    assert.equal(world.status, 200);
    assert.equal((await nationRow(r, 'aurelle')).inputs.crownConfidence, 100);
    assert.equal((await r.call('citizen', 'alice')).data.aurellePlan.mint.currencyConfidence, 100);
  } finally { await r.close(); }
});

test('#1515 count of lost wars returns 0 on a missing-relation error (including the Postgres 42P01 shape)', async () => {
  const r = await localRuntime();
  try {
    const { readCrownMint, readCrownConfidenceAt } = await r.importModule('lib/crown-debasement.ts');
    const missing = async (error) => {
      const db = {
        prepare(sql) {
          const thrower = { bind() { return this; }, first: async () => { throw error; }, catch(fn) { return Promise.reject(error).catch(fn); } };
          if (/crown_decrees/i.test(sql)) return thrower;
          if (/war_end_terms/i.test(sql)) return thrower;
          return { bind() { return this; }, first: async () => null };
        },
      };
      assert.equal((await readCrownMint(db, 1_000, { warLoss: true })).currencyConfidence, 100);
      assert.equal(await readCrownConfidenceAt(db, 1_000, { warLoss: true }), null);
    };
    await missing(Object.assign(new Error('no such table: war_end_terms'), { code: 'SQLITE_ERROR' }));
    await missing(Object.assign(new Error('relation "war_end_terms" does not exist'), { code: '42P01' }));
  } finally { await r.close(); }
});

test('#1515 mutants of the cap, as-of bound, Aurelle filter, and Stability wiring are caught in a scratch tree', () => {
  const file = 'tests/war-loss-confidence-1515.test.mjs';
  const cases = [
    {
      file: 'lib/crown-debasement-rules.ts',
      find: 'const term = -Math.min(WAR_LOSS_CONFIDENCE_CAP, n * WAR_LOSS_CONFIDENCE_DROP);',
      replace: 'const term = -(n * WAR_LOSS_CONFIDENCE_DROP);',
      pattern: '#1515 curve',
    },
    {
      file: 'lib/crown-debasement-rules.ts',
      find: 'return Math.max(0, decree + term);',
      replace: 'return decree + term;',
      pattern: '#1515 curve',
    },
    {
      file: 'lib/crown-debasement.ts',
      find: "SELECT COUNT(*) AS n FROM war_end_terms WHERE status='enacted' AND proposer_nation='aurelle' AND kind IN ('surrender','concession') AND decided_at<=?",
      replace: "SELECT COUNT(*) AS n FROM war_end_terms WHERE status='enacted' AND proposer_nation='aurelle' AND kind IN ('surrender','concession')",
      pattern: '#1515 four lost wars cap the term at −30; a later decided_at is ignored',
    },
    {
      file: 'lib/crown-debasement.ts',
      find: "SELECT COUNT(*) AS n FROM war_end_terms WHERE status='enacted' AND proposer_nation='aurelle' AND kind IN ('surrender','concession') AND decided_at<=?",
      replace: "SELECT COUNT(*) AS n FROM war_end_terms WHERE status='enacted' AND kind IN ('surrender','concession') AND decided_at<=?",
      pattern: '#1515 non-Aurelle and non-loss endings are ignored',
    },
    {
      file: 'lib/world-simulation.ts',
      find: "confidenceOn ? readCrownConfidenceAt(db, Number(row.scheduled_at), { warLoss: flagOn(options.atlasEnv, 'HARIMU_CROWN_CONFIDENCE_WAR_LOSS_ENABLED') && flagOn(options.atlasEnv, 'HARIMU_WAR_ENDINGS_ENABLED') }) : undefined",
      replace: 'confidenceOn ? readCrownConfidenceAt(db, Number(row.scheduled_at)) : undefined',
      pattern: '#1515 Stability uses the same as-of war-loss Confidence',
    },
  ];
  const tree = mutantTree();
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
