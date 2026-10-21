/** #615: AI eval harness v1 (npm run eval:ai). Offline fixtures through each AI feature's real validator; no model call, no secrets. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { evalFeatures, evalTable, featureValidators, readFixtures, runEvals } from './ai-evals/harness.mjs';

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
