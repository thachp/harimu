/** #1124: Ilmar Prism contracts show a Lightshare profit share, or an honest empty slot.
 *  NEXT_PUBLIC_HARIMU_ILMAR_PRISM_SHARES is exactly "true". Other nations stay unchanged.
 *  Dev has no contract or sharePercent field, so the civic panel passes no rows. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { simulateGovernment } from '../lib/government.ts';
import { nationCrest } from '../lib/nation-crests.ts';
import { nationMark } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_ILMAR_PRISM_SHARES';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { GovernmentPanel } = await import(await componentModule(fileURLToPath(new URL('../app/government-panel.tsx', import.meta.url))));
const shares = await import(await componentModule(fileURLToPath(new URL('../app/ilmar-prism-shares.tsx', import.meta.url))));
const { ilmarPrismSharesEnabled, ilmarPrismLines, ILMAR_PRISM_EMPTY, IlmarPrismShares } = shares;
const noop = () => {};
const civic = (nationId, flag, snapshot = null) => withFlag(flag, () => renderToStaticMarkup(React.createElement(GovernmentPanel, {
  snapshot, nationId, localDemo: true, pending: false, error: null, verification: null, onPetition: noop,
})));
const slot = html => { const start = html.indexOf('class="ilmar-prism-shares"'); return start < 0 ? '' : html.slice(start, html.indexOf('</section>', start)); };
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(ilmarPrismSharesEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(ilmarPrismSharesEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 28);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_ILMAR_PRISM_SHARES/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_ILMAR_PRISM_SHARES/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 28/);
  assert.match(await read('app/ilmar-prism-shares.tsx'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_ILMAR_PRISM_SHARES/);
  assert.match(await read('app/ilmar-prism-shares.tsx'), /key=\{index\}/);
  assert.match(await read('app/government-panel.tsx'), /IlmarPrismShares nationId=/);
  assert.doesNotMatch(await read('app/government-panel.tsx'), /sharePercent|Lightshare/);
});

test('styles use the Ilmar crest, scaled type, wrap, and no motion', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1124'));
  assert.match(block, /flex-wrap:wrap/); assert.match(block, /min-width:0/); assert.match(block, /overflow-wrap:anywhere/); assert.match(block, /max-width:100%/);
  assert.match(block, /font-size:calc\(16px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(15px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(20px \* var\(--text-scale, 1\)\)/);
  assert.doesNotMatch(block, /font-size:\s*\d+(\.\d+)?px/);
  assert.doesNotMatch(block, /@keyframes|\b(?:animation|transition)\s*:/);
  const crest = nationCrest('ilmar'), mark = nationMark('ilmar');
  assert.equal(crest.field, '#7d6a2b'); assert.equal(crest.mark, '#fff8e0');
  assert.equal(mark.pattern, 'dots'); assert.equal(mark.symbol, '⬢');
  assert.ok(contrast('#7d6a2b', '#fff8e0') >= 4.5, 'ink on the counting-house paper');
  assert.ok(contrast('#fff8e0', '#7d6a2b') >= 4.5, 'header mark on the sand field');
});

test('flag off and other nations leave the civic panel unchanged', () => {
  const base = simulateGovernment({ nationId: 'kindle', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} });
  for (const flag of ['false', undefined]) {
    const off = civic('ilmar', flag, { ...base, nationId: 'ilmar' });
    assert.doesNotMatch(off, /ilmar-prism-shares|Prism contracts|Lightshare/);
    assert.match(off, /Spending proposal/);
  }
  const kindle = civic('kindle', 'true', base);
  assert.doesNotMatch(kindle, /ilmar-prism-shares|Prism contracts|Lightshare/);
  assert.match(kindle, /Food security reserve/);
  const aurelle = civic('aurelle', 'true', simulateGovernment({ nationId: 'aurelle', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} }));
  assert.doesNotMatch(aurelle, /ilmar-prism-shares|Lightshare/);
  assert.match(aurelle, /Royal decree/);
});

test('flag on with no contract read shows the empty Lightshare slot and no invented rate', () => {
  const bare = civic('ilmar', 'true');
  const empty = slot(bare);
  assert.match(empty, /aria-label="Prism contracts"/);
  assert.match(empty, /data-nation-pattern="dots"/);
  assert.match(empty, /⬢/);
  assert.match(empty, new RegExp(ILMAR_PRISM_EMPTY));
  assert.match(empty, /tabindex="0"/);
  assert.doesNotMatch(empty, /interest|%|Lightshare partnership exists\.\s*\d/i);
  assert.match(bare, /Civic play coming soon/);
  const base = simulateGovernment({ nationId: 'kindle', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} });
  const loaded = civic('ilmar', 'true', { ...base, nationId: 'ilmar' });
  const finance = slot(loaded);
  assert.match(finance, new RegExp(ILMAR_PRISM_EMPTY));
  assert.doesNotMatch(finance, /%|interest/i);
  assert.match(loaded, /Spending proposal: 0 minor units/);
  assert.equal(ilmarPrismLines('ilmar', null, true).length, 0);
  assert.equal(ilmarPrismLines('ilmar', [], true).length, 0);
  assert.equal(ilmarPrismLines('kindle', [{ title: 'Mirrorhall lease', sharePercent: 12 }], true), null);
});

test('a real posted percent renders as a Lightshare line; a missing percent does not invent one', () => {
  const html = withFlag('true', () => renderToStaticMarkup(React.createElement(IlmarPrismShares, {
    nationId: 'ilmar',
    contracts: [
      { title: 'Mirrorhall glass lease', sharePercent: 12 },
      { title: 'Sunglass workshop', sharePercent: null },
      { title: 'Bad rate', sharePercent: 12.5 },
      { title: ' ', sharePercent: 40 },
    ],
  })));
  assert.match(html, /aria-label="Mirrorhall glass lease\. Lightshare, 12 percent profit share"/);
  assert.match(html, /class="ilmar-prism-kind">Lightshare</);
  assert.match(html, />12% profit share</);
  assert.match(html, /data-share="posted"/);
  assert.match(html, /aria-label="Sunglass workshop\. Share not posted"/);
  assert.match(html, /aria-label="Bad rate\. Share not posted"/);
  assert.doesNotMatch(html, /12\.5|40%|interest/i);
  assert.equal((html.match(/<li /g) ?? []).length, 3);
  assert.equal(ilmarPrismLines('ilmar', [{ title: 'Over', sharePercent: 101 }, { title: 'Under', sharePercent: -1 }], true).map(line => line.percent).join(), ',');
  const off = withFlag('false', () => renderToStaticMarkup(React.createElement(IlmarPrismShares, { contracts: [{ title: 'Mirrorhall glass lease', sharePercent: 12 }] })));
  assert.equal(off, '');
});
