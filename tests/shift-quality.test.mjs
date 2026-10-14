import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { applyQuality, validQualityInput, harvestQuestions, qualityGrades, gradeLabel } from '../lib/shift-quality.ts';
import { gradeShift, shiftAnswerKey, shiftOptionOrder, redeemQualityTicket } from '../lib/shift-quality-key.ts';
const secret = 'fixture-shift-quality-secret-252';
import { readdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const best = [1, 1, 2]; // canonical-order key, mirrors lib/shift-quality-key.ts
const wrong = best.map((b, i) => (b + 1) % harvestQuestions[i].options.length);
const mix = n => best.map((b, i) => i < n ? b : wrong[i]);

test('better decisions give a higher grade and a higher reward; poor never pays less than skipping', () => {
  const grades = [0, 1, 2, 3].map(n => gradeShift('harvest', { answers: mix(n) }, 'human', best));
  assert.deepEqual(grades.map(g => g.grade), ['poor', 'fair', 'good', 'excellent']);
  const pay = grades.map(g => applyQuality({ wageMinor: 800, quantity: 4 }, g.multiplierPct));
  assert.deepEqual(pay, [{ wageMinor: 800, quantity: 4 }, { wageMinor: 880, quantity: 4 }, { wageMinor: 1000, quantity: 5 }, { wageMinor: 1200, quantity: 6 }]);
  for (let i = 1; i < pay.length; i++) assert.ok(pay[i].wageMinor > pay[i - 1].wageMinor);
  assert.deepEqual(gradeShift('harvest', { skip: true }, 'human', best), { grade: null, multiplierPct: 100, correct: null });
  assert.equal(gradeLabel(null), 'Base (step skipped)'); for (const g of grades) if (g.grade) assert.equal(g.multiplierPct, qualityGrades[g.grade].multiplierPct); assert.equal(best.length, harvestQuestions.length); assert.equal(qualityGrades.excellent.multiplierPct, 150);
});
test('AI citizens and other jobs never get the quality bonus', () => {
  assert.equal(gradeShift('harvest', { answers: best }, 'ai', best).multiplierPct, 100);
  assert.equal(gradeShift('harvest', { answers: best }, 'ai', best).grade, null);
  assert.equal(gradeShift('freight', { answers: best }, 'human', best).multiplierPct, 100);
});
test('input validation: three in-range answers or skip, nothing else', () => {
  assert.equal(validQualityInput({ answers: best, ticket: 't' }), true); assert.equal(validQualityInput({ skip: true }), true);
  for (const bad of [null, {}, { answers: [0, 1] }, { answers: [0, 1, 9] }, { answers: [0, 1, 1.5] }, { skip: true, answers: best }, { answers: best, multiplierPct: 500 }, { answers: best }, { answers: best, ticket: 7 }, { skip: false }]) assert.equal(validQualityInput(bad), false, JSON.stringify(bad));
});

// #252: get a server-issued ticket and answer it 'best' or 'wrong' against that shift's own key.
const ticketed = async (r, user, pick) => {
  const issued = await r.call('citizen', user, { action: 'quality-ticket', workOrderId: 'harvest' }); assert.equal(issued.status, 200);
  const key = await shiftAnswerKey(secret, issued.data.ticket.split('.')[0], harvestQuestions);
  return { issued, key, quality: { ticket: issued.data.ticket, answers: pick === 'best' ? key : key.map((k, i) => (k + 1) % harvestQuestions[i].options.length) } };
};
const claim = async (r, user, body) => {
  if (typeof body.quality?.answers === 'string') body = { ...body, quality: (await ticketed(r, user, body.quality.answers)).quality };
  const start = await r.call('citizen', user, { action: 'commit-work', workOrderId: 'harvest', ...body });
  if (start.status !== 200) return { start };
  r.setNow(Date.parse(start.data.shifts[0].completesAt));
  const shift = (await r.call('citizen', user)).data.shifts.find(s => s.id === start.data.shifts[0].id);
  const done = await r.call('citizen', user, { action: 'claim-work', shiftId: shift.id });
  return { start, shift, done };
};
test('server grades, stores grade + multiplier with the shift, pays it, and shows it on completion', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { start, shift, done } = await claim(r, 'alice', { quality: { answers: 'best' } });
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
  const other = await claim(r, 'alice', { workOrderId: 'freight', quality: { answers: 'best' } });
  assert.equal(other.start.status, 200); assert.equal(other.shift.wageMinor, 1200, 'freight base wage, no bonus'); assert.equal(other.shift.qualityMultiplierPct, 100);
});
test('UI: no grade preview, answers are final, a double click or retry cannot re-grade; skip offers base', async () => {
  const compile = async f => ts.transpileModule(await readFile(new URL(f, import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const nodes = n => !n || typeof n !== 'object' ? [n] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
  const text = t => t.filter(n => typeof n === 'string' || typeof n === 'number').join(' ');
  let state = []; let cursor = 0;
  const react = { useState: init => { const i = cursor++; if (!(i in state)) state[i] = typeof init === 'function' ? init() : init; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; }, useRef: init => { const i = cursor++; if (!(i in state)) state[i] = { current: init }; return state[i]; } };
  const exports = {}; new Function('exports', 'require', await compile('../app/shift-quality-step.tsx'))(exports, n => n === 'react' ? react : n === '@/lib/shift-quality' ? require('../lib/shift-quality.ts') : require(n));
  const started = [];
  const render = () => { cursor = 0; return nodes(exports.ShiftQualityStep({ orderId: 'harvest', orderName: 'Savanna harvest', cost: 4, base: { wageMinor: 800, quantity: 4, item: 'food' }, questions: harvestQuestions, onStart: q => { started.push(q); }, onCancel() {} })); };
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
  assert.match(page, /if \(order\.id !== qualityWorkOrderId \|\| !rewards\[order\.id\]\) return runWork\('commit-work', order\);/); assert.match(page, /action: 'quality-ticket'/); assert.doesNotMatch(page, /shift-quality-key|gradeShift/);
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
  const payloads = [await r.call('citizen', 'alice'), await r.call('citizen', 'alice', { action: 'quality-ticket', workOrderId: 'harvest' }), await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality: (await ticketed(r, 'alice', 'best')).quality }), await r.call('citizen', 'alice')];
  for (const p of payloads) { const json = JSON.stringify(p.data); assert.doesNotMatch(json, /"best"|answerKey|"correct"|"key"|"order"|fixture-shift-quality-secret/); assert.doesNotMatch(json, /qualityGrade|qualityMultiplierPct/, 'no grade before completion'); }
});
test('grade is locked at shift start: a second submit or retry cannot change it', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const wrongStep = await ticketed(r, 'alice', 'wrong');
  const first = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality: wrongStep.quality });
  assert.equal(first.status, 200); const id = first.data.shifts[0].id; assert.equal(id, wrongStep.quality.ticket.split('.')[0], 'the ticket names the shift');
  const replay = { ...wrongStep.quality, answers: wrongStep.key };
  for (const quality of [replay, (await ticketed(r, 'alice', 'best')).quality, { skip: true }]) assert.notEqual((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality })).status, 200);
  const rows = (await r.db.prepare('SELECT shift_id,grade,multiplier_pct FROM shift_quality').all()).results.map(x => ({ ...x }));
  assert.deepEqual(rows, [{ shift_id: id, grade: 'poor', multiplier_pct: 100 }]);
  r.setNow(Date.parse(first.data.shifts[0].completesAt));
  const done = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: id });
  assert.equal(done.data.shifts.find(s => s.id === id).qualityGrade, 'poor'); assert.equal(done.data.economy.walletMinor, 800);
});

test('#252 the key varies per shift and is stable for the same shift', async () => {
  const ids = Array.from({ length: 40 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const keys = await Promise.all(ids.map(id => shiftAnswerKey(secret, id, harvestQuestions)));
  assert.ok(new Set(keys.map(k => k.join())).size > 1, 'two shifts can get different keys');
  for (let q = 0; q < harvestQuestions.length; q++) assert.ok(new Set(keys.map(k => k[q])).size > 1, `question ${q} moves`);
  for (const id of ids.slice(0, 5)) assert.deepEqual(await shiftAnswerKey(secret, id, harvestQuestions), await shiftAnswerKey(secret, id, harvestQuestions));
  assert.notDeepEqual((await Promise.all(ids.map(id => shiftAnswerKey('another-server-secret-xyz', id, harvestQuestions)))).map(k => k.join()), keys.map(k => k.join()), 'the key depends on the server secret');
  for (const id of ids) { const order = await shiftOptionOrder(secret, id, harvestQuestions); assert.ok(order.every(o => [...o].sort().join() === '0,1,2'), 'a permutation'); }
});
test('#252 the ticket shows that shift\'s shuffled options, is bound to the user, and cannot be forged or reused', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { issued, quality } = await ticketed(r, 'alice', 'best');
  const shiftId = issued.data.ticket.split('.')[0]; const order = await shiftOptionOrder(secret, shiftId, harvestQuestions);
  assert.deepEqual(issued.data.questions, harvestQuestions.map((q, qi) => ({ prompt: q.prompt, options: order[qi].map(i => q.options[i]) })));
  assert.deepEqual(Object.keys(issued.data).sort(), ['ok', 'questions', 'ticket']);
  assert.equal(await redeemQualityTicket(secret, 'bob', quality.ticket), null, 'bound to the user');
  assert.equal(await redeemQualityTicket(secret, 'alice', quality.ticket), shiftId);
  const before = (await r.call('citizen', 'alice')).data.capacity;
  for (const ticket of [quality.ticket.slice(0, -1) + (quality.ticket.endsWith('0') ? '1' : '0'), `${crypto.randomUUID()}.${quality.ticket.split('.')[1]}`, 'nope'])
    assert.equal((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality: { ...quality, ticket } })).status, 400);
  assert.equal((await r.call('citizen', 'bob', { action: 'commit-work', workOrderId: 'harvest', quality })).status, 400, "another citizen's ticket");
  assert.equal((await r.call('citizen', 'alice')).data.capacity, before, 'no WC spent on a rejected ticket');
  const started = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality }); assert.equal(started.status, 200);
  r.setNow(Date.parse(started.data.shifts[0].completesAt)); await r.call('citizen', 'alice', { action: 'claim-work', shiftId });
  assert.equal((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality })).status, 409, 'a used ticket cannot start another shift');
});
test('#252 without the server secret the step fails closed: no ticket, no graded start, skip still pays base', async t => {
  const r = await localRuntime(); t.after(() => r.close()); const { quality } = await ticketed(r, 'alice', 'best');
  r.setFixtureEnv('HARIMU_SHIFT_QUALITY_SECRET', undefined);
  assert.equal((await r.call('citizen', 'alice', { action: 'quality-ticket', workOrderId: 'harvest' })).status, 503);
  assert.equal((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest', quality })).status, 503);
  assert.equal((await r.call('citizen', 'alice', { action: 'quality-ticket', workOrderId: 'freight' })).status, 404);
  const skipped = await claim(r, 'alice', { quality: { skip: true } }); assert.equal(skipped.done.data.economy.walletMinor, 800);
});
