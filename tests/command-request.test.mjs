import assert from 'node:assert/strict';
import { isSameOriginCommand, readCommandObject } from '../lib/command-request.ts';

const request = (body, headers = {}) => new Request('https://harimu.com/api/citizen', {
  method: 'POST', headers: { Origin: 'https://harimu.com', ...headers }, body,
});
assert.equal(isSameOriginCommand(request('{}')), true);
assert.equal(isSameOriginCommand(request('{}', { Origin: 'https://other.example' })), false);
assert.equal(isSameOriginCommand(new Request('https://harimu.com/api/citizen', { method: 'POST', body: '{}' })), false);
assert.deepEqual(await readCommandObject(request('{"action":"petition"}')), { action: 'petition' });
for (const body of ['null', '[]', 'true', 'bad json']) await assert.rejects(readCommandObject(request(body)));
await assert.rejects(readCommandObject(request('{}', { 'Content-Length': '20000' })), /large/);
// Actual UTF-8 bytes exceed the bound even without a declared length.
await assert.rejects(readCommandObject(request(JSON.stringify({ note: '🌍'.repeat(5000) }))), /large/);
assert.deepEqual(await readCommandObject(request(JSON.stringify({ note: '🌍'.repeat(2000) }))), { note: '🌍'.repeat(2000) });
console.log('Command requests: same-origin guard, object parsing, declared and actual UTF-8 byte limits passed.');
