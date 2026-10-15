/** #411: an existing citizen's own nation is the viewed nation on load, and Civic opens that nation's government (editable), for every MVP nation. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { isForeignCivic, nationFromSearch, sceneFromSearch, sceneUrl, viewedNationAfterLoad } from '../lib/scene-navigation.ts';

const ids = ['kindle', 'korund', 'aurelle', 'ilmar', 'hoarvale'];
const HOME = 'https://preview.harimu.com/';

/** What the page does for a signed-in citizen: the initial selectedId comes from the URL or 'kindle', the profile load seeds it, then Civic is tapped. */
function reloadThenCivic(citizenNation, search) {
  const initial = nationFromSearch(search, ids, 'kindle');
  const selectedId = viewedNationAfterLoad(search, ids, citizenNation, initial);
  const viewed = nationFromSearch(search, ids, selectedId); // the page's `selected`
  const href = sceneUrl(`${HOME}${search}`, 'government', viewed, undefined, viewed !== citizenNation); // changeView('government')
  const nationParam = new URL(href).searchParams.get('nation');
  const resolved = nationFromSearch(new URL(href).search, ids, viewed);
  return { viewed, href, nationParam, resolved, foreign: isForeignCivic(sceneFromSearch(new URL(href).search), nationParam, resolved, citizenNation) };
}

for (const nation of ['kindle', 'korund', 'aurelle']) {
  test(`${nation} citizen reloading with no nation parameter views their own nation and Civic opens their own government, editable`, () => {
    const out = reloadThenCivic(nation, '');
    assert.equal(out.viewed, nation); assert.equal(out.resolved, nation);
    assert.equal(out.nationParam, null, 'no foreign nation parameter is built for the citizen\'s own Civic');
    assert.match(out.href, /view=government/); assert.equal(out.foreign, false, 'not the read-only visitor view');
    // Other scene URLs of a ?view= only reload (no nation) behave the same.
    assert.equal(reloadThenCivic(nation, '?view=government').viewed, nation);
    assert.equal(reloadThenCivic(nation, '?view=square').foreign, false);
  });
}

test('the old behaviour is what the bug report describes: without seeding, a Korund or Aurelle citizen gets Kindle read-only', () => {
  for (const nation of ['korund', 'aurelle']) {
    const viewed = nationFromSearch('', ids, 'kindle');
    const href = sceneUrl(`${HOME}`, 'government', viewed, undefined, viewed !== nation);
    assert.equal(new URL(href).searchParams.get('nation'), 'kindle');
    assert.equal(isForeignCivic('government', 'kindle', 'kindle', nation), true);
  }
});

test('a ?nation= parameter for another nation still gives the visitor view, for every MVP nation', () => {
  for (const [citizen, visited] of [['korund', 'kindle'], ['aurelle', 'korund'], ['kindle', 'aurelle'], ['kindle', 'korund']]) {
    const out = reloadThenCivic(citizen, `?view=government&nation=${visited}`);
    assert.equal(out.viewed, visited, `${citizen} citizen visiting ${visited}`); assert.equal(out.nationParam, visited); assert.equal(out.foreign, true, 'read-only visitor view');
  }
  assert.equal(viewedNationAfterLoad('?nation=korund', ids, 'aurelle', 'korund'), 'korund', 'a valid parameter keeps the current selection');
});

test('seeding rules: an invalid nation parameter falls back to the citizen; an unknown citizen nation changes nothing', () => {
  assert.equal(viewedNationAfterLoad('?nation=atlantis', ids, 'korund', 'kindle'), 'korund');
  assert.equal(viewedNationAfterLoad('', ids, 'atlantis', 'kindle'), 'kindle');
  assert.equal(viewedNationAfterLoad('', ids, null, 'kindle'), 'kindle'); assert.equal(viewedNationAfterLoad('', ids, undefined, 'korund'), 'korund');
});

test('the page seeds the viewed nation from the loaded profile once per citizen nation and resets it when the identity changes', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /viewedNationAfterLoad\(window\.location\.search, fallbackNations\.map\(nation => nation\.id\), snapshot\.profile!?\.nationId, current\)/);
  assert.match(page, /seededNationId\.current !== snapshot\.profile\.nationId/);
  assert.match(page, /setCitizenNationId\(null\); seededNationId\.current = null;/, 'a new identity seeds again');
});
