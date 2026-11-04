/** #1048 follow-up: the faith-festival countdown is hidden on the festival day and shown the day before.
 *  HUD tests stub GameTimer, so this case renders the real countdown. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { nextFaithFestivalAt } from '../lib/faith-festival-hud.ts';

const require = createRequire(import.meta.url);
const jsx = async (file) => ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const react = { useState: (initial) => [initial, () => {}], useEffect() {} };
const timer = {};
new Function('exports', 'require', await jsx('../app/game-timer.tsx'))(timer, (name) => name === 'react' ? react : name === './display-preferences' ? { useDisplayTimestamp: () => require('../lib/display-preferences.ts').displayTimestamp } : name === '../lib/game-time' ? require('../lib/game-time.ts') : name.endsWith('.css') ? { timer: 'timer', compact: 'compact' } : require(name));
const shell = {}, blank = () => null;
new Function('exports', 'require', await jsx('../app/game-shell.tsx'))(shell, (name) => {
  if (name === './game-timer') return timer;
  if (name === 'react') return react;
  if (name === '@phosphor-icons/react') return new Proxy({}, { get: (_, key) => String(key) });
  if (name.endsWith('.css')) return {};
  if (name === './game-settings' || name === './game-viewport' || name === './nation-crest' || name === './nation-symbol' || name === './topbar-countdown' || name === './korund-wallet-rations') return { GameSettings: blank, default: blank, NationCrest: blank, NationSymbol: blank, TopbarCountdown: blank, KorundWalletRations: blank };
  if (name.startsWith('@/')) return require(`../${name.slice(2)}.ts`);
  return require(name);
});

const sec = (day) => day * 7200 + 1;
function render(day) {
  const timers = [];
  const flat = (node) => Array.isArray(node) ? node.flatMap(flat) : !node || typeof node !== 'object' ? [node] : typeof node.type === 'function' ? (timers.push(node.props), flat(node.type(node.props))) : [node, ...[node.props?.children].flat(Infinity).flatMap(flat)];
  const nodes = flat(shell.FaithFestivalReadout({ nationId: 'kindle', nowSeconds: sec(day) }));
  return { timers, text: nodes.filter((part) => typeof part === 'string').join(' '), clock: nodes.find((node) => node?.props?.role === 'timer') };
}

test('faith festival countdown is hidden on the festival day and shown the day before', () => {
  const onDay = render(30), before = render(29);
  assert.equal(nextFaithFestivalAt('kindle', sec(30) * 1000).active, true);
  assert.equal(onDay.timers.length, 0);
  assert.equal(onDay.clock, undefined);
  assert.match(onDay.text, /Next faith festival: Launching · day 30 · Tolerated · today/);
  assert.doesNotMatch(onDay.text, /Checking clock/);
  const upcoming = nextFaithFestivalAt('kindle', sec(29) * 1000);
  assert.equal(upcoming.active, false);
  assert.equal(before.timers.length, 1);
  assert.equal(before.timers[0].label, 'in');
  assert.equal(before.timers[0].endsAt, upcoming.startsAt);
  assert.match(before.clock.props['aria-label'], /^in: /);
  assert.match(before.text, /Checking clock/);
  assert.doesNotMatch(before.text, /· today/);
});
