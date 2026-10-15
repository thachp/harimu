import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { guestDemoAllowed, isVisitorSession } from '../lib/scene-navigation.ts';

test('#379: the first-visit guide and "Try a day in the life" are for every visitor: a signed-out guest AND a signed-in account with no citizen yet', () => {
  assert.equal(guestDemoAllowed(false, true, 'anonymous'), true, 'signed-out guest');
  assert.equal(guestDemoAllowed(false, true, 'ready'), true, 'signed-in, no citizen yet (stubbed session)');
  assert.equal(guestDemoAllowed(false, false, 'anonymous'), true, 'browser-local demo');
  assert.equal(guestDemoAllowed(true, false, 'anonymous'), true, 'local demo keeps it even with a local citizen');
});

test('#379: never for a citizen, and never while the session is still loading or errored', () => {
  assert.equal(guestDemoAllowed(true, true, 'ready'), false, 'a citizen');
  assert.equal(guestDemoAllowed(true, true, 'anonymous'), false);
  assert.equal(guestDemoAllowed(false, true, 'loading'), false, 'the citizen may exist but is not known yet (#411)');
  assert.equal(guestDemoAllowed(false, true, 'error'), false);
});

test('#379: it agrees with isVisitorSession wherever Clerk is configured, so wording and the guide can never disagree', () => {
  for (const citizen of [true, false]) for (const status of ['loading', 'anonymous', 'ready', 'error'])
    assert.equal(guestDemoAllowed(citizen, true, status), isVisitorSession(citizen, true, status), `${citizen} ${status}`);
});

test('#379: app/page.tsx gates the guide, the sample day and the guest market on guestDemoAllowed, not on an anonymous-only check', () => {
  const page = readFileSync('app/page.tsx', 'utf8');
  assert.match(page, /const guestAllowed = guestDemoAllowed\(Boolean\(citizenNation\), clerkConfigured, citizenSessionStatus\)/);
  assert.doesNotMatch(page, /const guestAllowed = !clerkConfigured \|\| citizenSessionStatus === 'anonymous'/);
  assert.match(page, /guestDemoAllowed\(Boolean\(citizenNation\), clerkConfigured, citizenSessionStatus\) && guestMode/);
  assert.equal((page.match(/\{guestAllowed && /g) ?? []).length >= 2, true, 'guide card and "Start first-visit guide" still behind guestAllowed');
});
