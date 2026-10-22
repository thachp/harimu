/** #82 slice 1: the Overlays toggle group. The real component in happy-dom with real React; HARIMU_MAP_OVERLAYS_ENABLED reaches the client as GET /api/citizen flags.mapOverlays; flag off renders nothing. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import { localRuntime } from './helpers/local-runtime.mjs';
import { toggleOverlay, MAP_OVERLAYS, UNREST_SCALE, phonePopoverPlacement, POPOVER_GAP } from '../lib/map-overlays.ts';
const require = createRequire(import.meta.url);

const w = new Window({ url: 'http://localhost/' }); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'); const { createRoot } = require('react-dom/client'); const { act } = React;
const js = ts.transpileModule(await readFile(new URL('../app/map-overlays.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const mod = { exports: {} }; new Function('exports', 'require', 'module', js)(mod.exports, n => n.startsWith('../lib/') ? require(`${n}.ts`) : require(n), mod);
const { MapOverlaysControl } = mod.exports;

// The viewport the Ownership layer portals into; the control sits inside its camera bar, as in GameViewport.
async function mount(enabled, props = {}) {
  const el = document.createElement('div'); el.className = 'game-viewport'; document.body.appendChild(el); const root = createRoot(el);
  await act(async () => root.render(React.createElement(MapOverlaysControl, { enabled, ...props })));
  return { el, root, button: name => [...el.querySelectorAll('button')].find(b => b.textContent === name), close: () => act(async () => root.unmount()) };
}
const pressed = m => MAP_OVERLAYS.map(o => o.label).filter(l => m.button(l).getAttribute('aria-pressed') === 'true');
const click = b => act(async () => b.dispatchEvent(new w.MouseEvent('click', { bubbles: true })));
// A native <button> turns Enter/Space into a click; happy-dom does not, so the keyboard path is the focused button's click.
const key = async (b, k) => { b.focus(); assert.equal(document.activeElement, b, 'focusable'); await act(async () => b.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }))); await click(b); };

test('rules: Ownership and Unrest are exclusive, Resources combines with either, order is fixed', () => {
  assert.deepEqual(toggleOverlay([], 'ownership'), ['ownership']);
  assert.deepEqual(toggleOverlay(['ownership'], 'unrest'), ['unrest']);
  assert.deepEqual(toggleOverlay(['unrest'], 'ownership'), ['ownership']);
  assert.deepEqual(toggleOverlay(['ownership'], 'resources'), ['ownership', 'resources']);
  assert.deepEqual(toggleOverlay(['resources', 'unrest'], 'ownership'), ['ownership', 'resources']);
  assert.deepEqual(toggleOverlay(['ownership', 'resources'], 'resources'), ['ownership']);
  assert.deepEqual(UNREST_SCALE, ['Calm', 'Tense', 'Riot']);
});

test('flag off renders nothing; the same spy sees the group with the flag on (baseline)', async () => {
  const on = await mount(true);
  assert.equal(on.el.querySelectorAll('[role="group"][aria-label="Overlays"]').length, 1, 'baseline: flag on renders the group');
  assert.ok(on.el.querySelectorAll('button').length >= 6); await on.close();
  const off = await mount(false);
  assert.equal(off.el.innerHTML, '', 'flag off renders nothing'); await off.close();
});

test('aria-pressed toggles, all start off, mutual exclusion and the legend follow the buttons, keyboard works', async () => {
  const m = await mount(true);
  assert.deepEqual(pressed(m), [], 'all overlays start off');
  assert.equal(m.el.querySelector('.map-overlays-legend'), null, 'no legend while nothing is on');
  await key(m.button('Ownership'), 'Enter'); assert.deepEqual(pressed(m), ['Ownership']);
  await key(m.button('Resources'), ' '); assert.deepEqual(pressed(m), ['Ownership', 'Resources']);
  await click(m.button('Unrest')); assert.deepEqual(pressed(m), ['Resources', 'Unrest'], 'Unrest turns Ownership off');
  const legend = m.el.querySelector('.map-overlays-legend');
  assert.deepEqual([...legend.querySelectorAll('section strong')].map(s => s.textContent), ['Resources', 'Unrest'], 'one legend section per active overlay');
  assert.deepEqual([...legend.querySelectorAll('.map-overlays-scale li')].map(li => li.textContent), ['Calm', 'Tense', 'Riot']);
  assert.match(m.el.querySelector('[aria-live="polite"]').textContent, /Resources, Unrest/);
  await click(m.button('Ownership')); assert.deepEqual(pressed(m), ['Ownership', 'Resources'], 'Ownership turns Unrest off');
  await click(m.button('Ownership')); await click(m.button('Resources')); assert.deepEqual(pressed(m), []);
  assert.equal(m.el.querySelector('[aria-live="polite"]').textContent, 'All overlays off');
  await m.close();
  window.sessionStorage.clear();
});

test('Army positions and Fog are aria-disabled, focusable, inert, with a reason tooltip', async () => {
  const m = await mount(true);
  for (const name of ['Army positions', 'Fog']) {
    const b = m.button(name);
    assert.equal(b.getAttribute('aria-disabled'), 'true'); assert.equal(b.hasAttribute('disabled'), false, 'not disabled, so it stays in the tab order');
    assert.equal(b.hasAttribute('aria-pressed'), false);
    const tip = document.getElementById(b.getAttribute('aria-describedby'));
    assert.equal(tip?.getAttribute('role'), 'tooltip'); assert.match(tip.textContent, /^Not available yet\./);
    await key(b, 'Enter'); assert.deepEqual(pressed(m), [], `${name} changes nothing`);
  }
  await m.close();
});

test('phone trigger opens and Escape closes the popover', async () => {
  const m = await mount(true); const trigger = m.button('Overlays'); const root = m.el.querySelector('.map-overlays');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false'); assert.equal(trigger.getAttribute('aria-controls'), 'map-overlays-panel');
  await click(trigger); assert.equal(root.dataset.open, 'true'); assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  await click(m.button('Resources'));
  const legend = m.el.querySelector('.map-overlays-legend');
  assert.deepEqual([legend.getAttribute('role'), legend.tabIndex, legend.getAttribute('aria-label')], ['region', 0, 'Overlay legend'], 'the scrolling legend is keyboard-reachable');
  m.button('Ownership').focus();
  await act(async () => m.button('Ownership').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  assert.equal(root.dataset.open, 'false'); assert.equal(document.activeElement, trigger, 'Escape returns focus to Overlays');
  await click(trigger); trigger.blur();
  await act(async () => m.button('Unrest').dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true })));
  assert.equal(root.dataset.open, 'true', 'a tap inside keeps it open');
  await act(async () => document.body.dispatchEvent(new w.PointerEvent('pointerdown', { bubbles: true })));
  assert.equal(root.dataset.open, 'false', 'an outside tap closes it'); assert.equal(document.activeElement, trigger, 'and returns focus to Overlays');
  await m.close();
});

test('phone placement: beside the World chip when it fits, else a bottom sheet whose top stays below the chip', () => {
  const chip = { right: 92, bottom: 355 };
  const beside = phonePopoverPlacement({ width: 390, height: 844 }, { right: 390 }, chip);
  assert.equal(beside.position, undefined); assert.equal(390 - beside.right - beside.maxWidth, chip.right + POPOVER_GAP, 'its left edge clears the chip');
  const sheet = phonePopoverPlacement({ width: 320, height: 640 }, { right: 320 }, chip);
  assert.equal(sheet.position, 'fixed'); assert.equal(640 - sheet.bottom - sheet.maxHeight, chip.bottom + POPOVER_GAP, 'its top clears the chip');
  assert.equal(phonePopoverPlacement({ width: 320, height: 300 }, { right: 320 }, chip).maxHeight, 0);
});

test('wiring: the group sits first in viewport-controls (left of the zoom cluster) and gets the flag through GameShell and page', async () => {
  const vp = await readFile(new URL('../app/game-viewport.tsx', import.meta.url), 'utf8');
  assert.match(vp, /<div className="viewport-controls" aria-label="Camera controls">\s*<MapOverlaysControl enabled=\{overlays\} lowGraphics=\{graphics === 'low'\} mapLayer=\{mode === 'world'\} \/>\s*<button type="button".*aria-label="Zoom in"/);
  assert.match(vp, /overlays = false \}: GameViewportProps/);
  const shell = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /mapOverlays = false,/); assert.match(shell, /<GameViewport marketOpen=\{marketVisible\([^)]*\)\} visitor=\{visitor\} overlays=\{mapOverlays\}/);
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /const \[overlaysFlag, setOverlaysFlag\] = useState\(false\)/); assert.match(page, /setOverlaysFlag\(snapshot\.flags\.mapOverlays === true\)/); assert.match(page, /<GameShell .*marketOpen=\{marketShown\} mapOverlays=\{overlaysFlag\}/);
  const css = await readFile(new URL('../app/game-shell.css', import.meta.url), 'utf8');
  assert.match(css, /\.viewport-controls:has\(\.map-overlays\) button\{min-width:44px;min-height:44px\}/);
  assert.match(css, /@media\(max-width:390px\)\{\n.*\n  \.map-overlays-trigger\{display:inline-flex/);
});

for (const backend of ['sqlite', 'postgres']) test(`GET /api/citizen flags.mapOverlays: false by default, true only with the flag (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  const off = (await r.call('citizen', 'alice')).data;
  assert.equal(off.flags.mapOverlays, false);
  r.setMapOverlays(true);
  const on = (await r.call('citizen', 'alice')).data;
  assert.equal(on.flags.mapOverlays, true, 'baseline: the flag reaches the client');
  assert.deepEqual({ ...on, flags: { ...on.flags, mapOverlays: false } }, off, 'only flags.mapOverlays differs');
});

// #82 slice 2 (ARC): toggles are remembered for the browser session; the Ownership overlay reads owners only while it is on.
const fixture = { width: 24, height: 18, cells: [[3, 2, 'kindle'], [4, 2, 'kindle'], [16, 2, 'korund']], totals: [{ nationId: 'kindle', squares: 2 }, { nationId: 'korund', squares: 1 }] };
function spyFetch() { const calls = []; globalThis.fetch = async url => { calls.push(String(url)); return new Response(JSON.stringify(fixture), { status: 200 }); }; return calls; }

test('ARC: the toggles survive leaving for the country view and coming back, but not a new session or a tampered value', async () => {
  window.sessionStorage.clear(); spyFetch();
  const world = await mount(true);
  await click(world.button('Unrest')); await click(world.button('Resources'));
  await world.close(); // the country view has no GameViewport, so the group unmounts
  const back = await mount(true);
  assert.deepEqual(pressed(back), ['Resources', 'Unrest'], 'back on the map, the same overlays are on'); await back.close();
  window.sessionStorage.clear();
  const fresh = await mount(true); assert.deepEqual(pressed(fresh), [], 'a new session starts with all off'); await fresh.close();
  window.sessionStorage.setItem('harimu.mapOverlays', JSON.stringify(['ownership', 'unrest', 'army', 7]));
  const tampered = await mount(true); assert.deepEqual(pressed(tampered), ['Unrest'], 'unknown ids dropped, Ownership/Unrest stay exclusive'); await tampered.close();
  window.sessionStorage.setItem('harimu.mapOverlays', '{bad'); const broken = await mount(true); assert.deepEqual(pressed(broken), []); await broken.close();
  window.sessionStorage.clear();
});

test('Ownership: flag off reads nothing; on, one read draws each owned square with its nation symbol and the legend counts squares', async () => {
  window.sessionStorage.setItem('harimu.mapOverlays', JSON.stringify(['ownership']));
  let calls = spyFetch();
  const off = await mount(false); await act(async () => {}); assert.equal(calls.length, 0, 'flag off: no read even with Ownership remembered'); assert.equal(document.querySelector('.map-ownership'), null); await off.close();
  calls = spyFetch();
  const on = await mount(true); await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  assert.deepEqual(calls, ['/api/world/ownership'], 'baseline: the same spy sees the one read');
  const cells = [...on.el.querySelectorAll('.map-ownership > span')];
  assert.deepEqual(cells.map(c => [c.dataset.nation, c.textContent, c.dataset.x, c.dataset.y, c.hidden]), [['kindle', '▣', '3', '2', true], ['kindle', '▣', '4', '2', true], ['korund', '▦', '16', '2', true]], 'symbol per square, not color alone; hidden until GameViewport places it on the globe');
  assert.ok(cells.every(c => c.style.backgroundColor), 'standard graphics tint the squares');
  assert.equal(on.el.querySelector('.map-ownership').getAttribute('aria-hidden'), 'true');
  assert.deepEqual([...on.el.querySelectorAll('.map-ownership-key li')].map(li => li.textContent), ['▣ Kindle Republic: 2 squares', '▦ Korund: 1 square']);
  await click(on.button('Ownership')); assert.equal(document.querySelector('.map-ownership'), null, 'off removes the layer');
  await click(on.button('Ownership')); assert.equal(calls.length, 1, 'turning it back on reuses the read'); await on.close();
  window.sessionStorage.setItem('harimu.mapOverlays', JSON.stringify(['ownership'])); spyFetch();
  const low = await mount(true, { lowGraphics: true }); await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  const layer = low.el.querySelector('.map-ownership');
  assert.equal(layer.dataset.lowGraphics, 'true'); assert.ok([...layer.children].every(c => !c.style.backgroundColor && c.textContent), 'low graphics: symbols only, no tint');
  await low.close(); window.sessionStorage.clear();
});

for (const backend of ['sqlite', 'postgres']) test(`GET /api/world/ownership: 404 with no database read while off; read-only owners while on (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  const sql = []; const prepare = r.db.prepare.bind(r.db); r.db.prepare = q => { sql.push(q); return prepare(q); };
  const off = await r.call('world/ownership');
  assert.equal(off.status, 404); assert.equal(sql.length, 0, 'flag off opens no database');
  r.setMapOverlays(true);
  const on = await r.call('world/ownership');
  assert.equal(on.status, 200); assert.ok(sql.length > 0, 'baseline: the same spy sees the read');
  assert.ok(sql.every(q => /^\s*SELECT/i.test(q)), `GET is read-only: ${sql.join(' | ')}`);
  assert.equal(on.data.width, 24); assert.equal(on.data.height, 18);
  assert.deepEqual(on.data.cells.find(c => c[0] === 5 && c[1] === 4), [5, 4, 'kindle'], 'the Kindle capital square');
  assert.ok(on.data.cells.every(([, , owner]) => typeof owner === 'string' && owner), 'only owned squares');
  assert.equal(on.data.totals.reduce((n, t) => n + t.squares, 0), on.data.cells.length);
});

// QA3 #720: the layer rides the globe squares, is hidden where it does not apply, and storage failures fall back to all off.
const THREE = require('three');
const { squareLatLon, projectOwnershipCells, nationGlobeCoordinates } = require('../lib/globe-mapping.ts');
const ownershipCellLatLon = (x, y, width, height) => squareLatLon({ x, y }, { width, height });
function scene(rx, ry, zoom = 1) { // the world-mode camera of GameViewport: globe group rotated by the target, ortho camera at z 25
  const group = new THREE.Group(); group.rotation.set(rx, ry, 0); group.updateMatrixWorld();
  const camera = new THREE.OrthographicCamera(-16 / zoom, 16 / zoom, 12 / zoom, -12 / zoom, .1, 120); camera.position.set(0, 0, 25); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  return { group, camera };
}
const spots = (cells, s) => projectOwnershipCells({ width: 24, height: 18 }, cells, s.group, s.camera, { w: 800, h: 600 }, new THREE.Vector3());

test('anchoring rule: square (x, y) maps to latitude/longitude equirectangularly and its screen spot follows rotation and zoom', () => {
  assert.deepEqual(ownershipCellLatLon(0, 0, 24, 18), { latitude: 85, longitude: -172.5 });
  assert.deepEqual(ownershipCellLatLon(12, 9, 24, 18), { latitude: -5, longitude: 7.5 });
  { // ARC: the overlay and the nation markers share one mapping, so Kindle's capital cell projects onto Kindle's marker
    const s = scene(.3, 1.2), [kindle] = nationGlobeCoordinates([{ x: 5, y: 4 }]), lat = kindle.latitude * Math.PI / 180, lon = kindle.longitude * Math.PI / 180;
    const marker = new THREE.Vector3(7.05 * Math.cos(lat) * Math.sin(lon), 7.05 * Math.sin(lat), 7.05 * Math.cos(lat) * Math.cos(lon)).applyMatrix4(s.group.matrixWorld).project(s.camera);
    const [cell] = spots([[5, 4]], s); assert.ok(Math.abs(cell.left - (marker.x + 1) * 400) < 1e-6 && Math.abs(cell.top - (1 - marker.y) * 300) < 1e-6);
  }
  const centre = [[11, 8]], back = [[0, 8]];
  const [a] = spots(centre, scene(0, 0)); assert.equal(a.hidden, false, 'facing square shown'); assert.ok(Math.abs(a.left - 400) < 30 && Math.abs(a.top - 300) < 30, 'near the screen centre');
  assert.equal(spots(back, scene(0, 0))[0].hidden, true, 'back hemisphere hidden');
  const [r] = spots(centre, scene(0, .6)); assert.ok(r.left - a.left > 40, 'rotating the globe moves the square');
  assert.equal(spots(back, scene(0, Math.PI))[0].hidden, false, 'turning the globe brings the back square round');
  const [z] = spots([[13, 6]], scene(0, 0, 2)), [z1] = spots([[13, 6]], scene(0, 0, 1)); assert.ok(Math.abs(z.left - 400) > 1.8 * Math.abs(z1.left - 400), 'zooming spreads squares from the centre');
});

test('GameViewport places the cells from its draw loop in world mode only, and the city view hides the layer', async () => {
  const vp = await readFile(new URL('../app/game-viewport.tsx', import.meta.url), 'utf8');
  const draw = vp.slice(vp.indexOf('const draw = () => {'), vp.indexOf('renderer.render(scene, camera);'));
  assert.match(draw, /const owned = mode === 'world' \? container\.closest\('\.game-viewport'\)\?\.querySelector<HTMLElement>\('\.map-ownership'\) : null;/);
  assert.match(draw, /projectOwnershipCells\([^;]*world\.group, camera, \{ w, h \}/);
  assert.match(vp, /new MutationObserver\(render\)/, 'a layer that mounts later is placed');
  window.sessionStorage.setItem('harimu.mapOverlays', JSON.stringify(['ownership'])); const calls = spyFetch();
  const city = await mount(true, { mapLayer: false }); await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  assert.equal(calls.length, 1, 'baseline: the read happens'); assert.ok(city.el.querySelector('.map-ownership-key'), 'legend still lists owners');
  assert.equal(document.querySelector('.map-ownership'), null, 'no world squares over the city'); await city.close(); window.sessionStorage.clear();
});

test('flag on, Ownership off: no read', async () => {
  window.sessionStorage.setItem('harimu.mapOverlays', JSON.stringify(['resources'])); const calls = spyFetch();
  const m = await mount(true); await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  await click(m.button('Unrest')); await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  assert.equal(calls.length, 0); await m.close(); window.sessionStorage.clear();
});

test('ARC: blocked or missing sessionStorage is safe and starts all off', async t => {
  const real = Object.getOwnPropertyDescriptor(window, 'sessionStorage') ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), 'sessionStorage');
  t.after(() => { delete window.sessionStorage; if (real && !Object.getOwnPropertyDescriptor(window, 'sessionStorage')) Object.defineProperty(window, 'sessionStorage', real); });
  const writes = [], boom = () => { throw new Error('SecurityError'); };
  const fake = (getItem, setItem) => ({ configurable: true, get: () => ({ getItem, setItem }) });
  const cases = {
    'getItem throws': fake(boom, (k, v) => writes.push(v)),
    'setItem throws': fake(() => JSON.stringify(['resources']), boom),
    'window.sessionStorage throws': { configurable: true, get: boom },
  };
  for (const [name, property] of Object.entries(cases)) {
    Object.defineProperty(window, 'sessionStorage', property);
    const m = await mount(true);
    if (name === 'setItem throws') assert.deepEqual(pressed(m), ['Resources'], 'baseline: a readable value is used');
    else assert.deepEqual(pressed(m), [], `${name}: all off`);
    await click(m.button('Unrest')); assert.ok(pressed(m).includes('Unrest'), `${name}: toggles still work`);
    await m.close();
  }
  assert.deepEqual(writes, ['["unrest"]'], 'getItem failing does not stop the write');
  const { readSessionOverlays, writeSessionOverlays } = require('../lib/map-overlays.ts');
  assert.doesNotThrow(() => writeSessionOverlays({ setItem: boom }, ['unrest']), 'a blocked write never throws out of the click');
  assert.deepEqual(readSessionOverlays({ getItem: boom }), []); assert.deepEqual(readSessionOverlays(undefined), []);
});
