/** #1445 slice 1. NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK is HARIMU_UI_PACK index 71. Preview on, production off. */
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises'; import { fileURLToPath } from 'node:url'; import { build } from 'esbuild';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs'; import { cityTierUnlockFields } from '../lib/city-tier.ts';
import { districtIndex, districtLabels, districtTypes, emptyResidents, houseSlots, nearestResident, neighborhoodWalkEnabled, NEIGHBORHOOD_WALK_FLAG, residentCard, stepWalk } from '../lib/neighborhood-walk.ts';
import { normalizeSceneSearch, sceneFromSearch } from '../lib/scene-navigation.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8'), strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '')), key = NEIGHBORHOOD_WALK_FLAG, root = fileURLToPath(new URL('..', import.meta.url));
const built = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `import { createRoot } from 'react-dom/client'; import { NeighborhoodWalk } from './app/neighborhood-walk.tsx'; globalThis.__mount = props => { const el = document.getElementById('root'); (globalThis.__root ??= createRoot(el)).render(<NeighborhoodWalk {...props} />); };` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_DESKTOP_GATE': '"true"' }, banner: { js: 'var process = globalThis.process || { env: {} };' }, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' } });
test('flag is on only for the exact string "true", pack index 71, preview on and production off', async () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true', 'true ']) assert.equal(neighborhoodWalkEnabled(value), false, String(value));
  assert.equal(neighborhoodWalkEnabled('true'), true); const previous = process.env[key];
  try { delete process.env[key]; assert.equal(neighborhoodWalkEnabled(), false); assert.equal(sceneFromSearch('?view=neighborhood'), 'square'); process.env[key] = 'true'; assert.equal(neighborhoodWalkEnabled(), true); assert.equal(sceneFromSearch('?view=neighborhood'), 'neighborhood'); }
  finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 76); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(71), key, 'index 71'); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(70), 'NEXT_PUBLIC_HARIMU_FAITH'); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(69), 'NEXT_PUBLIC_HARIMU_ECONOMY');
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined); assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false'); assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false');
  assert.match(await read('lib/neighborhood-walk.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK/); assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 76/);
});
test('district count is districtSlots and names are the spec types', () => {
  const previous = process.env[key];
  try {
    process.env[key] = 'true';
    for (const tier of [1, 2, 3, 4]) { const labels = districtLabels(cityTierUnlockFields(tier).districtSlots); assert.equal(labels.length, cityTierUnlockFields(tier).districtSlots, String(tier)); assert.ok(labels.every(label => districtTypes.some(type => label === type || label.startsWith(`${type} `)))); }
    assert.deepEqual(districtLabels(cityTierUnlockFields(1).districtSlots), ['Residential', 'Industrial']); assert.deepEqual(districtLabels(8), ['Residential', 'Industrial', 'Market', 'Civic', 'Military', 'Sacred', 'Residential 2', 'Industrial 2']);
    assert.equal(districtIndex('?district=2', 6), 2); assert.equal(districtIndex('?district=7', 8), 7); assert.equal(districtIndex('?district=7', 2), 0); assert.equal(districtIndex('?district=Old+Quarter', 4), 0);
    const houses = houseSlots(4), stepped = stepWalk(0, 0, 0, 1, 0, houses), blocked = stepWalk(8, 0, 0, 0, 0, houses), right = stepWalk(0, 0, 0, 0, 1, []);
    assert.ok(stepped.z > 0); assert.ok(right.x < 0 && right.z === 0, 'positive strafe is camera-right'); assert.ok(Math.hypot(blocked.x - 8, blocked.z) >= 1.3); assert.equal(nearestResident(0, 0, [{ x: 0, z: 0 }]), 0); assert.equal(nearestResident(9, 9, [{ x: 0, z: 0 }]), -1);
    assert.equal(normalizeSceneSearch('?view=neighborhood&district=2', ['kindle'], () => true), '?view=neighborhood&district=2'); assert.equal(normalizeSceneSearch('?view=neighborhood&district=7', ['kindle'], () => true), '?view=neighborhood&district=7');
    assert.equal(normalizeSceneSearch('?view=neighborhood&district=Old%20Quarter', ['kindle'], () => true), '?view=neighborhood'); assert.equal(normalizeSceneSearch('?view=neighborhood&district=8', ['kindle'], () => true), '?view=neighborhood'); assert.equal(normalizeSceneSearch('?view=square&district=1', ['kindle'], () => true), '?view=square');
    delete process.env[key]; assert.equal(normalizeSceneSearch('?view=neighborhood&district=2', ['kindle'], () => true), '?view=neighborhood');
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});
test('resident cards keep each resident name and do not copy a Notable', async () => {
  const human = { key: 'h:0', name: 'Ada', nationId: 'kindle', kind: 'human', status: 'idle', you: true }, ai = { key: 'ai:x', name: 'Sera', nationId: 'kindle', kind: 'ai', status: 'working', you: false };
  assert.deepEqual(residentCard(human), { name: 'Ada', status: 'idle', kind: 'Citizen', you: true }); assert.deepEqual(residentCard(ai), { name: 'Sera', status: 'working', kind: 'AI citizen', you: false });
  assert.equal(Object.hasOwn(residentCard(ai), 'role'), false); assert.doesNotMatch(await read('lib/neighborhood-walk.ts'), /notableProfile/); assert.match(await read('app/neighborhood-walk.tsx'), /<NotableControl nationId=\{nationId\} \/>/);
});
test('the scene is gated, instanced, and readable at 1280 and 150% text', async (t) => {
  const css = await read('app/neighborhood-walk.css'), scene = await read('app/neighborhood-walk.tsx'), rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|\})([^{}]+)\{/g)].map(m => m[1].trim()).filter(Boolean);
  for (const sel of rules) for (const part of sel.split(',')) assert.match(part.trim(), /^\.game-neighborhood-walk\b/, part);
  assert.doesNotMatch(css, /overflow-wrap:\s*anywhere|word-break:\s*break-all/); assert.match(css, /:focus-visible/); assert.match(scene, /InstancedMesh/); assert.match(scene, /\.dispose\(\)/); assert.match(scene, /tabIndex = 0/); assert.match(scene, /desktopGateEnabled/); assert.match(scene, /keys\.clear\(\)/); assert.doesNotMatch(scene, /\.lerp\(|performance\.now|Hello traveler|Elara|Old Quarter|Market Row/);
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); } let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  const residents = [{ key: 'h:0', name: 'Ada', nationId: 'kindle', kind: 'human', status: 'idle', you: true }, { key: 'ai:mara', name: 'Mara Vale', nationId: 'kindle', kind: 'ai', status: 'working', you: false }];
  try { const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); await page.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0}${css}</style></head><body class="game-neighborhood-walk"><div id="root"></div></body></html>`, { waitUntil: 'load' }); await page.addScriptTag({ content: built.outputFiles[0].text });
    await page.evaluate(props => window.__mount({ ...props, onCity: () => { window.__city = (window.__city ?? 0) + 1; } }), { nationId: 'kindle', cityName: 'Forgehaven', slots: 8, residents, search: '?view=neighborhood&district=6' });
    await page.waitForSelector('.neighborhood-walk-panel h2'); const fit = () => [...document.querySelectorAll('.neighborhood-walk-panel h2, .neighborhood-walk-panel h3, .neighborhood-walk-panel p, .neighborhood-walk-panel button, .neighborhood-walk-panel li')].filter(node => node.clientWidth > 0).every(node => node.scrollWidth <= node.clientWidth + 1);
    const opened = await page.evaluate(fit); assert.equal(await page.locator('h2').innerText(), 'Residential 2'); assert.equal(opened, true); assert.equal(await page.locator('canvas').getAttribute('tabindex'), '0'); assert.equal(await page.locator('canvas').getAttribute('aria-label'), 'Residential 2, Forgehaven');
    await page.locator('button', { hasText: 'Mara Vale' }).click(); await page.waitForSelector('.neighborhood-walk-card'); const card = await page.locator('.neighborhood-walk-card').innerText(); assert.match(card, /Mara Vale/); assert.match(card, /AI citizen/); assert.match(card, /working/); assert.match(card, /Meet /); assert.doesNotMatch(card, /Civic journalist|introduction|Hello|rumor is not evidence/i);
    await page.evaluate(() => document.documentElement.style.setProperty('--text-scale', '1.5')); assert.equal(await page.evaluate(fit), true); assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--text-scale').trim()), '1.5');
    await page.getByRole('button', { name: 'Close' }).focus(); await page.keyboard.press('Escape'); assert.equal(await page.locator('.neighborhood-walk-card').count(), 0); assert.equal(await page.evaluate(() => window.__city ?? 0), 0); assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'CANVAS');
    await page.locator('button', { hasText: 'City' }).focus(); await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => window.__city), 1); await page.close();
  } finally { await browser.close(); }
});
test('D and Right move toward camera-right', () => { const right = stepWalk(0, 0, 0, 0, 1, []), left = stepWalk(0, 0, 0, 0, -1, []); assert.ok(right.x < 0 && right.z === 0 && left.x > 0); });
test('a new empty residents array does not rebuild the scene, and cleanup releases the context', async (t) => {
  const scene = await read('app/neighborhood-walk.tsx'); assert.match(scene, /forceContextLoss\(\); renderer\.dispose\(\)/); assert.match(scene, /residentSig/); assert.doesNotMatch(scene, /\[on, nationId, cityName, label, index, residents,/); assert.match(await read('app/page.tsx'), /coResidents \?\? emptyResidents/); assert.ok(emptyResidents.length === 0);
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); } let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>'); await page.addScriptTag({ content: built.outputFiles[0].text });
    const kept = await page.evaluate(async () => { const mount = residents => window.__mount({ nationId: 'kindle', cityName: 'Forgehaven', slots: 2, residents, search: '?district=0', onCity() {} }); const wait = async () => { for (let i = 0; i < 40 && !document.querySelector('canvas'); i++) await new Promise(resolve => requestAnimationFrame(resolve)); }; mount([]); await wait(); const first = document.querySelector('canvas'); mount([]); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return first != null && first === document.querySelector('canvas') && document.querySelectorAll('canvas').length === 1; });
    assert.equal(kept, true); await page.close();
  } finally { await browser.close(); }
});
