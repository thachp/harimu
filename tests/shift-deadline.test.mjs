import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { shiftDeadlineText, shiftDeadlineDelay, shiftDeadlineReady, shiftDeadlineConfirming } from '../lib/shift-deadline.ts';
const require = createRequire(import.meta.url);

// Follow-up from #54 (shipped with #53): the top banner said "Deadline reached · refresh to confirm"
// forever until the player refreshed by hand.
test('one-time refresh fires just after the deadline, immediately if already past', () => {
  const now = Date.parse('2026-10-14T10:00:00.000Z');
  assert.equal(shiftDeadlineDelay('2026-10-14T10:01:00.000Z', now), 60250);
  assert.equal(shiftDeadlineDelay('2026-10-14T09:00:00.000Z', now), 0);
  assert.equal(shiftDeadlineDelay('not a date', now), null);
  assert.equal(shiftDeadlineDelay('2099-01-01T00:00:00.000Z', now), 2147483647, 'clamped to setTimeout max');
});
test('banner text never asks the player to refresh: confirming, then ready to collect', () => {
  assert.equal(shiftDeadlineText('s1', null), shiftDeadlineConfirming);
  assert.equal(shiftDeadlineText('s1', 'old'), shiftDeadlineConfirming);
  assert.equal(shiftDeadlineText('s1', 's1'), shiftDeadlineReady);
  for (const text of [shiftDeadlineConfirming, shiftDeadlineReady]) assert.doesNotMatch(text, /refresh/i);
});
test('GameTimer shows the supplied expired text, and keeps the old default elsewhere', async () => {
  const js = ts.transpileModule(await readFile(new URL('../app/game-timer.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {}; let slot = 0;
  new Function('exports', 'require', js)(exports, name => name === 'react' ? { useState: () => [slot++ % 2 === 0 ? Date.parse('2026-10-14T12:00:00.000Z') : false, () => {}], useEffect() {} } : name === './display-preferences' ? { useDisplayTimestamp: () => String } : name.endsWith('.css') ? { default: {} } : name === '../lib/game-time' ? require('../lib/game-time.ts') : require(name));
  const nodes = n => !n || typeof n !== 'object' ? [n] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
  const text = tree => tree.filter(n => typeof n === 'string').join(' ');
  const ended = '2026-10-14T11:00:00.000Z';
  assert.match(text(nodes(exports.GameTimer({ endsAt: ended, label: 'Shift', compact: true, expiredText: shiftDeadlineReady }))), /Shift complete · collect at Work\./);
  slot = 0; assert.match(text(nodes(exports.GameTimer({ endsAt: ended, label: 'Meal' }))), /Deadline reached · refresh to confirm\./);
});
test('page wires the one-time deadline refresh to the banner and shift chip', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /window\.setTimeout\(\(\) => \{ void runWorkRef\.current\?\.\('refresh-work'\)\.finally\(\(\) => setDeadlineConfirmedId\(deadlineShiftId\)\); \}, delay\)/);
  assert.match(page, /\{label:'Work',endsAt:activeShift\.completesAt,expiredText:shiftExpiredText\}/);
  assert.match(page, /expiredText:shiftExpiredText\} : undefined\}/);
  const shell = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /expiredText=\{nextDeadline\.expiredText\}/); assert.match(shell, /expiredText=\{shiftSummary\.expiredText\}/);
});
