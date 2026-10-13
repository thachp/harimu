import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readVerification } from '../lib/verification.ts';

test('trusted verification fails closed for absent, malformed, stale, revoked and foreign evidence', async () => {
  const now = 100000;
  const valid = { userId: 'alice', emailVerified: true, phoneVerified: true, phoneUnique: true,
    revoked: false, checkedAt: now, expiresAt: now + 60000 };
  assert.equal((await readVerification('alice', undefined, now)).status, 'unavailable');
  for (const evidence of [null, {}, { ...valid, userId: 'bob' }, { ...valid, revoked: true },
    { ...valid, emailVerified: false }, { ...valid, phoneVerified: false }, { ...valid, phoneUnique: false },
    { ...valid, checkedAt: now - 60001 }, { ...valid, checkedAt: now + 1 },
    { ...valid, expiresAt: now }, { ...valid, checkedAt: NaN }, { ...valid, expiresAt: Infinity },
    { ...valid, phoneVerified: 'true' }, { ...valid, revoked: undefined }]) {
    const result = await readVerification('alice', { async read() { return evidence; } }, now);
    assert.equal(result.tier, 0); assert.equal(result.countedActionsEligible, false);
  }
  assert.equal((await readVerification('alice', { async read() { throw new Error('provider down'); } }, now)).status, 'unavailable');
  assert.equal((await readVerification('alice', { async read(id) { assert.equal(id, 'alice'); return valid; } }, now)).tier, 1);
});
