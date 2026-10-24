/** #871 (#392 S11): the Government (Civic) panel head in the S3 shape, flag NEXT_PUBLIC_HARIMU_UI_V2_PANEL. Rendered flag off and on with the same assertions;
 *  per MVP nation, each lever row exists only where that nation shows the section, its jump target is that section's own root, and page.tsx keeps every civic section. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

const build = async flag => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': JSON.stringify(flag) } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  return (name, props) => renderToStaticMarkup(React.createElement(mod[name], props));
};
const nations = { kindle: { id: 'kindle', name: 'Kindle Republic', government: 'Presidential republic', capital: 'Emberfall' }, korund: { id: 'korund', name: 'Korund', government: 'Planned state', capital: 'Ostrava' }, aurelle: { id: 'aurelle', name: 'Aurelle', government: 'Monarchy', capital: 'Lys' } };
const levers = { kindle: ['Presidential election · PoC', 'Policy and petitions', 'Collective petitions'], korund: ['Policy and petitions'], aurelle: ['Policy and petitions', 'Claimants of the rival houses'] };
const all = ['Presidential election · PoC', 'Collective petitions', 'Claimants of the rival houses'];

for (const flag of ['false', 'true']) test(`flag ${flag}: the Government head shows only with the flag on; per MVP nation only its own levers`, async () => {
  const render = await build(flag), on = flag === 'true';
  for (const [id, nation] of Object.entries(nations)) {
    const html = render('GovernmentSummary', { nation, account: true });
    assert.equal(html.includes('class="panel-v2"'), on, id);
    for (const t of ['<h2>Government</h2>', nation.name, `<dt>Government</dt><dd>${nation.government}</dd>`, ...levers[id]]) assert.equal(html.includes(t), on, `${id}: ${t}`);
    for (const t of all.filter(t => !levers[id].includes(t))) assert.equal(html.includes(t), false, `${id} has no ${t}`);
    const local = render('GovernmentSummary', { nation, account: false });
    for (const t of all) assert.equal(local.includes(t), false, `${id} without an account: no account-only lever (${t})`);
  }
});

test('every lever jumps to its section\'s own root, and page.tsx still renders every civic section', async () => {
  const src = await read('app/scene-panels-v2.tsx'), page = await read('app/page.tsx');
  for (const [sel, file] of [['[aria-label="Government preview status"]', 'app/government-panel.tsx'], ['.collective-petitions', 'app/collective-petitions.tsx'], ['[aria-label="Aurelle claimants and the Rising"]', 'app/aurelle-rising.tsx'], ['.ranked-ballot', 'app/ranked-ballot.tsx']]) {
    assert.ok(src.includes(`jump('${sel}')`), sel);
    const root = await read(file); assert.ok(sel.startsWith('.') ? root.includes(`className="${sel.slice(1)}"`) : root.includes(sel.slice(1, -1).replace('aria-label=', 'aria-label=')), `${file} keeps ${sel}`);
  }
  assert.match(page, /<GovernmentSummary nation=\{citizenNation\} account=\{clerkConfigured\} \/>/);
  for (const c of ['GovernmentPanel', 'RankedBallot', 'AssemblyBallot', 'PrimaryCard', 'CollectivePetitionsPanel', 'AurelleRisingPanel', 'TownHalls', 'PollCard', 'Debate']) assert.match(page, new RegExp(`<${c}\\b`), c);
});
