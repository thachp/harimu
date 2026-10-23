/** #392 S6: Nation panel shape and institution rows, flag NEXT_PUBLIC_HARIMU_UI_V2_NATION ("true" in preview, "false" in production). Pins plus a render of the
 *  real NationPanel, built with the flag off and on (build-time define, as in the app), with the same assertions. Browser layout: scripts/ui-v2-nation-check.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { exploreNationLabels, uiV2NationEnabled } from '../lib/ui-v2-nation.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('flag: preview on, production off, only the exact string "true" enables it', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_NATION":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_NATION":\s*"false"/);
  assert.equal(uiV2NationEnabled('true'), true);
  for (const v of [undefined, '', 'false', 'TRUE', '1']) assert.equal(uiV2NationEnabled(v), false);
});

test("Content's Explore copy: one pattern for all ten nations; the accessible label starts with the visible text", () => {
  for (const name of ['Kindle', 'Confluence', 'Meridian', 'Korund', 'Aurelle', 'Ilmar', 'Hoarvale', 'Varkand', 'Veldwood', 'Fulmara']) {
    const { label, ariaLabel } = exploreNationLabels(name);
    assert.equal(label, `Explore ${name}`);
    assert.equal(ariaLabel, `Explore ${name}: open the nation map`);
    assert.ok(ariaLabel.startsWith(label));
  }
});

export const nation = { id: 'aurelle', name: 'Aurelle', shortName: 'Aurelle', capital: 'Highspire', government: 'GOV', economy: 'ECO', currency: 'Crown · CRN', religion: 'REL',
  population: 'POP', treasury: 'TRE', stability: 72, motto: 'MOTTO', tradeStatus: 'TRADE' };
const render = async flag => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-panel-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': JSON.stringify(flag) } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server'), noop = () => {};
  return renderToStaticMarkup(React.createElement(mod.NationPanel, { nation, capacity: 10, workOrders: [], workPending: false, onWorldView: noop, onHousehold: noop, onWorkplace: noop, onCommitWork: noop, onNationMap: noop }));
};
const count = (html, text) => html.split(text).length - 1;
const expectFor = (flag, html) => {
  const on = flag === 'true';
  assert.equal(html.includes('class="panel-v2"'), on, `panel shape with the flag ${flag}`);
  assert.equal(html.includes('aria-label="Institution systems"'), true, 'the systems keep their name (picker off, rows on)');
  assert.equal(html.includes('role="group" aria-label="Institution systems"'), !on, 'the old picker only with the flag off');
  for (const fact of ['GOV', 'ECO', 'REL', 'POP', 'TRE', 'Highspire']) assert.ok(html.includes(fact), `${fact} kept with the flag ${flag}`);
  assert.equal(count(html, 'aria-pressed="true"'), 1, 'one selected system');
  for (const label of ['Capital', 'Currency', 'Trade', 'Civic life', 'Public works']) assert.ok(html.includes(on ? `<strong>${label}</strong>` : `>${label}</button>`), `${label} selectable with the flag ${flag}`);
  assert.equal(html.includes('MOTTO'), on, 'the motto is the S6 subtitle');
  assert.equal(html.includes('<span>Explore Aurelle</span>'), on);
  assert.equal(html.includes('aria-label="Explore Aurelle: open the nation map"'), on);
  assert.ok(html.includes('World globe'), 'existing links stay');
};

test('render: NationPanel with the flag off and on, same assertions', async () => {
  for (const flag of ['false', 'true']) expectFor(flag, await render(flag));
  assert.throws(() => expectFor('false', '<section class="panel-v2"></section>'));
});

test('page.tsx renders NationPanel once, without `enabled`, and NationInstitutions only through it', async () => {
  const page = await read('app/page.tsx');
  const uses = [...page.matchAll(/<NationPanel\b[^>]*>/g)];
  assert.equal(uses.length, 1);
  assert.doesNotMatch(uses[0][0], /\benabled\b/);
  assert.doesNotMatch(page, /<NationInstitutions\b|uiV2NationEnabled|UI_V2_NATION/);
});

test('every esbuild harness that defines UI_V2_WORLD also defines UI_V2_NATION', async () => {
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_WORLD['"]\s*:/.test(src)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_NATION['"]\s*:/, `${f} must define UI_V2_NATION`);
  }
});
