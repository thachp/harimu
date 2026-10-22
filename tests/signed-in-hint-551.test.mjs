/** #551 (follow-up to #541/#533): the cookie hint read never throws, so a sandboxed iframe or a cookie-blocked browser still renders the page. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { identityHold, identityHoldTimeoutMs, readSignedInHint, signedInHint } from '../lib/scene-navigation.ts';

const nations = ['kindle', 'korund', 'aurelle'];
test('readSignedInHint returns the hint, and unknown when the cookie read throws (SecurityError)', () => {
  assert.equal(readSignedInHint(() => '__client_uat=1700000000; other=1'), 'signed-in');
  assert.equal(readSignedInHint(() => '__client_uat=0'), 'signed-out');
  assert.equal(readSignedInHint(() => ''), 'signed-out');
  assert.equal(readSignedInHint(() => undefined), 'unknown');
  const blocked = () => { throw new DOMException('The document is sandboxed and lacks the allow-same-origin flag.', 'SecurityError'); };
  assert.equal(readSignedInHint(blocked), 'unknown');
  const doc = {}; Object.defineProperty(doc, 'cookie', { get: blocked });
  assert.doesNotThrow(() => readSignedInHint(() => doc.cookie)); assert.equal(readSignedInHint(() => doc.cookie), 'unknown');
  assert.equal(signedInHint('__client_uat=1700000000'), 'signed-in', 'the plain parser is unchanged');
});
test('with an unknown hint the hold still ends: by the Clerk status, a valid ?nation=, or the timeout', () => {
  assert.equal(identityHold('', nations, true, false, 'unknown'), 'neutral');
  assert.equal(identityHold('?nation=korund', nations, true, false, 'unknown'), 'none');
  assert.equal(identityHold('', nations, false, false, 'unknown'), 'none', 'Clerk finished');
  assert.equal(identityHold('', nations, true, false, 'unknown', true), 'none', 'timed out');
  assert.equal(identityHold('', nations, true, true, 'unknown'), 'none', 'citizen known');
  assert.ok(identityHoldTimeoutMs > 0);
});
test('app/page.tsx reads the cookie only through the guarded helper', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /readSignedInHint\(\(\) => document\.cookie\)/);
  assert.equal([...page.matchAll(/document\.cookie/g)].length, 1, 'the only cookie access is the one inside the guarded read');
  assert.doesNotMatch(page, /\bsignedInHint\(document\.cookie\)/);
});
