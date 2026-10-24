/** #936: one Kindle presidential election row per voting window. Cycle k's vote (day 30 + k*120, 72 h) has its own row, ballots, receipts and result;
 *  a ballot never carries over; a closed result stays readable until the next window; held calendar: no row. Account-level preview path. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { presidentialCycle } from '../lib/election-calendars.ts';

const DAY = 86400, H = 3600, start = 1_792_368_000, at = (d, h = 0) => start + d * DAY + h * H, base = 'kindle-presidential-poc-1';

test('#936 pure: cycle numbering and per-window ids', async t => {
  const rt = await localRuntime(); t.after(() => rt.close());
  const { electionIdFor } = await rt.importModule('lib/elections.ts'), { accountIdFor } = await rt.importModule('lib/preview-election.ts');
  const c = now => presidentialCycle({ HARIMU_KINDLE_CYCLE_START_AT: String(start) }, now);
  assert.equal(c(at(29)), null); assert.equal(c(at(30)), 0); assert.equal(c(at(149, 23)), 0, 'cycle 0 result stays current until the next open');
  assert.equal(c(at(150)), 1); assert.equal(c(at(270)), 2); assert.equal(presidentialCycle({}, at(150)), null); assert.equal(presidentialCycle({ HARIMU_KINDLE_CYCLE_START_AT: 'x' }, at(150)), null);
  assert.equal(c(1.5), null);
  assert.equal(electionIdFor(null), base); assert.equal(electionIdFor(0), base); assert.equal(electionIdFor(1), `${base}-cycle-1`); assert.equal(electionIdFor(7), `${base}-cycle-7`);
  assert.equal(accountIdFor(base), 'kindle-presidential-account-poc-1'); assert.equal(accountIdFor(`${base}-cycle-2`), 'kindle-presidential-account-poc-1-cycle-2');
  assert.equal(accountIdFor('alice'), 'alice'); assert.equal(accountIdFor(`x${base}`), `x${base}`);
});

for (const backend of ['sqlite', 'postgres']) {
  async function setup(t) {
    const r = await localRuntime({ backend, accountElection: true }); t.after(() => r.close());
    const now0 = Math.floor(r.now / 1000), s = now0 - 30 * DAY - H; // 1 hour into the cycle-0 window
    r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', String(s));
    const iso = new Date(r.now).toISOString();
    for (const u of ['carl', 'dana']) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(u, u, iso, iso).run();
    const go = (d, h = 0) => r.setNow((s + d * DAY + h * H) * 1000);
    const view = async user => (await r.call('election', user)).data;
    const vote = async (user, ranking, id) => r.call('election', user, { action: 'vote', electionId: id ?? (await view(user)).id, requestId: randomUUID(), ranking });
    const rows = async () => (await r.db.prepare('SELECT id, opens_at, closes_at, closed_at IS NOT NULL AS closed FROM poc_elections ORDER BY opens_at').all()).results.map(x => ({ id: x.id, opensAt: Number(x.opens_at), closesAt: Number(x.closes_at), closed: Boolean(Number(x.closed)) }));
    const ballots = async id => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM poc_anonymous_ballots WHERE election_id=?').bind(id).first()).n);
    const tick = async () => { await r.call('world', null); await r.call('world', null); };
    return { r, s, go, view, vote, rows, ballots, tick };
  }
  const I = ['ines-varro', 'tobin-achterberg', 'mara-quell'], T = ['tobin-achterberg', 'mara-quell', 'ines-varro'];
  const acct = 'kindle-presidential-account-poc-1';

  test(`#936 ${backend}: two windows make two independent elections, each with its own ballots and result`, async t => {
    const c = await setup(t);
    const v0 = await c.view('alice'); assert.equal(v0.id, acct); assert.equal(v0.status, 'open');
    for (const u of ['alice', 'bob']) assert.equal((await c.vote(u, I)).status, 200, u);
    assert.equal((await c.vote('carl', T)).status, 200);
    assert.equal((await c.vote('alice', T)).status, 409, 'once per window');
    c.go(34); await c.tick();
    const closed0 = await c.view('alice'); assert.equal(closed0.status, 'closed'); assert.equal(closed0.result.winner, 'ines-varro'); assert.equal(closed0.result.humanBallots, 3);
    c.go(100); const mid = await c.view('alice'); assert.equal(mid.id, acct, 'between windows the last result stays readable'); assert.equal(mid.status, 'closed');
    c.go(150, 2);
    const v1 = await c.view('alice'); assert.equal(v1.id, `${acct}-cycle-1`); assert.equal(v1.status, 'open'); assert.equal(v1.voted, false, 'a fresh vote: nothing carried over');
    assert.equal((await c.vote('alice', T)).status, 200, 'alice votes again in the new window');
    for (const u of ['carl', 'dana']) assert.equal((await c.vote(u, T)).status, 200, u);
    assert.equal((await c.vote('bob', I, acct)).status, 400, "the closed window's id is refused");
    assert.deepEqual((await c.rows()).map(x => [x.id, x.opensAt - c.s, x.closesAt - x.opensAt]), [[acct, 30 * DAY, 72 * H], [`${acct}-cycle-1`, 150 * DAY, 72 * H]]);
    assert.equal(await c.ballots(acct), 3); assert.equal(await c.ballots(`${acct}-cycle-1`), 3);
    c.go(154); await c.tick();
    const closed1 = await c.view('bob'); assert.equal(closed1.status, 'closed'); assert.equal(closed1.result.winner, 'tobin-achterberg'); assert.equal(closed1.result.humanBallots, 3);
    assert.deepEqual((await c.rows()).map(x => x.closed), [true, true], 'the world tick closed both');
    const stored = (await c.r.db.prepare('SELECT id, result_json FROM poc_elections ORDER BY id').all()).results;
    assert.equal(JSON.parse(stored[0].result_json).winner, 'ines-varro', 'the first result is unchanged'); assert.equal(JSON.parse(stored[1].result_json).winner, 'tobin-achterberg');
  });

  test(`#936 ${backend}: a held calendar makes no row in any window, and a ballot receipt cannot be replayed into the next window`, async t => {
    const c = await setup(t);
    const rid = randomUUID();
    assert.equal((await c.r.call('election', 'alice', { action: 'vote', electionId: acct, requestId: rid, ranking: I })).status, 200);
    c.go(150, 1);
    const replay = await c.r.call('election', 'alice', { action: 'vote', electionId: `${acct}-cycle-1`, requestId: rid, ranking: I });
    assert.equal(replay.status, 409, 'an old receipt is not a new ballot'); assert.equal(await c.ballots(`${acct}-cycle-1`), 0);
    c.r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', undefined);
    const held = await c.view('alice'); assert.equal(held.id, acct); assert.notEqual(held.status, 'open');
    assert.notEqual((await c.vote('bob', I)).status, 200);
    assert.deepEqual((await c.rows()).map(x => x.id), [acct], 'no new row while held');
  });
}

for (const backend of ['sqlite', 'postgres']) test(`#936 ${backend}: civic path — a window-0 voter shows as not voted in window 1`, async t => {
  const r = await localRuntime({ backend, ballotPrivacyReady: true }); t.after(() => r.close());
  const s = Math.floor(r.now / 1000) - 30 * DAY - H; r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', String(s));
  const ok = () => ['alice', 'bob'].forEach(u => r.setVerification(u, { userId: u, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 })); ok();
  const view = async () => (await r.call('election', 'alice')).data;
  const v0 = await view(); assert.equal(v0.id, base); assert.equal(v0.status, 'open');
  assert.equal((await r.call('election', 'alice', { action: 'vote', electionId: v0.id, requestId: randomUUID(), ranking: I0 })).status, 200);
  assert.equal((await view()).voted, true, 'voted in window 0');
  r.setNow((s + 150 * DAY + H) * 1000); ok();
  assert.equal((await r.call('election', 'bob', { action: 'vote', electionId: `${base}-cycle-1`, requestId: randomUUID(), ranking: I0 })).status, 200, 'bob opens window 1');
  const v1 = await view(); assert.equal(v1.id, `${base}-cycle-1`); assert.equal(v1.status, 'open'); assert.equal(v1.voted, false, 'window 1 starts unvoted');
});
const I0 = ['ines-varro', 'tobin-achterberg', 'mara-quell'];

test('#936 ballot accepts each window id (QA2 on #937)', async () => {
  const { isKindleElectionId } = await import('../lib/election-ids.ts');
  for (const ok of [base, 'kindle-presidential-account-poc-1', `${base}-cycle-1`, 'kindle-presidential-account-poc-1-cycle-12']) assert.equal(isKindleElectionId(ok), true, ok);
  for (const bad of ['', `${base}-cycle-0`, `${base}-cycle-`, `${base}-cycle-1x`, `x${base}`, 'kindle-presidential-poc-2', null]) assert.equal(isKindleElectionId(bad), false, String(bad));
});

for (const backend of ['sqlite', 'postgres']) test(`#936 ${backend}: polling follows the current window (QA2 on #937)`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  const { readPolling } = await r.importModule('lib/polling.ts');
  const now = Math.floor(r.now / 1000), slate = JSON.stringify(I0.map(id => ({ id, name: id, platform: 'p' })));
  const add = (id, o, c, closed) => r.db.prepare('INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at,closed_at) VALUES (?,?,?,?,?,?)').bind(id, 'kindle', slate, o, c, closed).run();
  await add(base, now - 130 * DAY, now - 127 * DAY, now - 127 * DAY);
  assert.equal((await readPolling(r.db, 'alice', now)).open, false, 'only the closed first window');
  await add(`${base}-cycle-1`, now - H, now + 71 * H, null);
  assert.equal((await readPolling(r.db, 'alice', now)).open, true, 'the open current window is polled');
});
