/** #1445 slice 2. NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_TALK is HARIMU_UI_PACK index 72. Preview on, production off. */
import test from 'node:test'; import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises'; import { fileURLToPath } from 'node:url'; import { build } from 'esbuild';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { neighborhoodTalkEnabled, NEIGHBORHOOD_TALK_FLAG, residentStatusLabel, WEBGL_UNAVAILABLE } from '../lib/neighborhood-talk.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8'), strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '')), key = NEIGHBORHOOD_TALK_FLAG, root = fileURLToPath(new URL('..', import.meta.url));
const built = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: `import { createRoot } from 'react-dom/client'; import { NeighborhoodWalk } from './app/neighborhood-walk.tsx'; globalThis.__mount = props => { const el = document.getElementById(props.root ?? 'root'); (globalThis.__root ??= createRoot(el)).render(<NeighborhoodWalk {...props} />); };` }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_TALK': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_DESKTOP_GATE': '"true"' }, banner: { js: 'var process = globalThis.process || { env: {} };' }, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' } });
const ada = { key: 'h:0', name: 'Ada', nationId: 'kindle', kind: 'human', status: 'idle', you: true }, mara = { key: 'ai:mara', name: 'Mara Vale', nationId: 'kindle', kind: 'ai', status: 'working', you: false }, bren = { key: 'h:2', name: 'Bren', nationId: 'kindle', kind: 'human', status: 'idle', you: false };
const props = residents => ({ nationId: 'kindle', cityName: 'Forgehaven', slots: 8, residents, search: '?view=neighborhood&district=0' });
const mount = (page, residents) => page.evaluate(next => window.__mount({ ...next, onCity() {}, onSummary() { window.__summary = (window.__summary ?? 0) + 1; } }), props(residents));
test('flag is on only for the exact string "true", pack index 72, preview on and production off', async () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true', 'true ']) assert.equal(neighborhoodTalkEnabled(value), false, String(value));
  assert.equal(neighborhoodTalkEnabled('true'), true); assert.equal(residentStatusLabel('working'), 'Working'); assert.equal(residentStatusLabel('idle'), 'Idle');
  const previous = process.env[key];
  try { delete process.env[key]; assert.equal(neighborhoodTalkEnabled(), false); process.env[key] = 'true'; assert.equal(neighborhoodTalkEnabled(), true); }
  finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 74); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(72), key, 'index 72'); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(71), 'NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK'); assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(70), 'NEXT_PUBLIC_HARIMU_FAITH');
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined); assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false'); assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false');
  assert.match(await read('lib/neighborhood-talk.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_TALK/); assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 74/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key)); assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  const css = await read('app/neighborhood-talk.css'), rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|\})([^{}]+)\{/g)].map(m => m[1].trim()).filter(Boolean);
  for (const sel of rules) for (const part of sel.split(',')) assert.match(part.trim(), /^\.game-neighborhood-talk\b/, part);
  assert.doesNotMatch(css, /overflow-wrap:\s*anywhere|word-break:\s*break-all/); assert.match(css, /:focus-visible/);
  const scene = await read('app/neighborhood-walk.tsx'), talk = await read('app/neighborhood-talk.tsx'), panels = await read('app/scene-panels-v2.tsx'), page = await read('app/page.tsx');
  assert.match(scene, /setOpen\(talk \? resident\.key : i\)/); assert.match(scene, /key=\{talk \? person\.key : 'card'\}/); assert.match(scene, /talk && !person\.you \? <NeighborhoodCityTalk/); assert.doesNotMatch(scene, /person\.key === open\)\) setOpen\(null\)/);
  assert.equal(WEBGL_UNAVAILABLE, 'This neighborhood needs 3D graphics, which your browser has turned off. Try another browser or turn on hardware acceleration.'); assert.match(scene, /WEBGL_UNAVAILABLE/); assert.match(scene, /residentStatusLabel\(card\.status\)/);
  assert.match(talk, /fetch\('\/api\/city-chat'/); assert.match(talk, /<ReportButton kind="citizen-message" targetId=\{message\.id\} \/>/); assert.match(talk, /catch \{ setError\(unavailable\)/); assert.match(talk, /if \(busy \|\| posting\.current\) return/); assert.match(talk, /intent\.current \?\?=/); assert.match(talk, /disabled=\{busy\}/); assert.doesNotMatch(talk, /Hello|traveler|Elara/);
  assert.match(panels, /ShieldCheck/); assert.match(panels, /BookOpen/); assert.match(panels, /icon: talk \? districtMark\(name\) : undefined/); assert.match(page, /neighborhoodTalkEnabled\(\) && neighborhoodList/);
  assert.match(await read('app/game-shell.tsx'), /neighborhoodTalkEnabled\(\) \? ' game-neighborhood-talk'/);
});
test('the open card follows the resident key, WebGL failure uses the exact copy, and Talk opens city chat', async (t) => {
  let chromium; try { ({ chromium } = await import('playwright')); } catch { return t.skip('playwright is not installed'); }
  let browser; try { browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); } catch { return t.skip('headless chromium is not installed'); }
  const css = await read('app/neighborhood-talk.css');
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0}${css}</style></head><body class="game-neighborhood-walk game-neighborhood-talk"><div id="root"></div><div id="blank"></div></body></html>`, { waitUntil: 'load' });
    await page.addScriptTag({ content: built.outputFiles[0].text });
    await mount(page, [ada, mara, bren]);
    await page.locator('button', { hasText: 'Mara Vale' }).click(); await page.waitForSelector('.neighborhood-walk-card');
    const ai = await page.locator('.neighborhood-walk-card').innerText(); assert.match(ai, /Mara Vale/); assert.match(ai, /Working/); assert.doesNotMatch(ai, /\bTalk\b/);
    await mount(page, [mara, bren]);
    assert.match(await page.locator('.neighborhood-walk-card').innerText(), /Mara Vale/); assert.doesNotMatch(await page.locator('.neighborhood-walk-card').innerText(), /Bren/);
    await mount(page, [bren]);
    await page.waitForFunction(() => document.querySelectorAll('.neighborhood-walk-card').length === 0);
    await mount(page, [ada, bren]);
    await page.locator('button', { hasText: 'Ada' }).click(); await page.waitForSelector('.neighborhood-walk-card');
    assert.match(await page.locator('.neighborhood-walk-card').innerText(), /Idle/); assert.equal(await page.getByRole('button', { name: 'Talk' }).count(), 0);
    await page.getByRole('button', { name: 'Close' }).click(); await page.locator('button', { hasText: 'Bren' }).click(); await page.waitForSelector('.neighborhood-walk-card');
    await page.evaluate(() => { window.__urls = []; const reply = body => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })); window.fetch = (url, init) => { window.__urls.push(String(url) + ' ' + (init?.method ?? 'GET')); return reply({ nationId: 'kindle', cityId: 'forgehaven', reportsEnabled: true, messages: [{ id: 'm1', handle: 'Citizen-abc', body: 'Stored line', postedAt: 1, mine: false }] }); }; });
    await page.getByRole('button', { name: 'Talk' }).click(); await page.getByText('Stored line').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__urls), ['/api/city-chat GET']);
    const chat = await page.locator('.neighborhood-talk').innerText(); assert.match(chat, /Forgehaven/); assert.match(chat, /Stored line/); assert.match(chat, /Report this message/); assert.doesNotMatch(chat, /Hello|traveler/);
    await page.getByRole('button', { name: 'Neighborhood' }).click(); assert.equal(await page.evaluate(() => window.__summary), 1);
    await page.evaluate(() => document.documentElement.style.setProperty('--text-scale', '1.5'));
    const fit = await page.evaluate(() => [...document.querySelectorAll('.neighborhood-talk h3, .neighborhood-talk p, .neighborhood-talk button, .neighborhood-talk li, .neighborhood-talk label')].filter(node => node.clientWidth > 0).every(node => node.scrollWidth <= node.clientWidth + 1));
    assert.equal(fit, true);
    const blank = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await blank.setContent('<!doctype html><html><body class="game-neighborhood-talk"><div id="root"></div></body></html>', { waitUntil: 'load' });
    await blank.addScriptTag({ content: built.outputFiles[0].text });
    await blank.evaluate(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...rest) { if (String(type).includes('webgl')) return null; return orig.apply(this, [type, ...rest]); }; });
    await mount(blank, [ada]);
    await blank.waitForSelector('.neighborhood-talk-webgl');
    assert.equal(await blank.locator('.neighborhood-talk-webgl').innerText(), 'This neighborhood needs 3D graphics, which your browser has turned off. Try another browser or turn on hardware acceleration.');
    await page.close(); await blank.close();
  } finally { await browser.close(); }
});
