import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createGuestDemo, guestDemoAction } from '../lib/guest-demo.ts';

test('guest examples have isolated reversible state and never grant real progress', () => {
  const initial = createGuestDemo();
  const worked = guestDemoAction(initial, 'work');
  assert.equal(worked.capacity, 18);
  assert.equal(worked.coins, 8);
  assert.equal(initial.coins, 0);
  assert.deepEqual(guestDemoAction(worked, 'work'), worked);
  const bought = guestDemoAction(worked, 'buy-food');
  assert.equal(bought.coins, 4);
  assert.equal(bought.food, 2);
  const fed = guestDemoAction(bought, 'meal');
  assert.equal(fed.capacity, 22);
  assert.equal(fed.food, 0);
  assert.deepEqual(guestDemoAction(fed, 'reset'), initial);
  assert.deepEqual(createGuestDemo(), initial);
});

test('guest examples reject unfunded trades and unavailable meals', () => {
  const initial = createGuestDemo();
  assert.deepEqual(guestDemoAction(initial, 'buy-food'), initial);
  assert.deepEqual(guestDemoAction(initial, 'meal'), initial);
});

test('guest implementation uses no network, persistent storage, or citizen state', () => {
  for (const file of ['lib/guest-demo.ts', 'app/guest-demo.tsx']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b|\/api\/|citizen-session|drizzle|cloudflare/);
  }
});
