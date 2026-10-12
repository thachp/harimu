import assert from 'node:assert/strict';
import { validMarketCommand } from '../lib/market.ts';
const command = { requestId: 'd0311bcb-0e2f-4d63-833b-166ec5eaeb99', action: 'market-trade', side: 'buy', item: 'food', quantity: 1 };
assert.equal(validMarketCommand(command), true);
assert.equal(validMarketCommand({ requestId: command.requestId, action: 'household-meal' }), true);
for (const quantity of [0, -1, 11, 1.5, '1', null, Number.MAX_SAFE_INTEGER]) {
  assert.equal(validMarketCommand({ ...command, quantity }), false);
}
for (const patch of [{ side: 'steal' }, { item: 'weapon' }, { requestId: 'bad' }, { action: 'mint' }]) {
  assert.equal(validMarketCommand({ ...command, ...patch }), false);
}
console.log('Market intent validation checks passed.');
