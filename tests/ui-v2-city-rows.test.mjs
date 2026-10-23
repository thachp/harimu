/** #392 S7 follow-up (Refs #392): with the City pills on (UI_V2_CITY), the City panel's destination rows and Household primary carry the pill's decorative icon,
 *  so rows and pills match. Flag off and on, same assertions: labels, details and accessible names are unchanged; icons are aria-hidden. */
import test from 'node:test';
import assert from 'node:assert/strict';

const render = async flag => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': JSON.stringify(flag), 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"true"' } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server'), { cityDestinations } = await import('../lib/city-destinations.ts');
  const nation = { id: 'kindle', name: 'Kindle Republic', government: 'G', capital: 'Forgehaven', currency: 'Spark', economy: 'E', religion: 'R' };
  return renderToStaticMarkup(React.createElement(mod.CitySummary, { cityName: 'Forgehaven', city: { capital: true }, nation, destinations: cityDestinations('kindle', true), onView: () => {} }));
};
const text = html => html.replace(/<span class="panel-v2-icon"[^>]*>.*?<\/span>/g, '').replace(/<svg.*?<\/svg>/g, '');

test('flag off and on: same rows, details and names; with the flag on every row and the Household primary has one aria-hidden icon', async () => {
  const off = await render('false'), on = await render('true');
  assert.equal(text(on), text(off), 'nothing but the icons changes');
  assert.equal((off.match(/panel-v2-icon/g) ?? []).length, 0);
  assert.equal((on.match(/<span class="panel-v2-icon" aria-hidden="true"><svg/g) ?? []).length, 4, 'Workplace, Market, Government rows + Household primary');
});
