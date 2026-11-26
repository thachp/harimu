/** #1526: in-force embargoes lower Stability on both sides (target −4, sanctioner −1, combined cap −8). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';
import { computeStability } from '../lib/stability.ts';
import {
  embargoStabilityPoints, embargoStabilityDetail,
  EMBARGO_TARGET_STABILITY_DROP, EMBARGO_SANCTIONER_STABILITY_DROP, EMBARGO_STABILITY_CAP,
} from '../lib/embargo-stability-rules.ts';

const tickSeconds = 7200;
const sum = (terms) => terms.reduce((total, term) => total + term.points, 0);
const embargoTerm = (row) => row.breakdown.stability.find((item) => item.input === 'embargo');

test('#1526 curve: target −4, sanctioner −1, combined term capped at −8, never positive', () => {
  assert.equal(EMBARGO_TARGET_STABILITY_DROP, 4);
  assert.equal(EMBARGO_SANCTIONER_STABILITY_DROP, 1);
  assert.equal(EMBARGO_STABILITY_CAP, 8);
  assert.equal(embargoStabilityPoints({}), 0);
  assert.equal(embargoStabilityPoints({ embargoesAgainstUs: 1 }), -4);
  assert.equal(embargoStabilityPoints({ embargoesWeImpose: 1 }), -1);
  assert.equal(embargoStabilityPoints({ embargoesAgainstUs: 1, embargoesWeImpose: 1 }), -5);
  assert.equal(embargoStabilityPoints({ embargoesAgainstUs: 2 }), -8);
  assert.equal(embargoStabilityPoints({ embargoesAgainstUs: 3 }), -8, 'a third embargo against us is still capped at −8');
  assert.equal(embargoStabilityPoints({ embargoesAgainstUs: 2, embargoesWeImpose: 1 }), -8);
  assert.equal(embargoStabilityPoints({ embargoesAgainstUs: -2, embargoesWeImpose: 1.5 }), 0);
  assert.ok(embargoStabilityPoints({ embargoesAgainstUs: 1 }) <= 0);
  const score = computeStability({ embargoesAgainstUs: 1, embargoesWeImpose: 1 });
  assert.equal(embargoTerm(score).points, -5);
  assert.equal(embargoTerm(score).detail, 'Embargo: −4; Lost exports (our embargo): −1');
  assert.equal(score.stability, sum(score.breakdown.stability));
  assert.ok(!score.breakdown.unrest.some((item) => item.input === 'embargo'));
  assert.equal(embargoTerm(computeStability({})), undefined);
  const floor = computeStability({ embargoesAgainstUs: 2, petitionBacklog: 10_000 });
  assert.ok(floor.stability >= 0 && sum(floor.breakdown.stability) === floor.stability);
  const capLine = embargoStabilityDetail({ embargoesAgainstUs: 2, embargoesWeImpose: 1 });
  assert.equal(capLine, 'Embargo: −8; Lost exports (our embargo): −1; capped at −8');
});

const setFlags = (r, { stability = true, embargo = true } = {}) => {
  r.setFixtureEnv('HARIMU_EMBARGO_STABILITY_ENABLED', stability ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_EMBARGO_ENABLED', embargo ? 'true' : undefined);
};

const insertEmbargo = async (r, { id, actor, target, at, status = 'in_force', liftedAt }) => {
  const pair = [actor, target].sort().join(':');
  const decided = status === 'proposed' ? null : at;
  const imposed = status === 'in_force' || status === 'lifted' ? at : null;
  const lifted = status === 'lifted' ? (liftedAt ?? at) : null;
  await r.db.prepare('INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at,lifted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `req-${id}`.padEnd(12, 'x'), pair, actor, target, 'AI', at, status, decided, imposed, lifted).run();
};

const nationRow = async (r, nationId, tick = 1) => {
  const row = await r.db.prepare('SELECT nation_id,tick,stability,unrest,inputs_json,breakdown_json FROM nation_stability_scores WHERE nation_id=? AND tick=?').bind(nationId, tick).first();
  return row && { ...row, inputs: JSON.parse(row.inputs_json), breakdown: JSON.parse(row.breakdown_json) };
};
const previewTick = async (r) => {
  const preview = await r.call('world', null);
  return { epoch: preview.data.simulation.clock.epochSeconds, tickAt: preview.data.simulation.clock.epochSeconds + tickSeconds };
};
const spySql = async (r, fn) => {
  const seen = [];
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = (sql, ...rest) => { seen.push(String(sql)); return prepare(sql, ...rest); };
  try { return { value: await fn(), seen }; } finally { r.db.prepare = prepare; }
};
const scoreOf = (world, nationId) => world.data.simulation.stability.find((row) => row.nationId === nationId);

for (const backend of ['sqlite', 'postgres']) {
  test(`#1526 flags on: an in-force embargo costs the target −4 and the sanctioner −1; a third nation is unchanged (${backend})`, async () => {
    const base = await localRuntime({ backend });
    const on = await localRuntime({ backend });
    try {
      setFlags(base); setFlags(on);
      const basePreview = await previewTick(base);
      base.setNow((basePreview.tickAt + 5) * 1000);
      assert.equal((await base.call('world', null)).status, 200);
      const baseKindle = await nationRow(base, 'kindle');
      const baseKorund = await nationRow(base, 'korund');
      const baseAurelle = await nationRow(base, 'aurelle');

      const { epoch, tickAt } = await previewTick(on);
      await insertEmbargo(on, { id: 'k-vs-o', actor: 'kindle', target: 'korund', at: epoch + 1 });
      on.setNow((tickAt + 5) * 1000);
      const world = await on.call('world', null);
      assert.equal(world.status, 200);
      const kindle = await nationRow(on, 'kindle');
      const korund = await nationRow(on, 'korund');
      const aurelle = await nationRow(on, 'aurelle');
      assert.equal(kindle.inputs.embargoesWeImpose, 1);
      assert.equal(kindle.inputs.embargoesAgainstUs, 0);
      assert.deepEqual(embargoTerm(kindle), { input: 'embargo', points: -1, detail: 'Lost exports (our embargo): −1' });
      assert.equal(kindle.stability, baseKindle.stability - 1);
      assert.equal(scoreOf(world, 'kindle').stability, kindle.stability);
      assert.ok(scoreOf(world, 'kindle').breakdown.stability.some((item) => item.input === 'embargo'));
      assert.equal(korund.inputs.embargoesAgainstUs, 1);
      assert.equal(korund.inputs.embargoesWeImpose, 0);
      assert.deepEqual(embargoTerm(korund), { input: 'embargo', points: -4, detail: 'Embargo: −4' });
      assert.equal(korund.stability, baseKorund.stability - 4);
      assert.equal(aurelle.stability, baseAurelle.stability);
      assert.equal(aurelle.inputs.embargoesAgainstUs, undefined);
      assert.equal(embargoTerm(aurelle), undefined);
      assert.ok(!aurelle.breakdown.unrest.some((item) => item.input === 'embargo'));
      assert.ok(!kindle.breakdown.unrest.some((item) => item.input === 'embargo'));
    } finally { await base.close(); await on.close(); }
  });

  test(`#1526 two embargoes against one nation cap the term at −8; an extra sanctioner cost does not pass the cap (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setFlags(r);
      const { epoch, tickAt } = await previewTick(r);
      await insertEmbargo(r, { id: 'k-vs-o', actor: 'kindle', target: 'korund', at: epoch + 1 });
      await insertEmbargo(r, { id: 'a-vs-o', actor: 'aurelle', target: 'korund', at: epoch + 1 });
      await insertEmbargo(r, { id: 'o-vs-k', actor: 'korund', target: 'kindle', at: epoch + 1 });
      r.setNow((tickAt + 5) * 1000);
      assert.equal((await r.call('world', null)).status, 200);
      const korund = await nationRow(r, 'korund');
      assert.equal(korund.inputs.embargoesAgainstUs, 2);
      assert.equal(korund.inputs.embargoesWeImpose, 1);
      assert.equal(embargoTerm(korund).points, -8);
      assert.match(embargoTerm(korund).detail, /capped at −8/);
    } finally { await r.close(); }
  });

  test(`#1526 as-of imposed_at and lifted_at; proposed and rejected rows are ignored (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setFlags(r);
      const { epoch, tickAt } = await previewTick(r);
      await insertEmbargo(r, { id: 'live', actor: 'kindle', target: 'korund', at: tickAt });
      await insertEmbargo(r, { id: 'future', actor: 'aurelle', target: 'korund', at: tickAt + 1 });
      await insertEmbargo(r, { id: 'lifted-after', actor: 'kindle', target: 'aurelle', at: epoch + 1, status: 'lifted', liftedAt: tickAt + 1 });
      await insertEmbargo(r, { id: 'lifted-at', actor: 'korund', target: 'aurelle', at: epoch + 1, status: 'lifted', liftedAt: tickAt });
      await insertEmbargo(r, { id: 'prop', actor: 'aurelle', target: 'kindle', at: epoch + 1, status: 'proposed' });
      await insertEmbargo(r, { id: 'rej', actor: 'korund', target: 'kindle', at: epoch + 1, status: 'rejected' });
      r.setNow((tickAt + 5) * 1000);
      assert.equal((await r.call('world', null)).status, 200);
      const korund = await nationRow(r, 'korund');
      const aurelle = await nationRow(r, 'aurelle');
      const kindle = await nationRow(r, 'kindle');
      assert.equal(embargoTerm(korund).points, -4, 'only the in-window imposed embargo counts; the later imposed_at does not');
      assert.equal(embargoTerm(aurelle).points, -4, 'a lift after scheduled_at still counts; a lift at scheduled_at does not');
      assert.equal(embargoTerm(kindle).points, -2, 'Kindle is the sanctioner of the live row and of the lift-after row; proposed and rejected rows add no target cost');
      assert.equal(kindle.inputs.embargoesWeImpose, 2);
      assert.equal(kindle.inputs.embargoesAgainstUs, 0);
    } finally { await r.close(); }
  });

  test(`#1526 flag off: Stability JSON is byte-identical to the flag-off baseline and embargoes is not read (${backend})`, async () => {
    const baseline = await localRuntime({ backend });
    const off = await localRuntime({ backend });
    try {
      setFlags(baseline, { stability: false });
      setFlags(off, { stability: false });
      const basePreview = await previewTick(baseline);
      await insertEmbargo(baseline, { id: 'k-vs-o', actor: 'kindle', target: 'korund', at: basePreview.epoch + 1 });
      baseline.setNow((basePreview.tickAt + 5) * 1000);
      const baseWorld = await baseline.call('world', null);
      const preview = await previewTick(off);
      await insertEmbargo(off, { id: 'k-vs-o', actor: 'kindle', target: 'korund', at: preview.epoch + 1 });
      off.setNow((preview.tickAt + 5) * 1000);
      const { value: world, seen } = await spySql(off, () => off.call('world', null));
      assert.equal(world.status, 200);
      assert.deepEqual(world.data.simulation.stability, baseWorld.data.simulation.stability);
      assert.ok(!seen.some((sql) => /imposed_at<=\?/i.test(sql)), 'flag off must not add the as-of embargo Stability read');
      for (const nationId of ['kindle', 'korund', 'aurelle']) {
        assert.deepEqual(await nationRow(off, nationId), await nationRow(baseline, nationId));
      }
    } finally { await baseline.close(); await off.close(); }
  });

  test(`#1526 EMBARGO_ENABLED off: no term and no read even when the Stability flag is on (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setFlags(r, { embargo: false });
      const { epoch, tickAt } = await previewTick(r);
      await insertEmbargo(r, { id: 'k-vs-o', actor: 'kindle', target: 'korund', at: epoch + 1 });
      r.setNow((tickAt + 5) * 1000);
      const { value: world, seen } = await spySql(r, () => r.call('world', null));
      assert.equal(world.status, 200);
      assert.equal(embargoTerm(await nationRow(r, 'korund')), undefined);
      assert.equal((await nationRow(r, 'korund')).inputs.embargoesAgainstUs, undefined);
      assert.ok(!seen.some((sql) => /embargoes/i.test(sql)));
    } finally { await r.close(); }
  });
}

test('#1526 a missing embargoes table adds no term and does not throw (sqlite)', async () => {
  const r = await localRuntime({ backend: 'sqlite' });
  try {
    setFlags(r);
    await r.db.prepare('DROP TABLE embargoes').run();
    const { tickAt } = await previewTick(r);
    r.setNow((tickAt + 5) * 1000);
    assert.equal((await r.call('world', null)).status, 200);
    const korund = await nationRow(r, 'korund');
    assert.equal(embargoTerm(korund), undefined);
    assert.equal(korund.inputs.embargoesAgainstUs, undefined);
  } finally { await r.close(); }
});

test('#1526 readEmbargoStabilityAt returns null on a missing-relation error (including the Postgres 42P01 shape)', async () => {
  const r = await localRuntime({ backend: 'sqlite' });
  try {
    const { readEmbargoStabilityAt } = await r.importModule('lib/embargo-stability.ts');
    const missing = async (error) => {
      const db = {
        prepare(sql) {
          const thrower = { bind() { return this; }, all: async () => { throw error; }, first: async () => { throw error; }, catch(fn) { return Promise.reject(error).catch(fn); } };
          if (/embargoes/i.test(sql)) return thrower;
          return { bind() { return this; }, all: async () => ({ results: [] }), first: async () => null };
        },
      };
      assert.equal(await readEmbargoStabilityAt(db, 1_000), null);
    };
    await missing(Object.assign(new Error('no such table: embargoes'), { code: 'SQLITE_ERROR' }));
    await missing(Object.assign(new Error('relation "embargoes" does not exist'), { code: '42P01' }));
  } finally { await r.close(); }
});

test('#1526 mutants of the cap, as-of bounds, sanctioner cost, and Stability wiring are caught in a scratch tree', () => {
  const file = 'tests/embargo-stability-1526.test.mjs';
  const cases = [
    {
      file: 'lib/embargo-stability-rules.ts',
      find: 'return -Math.min(EMBARGO_STABILITY_CAP, raw) || 0;',
      replace: 'return -raw || 0;',
      pattern: '#1526 curve',
    },
    {
      file: 'lib/embargo-stability.ts',
      find: 'SELECT actor_nation,target_nation FROM embargoes WHERE imposed_at<=? AND (lifted_at IS NULL OR lifted_at>?)',
      replace: 'SELECT actor_nation,target_nation FROM embargoes WHERE (imposed_at<=? OR 1=1) AND (lifted_at IS NULL OR lifted_at>?)',
      pattern: '#1526 as-of imposed_at and lifted_at',
    },
    {
      file: 'lib/embargo-stability.ts',
      find: 'SELECT actor_nation,target_nation FROM embargoes WHERE imposed_at<=? AND (lifted_at IS NULL OR lifted_at>?)',
      replace: 'SELECT actor_nation,target_nation FROM embargoes WHERE imposed_at<=? AND (1=1 OR ? IS NULL)',
      pattern: '#1526 as-of imposed_at and lifted_at',
    },
    {
      file: 'lib/embargo-stability-rules.ts',
      find: 'const raw = against * EMBARGO_TARGET_STABILITY_DROP + impose * EMBARGO_SANCTIONER_STABILITY_DROP;',
      replace: 'const raw = against * EMBARGO_TARGET_STABILITY_DROP;',
      pattern: '#1526 flags on: an in-force embargo costs the target',
    },
    {
      file: 'lib/world-simulation.ts',
      find: 'embargoStabilityOn ? readEmbargoStabilityAt(db, Number(row.scheduled_at)) : undefined',
      replace: 'undefined',
      pattern: '#1526 flags on: an in-force embargo costs the target',
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
