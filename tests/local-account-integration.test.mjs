/** Real route handlers + schema bootstrap + SQLite; fixture authentication only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

async function fixture(t) { const runtime = await localRuntime(); t.after(() => runtime.close()); return runtime; }
const privateResponse = response => assert.equal(response.cache, 'private, no-store');
const tierOne = (r, user, overrides = {}) => ({ userId: user, emailVerified: true, phoneVerified: true,
  phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000, ...overrides });

test('two accounts save/read private drafts and decisions through actual handlers, including reopen', async t => {
  const r = await fixture(t);
  await Promise.all([
    ['alice', 'today', 'Alice fixture private note', ['capacity']],
    ['bob', 'season', 'Bob fixture private note', ['forum']],
  ].map(async ([user, horizon, note, completedIds]) => {
    const response = await r.call('citizen', user, { action: 'save-plan', horizon, note, completedIds, clerk_user_id: 'other-account' });
    assert.equal(response.status, 200); privateResponse(response);
  }));
  const committed = await r.call('citizen', 'bob', {
    action: 'commit-decision', optionId: 'forum', infrastructureId: 'council', householdMemberId: 'partner',
    horizon: 'season', note: 'Bob fixture private note',
  });
  assert.equal(committed.status, 200);
  const verify = async () => {
    const alice = await r.call('citizen', 'alice'), bob = await r.call('citizen', 'bob');
    assert.equal(alice.data.plan.note, 'Alice fixture private note');
    assert.deepEqual(alice.data.plan.completedIds, ['capacity']);
    assert.equal(alice.data.plan.horizon, 'today');
    assert.equal(alice.data.decision, null);
    assert.equal(alice.data.profile.capacity, 18);
    assert.equal(bob.data.profile.capacity, 16);
    assert.ok(!JSON.stringify(alice.data).includes('Private bob'));
    assert.ok(!JSON.stringify(bob.data).includes('Private alice'));
    assert.equal(bob.data.plan.note, 'Bob fixture private note');
    assert.equal(bob.data.decision.optionId, 'forum');
    assert.ok(!JSON.stringify(alice.data).includes('Bob fixture private note'));
    assert.ok(!JSON.stringify(bob.data).includes('Alice fixture private note'));
    privateResponse(alice); privateResponse(bob);
  };
  await verify(); r.reopen(); await verify();
  const anonymousRead = await r.call('citizen', null);
  assert.equal(anonymousRead.status, 401); privateResponse(anonymousRead);
  const denied = await r.call('citizen', null, { action: 'save-plan', note: 'Unauthorized replacement' });
  assert.equal(denied.status, 401); privateResponse(denied);
  const foreign = await r.call('citizen', 'alice', { action: 'save-plan', note: 'Cross-origin replacement' }, 'https://foreign.invalid');
  assert.equal(foreign.status, 403); await verify();
});

test('petitions expose only own history and bind request replays to the account', async t => {
  const r = await fixture(t), aliceId = randomUUID(), bobId = randomUUID();
  for (const user of ['alice', 'bob']) r.setVerification(user, tierOne(r, user));
  const responses = await Promise.all([
    r.call('citizen', 'alice', { action: 'government-petition', topic: 'work', requestId: aliceId }),
    r.call('citizen', 'bob', { action: 'government-petition', topic: 'food', requestId: bobId }),
  ]);
  for (const response of responses) { assert.equal(response.status, 200); privateResponse(response); }
  assert.equal((await r.call('citizen', 'bob', { action: 'government-petition', topic: 'work', requestId: aliceId })).status, 409);
  assert.equal((await r.call('citizen', 'alice', { action: 'government-petition', topic: 'work', requestId: aliceId })).status, 200);
  assert.equal((await r.call('citizen', 'alice', { action: 'government-petition', topic: 'food', requestId: randomUUID() })).status, 409);
  const period = Math.floor(r.now / 86400000) * 86400 - 86400;
  const oldAlice = randomUUID(), oldBob = randomUUID();
  await r.db.batch([
    r.db.prepare('INSERT INTO government_petitions VALUES (?,?,?,?,?,?)').bind(oldAlice, 'alice', 'kindle', 'work', period, period + 1),
    r.db.prepare('INSERT INTO government_petitions VALUES (?,?,?,?,?,?)').bind(oldBob, 'bob', 'kindle', 'food', period, period + 2),
    r.db.prepare('INSERT INTO government_petition_eligibility VALUES (?,?,?)').bind(oldAlice, 'alice', period + 1),
    r.db.prepare('INSERT INTO government_petition_eligibility VALUES (?,?,?)').bind(oldBob, 'bob', period + 2),
  ]);
  const verify = async () => {
    const [alice, bob] = await Promise.all([r.call('citizen', 'alice'), r.call('citizen', 'bob')]);
    assert.deepEqual(new Set(alice.data.government.petitions.map(p => p.requestId)), new Set([aliceId, oldAlice]));
    assert.deepEqual(new Set(bob.data.government.petitions.map(p => p.requestId)), new Set([bobId, oldBob]));
    assert.equal(alice.data.government.petitions.find(p => p.requestId === oldAlice).status, 'deferred');
    assert.equal(bob.data.government.petitions.find(p => p.requestId === oldBob).status, 'accepted');
    assert.equal(alice.data.government.petitions.find(p => p.requestId === aliceId).status, 'pending');
    assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM government_reviews').first()).count, 1);
    assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM government_petition_resolutions').first()).count, 2);
    privateResponse(alice); privateResponse(bob);
  };
  await verify(); r.reopen(); await verify();
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  assert.deepEqual((await r.call('citizen', 'bob')).data.government.petitions, []);
});

test('chat shares pseudonymous nation messages but keeps ownership, identity and presence private', async t => {
  const r = await fixture(t), aliceId = randomUUID(), bobId = randomUUID();
  assert.equal((await r.call('square', 'alice', { action: 'post', id: aliceId, text: 'Alice shared fixture message' })).status, 200);
  assert.equal((await r.call('square', 'bob', { action: 'post', id: bobId, text: 'Bob shared fixture message', user_id: 'alice' })).status, 200);
  assert.equal((await r.call('square', 'bob', { action: 'post', id: aliceId, text: 'Alice shared fixture message' })).status, 409);
  assert.equal((await r.call('square', 'alice', { action: 'post', id: aliceId, text: 'Alice shared fixture message' })).status, 200);
  const verify = async () => {
    for (const [user, own] of [['alice', aliceId], ['bob', bobId]]) {
      const response = await r.call('square', user); privateResponse(response);
      assert.equal(response.data.messages.length, 2);
      assert.deepEqual(response.data.messages.filter(m => m.mine).map(m => m.id), [own]);
      for (const message of response.data.messages) {
        assert.deepEqual(Object.keys(message).sort(), ['body', 'handle', 'id', 'mine', 'postedAt']);
        assert.match(message.handle, /^Citizen-[0-9a-f]{16}$/);
      }
      assert.ok(!JSON.stringify(response.data).includes('Private alice'));
      assert.ok(!JSON.stringify(response.data).includes('Private bob'));
    }
  };
  await verify(); r.reopen(); await verify();
  assert.equal((await r.call('square', 'bob', { action: 'delete', id: aliceId })).status, 404);
  await r.call('square', 'alice', { action: 'presence', active: true, user_id: 'bob' });
  const presence = await r.call('square', 'bob'); assert.equal(presence.data.present, 1);
  assert.ok(!('users' in presence.data));
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  const separated = await r.call('square', 'bob'); assert.deepEqual(separated.data.messages, []); assert.equal(separated.data.present, 0);
  await r.call('square', 'bob', { action: 'post', id: randomUUID(), text: 'Korund fixture message', nation_id: 'kindle' });
  assert.equal((await r.call('square', 'alice')).data.messages.length, 2);
  assert.equal((await r.call('square', null)).status, 401);
});

test('actual petition route rejects forged, revoked, stale, duplicate-phone and cross-account evidence', async t => {
  const r = await fixture(t);
  const petition = requestId => ({ action: 'government-petition', topic: 'work', requestId,
    tier: 1, verification: tierOne(r, 'alice'), phoneUnique: true, emailVerified: true });
  const absent = await r.call('citizen', 'alice', petition(randomUUID()));
  assert.equal(absent.status, 403); assert.equal(absent.data.verification.status, 'unavailable'); privateResponse(absent);
  for (const evidence of [null, tierOne(r, 'bob'), tierOne(r, 'alice', { revoked: true }),
    tierOne(r, 'alice', { phoneUnique: false }), tierOne(r, 'alice', { checkedAt: r.now - 60001 }),
    tierOne(r, 'alice', { expiresAt: r.now }), new Error('trusted provider unavailable')]) {
    r.setVerification('alice', evidence);
    const denied = await r.call('citizen', 'alice', petition(randomUUID()));
    assert.equal(denied.status, 403); privateResponse(denied);
  }
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM government_petitions').first()).count, 0);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM government_petition_eligibility').first()).count, 0);
  r.setVerification('alice', tierOne(r, 'alice'));
  const requestId = randomUUID();
  assert.equal((await r.call('citizen', 'alice', petition(requestId))).status, 200);
  assert.equal((await r.call('citizen', 'alice', petition(requestId))).status, 200);
  r.reopen();
  assert.equal((await r.call('citizen', 'alice', petition(requestId))).status, 200);
  r.setVerification('bob', tierOne(r, 'bob'));
  assert.equal((await r.call('citizen', 'bob', petition(requestId))).status, 409);
  assert.equal((await r.call('citizen', 'alice', petition(randomUUID()))).status, 409);
  r.setVerification('alice', tierOne(r, 'alice', { revoked: true }));
  assert.equal((await r.call('citizen', 'alice', petition(requestId))).status, 403);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM government_petitions').first()).count, 1);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM government_petition_eligibility').first()).count, 1);
});

test('unverified Tier 0 retains work, market, chat, private drafts and noncounted commitments', async t => {
  const r = await fixture(t);
  assert.equal((await r.call('citizen', 'alice')).data.verification.tier, 0);
  assert.equal((await r.call('citizen', 'alice', { action: 'save-plan', horizon: 'today', note: 'Tier 0 draft', completedIds: ['forum'] })).status, 200);
  const commitment = await r.call('citizen', 'alice', { action: 'commit-decision', optionId: 'forum', infrastructureId: 'council', householdMemberId: 'citizen', note: 'Tier 0 draft' });
  assert.equal(commitment.status, 200); assert.equal(commitment.data.decision.counted, false);
  assert.equal((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' })).status, 200);
  const listingId = randomUUID();
  assert.equal((await r.call('citizen', 'alice', { action: 'create-listing', requestId: listingId, item: 'food', quantity: 1, unitMinor: 100 })).status, 200);
  assert.equal((await r.call('citizen', 'alice', { action: 'cancel-listing', requestId: randomUUID(), listingId })).status, 200);
  assert.equal((await r.call('square', 'alice', { action: 'post', id: randomUUID(), text: 'Tier 0 public chat' })).status, 200);
  assert.equal((await r.call('citizen', 'alice')).data.plan.note, 'Tier 0 draft');
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM government_petition_eligibility').first()).count, 0);
});

test('legacy and foreign eligibility receipts do not enter counted petition review', async t => {
  const r = await fixture(t), legacy = randomUUID(), foreign = randomUUID(), counted = randomUUID();
  const period = Math.floor(r.now / 86400000) * 86400 - 86400;
  await r.db.batch([
    r.db.prepare('INSERT INTO government_petitions VALUES (?,?,?,?,?,?)').bind(legacy, 'alice', 'kindle', 'work', period, period + 1),
    r.db.prepare('INSERT INTO government_petitions VALUES (?,?,?,?,?,?)').bind(foreign, 'bob', 'kindle', 'work', period, period + 2),
    r.db.prepare('INSERT INTO government_petition_eligibility VALUES (?,?,?)').bind(foreign, 'alice', period + 2),
  ]);
  assert.match((await r.call('citizen', 'alice')).data.government.petitions[0].reason, /not counted/);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS count FROM government_reviews').first()).count, 0);
  // A supported Tier 1 fixture receipt is the sole input to a later review.
  await r.db.batch([
    r.db.prepare('INSERT INTO government_petitions VALUES (?,?,?,?,?,?)').bind(counted, 'alice', 'kindle', 'food', period - 86400, period - 86399),
    r.db.prepare('INSERT INTO government_petition_eligibility VALUES (?,?,?)').bind(counted, 'alice', period - 86399),
  ]);
  const response = await r.call('citizen', 'alice');
  const review = await r.db.prepare('SELECT selected_topic,petition_count FROM government_reviews').first();
  assert.equal(review.selected_topic, 'food'); assert.equal(review.petition_count, 1);
  assert.match(response.data.government.petitions.find(p => p.requestId === legacy).reason, /not counted/);
  assert.match((await r.call('citizen', 'bob')).data.government.petitions.find(p => p.requestId === foreign).reason, /not counted/);
});
