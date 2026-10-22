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
test('page passes the hold to the shell from the session status, the cookie hint, the URL and the timeout (#533)', () => {
  assert.match(page, /const identityHoldNow = identityHold\(locationSearch, fallbackNationIds, sessionLoading, Boolean\(citizenNation\), signedHint, holdExpired\);/);
  assert.match(page, /identityHold=\{identityHoldNow\} viewedNationHeld=\{viewedNationHeld\(identityHoldNow, locationSearch, fallbackNationIds\)\}/);
  assert.match(page, /const sessionLoading = clerkConfigured && citizenSessionStatus === 'loading';/);
  assert.match(page, /const signedHint = useSyncExternalStore\(subscribeNever, readCookieHint, serverSignedInHint\);/, 'hydration-safe: the server snapshot is unknown');
  assert.match(page, /const serverSignedInHint = \(\): SignedInHint => 'unknown';/);
  assert.match(page, /const holdExpired = holdExpiredFor === holdEpisode;/);
  assert.match(page, /window\.setTimeout\(\(\) => setHoldExpiredFor\(holdEpisode\), identityHoldTimeoutMs\)/, 'state is set only inside the timer callback');
  assert.doesNotMatch(page, /setHoldExpired\(false\)|setSignedHint\(/, 'no synchronous setState in an effect body');
  assert.match(page, /sessionLoading && signedHint === 'signed-in' && !holdExpired \? 'Loading your citizen…' : 'Explore a nation/, 'the scene panel line follows the same hold');
  assert.doesNotMatch(page, /identityPending/);
});
