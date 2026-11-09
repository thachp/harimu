/** #1104 (docs §23.2): a countdown shows real time remaining and the game calendar, from the existing clock. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { seasonLengthMs } from '../lib/game-season.ts';
import { countdownDualTimeEnabled, dualTimeCountdown, gameTimeCompression } from '../lib/game-time.ts';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';

const require = createRequire(import.meta.url);
const read = name => readFileSync(name, 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const key = 'NEXT_PUBLIC_HARIMU_COUNTDOWN_DUAL_TIME';
const year3Spring = 8 * seasonLengthMs;

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', () => {
  assert.equal(countdownDualTimeEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(countdownDualTimeEnabled(value), false);
  assert.match(read('lib/game-time.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_COUNTDOWN_DUAL_TIME/);
  assert.match(read('app/government-panel.tsx'), /countdownDualTimeEnabled\(\)/);
  assert.match(read('app/work-shift-board.tsx'), /countdownDualTimeEnabled\(\)/);
  assert.doesNotMatch(read('app/government-panel.tsx'), /process\.env\.NEXT_PUBLIC_HARIMU_COUNTDOWN_DUAL_TIME/);
  assert.doesNotMatch(read('app/work-shift-board.tsx'), /process\.env\.NEXT_PUBLIC_HARIMU_COUNTDOWN_DUAL_TIME/);
  const preview = strip(read('wrangler.jsonc')), prod = strip(read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true');
  assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 34);
});

test('multi-day and under one hour use the world season at the deadline, and a missing epoch uses 12×', () => {
  const epoch = 1_700_000_000_000, ends = epoch + year3Spring;
  const days = dualTimeCountdown(ends, ends - (2 * 86_400_000 + 4 * 3_600_000), epoch);
  assert.equal(days.real, '2d 4h real');
  assert.equal(days.game, 'Year 3, Spring');
  assert.equal(days.access, '2d 4h real time; Year 3, Spring');
  const hour = dualTimeCountdown(ends, ends - 45 * 60_000, epoch);
  assert.equal(hour.real, '45m real');
  assert.equal(hour.game, 'Year 3, Spring');
  assert.match(hour.access, /45m real time; Year 3, Spring/);
  const bare = dualTimeCountdown(ends, ends - (2 * 86_400_000 + 4 * 3_600_000));
  assert.equal(bare.real, '2d 4h real');
  assert.equal(bare.game, '26d game');
  assert.equal(bare.access, '2d 4h real time; 26d game time');
  assert.equal(gameTimeCompression, 12);
  assert.equal(dualTimeCountdown(ends, ends), null);
  assert.equal(dualTimeCountdown('not-a-date', ends, epoch), null);
});

test('the shared parts use index keys, and a running timer names both times for a screen reader', () => {
  const ui = read('app/game-timer.tsx'), top = read('app/topbar-countdown.tsx'), gov = read('app/government-panel.tsx');
  assert.match(ui, /parts\.map\(\(part, index\) => <span key=\{index\}>/);
  assert.doesNotMatch(ui, /key=\{part\}/);
  assert.match(ui, /role="timer"/);
  assert.match(ui, /aria-live="off"/);
  assert.match(ui, /aria-label=\{access\}/);
  assert.match(top, /dual \? <DualTimeParts line=\{dual\} \/> : compact/);
  assert.match(top, /aria-live="off"/);
  assert.match(gov, /rows\.map\(\(row, index\) => <li key=\{index\}>/);
  assert.doesNotMatch(gov, /key=\{row\.label\}/);
  const css = read('app/game-shell.css');
  assert.match(css, /\.game-countdown\{color:#dce7e8;/);
  assert.match(css, /\.game-hud\{[^}]*background:#071820/);
  assert.ok(contrast('#dce7e8', '#071820') >= 4.5, 'HUD countdown on the HUD ink');
  assert.ok(contrast('#18343e', '#f1eddc') >= 4.5, 'Kindle ink on Kindle paper, which the timer inherits');
  assert.doesNotMatch(read('app/game-timer.module.css'), /font-size:\s*\d+px/);
});

test('with the flag on, the timer shows real remaining and the game year', () => {
  const prev = process.env[key];
  process.env[key] = 'true';
  try {
    const compiled = ts.transpileModule(read('app/game-timer.tsx'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const slots = [], effects = [];
    let cursor = 0;
    const react = { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = v; }]; }, useEffect(fn) { if (!effects.length) effects.push(fn); } };
    const exports = {};
    new Function('exports', 'require', compiled)(exports, name => name === 'react' ? react : name === './display-preferences' ? { useDisplayTimestamp: () => String } : name === '../lib/game-time' ? require('../lib/game-time.ts') : name.endsWith('.css') ? { timer: 'timer', compact: 'compact', dual: 'dual' } : require(name));
    const ends = 1_700_000_000_000 + year3Spring;
    const now = ends - (2 * 86_400_000 + 4 * 3_600_000);
    cursor = 0;
    const tree = exports.GameTimer({ endsAt: ends, epochMs: 1_700_000_000_000, label: 'Council election' });
    slots[0] = now;
    cursor = 0;
    const shown = exports.GameTimer({ endsAt: ends, epochMs: 1_700_000_000_000, label: 'Council election' });
    const flat = node => !node || typeof node !== 'object' ? [node] : [node, ...[node.props?.children].flat(Infinity).flatMap(flat)];
    const nodes = flat(shown);
    const timer = nodes.find(node => node?.props?.role === 'timer');
    assert.match(timer.props['aria-label'], /Council election: 2d 4h real time; Year 3, Spring/);
    assert.equal(timer.props['aria-live'], 'off');
    const parts = nodes.find(node => node?.type?.name === 'DualTimeParts');
    const visible = flat(parts.type(parts.props)).filter(node => typeof node === 'string').join('');
    assert.match(visible, /2d 4h real/);
    assert.match(visible, /Year 3, Spring/);
    assert.equal(tree.props.className.includes('timer'), true);
  } finally {
    if (prev === undefined) delete process.env[key]; else process.env[key] = prev;
  }
});
