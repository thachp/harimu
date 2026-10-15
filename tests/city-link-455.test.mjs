/** #455: a citizen's scene links carry nation and city before the city account has loaded, and the top bar waits for the citizen row. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { capitalCityForNation } from '../lib/cities.ts';
const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
test('the capital is the fallback city for every live nation, and changeView uses it', () => {
  assert.deepEqual(['kindle', 'korund', 'aurelle'].map(id => capitalCityForNation(id)?.id), ['forgehaven', 'stonehearth', 'highspire']);
  assert.match(page, /currentCityAccount\?\.currentCityId \?\? capitalCityForNation\(nextNation\)\?\.id/);
});
test('page passes the loading hold to the shell from the session status and the URL', () => {
  assert.match(page, /identityLoading=\{identityPending\(locationSearch, fallbackNationIds, clerkConfigured && citizenSessionStatus === 'loading', Boolean\(citizenNation\)\)\}/);
});
