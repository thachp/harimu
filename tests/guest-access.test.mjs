import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canReadSharedWorld } from '../lib/guest-access.ts';
test('anonymous/loading/error and local examples cannot advance shared-world state', () => {
  for (const session of ['anonymous','loading','error','ready']) {
    assert.equal(canReadSharedWorld(false,session),false);
  }
  for (const session of ['anonymous','loading','error']) assert.equal(canReadSharedWorld(true,session),false);
  assert.equal(canReadSharedWorld(true,'ready'),true);
});
