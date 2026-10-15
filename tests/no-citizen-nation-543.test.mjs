/** #543: a signed-in user with no citizen row yet keeps nation= on Work/Market like a guest. Item 2 (guest URL, then sign in as a citizen of another nation) is pinned as intended behaviour. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isVisitorSession, sceneUrl, nationFromSearch, viewedNationAfterLoad, isForeignCivic } from '../lib/scene-navigation.ts';
const ids = ['kindle', 'korund', 'aurelle'];

test('isVisitorSession table: no citizen + anonymous/local/ready is a visitor; loading, error and any citizen are not', () => {
  for (const clerk of [true, false]) for (const status of ['loading', 'anonymous', 'ready', 'error']) for (const citizen of [true, false]) {
    const expected = !citizen && (!clerk || status === 'anonymous' || status === 'ready');
    assert.equal(isVisitorSession(citizen, clerk, status), expected, `citizen=${citizen} clerk=${clerk} status=${status}`);
  }
  assert.equal(isVisitorSession(false, true, 'ready'), true, 'the #543 case: signed in, no citizen row yet');
  assert.equal(isVisitorSession(false, true, 'loading'), false, 'not while the citizen may still arrive (#411)');
  assert.equal(isVisitorSession(false, true, 'error'), false);
  assert.equal(isVisitorSession(true, true, 'ready'), false, 'a citizen is never a visitor');
});

test('a ready user with no citizen previews Korund: Work then Market keep nation=korund, and a reload reads it back', () => {
  const visitor = isVisitorSession(false, true, 'ready');
  const work = sceneUrl('https://harimu.com/?view=world&nation=korund', 'workplace', 'korund', undefined, true, visitor);
  const market = sceneUrl(work, 'market', 'korund', undefined, true, visitor);
  assert.equal(new URL(work).search, '?view=workplace&nation=korund'); assert.equal(new URL(market).search, '?view=market&nation=korund');
  assert.equal(nationFromSearch(new URL(market).search, ids, 'kindle'), 'korund');
  const loading = sceneUrl('https://harimu.com/?view=world&nation=korund', 'workplace', 'korund', undefined, true, isVisitorSession(false, true, 'loading'));
  assert.equal(new URL(loading).search, '?view=workplace', 'unchanged while loading');
});

test('#543 item 2 [ASSUMPTION: intended]: a guest-browsed nation=kindle URL, then sign-in as a Korund citizen, stays a Kindle visitor view where the URL names it; personal scenes still show the citizen\'s own nation', () => {
  // viewedNationAfterLoad: a valid ?nation= keeps the visited nation (#411); no nation means the citizen's own.
  for (const view of ['world', 'nation', 'country', 'government', 'square', 'workplace', 'market', 'household']) {
    assert.equal(viewedNationAfterLoad(`?view=${view}&nation=kindle`, ids, 'korund', 'kindle'), 'kindle', `${view}: a shared nation link stays a visitor view`);
    assert.equal(viewedNationAfterLoad(`?view=${view}`, ids, 'korund', 'kindle'), 'korund', `${view}: no nation in the URL lands on the citizen's own nation`);
  }
  assert.equal(viewedNationAfterLoad('?nation=atlantis', ids, 'korund', 'kindle'), 'korund', 'an unknown nation does not count');
  assert.equal(viewedNationAfterLoad('?view=market&nation=kindle', ids, null, 'kindle'), 'kindle', 'no citizen: nothing changes');
  // Only Civic, World, Country and Nation use the viewed nation; Civic is the foreign read-only panel (#91), so nothing is editable.
  assert.equal(isForeignCivic('government', 'kindle', 'kindle', 'korund'), true);
  assert.equal(isForeignCivic('market', 'kindle', 'kindle', 'korund'), false, 'Work/Market/City/Household render the citizen\'s own nation, whatever the URL says');
});
