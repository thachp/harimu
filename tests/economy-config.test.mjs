import assert from 'node:assert/strict';
import { recoveryInterval } from '../lib/economy-rules.ts';

assert.equal(recoveryInterval('7200'), 7200);
assert.equal(recoveryInterval(undefined), 86400);
for (const input of ['no', '-1', '0', '59', '2.5', '604801', Infinity]) {
  assert.equal(recoveryInterval(input), 86400);
}
console.log('Economy recovery configuration checks passed.');
