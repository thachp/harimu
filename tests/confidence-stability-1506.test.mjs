/** #1506: Aurelle Crown Currency Confidence feeds Aurelle's Stability (docs §10.1 / §12.4). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';
import {
  computeStability, crownConfidenceStabilityPoints, CROWN_CONFIDENCE_STABILITY_CAP, CROWN_CONFIDENCE_STABILITY_NEUTRAL,
  CROWN_CONFIDENCE_STABILITY_POINTS_PER_STEP, CROWN_CONFIDENCE_STABILITY_STEP, publicStability,
} from '../lib/stability.ts';
import { crownConfig } from '../lib/crown-debasement-rules.ts';

const sum = (terms) => terms.reduce((total, term) => total + term.points, 0);
const tickSeconds = 7200;

test('#1506 curve: 0 at Confidence ≥ 90, then −1 per 5 below 90 (89 → 0, 85 → −1, 84 → −1, 0 → −10); cap −10; never positive', () => {
  assert.equal(CROWN_CONFIDENCE_STABILITY_NEUTRAL, 90);
  assert.equal(CROWN_CONFIDENCE_STABILITY_STEP, 5);
  assert.equal(CROWN_CONFIDENCE_STABILITY_POINTS_PER_STEP, 1);
  assert.equal(CROWN_CONFIDENCE_STABILITY_CAP, 10);
  assert.deepEqual([100, 90, 89, 85, 84, 80, 70, 0].map(crownConfidenceStabilityPoints), [0, 0, 0, -1, -1, -2, -4, -10]);
  assert.equal(crownConfidenceStabilityPoints(200), 0, 'out-of-range high is clamped and never raises Stability');
  assert.equal(crownConfidenceStabilityPoints(-5), -10, 'out-of-range low is clamped to the cap');
  assert.equal(crownConfidenceStabilityPoints(Number.NaN), -10, 'non-numbers are clamped');
  for (let n = 0; n <= 100; n++) assert.ok(crownConfidenceStabilityPoints(n) <= 0);
  assert.equal(crownConfidenceStabilityPoints(0), -CROWN_CONFIDENCE_STABILITY_CAP);
});

test('#1506 computeStability: a currency term is present when the input is (including a 0-point term at 100); without the input the breakdown matches today', () => {
  const base = computeStability({ citizens: 4, fed: 2, worked: 1, petitionBacklog: 1 });
  assert.deepEqual(base.breakdown.stability.map((term) => term.input), ['baseline', 'food', 'work', 'promises', 'petitions']);
  const at100 = computeStability({ citizens: 4, fed: 2, worked: 1, petitionBacklog: 1, crownConfidence: 100 });
  assert.equal(at100.stability, base.stability);
  assert.equal(at100.unrest, base.unrest);
  const currency100 = at100.breakdown.stability.find((term) => term.input === 'currency');
  assert.deepEqual(currency100, { input: 'currency', points: 0, detail: 'Crown Currency Confidence 100/100' });
  assert.equal(sum(at100.breakdown.stability), at100.stability);
  const at80 = computeStability({ citizens: 4, fed: 2, worked: 1, petitionBacklog: 1, crownConfidence: 80 });
  assert.equal(at80.stability, base.stability - 2);
  assert.equal(at80.unrest, base.unrest, 'there is no Unrest term');
  const currency80 = at80.breakdown.stability.find((term) => term.input === 'currency');
  assert.deepEqual(currency80, { input: 'currency', points: -2, detail: 'Crown Currency Confidence 80/100' });
  assert.equal(sum(at80.breakdown.stability), at80.stability);
  const floor = computeStability({ citizens: 10, fed: 0, worked: 0, promisesKept: 0, promisesBroken: 5, petitionBacklog: 20, crownConfidence: 0 });
  assert.equal(floor.stability, 0);
  assert.ok(floor.breakdown.stability.find((term) => term.input === 'currency').points <= 0);
  assert.equal(sum(floor.breakdown.stability), floor.stability);
});

test('#1506 the Stability panel shows the currency breakdown term', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const require = createRequire(import.meta.url);
  const src = await readFile(new URL('../app/stability-panel.tsx', import.meta.url), 'utf8');
  const exports = {};
  new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText)(exports, require);
  const score = computeStability({ citizens: 4, fed: 2, worked: 1, petitionBacklog: 1, crownConfidence: 80 });
  const row = { nationId: 'aurelle', tick: 2, scheduledAt: 1, inputs: { citizens: 4, fed: 2, worked: 1, promisesKept: 0, promisesBroken: 0, petitionBacklog: 1, crownConfidence: 80 }, ...score };
  const markup = renderToStaticMarkup(exports.StabilityPanel({ score: publicStability(row) }));
  assert.match(markup, /Stability -2 · Crown Currency Confidence 80\/100/);
  const korund = renderToStaticMarkup(exports.StabilityPanel({ score: publicStability({ ...row, nationId: 'korund' }) }));
  assert.doesNotMatch(korund, /Currency Confidence/);
});

test('#1506 world-simulation reads confidence in the stability Promise.all only when both flags are on', () => {
  const src = readFileSync(new URL('../lib/world-simulation.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('// #1506: Currency Confidence as of the tick'));
  assert.match(block, /flagOn\(options\.atlasEnv, 'HARIMU_CROWN_CONFIDENCE_STABILITY_ENABLED'\) && flagOn\(options\.atlasEnv, 'HARIMU_CROWN_DEBASEMENT_ENABLED'\)/);
  assert.match(block, /confidenceOn \? readCrownConfidenceAt\(db, Number\(row\.scheduled_at\), \{ warLoss: flagOn\(options\.atlasEnv, 'HARIMU_CROWN_CONFIDENCE_WAR_LOSS_ENABLED'\) && flagOn\(options\.atlasEnv, 'HARIMU_WAR_ENDINGS_ENABLED'\) \}\) : undefined/);
  assert.match(block, /Promise\.all\(\[options\.warWeariness[\s\S]*confidenceOn \? readCrownConfidenceAt/);
  assert.doesNotMatch(src, /cron-advance/);
});

const setFlags = (r, { confidence = true, debasement = true } = {}) => {
  r.setFixtureEnv('HARIMU_CROWN_CONFIDENCE_STABILITY_ENABLED', confidence ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_CROWN_DEBASEMENT_ENABLED', debasement ? 'true' : undefined);
};

const insertDecree = async (r, { id, year, at, confidenceAfter }) => {
  await r.db.prepare('INSERT INTO crown_decrees (id,request_id,game_year,percent_bp,parity_before,parity_after,confidence_before,confidence_after,decreed_by,decreed_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `req-${id}`.padEnd(12, 'x'), year, 1000, 1000, 1100, crownConfig.baselineConfidence, confidenceAfter, 'Monarch', at).run();
};

const aurelleScore = (world) => world.data.simulation.stability.find((row) => row.nationId === 'aurelle');
const nationRow = async (r, nationId, tick = 1) => {
  const row = await r.db.prepare('SELECT nation_id,tick,stability,unrest,inputs_json,breakdown_json FROM nation_stability_scores WHERE nation_id=? AND tick=?').bind(nationId, tick).first();
  return row && { ...row, inputs: JSON.parse(row.inputs_json), breakdown: JSON.parse(row.breakdown_json) };
};

const spyDecreeReads = async (r, fn) => {
  const seen = [];
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = (sql, ...rest) => { seen.push(String(sql)); return prepare(sql, ...rest); };
  try { return { value: await fn(), seen }; } finally { r.db.prepare = prepare; }
};

const advanceOneTick = async (r, afterPreview) => {
  const preview = await r.call('world', null);
  const epoch = preview.data.simulation.clock.epochSeconds;
  const tickAt = epoch + tickSeconds;
  if (afterPreview) await afterPreview({ epoch, tickAt });
  r.setNow((tickAt + 5) * 1000);
  const world = await r.call('world', null);
  assert.equal(world.status, 200);
  return { epoch, tickAt, world };
};

for (const backend of ['sqlite', 'postgres']) {
  test(`#1506 both flags on: no decrees leave a 0-point currency term at baseline 100; two decrees (80) lower Aurelle by 2; Kindle and Korund are unchanged (${backend})`, async () => {
    const on = await localRuntime({ backend });
    const control = await localRuntime({ backend });
    try {
      setFlags(on); setFlags(control);
      const baseline = await advanceOneTick(on);
      const baseRow = await nationRow(on, 'aurelle');
      assert.equal(baseRow.inputs.crownConfidence, 100);
      const term = baseRow.breakdown.stability.find((item) => item.input === 'currency');
      assert.deepEqual(term, { input: 'currency', points: 0, detail: 'Crown Currency Confidence 100/100' });
      assert.equal(aurelleScore(baseline.world).breakdown.stability.find((item) => item.input === 'currency').points, 0);

      const lowered = await advanceOneTick(control, async ({ epoch }) => {
        await insertDecree(control, { id: 'd-90', year: 1, at: epoch + 1, confidenceAfter: 90 });
        await insertDecree(control, { id: 'd-80', year: 2, at: epoch + 2, confidenceAfter: 80 });
      });
      const aurelle = await nationRow(control, 'aurelle');
      assert.equal(aurelle.inputs.crownConfidence, 80);
      assert.equal(aurelle.stability, baseRow.stability - 2);
      assert.equal(aurelle.unrest, baseRow.unrest);
      assert.deepEqual(aurelle.breakdown.stability.find((item) => item.input === 'currency'), { input: 'currency', points: -2, detail: 'Crown Currency Confidence 80/100' });
      for (const nation of ['kindle', 'korund']) {
        const left = await nationRow(on, nation);
        const right = await nationRow(control, nation);
        assert.equal(left.inputs.crownConfidence, undefined, `${nation} is not charged`);
        assert.equal(right.inputs.crownConfidence, undefined);
        assert.equal(right.stability, left.stability);
        assert.deepEqual(right.breakdown, left.breakdown);
      }
      assert.equal(aurelleScore(lowered.world).stability, aurelle.stability);
    } finally {
      await on.close();
      await control.close();
    }
  });

  test(`#1506 a decree after scheduled_at is ignored; a decree at scheduled_at counts (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setFlags(r);
      const { world } = await advanceOneTick(r, async ({ tickAt }) => {
        await insertDecree(r, { id: 'd-future', year: 2, at: tickAt + 1, confidenceAfter: 80 });
        await insertDecree(r, { id: 'd-on-tick', year: 1, at: tickAt, confidenceAfter: 70 });
      });
      const row = await nationRow(r, 'aurelle');
      assert.equal(row.inputs.crownConfidence, 70, 'decreed_at === scheduled_at is included; a later decree is ignored');
      assert.deepEqual(row.breakdown.stability.find((item) => item.input === 'currency'), { input: 'currency', points: -4, detail: 'Crown Currency Confidence 70/100' });
      assert.equal(aurelleScore(world).stability, row.stability);
    } finally {
      await r.close();
    }
  });

  test(`#1506 same-timestamp ties: two decrees with the same decreed_at <= scheduled_at pick game_year DESC, then id DESC (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setFlags(r);
      const { world } = await advanceOneTick(r, async ({ epoch, tickAt }) => {
        const at = epoch + 1;
        assert.ok(at <= tickAt);
        // Later game_year has the smaller id, so id-first or ASC year would pick the other row.
        await insertDecree(r, { id: 'd-z', year: 1, at, confidenceAfter: 80 });
        await insertDecree(r, { id: 'd-a', year: 2, at, confidenceAfter: 70 });
      });
      const row = await nationRow(r, 'aurelle');
      assert.equal(row.inputs.crownConfidence, 70, 'same decreed_at: game_year descending wins over a larger id');
      assert.deepEqual(row.breakdown.stability.find((item) => item.input === 'currency'), { input: 'currency', points: -4, detail: 'Crown Currency Confidence 70/100' });
      assert.equal(aurelleScore(world).stability, row.stability);
    } finally {
      await r.close();
    }
  });

  test(`#1506 flag off: byte-identical Stability JSON against the flag-off baseline and crown_decrees is not read (${backend})`, async () => {
    const baseline = await localRuntime({ backend });
    const off = await localRuntime({ backend });
    try {
      const base = await advanceOneTick(baseline, async ({ epoch }) => {
        await insertDecree(baseline, { id: 'd-80', year: 1, at: epoch + 1, confidenceAfter: 80 });
      });
      const baseAurelle = await nationRow(baseline, 'aurelle');
      const preview = await off.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      const tickAt = epoch + tickSeconds;
      await insertDecree(off, { id: 'd-80', year: 1, at: epoch + 1, confidenceAfter: 80 });
      off.setNow((tickAt + 5) * 1000);
      const { value, seen } = await spyDecreeReads(off, () => off.call('world', null));
      assert.equal(value.status, 200);
      const offAurelle = await nationRow(off, 'aurelle');
      assert.equal(offAurelle.inputs.crownConfidence, undefined);
      assert.equal(offAurelle.breakdown.stability.some((item) => item.input === 'currency'), false);
      assert.deepEqual(offAurelle, baseAurelle);
      assert.deepEqual(aurelleScore(value), aurelleScore(base.world));
      assert.equal(seen.some((sql) => /crown_decrees/i.test(sql)), false, 'flag off must not read crown_decrees');
    } finally {
      await baseline.close();
      await off.close();
    }
  });

  test(`#1506 HARIMU_CROWN_DEBASEMENT_ENABLED off: no term, no read, byte-identical to the flag-off baseline even when the Confidence flag is on (${backend})`, async () => {
    const baseline = await localRuntime({ backend });
    const partial = await localRuntime({ backend });
    try {
      const base = await advanceOneTick(baseline, async ({ epoch }) => {
        await insertDecree(baseline, { id: 'd-80', year: 1, at: epoch + 1, confidenceAfter: 80 });
      });
      setFlags(partial, { confidence: true, debasement: false });
      const preview = await partial.call('world', null);
      const epoch = preview.data.simulation.clock.epochSeconds;
      const tickAt = epoch + tickSeconds;
      await insertDecree(partial, { id: 'd-80', year: 1, at: epoch + 1, confidenceAfter: 80 });
      partial.setNow((tickAt + 5) * 1000);
      const { value, seen } = await spyDecreeReads(partial, () => partial.call('world', null));
      assert.equal(value.status, 200);
      const row = await nationRow(partial, 'aurelle');
      assert.equal(row.inputs.crownConfidence, undefined);
      assert.deepEqual(row, await nationRow(baseline, 'aurelle'));
      assert.deepEqual(aurelleScore(value), aurelleScore(base.world));
      assert.equal(seen.some((sql) => /crown_decrees/i.test(sql)), false);
    } finally {
      await baseline.close();
      await partial.close();
    }
  });

}

// #584: DROP TABLE fails on the PGlite fixture; pin the missing-table case to SQLite. The 42P01 shape is covered below.
test('#1506 a missing crown_decrees table adds no term and does not throw (sqlite)', async () => {
  const r = await localRuntime({ backend: 'sqlite' });
  try {
    const preview = await r.call('world', null);
    const epoch = preview.data.simulation.clock.epochSeconds;
    await r.db.prepare('DROP TABLE crown_decrees').run();
    setFlags(r);
    r.setNow((epoch + tickSeconds + 5) * 1000);
    const world = await r.call('world', null);
    assert.equal(world.status, 200);
    const row = await nationRow(r, 'aurelle');
    assert.ok(row, 'scores are still written');
    assert.equal(row.inputs.crownConfidence, undefined);
    assert.equal(row.breakdown.stability.some((item) => item.input === 'currency'), false);
  } finally {
    await r.close();
  }
});

test('#1506 readCrownConfidenceAt returns null on a missing-relation error (including the Postgres 42P01 shape)', async () => {
  const r = await localRuntime();
  try {
    const { readCrownConfidenceAt } = await r.importModule('lib/crown-debasement.ts');
    const missing = async (error) => {
      const db = { prepare() { return { bind() { return this; }, first: async () => { throw error; } }; } };
      assert.equal(await readCrownConfidenceAt(db, 1_000), null);
    };
    await missing(Object.assign(new Error('no such table: crown_decrees'), { code: 'SQLITE_ERROR' }));
    await missing(Object.assign(new Error('relation "crown_decrees" does not exist'), { code: '42P01' }));
    const other = Object.assign(new Error('PostgreSQL operation failed (57014).'), { code: '57014' });
    const db = { prepare() { return { bind() { return this; }, first: async () => { throw other; } }; } };
    await assert.rejects(() => readCrownConfidenceAt(db, 1_000), /57014/);
  } finally {
    await r.close();
  }
});

test('#1506 mutants of the curve, as-of read, tiebreak, Aurelle-only attach, and flag gate are caught in a scratch tree', () => {
  const file = 'tests/confidence-stability-1506.test.mjs';
  const cases = [
    {
      file: 'lib/stability.ts',
      find: 'Math.floor(Math.max(0, CROWN_CONFIDENCE_STABILITY_NEUTRAL - c) / CROWN_CONFIDENCE_STABILITY_STEP)',
      replace: 'Math.ceil(Math.max(0, CROWN_CONFIDENCE_STABILITY_NEUTRAL - c) / CROWN_CONFIDENCE_STABILITY_STEP)',
      pattern: '#1506 curve',
    },
    {
      file: 'lib/stability.ts',
      find: 'return Math.max(-CROWN_CONFIDENCE_STABILITY_CAP, pts) || 0; // no -0; never positive',
      replace: 'return pts || 0; // no -0; never positive',
      pattern: '#1506 curve',
    },
    {
      file: 'lib/crown-debasement.ts',
      find: 'SELECT confidence_after FROM crown_decrees WHERE decreed_at<=? ORDER BY decreed_at DESC, game_year DESC, id DESC LIMIT 1',
      replace: 'SELECT confidence_after FROM crown_decrees ORDER BY decreed_at DESC, game_year DESC, id DESC LIMIT 1',
      pattern: '#1506 a decree after scheduled_at is ignored',
    },
    {
      file: 'lib/crown-debasement.ts',
      find: 'SELECT confidence_after FROM crown_decrees WHERE decreed_at<=? ORDER BY decreed_at DESC, game_year DESC, id DESC LIMIT 1',
      replace: 'SELECT confidence_after FROM crown_decrees WHERE decreed_at<=? ORDER BY decreed_at DESC, id DESC, game_year DESC LIMIT 1',
      pattern: '#1506 same-timestamp ties',
    },
    {
      file: 'lib/stability.ts',
      find: "if (nationId === 'aurelle' && options.crownConfidence !== undefined) inputs.crownConfidence = options.crownConfidence;",
      replace: "if (options.crownConfidence !== undefined) inputs.crownConfidence = options.crownConfidence;",
      pattern: '#1506 both flags on: no decrees leave a 0-point currency term',
    },
    {
      file: 'lib/world-simulation.ts',
      find: "const confidenceOn = flagOn(options.atlasEnv, 'HARIMU_CROWN_CONFIDENCE_STABILITY_ENABLED') && flagOn(options.atlasEnv, 'HARIMU_CROWN_DEBASEMENT_ENABLED');",
      replace: 'const confidenceOn = true;',
      pattern: '#1506 flag off: byte-identical Stability JSON',
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
