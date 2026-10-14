import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { applyQuality, validQualityInput, harvestQuestions, qualityGrades, gradeLabel } from '../lib/shift-quality.ts';
import { gradeShift } from '../lib/shift-quality-key.ts';
import { readdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const best = [1, 1, 2]; // mirrors the server-only key in lib/shift-quality-key.ts
const wrong = best.map((b, i) => (b + 1) % harvestQuestions[i].options.length);
const mix = n => best.map((b, i) => i < n ? b : wrong[i]);

test('better decisions give a higher grade and a higher reward; poor never pays less than skipping', () => {
  const grades = [0, 1, 2, 3].map(n => gradeShift('harvest', { answers: mix(n) }, 'human'));
  assert.deepEqual(grades.map(g => g.grade), ['poor', 'fair', 'good', 'excellent']);
  const pay = grades.map(g => applyQuality({ wageMinor: 800, quantity: 4 }, g.multiplierPct));
  assert.deepEqual(pay, [{ wageMinor: 800, quantity: 4 }, { wageMinor: 880, quantity: 4 }, { wageMinor: 1000, quantity: 5 }, { wageMinor: 1200, quantity: 6 }]);
  for (let i = 1; i < pay.length; i++) assert.ok(pay[i].wageMinor > pay[i - 1].wageMinor);
  assert.deepEqual(gradeShift('harvest', { skip: true }, 'human'), { grade: null, multiplierPct: 100, correct: null });
  assert.equal(gradeLabel(null), 'Base (step skipped)'); for (const g of grades) if (g.grade) assert.equal(g.multiplierPct, qualityGrades[g.grade].multiplierPct); assert.equal(best.length, harvestQuestions.length); assert.equal(qualityGrades.excellent.multiplierPct, 150);
});
test('AI citizens and other jobs never get the quality bonus', () => {
  assert.equal(gradeShift('harvest', { answers: best }, 'ai').multiplierPct, 100);
  assert.equal(gradeShift('harvest', { answers: best }, 'ai').grade, null);
  assert.equal(gradeShift('freight', { answers: best }, 'human').multiplierPct, 100);
});
test('input validation: three in-range answers or skip, nothing else', () => {
  assert.equal(validQualityInput({ answers: best }), true); assert.equal(validQualityInput({ skip: true }), true);
  for (const bad of [null, {}, { answers: [0, 1] }, { answers: [0, 1, 9] }, { answers: [0, 1, 1.5] }, { skip: true, answers: best }, { answers: best, multiplierPct: 500 }, { skip: false }]) assert.equal(validQualityInput(bad), false, JSON.stringify(bad));
});

const claim = async (r, user, body) => {
  const start = await r.call('citizen', user, { action: 'commit-work', workOrderId: 'harvest', ...body });
  if (start.status !== 200) return { start };
  r.setNow(Date.parse(start.data.shifts[0].completesAt));
  const shift = (await r.call('citizen', user)).data.shifts.find(s => s.id === start.data.shifts[0].id);
  const done = await r.call('citizen', user, { action: 'claim-work', shiftId: shift.id });
  return { start, shift, done };
};
test('server grades, stores grade + multiplier with the shift, pays it, and shows it on completion', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { start, shift, done } = await claim(r, 'alice', { quality: { answers: best } });
  assert.equal(start.status, 200);
  assert.equal(shift.qualityGrade, 'excellent'); assert.equal(shift.qualityMultiplierPct, 150);
  assert.equal(shift.wageMinor, 1200); assert.equal(shift.rewardQuantity, 6);
  assert.equal(shift.qualityPending, undefined, 'claim() reads after completion');
  assert.equal(start.data.shifts[0].qualityPending, true);
  for (const hidden of ['qualityGrade', 'qualityMultiplierPct', 'wageMinor', 'rewardQuantity']) assert.equal(start.data.shifts[0][hidden], undefined, hidden + ' hidden while running');
  assert.equal(done.status, 200); assert.equal(done.data.economy.walletMinor, 1200);
  const recorded = done.data.shifts.find(s => s.id === shift.id);
  assert.ok(recorded.claimedAt); assert.equal(recorded.qualityGrade, 'excellent'); assert.equal(recorded.qualityMultiplierPct, 150);
  const row = await r.db.prepare('SELECT grade,multiplier_pct,correct FROM shift_quality WHERE shift_id=?').bind(shift.id).first();
  assert.deepEqual({ ...row }, { grade: 'excellent', multiplier_pct: 150, correct: 3 });
});
test('skipping (or an old client sending no quality) keeps the current base reward', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const skipped = await claim(r, 'alice', { quality: { skip: true } });
  assert.equal(skipped.shift.wageMinor, 800); assert.equal(skipped.shift.qualityGrade, null); assert.equal(skipped.shift.qualityMultiplierPct, 100);
  assert.equal(skipped.done.data.economy.walletMinor, 800);
  const legacy = await claim(r, 'bob', {});
  assert.equal(legacy.shift.wageMinor, 800); assert.equal(legacy.shift.qualityMultiplierPct, 100);
});
test('client cannot forge a grade: invalid quality is rejected before WC is spent', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const before = (await r.call('citizen', 'alice')).data.capacity;
  const forged = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality: { answers: best, multiplierPct: 500 } });
  assert.equal(forged.status, 400); assert.equal((await r.call('citizen', 'alice')).data.capacity, before);
  const other = await claim(r, 'alice', { workOrderId: 'freight', quality: { answers: best } });
  assert.equal(other.start.status, 200); assert.equal(other.shift.wageMinor, 1200, 'freight base wage, no bonus'); assert.equal(other.shift.qualityMultiplierPct, 100);
});
test('UI: no grade preview, answers are final, a double click or retry cannot re-grade; skip offers base', async () => {
  const compile = async f => ts.transpileModule(await readFile(new URL(f, import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const nodes = n => !n || typeof n !== 'object' ? [n] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
  const text = t => t.filter(n => typeof n === 'string' || typeof n === 'number').join(' ');
  let state = []; let cursor = 0;
  const react = { useState: init => { const i = cursor++; if (!(i in state)) state[i] = typeof init === 'function' ? init() : init; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; } };
  const exports = {}; new Function('exports', 'require', await compile('../app/shift-quality-step.tsx'))(exports, n => n === 'react' ? react : n === '@/lib/shift-quality' ? require('../lib/shift-quality.ts') : require(n));
  const started = [];
  const render = () => { cursor = 0; return nodes(exports.ShiftQualityStep({ orderId: 'harvest', orderName: 'Savanna harvest', cost: 4, base: { wageMinor: 800, quantity: 4, item: 'food' }, onStart: q => { started.push(q); }, onCancel() {} })); };
  let tree = render(); const btn = (tr, label) => tr.find(n => n?.type === 'button' && text(nodes(n)).includes(label));
  assert.equal(btn(tree, 'Start shift').props.disabled, true, 'all questions required');
  assert.ok(!btn(tree, 'See my grade') && !btn(tree, 'Back'), 'no client-side preview or re-grade loop');
  const radios = tree.filter(n => n?.type === 'input');
  for (let q = 0; q < 3; q++) radios[q * 3 + best[q]].props.onChange();
  tree = render(); assert.doesNotMatch(text(tree), /Grade:|Excellent|12\.00/);
  btn(tree, 'Start shift').props.onClick(); btn(tree, 'Start shift').props.onClick(); btn(tree, 'Skip').props.onClick();
  assert.deepEqual(started, [{ answers: best }], 'one submission only');
  tree = render(); assert.equal(btn(tree, 'Start shift').props.disabled, true); assert.ok(tree.filter(n => n?.type === 'input').every(n => n.props.disabled));
  state = []; started.length = 0; tree = render(); assert.match(text(tree), /8\.00\s*SPK \+\s*4\s*food/); btn(tree, 'Skip').props.onClick(); assert.deepEqual(started, [{ skip: true }]);
  assert.doesNotMatch(JSON.stringify(render(), (k, v) => k === '_owner' ? undefined : v), /"best"|answerKey/, 'rendered step carries no answer key');
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /if \(order\.id === qualityWorkOrderId && rewards\[order\.id\]\) \{ setQualityOrder\(order\)/);
  const board = await readFile(new URL('../app/work-shift-board.tsx', import.meta.url), 'utf8');
  assert.match(board, /active\.qualityPending/);
});
test('the answer key never reaches the client: no client module imports it and no API payload carries it', async t => {
  const lib = await readFile(new URL('../lib/shift-quality.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /\bbest\b|answerKey|gradeShift/, 'client-safe module has no key or grader');
  assert.ok(harvestQuestions.every(q => Object.keys(q).sort().join() === 'options,prompt'));
  const walk = async dir => (await Promise.all((await readdir(new URL(dir, import.meta.url), { withFileTypes: true })).map(e => e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`]))).flat();
  for (const f of (await walk('../app/')).filter(f => /\.tsx?$/.test(f) && !f.startsWith('../app/api/'))) assert.doesNotMatch(await readFile(new URL(f, import.meta.url), 'utf8'), /shift-quality-key/, f);
  const r = await localRuntime(); t.after(() => r.close());
  const payloads = [await r.call('citizen', 'alice'), await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality: { answers: best } }), await r.call('citizen', 'alice')];
  for (const p of payloads) { const json = JSON.stringify(p.data); assert.doesNotMatch(json, /"best"|answerKey|"correct"/); assert.doesNotMatch(json, /qualityGrade|qualityMultiplierPct/, 'no grade before completion'); }
});
test('grade is locked at shift start: a second submit or retry cannot change it', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const first = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality: { answers: wrong } });
  assert.equal(first.status, 200); const id = first.data.shifts[0].id;
  for (const quality of [{ answers: best }, { skip: true }]) assert.notEqual((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality })).status, 200);
  const rows = (await r.db.prepare('SELECT shift_id,grade,multiplier_pct FROM shift_quality').all()).results.map(x => ({ ...x }));
  assert.deepEqual(rows, [{ shift_id: id, grade: 'poor', multiplier_pct: 100 }]);
  r.setNow(Date.parse(first.data.shifts[0].completesAt));
  const done = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: id });
  assert.equal(done.data.shifts.find(s => s.id === id).qualityGrade, 'poor'); assert.equal(done.data.economy.walletMinor, 800);
});
