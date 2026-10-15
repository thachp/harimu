/** #527: a Kindle citizen who inspected another nation on World gets their own nation back on City/Household/Work/Market and Civic, and the URLs keep nation and city. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { nationForNavigation, sceneUrl, sceneFromSearch, nationFromSearch, isForeignCivic } from '../lib/scene-navigation.ts';
const ids = ['kindle', 'korund', 'aurelle'];
const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');

/** Mirrors changeView (page.tsx): selected nation = URL nation if valid, else the state; city for the citizen's own nation from the account. */
function walk(start, steps, citizen, city) {
  let href = start, selectedId = 'kindle', out = [];
  for (const nextView of steps) {
    const search = new URL(href).search, viewMode = sceneFromSearch(search), selected = nationFromSearch(search, ids, selectedId);
    const nextNation = nationForNavigation(nextView, viewMode, selected, citizen);
    selectedId = nextNation;
    const cityId = citizen === nextNation ? city : undefined;
    href = sceneUrl(href, nextView, nextNation, cityId, nextNation !== citizen);
    out.push([nextView, new URL(href).search, isForeignCivic(nextView, new URL(href).searchParams.get('nation'), nextNation, citizen)]);
  }
  return out;
}

test('the repro: inspect Korund on World, then City, Household, Work, Civic: own nation, nation and city kept, Civic is not foreign', () => {
  // inspecting: the Korund card sets the viewed nation on the World scene
  const inspected = 'https://harimu.com/?view=world&nation=korund';
  const steps = walk(inspected, ['square', 'household', 'workplace', 'government'], 'kindle', 'forgehaven');
  assert.deepEqual(steps.map(s => s[1]), [
    '?view=square&nation=kindle&city=forgehaven', '?view=household&nation=kindle&city=forgehaven',
    '?view=workplace&nation=kindle&city=forgehaven', '?view=government&nation=kindle&city=forgehaven']);
  assert.equal(steps[3][2], false, 'Civic shows the citizen\'s own government, editable');
  const market = walk(inspected, ['market'], 'kindle', 'forgehaven')[0]; assert.equal(market[1], '?view=market&nation=kindle&city=forgehaven');
});

test('helper table: inspection stays on the inspecting scenes and ends on personal scenes; Civic straight from an inspection stays read-only (#91)', () => {
  const f = nationForNavigation;
  for (const view of ['world', 'country', 'nation']) assert.equal(f(view, 'world', 'korund', 'kindle'), 'korund', `${view} keeps the inspected nation`);
  for (const from of ['world', 'country', 'nation', 'square', 'workplace', 'government']) for (const to of ['square', 'household', 'workplace', 'market']) assert.equal(f(to, from, 'korund', 'kindle'), 'kindle', `${from} -> ${to}`);
  for (const from of ['world', 'country', 'nation']) assert.equal(f('government', from, 'korund', 'kindle'), 'korund', `Civic from ${from} keeps the visited nation`);
  for (const from of ['square', 'household', 'workplace', 'market', 'government']) { assert.equal(f('government', from, 'korund', 'kindle'), 'kindle', `Civic from ${from}`); assert.equal(f('country', from, 'korund', 'kindle'), 'kindle', `Country from ${from}`); }
  assert.equal(f('country', 'world', 'korund', 'kindle'), 'korund', 'Country from World keeps the inspected nation (unchanged)');
});

test('guests and signed-out visitors keep their previewed nation everywhere (no citizen)', () => {
  for (const to of ['square', 'household', 'workplace', 'market', 'government', 'country', 'world', 'nation']) for (const from of ['world', 'square']) assert.equal(nationForNavigation(to, from, 'korund', null), 'korund');
  assert.equal(nationForNavigation('market', 'world', 'korund', undefined), 'korund');
});

test('changeView uses the helper', () => {
  assert.match(page, /const nextNation = nationForNavigation\(nextView, viewMode, selected\.id, citizenNation\?\.id\);/);
});
