import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('#875: the nations-bar Preview badge waits for openNations, so Confluence and unbuilt nations never flash Preview before the open list loads', async () => {
  const shell = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /view === 'world' && openNations !== undefined && nationIsPreview\(item\.id, openNations\) && item\.badge !== 'Coming soon' && <small className="nation-preview-badge">Preview<\/small>/);
  assert.equal((shell.match(/>Preview</g) ?? []).length, 1, 'no new badge copy');
});

test('#875: a loaded snapshot always sets a list ([] when no nation is flag-opened), so Preview still shows after load', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /setOpenNations\(snapshot\.openNations \?\? \[\]\)/);
  assert.match(page, /useState<readonly string\[\] \| undefined>\(\)/, 'undefined until the snapshot loads');
});

// QA3 (#924): behaviour, not source text. The real GameShell world strip, fed through the same previewOpenNations() call page.tsx makes.
const renderStrip = async () => {
  const { build } = await import('esbuild');
  const out = await build({ stdin: { contents: "export { GameShell } from './app/game-shell.tsx'; export { previewOpenNations } from './lib/nation-discovery.ts';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'css-modules', setup(b) { b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'm', namespace: 'cssm' })); b.onLoad({ filter: /.*/, namespace: 'cssm' }, () => ({ contents: 'export default new Proxy({}, { get: (_, k) => String(k) })' })); } }] });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven', currency: 'Spark' };
  const items = ['kindle', 'confluence', 'meridian'].map(id => ({ id, label: id, selected: id === 'kindle' }));
  return (open, accounts, status) => {
    const html = renderToStaticMarkup(React.createElement(mod.GameShell, { view: 'world', nation, citizenNation: nation, nations: [nation], capacity: 18, localDemo: !accounts, worldClock: { gameDay: 12, latestTick: 140 }, onNavigate: () => {}, onSelectNation: () => {}, accountControls: null,
      contextTitle: 'Nations', contextItems: items, openNations: mod.previewOpenNations(open, accounts, status), panel: React.createElement('p', null, 'PANEL') }));
    return (html.match(/class="nation-preview-badge">Preview</g) ?? []).length;
  };
};

test('QA3: Preview badges per citizen state: loading none; loaded with an open nation, loaded with none, signed out, fetch error and no-accounts builds all show them', async () => {
  const badges = await renderStrip();
  assert.equal(badges(undefined, true, 'loading'), 0, 'loading: no flash');
  assert.equal(badges(['confluence'], true, 'ready'), 1, 'loaded with Confluence open: only Meridian');
  assert.equal(badges([], true, 'ready'), 2, 'loaded, none open');
  assert.equal(badges(undefined, true, 'ready'), 0, 'ready but the snapshot not yet applied: still settling');
  assert.equal(badges(undefined, true, 'anonymous'), 2, 'signed out');
  assert.equal(badges(undefined, true, 'error'), 2, 'citizen fetch error');
  assert.equal(badges(undefined, false, 'loading'), 2, 'build without accounts (local demo)');
});

test('page.tsx feeds the strip through previewOpenNations with the citizen status', async () => {
  assert.match(await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'), /openNations=\{previewOpenNations\(openNations, clerkConfigured, citizenSessionStatus\)\}/);
});
