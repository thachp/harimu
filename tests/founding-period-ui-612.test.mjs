/** #612 slice B: the Founding Period banner on the government view. Real component, real React; lines from the #499 copy module; hidden with the flag off (the server sends no government.founding). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
const require = createRequire(import.meta.url);
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
const rt = await localRuntime(); // its importModule transpiles lib files that import extensionless siblings
const copy = await rt.importModule('lib/founding-period-copy.ts');

async function load(rel, deps = {}) {
  const src = await readFile(new URL(`../app/${rel}.tsx`, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'module', js)(exports, name => {
    if (name === './display-preferences') return { useDisplayTimestamp: () => ms => `T${ms}` };
    if (name === './ai-disclosure') return { AiBadge: () => React.createElement('small', { className: 'ai-badge' }, 'SI') };
    if (name === '../lib/founding-period-copy') return copy;
    return deps[name] ?? require(name);
  }, { exports });
  return exports;
}
const { FoundingBanner } = await load('founding-banner');
const render = props => renderToStaticMarkup(React.createElement(FoundingBanner, props));
const esc = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;');
const active = { active: true, endsAt: 1_800_000_000, dayOfPeriod: 4 };

test.after(() => rt.close());

test('flag off: no founding data, nothing renders', () => {
  for (const nationId of ['kindle', 'korund', 'aurelle']) { assert.equal(render({ founding: undefined, nationId }), ''); assert.equal(render({ founding: null, nationId }), ''); }
});

test('active: title, dated caption, explainer, programme and tenure lines, and the nation day-30 preview', () => {
  for (const nationId of ['kindle', 'korund', 'aurelle']) {
    const html = render({ founding: active, nationId }), preview = copy.dayThirtyPreviewFor(nationId);
    for (const text of [copy.foundingBanner.title, copy.foundingBanner.caption.text.replace('{endsAt}', 'T1800000000000'), copy.foundingBanner.explainer.text, copy.foundingProgramme.label, copy.foundingProgramme.line.text, copy.foundingTenure.label, copy.foundingTenure.line.text, preview.headline, preview.body, preview.byline.name]) assert.ok(html.includes(esc(text)), `${nationId}: ${text}`);
    assert.doesNotMatch(html, /\{endsAt\}/);
    assert.equal(html.includes(esc(copy.foundingEnded.text)), false);
    assert.equal((html.match(/ai-badge/g) ?? []).length, nationId === 'korund' ? 2 : 1, 'the programme line, plus the State Media preview in Korund');
  }
});

test('[ASSUMPTION] unknown end time: the explainer only, no dated caption', () => {
  const html = render({ founding: { active: true, endsAt: null, dayOfPeriod: null }, nationId: 'kindle' });
  assert.ok(html.includes(esc(copy.foundingBanner.explainer.text)));
  assert.doesNotMatch(html, /Founding Period until/);
});

test('after day 30: only the ended line', () => {
  const html = render({ founding: { active: false, endsAt: 1_800_000_000, dayOfPeriod: null }, nationId: 'korund' });
  assert.ok(html.includes(esc(copy.foundingEnded.text)));
  for (const text of [copy.foundingBanner.explainer.text, copy.foundingProgramme.line.text, copy.dayThirtyPreviewFor('korund').headline]) assert.equal(html.includes(esc(text)), false, text);
});

test('other nations get no banner, and the government view mounts it above the panel', async () => {
  assert.equal(render({ founding: active, nationId: 'confluence' }), '');
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<FoundingBanner founding=\{government\?\.founding\} nationId=\{citizenNation\.id\} \/>\s*<GovernmentPanel /);
  assert.match(await readFile(new URL('../lib/government.ts', import.meta.url), 'utf8'), /founding\?: \{/);
});
