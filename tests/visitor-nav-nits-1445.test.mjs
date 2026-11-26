/** #1445 slice 4c. Visitor nav nits behind the existing flags. No new UI_PACK entry. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { levelDockTitle, noteDistrictSlots, placeCrumbTargets, PLACE_NAV_FLAG, placeNavTrail } from '../lib/place-nav.ts';
import { citySquareEvent, openCitySquare } from '../lib/city-drive.ts';
import { pushPlaceNav } from '../lib/scene-navigation.ts';
import { zoomPathCrumbs } from '../lib/zoom-path.ts';

const require = createRequire(import.meta.url);
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const names = ['NEXT_PUBLIC_HARIMU_PLACE_NAV', 'NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK', 'NEXT_PUBLIC_HARIMU_DESKTOP_GATE', 'NEXT_PUBLIC_HARIMU_ZOOM_PATH'];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
const restore = () => { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } noteDistrictSlots(null, null); };
const on = () => { for (const name of names) process.env[name] = 'true'; };
const historyWindow = search => { const entries = [{ href: `https://harimu.com/${search}`, state: null }]; return { entries, location: { pathname: '/', get href() { return entries.at(-1).href; } }, history: { get state() { return entries.at(-1).state; }, pushState(state, _t, href) { entries.push({ href: String(href), state }); } } }; };
const viewOf = href => new URL(href).searchParams.get('view');

test('rail, dock title, square row, crumbs, presence and #924 stay on the existing flags', async () => {
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 76);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(75), PLACE_NAV_FLAG);
  assert.equal(levelDockTitle('neighborhood'), 'Neighborhood');
  assert.equal(levelDockTitle('household'), null);
  assert.equal(levelDockTitle('square'), null);
  const page = await read('app/page.tsx'), panels = await read('app/scene-panels-v2.tsx'), shell = await read('app/game-shell.tsx');
  const rail = await read('app/game-shell.css'), zoom = await read('app/zoom-path.css'), countryCss = await read('app/country-scene.module.css');
  assert.match(page, /viewMode === 'household' \? 'Belongings'/);
  assert.match(page, /levelDockTitle\(viewMode\) \?\? 'Household'/);
  assert.match(page, /id="city-noticeboard"/);
  assert.match(panels, /visitor && place\.view === 'square'/);
  assert.match(panels, /openCitySquare\(\)/);
  assert.match(panels, /getElementById\('city-noticeboard'\)/);
  assert.doesNotMatch(panels, /aria-disabled/);
  assert.match(rail, /\.game-zoom-rail button\{[^}]*min-width:44px/);
  assert.match(rail, /\.game-zoom-rail button\{[^}]*min-height:56px/);
  assert.match(rail, /\.game-place-nav\.game-rail-on\{--rail-width:calc\(112px \* var\(--text-scale, 1\)\)\}/);
  assert.match(rail, /\.game-place-nav \.game-zoom-rail button span\{[^}]*font-size:calc\(10px \* var\(--text-scale, 1\)\)/);
  assert.match(zoom, /\.game-zoom-on:is\(\.game-zoom-world,\.game-zoom-square,\.game-zoom-neighborhood\) \.game-stage\{top:calc\(var\(--hud-height\) \+ var\(--zoom-crumb\)\)\}/);
  assert.match(zoom, /\.game-zoom-on\.game-city-drive \.city-drive-layer,\.game-zoom-on\.game-neighborhood-walk \.neighborhood-walk-layer\{top:calc\(var\(--hud-height\) \+ var\(--zoom-crumb\)\)\}/);
  assert.match(await read('app/city-drive.css'), /\.city-drive-map\{[^}]*bottom:/);
  assert.doesNotMatch(await read('app/city-drive.css'), /\.city-drive-map\{[^}]*\btop:/);
  assert.match(countryCss, /--pin-edge:calc\(56px \* var\(--text-scale, 1\)\)/);
  assert.match(countryCss, /\.game-place-nav\) \.bleed \.pin\{max-width:min\(var\(--pin-max\), 34%\)\}/);
  const added = [
    rail.match(/\.game-place-nav\.game-rail-on\{[^}]*\}/)[0],
    rail.match(/\.game-place-nav \.game-zoom-rail button span\{[^}]*\}/)[0],
    zoom.slice(zoom.indexOf('#1445 slice 4c')),
    countryCss.slice(countryCss.indexOf('#1445 slice 4c')),
  ].join('\n');
  assert.doesNotMatch(added, /overflow-wrap:\s*anywhere|word-break:\s*break-all/);
  const heard = [];
  const win = { dispatchEvent(event) { heard.push(event.type); } };
  const prior = globalThis.window; globalThis.window = win;
  try { openCitySquare(); } finally { globalThis.window = prior; }
  assert.deepEqual(heard, [citySquareEvent]);
});

test('World and Neighborhood crumbs render, and the visitor presence line is once', async () => {
  try {
    on();
    noteDistrictSlots('forgehaven', 4);
    const world = zoomPathCrumbs({ view: 'world', nationLabel: 'Kindle Republic', cityLabel: 'Forgehaven', nationId: 'kindle', visitor: true, neighborhood: true });
    assert.deepEqual(world.map(crumb => [crumb.label, crumb.view, crumb.current]), [['World', 'world', true]]);
    assert.match(world[0].href, /(?:^|[?&])view=world(?:&|$)/);
    const targets = placeCrumbTargets('?view=neighborhood&nation=kindle&district=0', 'kindle', 'Forgehaven', false);
    assert.equal(targets.cityId, 'forgehaven');
    assert.equal(targets.district, '0');
    const crumbs = zoomPathCrumbs({ view: 'neighborhood', nationLabel: 'Kindle Republic', cityLabel: 'Forgehaven', nationId: 'kindle', visitor: true, neighborhood: true, cityId: targets.cityId, district: targets.district });
    assert.deepEqual(crumbs.map(crumb => crumb.label), ['World', 'Kindle Republic', 'Forgehaven', 'Neighborhood']);
    assert.equal(crumbs.at(-1).current, true);
    for (const view of ['square', 'neighborhood']) {
      const href = crumbs.find(crumb => crumb.view === view).href;
      assert.match(href, /(?:^|[?&])city=forgehaven(?:&|$)/);
      if (view === 'neighborhood') assert.match(href, /(?:^|[?&])district=0(?:&|$)/);
      else assert.doesNotMatch(href, /district=/);
    }
    assert.equal(zoomPathCrumbs({ view: 'neighborhood', nationLabel: 'Kindle Republic', cityLabel: 'Forgehaven' }), null);
  } finally { restore(); }
  const source = await read('app/country-scene.tsx');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  let selected = null; const exports = {};
  new Function('exports', 'require', compiled)(exports, name => name === 'react' ? { useState: () => [selected, value => { selected = value; }] } : name === '../lib/cities' ? require('../lib/cities.ts') : name === '../lib/ui-v2-rail' ? require('../lib/ui-v2-rail.ts') : name.endsWith('.css') ? { country: 'country' } : require(name));
  const props = { nationId: 'kindle', currentCityId: 'forgehaven', homeCityId: 'forgehaven', onTravel() {}, preview: true };
  const all = node => [node, ...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child => typeof child === 'object' ? all(child) : [child])];
  const tree = () => all(exports.CountryScene(props));
  const pins = () => tree().filter(node => node?.type === 'button' && /Forgehaven|Tarrek Foundry|Kolt Savanna/.test(node.props?.['aria-label'] ?? ''));
  assert.equal(tree().filter(node => node === 'Presence shows in your own nation').length, 1);
  for (const pin of pins()) {
    assert.equal(all(pin).includes('Presence shows in your own nation'), false);
    assert.match(pin.props['aria-label'], /Forgehaven|Tarrek Foundry|Kolt Savanna/);
    assert.match(pin.props.style.top, /var\(--pin-edge, 0px\)/);
  }
  props.preview = false;
  assert.equal(tree().filter(node => node === 'Presence shows in your own nation').length, 0);
  assert.ok(tree().includes('Online count unavailable'));
});

test('clicking World from City pushes World; browser Back from a zoom-in is the Nation step', () => {
  assert.deepEqual(placeNavTrail('square', 'world'), ['world']);
  assert.deepEqual(placeNavTrail('neighborhood', 'world'), ['world']);
  assert.deepEqual(placeNavTrail('world', 'square'), ['country', 'square'], 'zooming in still inserts Nation, so browser Back from City lands on Nation');
  try {
    on();
    const fromCity = historyWindow('?view=square&nation=kindle&city=forgehaven');
    pushPlaceNav(fromCity, 'square', 'world', 'kindle', 'forgehaven', false, true);
    assert.equal(viewOf(fromCity.entries.at(-1).href), 'world');
    assert.notEqual(viewOf(fromCity.entries.at(-1).href), 'country');
    const zoomed = historyWindow('?view=world&nation=kindle');
    pushPlaceNav(zoomed, 'world', 'square', 'kindle', 'forgehaven', false, true);
    assert.deepEqual(zoomed.entries.slice(1).map(entry => viewOf(entry.href)), ['country', 'square']);
    const crumb = zoomPathCrumbs({ view: 'square', nationLabel: 'Kindle Republic', cityLabel: 'Forgehaven', nationId: 'kindle', visitor: true });
    assert.equal(crumb[0].view, 'world');
    assert.match(crumb[0].href, /(?:^|[?&])view=world(?:&|$)/);
    assert.doesNotMatch(crumb[0].href, /view=country/);
  } finally { restore(); }
});
