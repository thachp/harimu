import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deadlineMilliseconds, formatDuration, gameTimerSnapshot } from '../lib/game-time.ts';
test('real countdown converts at exactly twelve times speed across hour and day boundaries',()=>{
 const now=Date.parse('2026-10-13T15:00:00Z');
 assert.deepEqual(gameTimerSnapshot(now+7200000,now),{status:'running',deadline:now+7200000,remainingMs:7200000,real:'2h',game:'1d'});
 assert.equal(gameTimerSnapshot(now+86400000,now).game,'12d');
 assert.equal(gameTimerSnapshot(now+60000,now).game,'12m');
 assert.equal(formatDuration(3661000),'1h 1m 1s');assert.equal(formatDuration(1),'1s');
});
test('loading invalid expiry and overdue values do not invent a deadline or negative countdown',()=>{
 assert.equal(gameTimerSnapshot('bad',null).status,'invalid');assert.equal(deadlineMilliseconds(Infinity),null);
 assert.equal(gameTimerSnapshot(1000,null).status,'loading');assert.equal(gameTimerSnapshot(1000,NaN).status,'loading');
 assert.equal(gameTimerSnapshot(1000,1000).status,'expired');assert.equal(gameTimerSnapshot(1000,1001).remainingMs,0);
 assert.equal(formatDuration(-1),'Unavailable');assert.equal(deadlineMilliseconds('2026-10-13T15:00:00Z'),1791903600000);
});
