/** #1100: Fulmara government items as share certificates on a ticker. Other nations stay on their own chrome.
 *  The zzzzzzz- prefix sorts after zzzzzz- so --test-shard does not move earlier files. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { fulmaraGovernmentSnapshot, withFulmaraResolutions } from '../lib/government.ts';
import { fulmaraResolutions } from '../lib/fulmara-resolutions.ts';
import { nationCrests } from '../lib/nation-crests.ts';
import { nationMarks } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_FULMARA_SHARE_TICKER';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { GovernmentPanel } = await import(await componentModule(fileURLToPath(new URL('../app/government-panel.tsx', import.meta.url))));
const { fulmaraShareTickerEnabled, fulmaraShareLines, FULMARA_NO_VOTES } = await import(await componentModule(fileURLToPath(new URL('../app/fulmara-share-ticker.tsx', import.meta.url))));
const noop = () => {};
const civic = (nationId, flag, snapshot = null, extra = {}) => withFlag(flag, () => renderToStaticMarkup(React.createElement(GovernmentPanel, {
  snapshot, nationId, localDemo: true, pending: false, error: null, verification: null, onPetition: noop, ...extra,
})));
const others = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood'];
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(fulmaraShareTickerEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(fulmaraShareTickerEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 34);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_FULMARA_SHARE_TICKER/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_FULMARA_SHARE_TICKER/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 34/);
  assert.match(await read('app/fulmara-share-ticker.tsx'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_FULMARA_SHARE_TICKER/);
  assert.match(await read('app/government-panel.tsx'), /countdownDualTimeEnabled\(\)/);
  assert.match(await read('app/work-shift-board.tsx'), /countdownDualTimeEnabled\(\)/);
});

test('certificate styles use Fulmara tokens, vertical stripes, scaled type, and a static ticker when motion is reduced', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1100'));
  assert.match(block, /90deg/);
  assert.match(block, /#4a3279/); assert.match(block, /#f1ecff/); assert.match(block, /#3aa0ff/); assert.match(block, /#b598d3/);
  assert.equal(nationCrests.fulmara.field, '#4a3279'); assert.equal(nationCrests.fulmara.mark, '#f1ecff');
  assert.equal(nationCrests.fulmara.accent, '#3aa0ff'); assert.equal(nationMarks.fulmara.accent, '#b598d3');
  assert.equal(nationMarks.fulmara.pattern, 'vertical'); assert.equal(nationMarks.fulmara.symbol, '✦');
  assert.doesNotMatch(block, /font-size:\s*\d+(\.\d+)?px/);
  assert.match(block, /font-size:calc\(13px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(15px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(16px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(block, /html\[data-harimu-reduced-motion\] \.fulmara-ticker-track\{animation:none/);
  assert.match(block, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.ok(contrast('#4a3279', '#f1ecff') >= 4.5, 'certificate ink on the mark');
  assert.ok(contrast('#f1ecff', '#4a3279') >= 4.5, 'header ink on the storm field');
  const src = await read('app/fulmara-share-ticker.tsx');
  assert.match(src, /key=\{index\}/);
  assert.match(src, /aria-hidden="true"/);
});

test('a Fulmara viewer gets share certificates; other nations keep their civic styling', () => {
  const on = civic('fulmara', 'true');
  assert.match(on, /aria-label="Fulmara share register"/);
  assert.match(on, /class="fulmara-share"/);
  assert.match(on, /data-nation-pattern="vertical"/);
  assert.match(on, /Share certificate/);
  assert.match(on, new RegExp(FULMARA_NO_VOTES));
  assert.match(on, /Civic play coming soon/);
  assert.match(on, /aria-hidden="true"/);
  assert.doesNotMatch(on, /tabindex="-1"/i);
  for (const flag of ['false', undefined]) {
    const off = civic('fulmara', flag);
    assert.doesNotMatch(off, /fulmara-share|Fulmara share register/);
    assert.match(off, /Civic play coming soon/);
  }
  for (const id of others) {
    const html = civic(id, 'true');
    assert.doesNotMatch(html, /fulmara-share|Fulmara share register|No votes are open/, id);
  }
  const read = fulmaraGovernmentSnapshot(1_700_000_000_000, true);
  const loaded = civic('fulmara', 'true', read);
  assert.match(loaded, /Grand Council/);
  assert.match(loaded, /Spending proposal: 0 minor units from 0 available/);
  assert.match(loaded, /This proposal itself does not spend funds/);
  assert.match(loaded, /Preview priority for/);
  assert.equal(fulmaraShareLines(read, ' This proposal itself does not spend funds.').length, 1);
  assert.equal(fulmaraShareLines(null, '').length, 0);
  const voted = withFulmaraResolutions(read, true);
  const lines = fulmaraShareLines(voted, ' This proposal itself does not spend funds.');
  assert.equal(lines.length, fulmaraResolutions().length);
  assert.equal(lines[0].title, 'Route charter: Kindle convoy');
  assert.equal(lines[0].status, 'Open · 420 for, 180 against, 40 abstain');
  const certificates = civic('fulmara', 'true', voted);
  assert.match(certificates, /Route charter: Kindle convoy/);
  assert.match(certificates, /Share issue: Arc Exchange expansion/);
  assert.match(certificates, /Reserve rule: Bank of the Arc band/);
  assert.match(certificates, /Alliance: trade compact with Meridian/);
  assert.match(certificates, /Open · 420 for, 180 against, 40 abstain/);
  assert.match(certificates, /Open · 610 for, 240 against, 30 abstain/);
  assert.match(certificates, /Carried · 640 for, 210 against, 50 abstain/);
  assert.match(certificates, /Lost · 280 for, 510 against, 70 abstain/);
  assert.doesNotMatch(certificates, /No votes are open/);
  assert.doesNotMatch(certificates, /Spending proposal/);
  assert.equal('resolutions' in read, false, 'the Council read is unchanged while resolutions are off');
  const kindle = civic('kindle', 'true', { ...read, nationId: 'kindle', decision: { ...read.decision, title: 'Food security reserve' } });
  assert.doesNotMatch(kindle, /fulmara-share/);
  assert.match(kindle, /Food security reserve/);
});
