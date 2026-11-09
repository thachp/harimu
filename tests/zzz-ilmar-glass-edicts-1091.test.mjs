/** #1091: an Ilmar viewer gets the illuminated glass edict; other nations keep their own civic styling.
 *  The zz- prefix keeps this file last so --test-shard does not move earlier files between Postgres shards. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { simulateGovernment } from '../lib/government.ts';
import { nationCrests } from '../lib/nation-crests.ts';
import { nationMarks } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_ILMAR_GLASS_EDICTS';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { GovernmentPanel } = await import(await componentModule(fileURLToPath(new URL('../app/government-panel.tsx', import.meta.url))));
const { ilmarGlassEdictsEnabled } = await import(await componentModule(fileURLToPath(new URL('../app/ilmar-glass-edict.tsx', import.meta.url))));
const noop = () => {};
const civic = (nationId, flag, snapshot = null) => withFlag(flag, () => renderToStaticMarkup(React.createElement(GovernmentPanel, {
  snapshot, nationId, localDemo: true, pending: false, error: null, verification: null, onPetition: noop,
})));
const others = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'hoarvale', 'varkand', 'veldwood', 'fulmara'];
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const soon = 'Civic play coming soon';

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(ilmarGlassEdictsEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(ilmarGlassEdictsEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 32);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_ILMAR_GLASS_EDICTS/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_ILMAR_GLASS_EDICTS/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 32/);
  assert.match(await read('app/ilmar-glass-edict.tsx'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_ILMAR_GLASS_EDICTS/);
});

test('glass styles use Ilmar tokens, the dots pattern, scaled type, and no glow when motion is reduced', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1091'));
  assert.match(block, /data-nation-pattern|radial-gradient/);
  assert.match(block, /#7d6a2b/); assert.match(block, /#fff8e0/); assert.match(block, /#8d7be0/); assert.match(block, /#e0bb59/);
  assert.equal(nationCrests.ilmar.field, '#7d6a2b'); assert.equal(nationCrests.ilmar.mark, '#fff8e0');
  assert.equal(nationCrests.ilmar.accent, '#8d7be0'); assert.equal(nationMarks.ilmar.accent, '#e0bb59');
  assert.equal(nationMarks.ilmar.pattern, 'dots'); assert.equal(nationMarks.ilmar.symbol, '⬢');
  assert.doesNotMatch(block, /font-size:\s*\d+(\.\d+)?px/);
  assert.match(block, /font-size:calc\(15px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(16px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(20px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\)\{\s*\.ilmar-glass-edict\{animation:none\}/);
  assert.match(block, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.ok(contrast('#7d6a2b', '#fff8e0') >= 4.5, 'edict ink on the glass');
  assert.ok(contrast('#fff8e0', '#7d6a2b') >= 4.5, 'header mark on the sand field');
});

test('an Ilmar viewer gets the glass edict; other nations keep their civic styling', () => {
  const on = civic('ilmar', 'true');
  assert.match(on, /aria-label="Ilmar edict"/);
  assert.match(on, /class="ilmar-glass-edict"/);
  assert.match(on, /data-nation-pattern="dots"/);
  assert.match(on, /⬢/);
  assert.doesNotMatch(on, /tabindex/i);
  assert.match(on, /data-nation-crest="ilmar"/);
  assert.match(on, /Ilmar crest: a prism-eye/);
  assert.match(on, new RegExp(soon));
  assert.match(on, /not built yet/);
  for (const flag of ['false', undefined]) {
    const off = civic('ilmar', flag);
    assert.doesNotMatch(off, /ilmar-glass-edict|Ilmar edict/);
    assert.match(off, new RegExp(soon));
    assert.equal(off, civic('fulmara', 'true'));
  }
  for (const id of others) {
    const html = civic(id, 'true');
    assert.doesNotMatch(html, /ilmar-glass-edict|Ilmar edict/, id);
    if (id === 'kindle' || id === 'korund' || id === 'aurelle') assert.match(html, /Government preview unavailable/);
    else assert.match(html, new RegExp(soon));
  }
  const base = simulateGovernment({ nationId: 'kindle', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} });
  const loaded = civic('ilmar', 'true', { ...base, nationId: 'ilmar' });
  assert.match(loaded, /class="ilmar-glass-edict"/);
  assert.match(loaded, /Food security reserve/);
  assert.match(loaded, /Spending proposal: 0 minor units/);
  assert.doesNotMatch(loaded, /aurelle-sealed-scroll|varkand-dispatch|veldwood-ballot|kindle-civic/);
  const kindle = civic('kindle', 'true', base);
  assert.doesNotMatch(kindle, /ilmar-glass-edict/);
  assert.match(kindle, /Food security reserve/);
  assert.match(kindle, /Reasoning Brief/);
  const aurelle = civic('aurelle', 'true', simulateGovernment({ nationId: 'aurelle', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} }));
  assert.doesNotMatch(aurelle, /ilmar-glass-edict/);
  assert.match(aurelle, /Royal decree/);
  const korund = civic('korund', 'true', simulateGovernment({ nationId: 'korund', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} }));
  assert.doesNotMatch(korund, /ilmar-glass-edict/);
  assert.match(korund, /Chairman/);
});
