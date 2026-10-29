/** #1040: NEXT_PUBLIC_HARIMU_MOBILE_TWO_TAP is a HARIMU_UI_PACK key (preview on, production off) and the shortcut picks the existing action. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { expandFlagPacks, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { mobileTwoTapEnabled, twoTapButtons, twoTapCommand } from '../lib/mobile-two-tap.ts';
import { dashboardManagedVars } from '../scripts/wrangler-pin.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
const key = 'NEXT_PUBLIC_HARIMU_MOBILE_TWO_TAP';

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', () => {
  assert.equal(mobileTwoTapEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(mobileTwoTapEnabled(value), false);
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false');
  assert.match(readFileSync('tests/wrangler-prod-501b.test.mjs', 'utf8'), /NEXT_PUBLIC_HARIMU_MOBILE_TWO_TAP/);
  assert.match(readFileSync('tests/flag-off-audit-384.test.mjs', 'utf8'), /NEXT_PUBLIC_HARIMU_MOBILE_TWO_TAP/);
  const outside = dashboardManagedVars.filter(name => !(name in preview.vars));
  const total = Object.keys(preview.vars).length + outside.length + 2;
  assert.ok(127 - total >= 3, `preview headroom ${127 - total}`);
});

test('each shortcut names one existing daily-loop action', () => {
  const ready = { id: 's1', ready: true }, underway = { id: 's1', ready: false };
  assert.deepEqual(twoTapCommand('kindle', 'ballot', null), { kind: 'inbox' });
  assert.deepEqual(twoTapCommand('korund', 'ballot', null), { kind: 'inbox' });
  assert.deepEqual(twoTapCommand('aurelle', 'ballot', null), { kind: 'inbox' });
  assert.deepEqual(twoTapCommand('kindle', 'shift', null), { kind: 'start' });
  assert.deepEqual(twoTapCommand('kindle', 'wage', null), { kind: 'open-work' });
  assert.deepEqual(twoTapCommand('kindle', 'shift', ready), { kind: 'claim', shiftId: 's1' });
  assert.deepEqual(twoTapCommand('kindle', 'wage', ready), { kind: 'claim', shiftId: 's1' });
  assert.deepEqual(twoTapCommand('kindle', 'shift', underway), { kind: 'open-work' });
  assert.deepEqual(twoTapCommand('korund', 'shift', null), { kind: 'korund', action: 'korund-start-work' });
  assert.deepEqual(twoTapCommand('korund', 'shift', ready), { kind: 'korund', action: 'korund-claim-work', shiftId: 's1' });
  assert.deepEqual(twoTapCommand('korund', 'wage', null), { kind: 'korund', action: 'korund-redeem-ration' });
  assert.deepEqual(twoTapCommand('korund', 'wage', ready), { kind: 'korund', action: 'korund-redeem-ration' });
  assert.deepEqual(twoTapCommand('aurelle', 'shift', null), { kind: 'aurelle', action: 'aurelle-start-work' });
  assert.deepEqual(twoTapCommand('aurelle', 'wage', ready), { kind: 'aurelle', action: 'aurelle-claim-work', shiftId: 's1' });
  assert.equal(twoTapButtons('korund').find(item => item.id === 'wage').label, 'Rations');
  assert.equal(twoTapButtons('kindle').find(item => item.id === 'wage').label, 'Wages');
  assert.deepEqual(twoTapButtons('aurelle').map(item => item.ariaLabel), ['Start or claim shift', 'Collect wage or rations', 'Open civic inbox ballot']);
});

test('shortcut CSS is 44px, labeled, and does not animate', () => {
  const css = readFileSync('app/game-shell.css', 'utf8');
  const block = css.slice(css.indexOf('/* #1040'));
  assert.match(block, /min-height:44px/); assert.match(block, /min-width:44px/);
  assert.match(block, /transition:none/); assert.match(block, /animation:none/);
  assert.doesNotMatch(block, /@keyframes|animation:\s*(?!none)/);
  const shell = readFileSync('app/game-shell.tsx', 'utf8');
  assert.match(shell, /aria-label=\{ariaLabel\}/); assert.match(shell, /aria-label="Daily loop"/);
  assert.match(shell, /twoTapPhone && onDailyLoop/);
  assert.doesNotMatch(shell, /from '\.\/mobile-two-tap'|from '@\/lib\/mobile-two-tap'/);
});
