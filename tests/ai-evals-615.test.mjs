/** #615: AI eval harness v1 (npm run eval:ai). Offline fixtures through each AI feature's real validator; no model call, no secrets. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { evalFeatures, evalTable, featureValidators, modelStageAllowed, readFixtures, requiredRules, runEvals } from './ai-evals/harness.mjs';


const load = async t => { const r = await localRuntime(); t.after(() => r.close()); return featureValidators(r.importModule); };

test('every AI feature has at least 5 must_reject and 2 legal fixtures; all must_reject are refused and all legal accepted', async t => {
  const result = runEvals(await load(t));
  assert.deepEqual(result.escapes, [], evalTable(result));
  assert.deepEqual(result.rows.map(r => r.feature), ['news', 'notables', 'cabinet', 'town_hall', 'debate']);
  for (const r of result.rows) {
    assert.ok(r.mustReject >= 5 && r.rejected === r.mustReject, `${r.feature} must_reject`);
    assert.ok(r.legal >= 2 && r.accepted === r.legal, `${r.feature} legal`);
  }
  assert.match(evalTable(result), /PASS: zero validator escapes/);
  for (const f of evalFeatures) {
    const list = readFixtures(f), cats = new Set(list.filter(x => x.expect === 'must_reject').map(x => x.category));
    for (const rule of requiredRules[f]) assert.ok(cats.has(rule), `${f}: no must_reject fixture for "${rule}"`);
    assert.deepEqual(list.filter(x => x.expect === 'model_stage').map(x => [x.id, x.category]).sort(), Object.entries(modelStageAllowed).sort(), `${f}: model_stage is exactly the allowlist`);
  }
});

test('each markup fixture breaks only the markup rule: with the markup characters removed the same validator accepts it', async t => {
  const v = await load(t);
  for (const f of evalFeatures) for (const x of readFixtures(f).filter(x => x.category === 'markup injection')) {
    assert.match(x.output, /[<>[\]{}]/); assert.doesNotMatch(x.output.replace(/^\{|\}$/g, ''), /\p{Number}/u, `${f}/${x.id} is digit-free`);
    const plain = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(x.output)).map(([k, val]) => [k, typeof val === 'string' ? val.replace(/[<>[\]{}]/g, '') : val])));
    assert.equal(v[f](x.output), false, `${f}/${x.id}`); assert.equal(v[f](plain), true, `${f}/${x.id} without markup`);
  }
});

test('model_stage: off the allowlist, or already refused by the validator, fails the run; ids are printed', async t => {
  const real = await load(t), all = Object.fromEntries(evalFeatures.map(f => [f, readFixtures(f)]));
  const relabel = runEvals(real, { ...all, debate: all.debate.map(x => x.id === 'too-short' ? { ...x, expect: 'model_stage' } : x) });
  const missing = runEvals(real, { ...all, town_hall: all.town_hall.filter(x => x.category !== 'markup injection') });
  assert.ok(missing.escapes.some(e => e.feature === 'town_hall' && e.id === 'category:markup injection'), 'a whole missing rule category fails the run');
  assert.ok(relabel.escapes.some(e => e.id === 'too-short' && /not allowlisted/.test(e.why)), 'relabelling a must_reject fixture fails');
  const recat = runEvals(real, { ...all, news: all.news.map(x => x.id === 'private-data' ? { ...x, category: 'other' } : x) });
  assert.ok(recat.escapes.some(e => e.id === 'private-data' && /not allowlisted/.test(e.why)), 'an allowlisted id under another category fails');
  const refused = runEvals(real, { ...all, cabinet: all.cabinet.map(x => x.id === 'private-data' ? { ...x, output: '{}' } : x) });
  assert.ok(refused.escapes.some(e => e.id === 'private-data' && /already refuses/.test(e.why)));
  const table = evalTable(runEvals(real));
  for (const f of evalFeatures) for (const id of Object.keys(modelStageAllowed)) assert.match(table, new RegExp(`^MODEL_STAGE ${f}/${id}:`, 'm'));
});

test('real public-figure names appear only in real-world-name red-team fixtures and the denylist: never in other fixtures or in game content', () => {
  const names = ['Joe Biden', 'Biden', 'Democratic Party'];
  for (const f of evalFeatures) for (const x of readFixtures(f)) if (x.category !== 'real-world political name') for (const n of names) assert.ok(!x.output.includes(n), `${f}/${x.id} uses ${n}`);
  const files = ['lib', 'app', 'worker', 'components', 'public'].filter(d => existsSync(d)).flatMap(d => readdirSync(d, { recursive: true }).map(p => `${d}/${p}`)).filter(p => /\.(tsx?|mdx?|json)$/.test(p));
  for (const p of files.filter(p => p !== 'lib/ai-denylist.ts')) { const text = readFileSync(p, 'utf8'); for (const n of names) assert.ok(!text.includes(n), `${p} contains ${n}`); }
});

test('a deliberately broken validator fails the gate (accept-all lets must_reject escape; reject-all refuses legal)', async t => {
  const real = await load(t);
  for (const feature of evalFeatures) {
    const acceptAll = runEvals({ ...real, [feature]: () => true }), rejectAll = runEvals({ ...real, [feature]: () => false });
    assert.ok(acceptAll.escapes.some(e => e.feature === feature && /validator escape/.test(e.why)), `${feature}: accept-all`);
    assert.ok(rejectAll.escapes.some(e => e.feature === feature && /legal fixture refused/.test(e.why)), `${feature}: reject-all`);
    assert.match(evalTable(acceptAll), /^FAIL: \d+ escape/m);
  }
  const unlabeled = runEvals(real, { ...Object.fromEntries(evalFeatures.map(f => [f, readFixtures(f)])), news: [{ id: 'x', output: '{}' }] });
  assert.ok(unlabeled.escapes.some(e => e.id === 'x'), 'a fixture without a known expect label fails');
});

test('npm run eval:ai prints the per-feature table and exits 0 offline', () => {
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).scripts['eval:ai'], 'node --experimental-strip-types scripts/eval-ai.mjs');
  const out = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/eval-ai.mjs'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.match(out, /^feature\s+legal accepted\s+must_reject rejected\s+model_stage/m);
  for (const f of evalFeatures) assert.match(out, new RegExp(`^${f}\\s+\\d`, 'm'));
  assert.match(out, /PASS: zero validator escapes/);
  // A fixture set with one escape (a hostile draft labelled legal) makes the command exit non-zero.
  const dir = mkdtempSync(join(tmpdir(), 'eval-ai-615-'));
  for (const f of evalFeatures) writeFileSync(join(dir, `${f}.json`), JSON.stringify(f === 'cabinet' ? [...readFixtures(f), { id: 'mislabelled', expect: 'legal', category: 'x', output: '{"response":"Spend 500 now."}' }] : readFixtures(f)));
  let failed;
  try { execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/eval-ai.mjs', dir], { encoding: 'utf8', env: { PATH: process.env.PATH } }); } catch (error) { failed = error; }
  assert.equal(failed?.status, 1); assert.match(failed.stdout, /ESCAPE cabinet\/mislabelled: legal fixture refused/);
});

test('the harness uses each feature\'s real parse + validator chain (pinned to the source) and makes no model or network call', () => {
  const src = f => readFileSync(`lib/${f}`, 'utf8');
  assert.match(src('ai-news.ts'), /validatedNewsIntroduction\(JSON\.parse\(raw\)\)/, 'news');
  assert.match(src('notables.ts'), /validatedNewsDraft\(JSON\.parse\(raw\)\)/, 'notables');
  assert.match(src('cabinet-response-ai.ts'), /try\{parsed=JSON\.parse\(raw\);\}catch\{parsed=null;\}[^]*?validatedCabinetResponse\(parsed\)/, 'cabinet');
  assert.match(src('town-hall-ai.ts'), /try \{ parsed = JSON\.parse\(raw\); \} catch \{ parsed = null; \}\s*const text = validatedCabinetResponse\(parsed\)/, 'town hall');
  assert.match(src('debate-ai.ts'), /await generateAnswer\(db,/, 'debate answers go through the town hall pipeline');
  for (const f of ['tests/ai-evals/harness.mjs', 'scripts/eval-ai.mjs']) assert.doesNotMatch(readFileSync(f, 'utf8'), /process\.env|fetch\(|\.run\(|HARIMU_|https?:|AI_GATEWAY/, `${f} is offline and reads no secrets`);
});

test('fixtures: unique ids, a known label and category, raw text output', () => {
  for (const f of evalFeatures) {
    const list = readFixtures(f);
    assert.equal(new Set(list.map(x => x.id)).size, list.length, `${f}: unique ids`);
    for (const x of list) {
      assert.ok(['legal', 'must_reject', 'model_stage'].includes(x.expect), `${f}/${x.id}`);
      assert.equal(typeof x.category, 'string'); assert.equal(typeof x.output, 'string');
    }
  }
});
