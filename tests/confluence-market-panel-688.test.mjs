/** #688 follow-up (QA2): a Confluence citizen's market panel shows neither the Kindle citizen listings form nor the "Trading unavailable" listings row. Other nations unchanged. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const page = readFileSync('app/page.tsx', 'utf8');

test('the Kindle listings form (PlayerMarket) is gated off for Confluence citizens', () => {
  const at = page.indexOf('<PlayerMarket state={playerMarket}');
  assert.ok(at > 0);
  const guard = page.lastIndexOf('{', page.lastIndexOf("(!orderBookApi.book || playerMarket?.listings", at));
  assert.match(page.slice(guard, at), /^\{citizenNation\.id !== 'confluence' && /, 'the form renders only when the citizen is not in Confluence');
  assert.equal(page.match(/<PlayerMarket /g).length, 1, 'no other render path for the form');
});

test('the "Citizen listings · Trading unavailable" summary row is dropped for Confluence citizens only', () => {
  const row = page.indexOf("{ id: 'listings', label: 'Citizen listings'");
  assert.ok(row > 0);
  assert.match(page.slice(row - 60, row), /\.\.\.\(citizenNation\?\.id === 'confluence' \? \[\] : \[$/, 'spread away for Confluence');
  assert.equal(page.match(/Trading unavailable/g).length, 1, 'the wording appears only in that gated row');
});
