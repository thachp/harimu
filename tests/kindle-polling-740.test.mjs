/** #740 slice 1: Kindle polling (docs §9.4/§9.5). Pure rules, flag-off 404 with no DB (spy), answer/change/decline/replay, eligibility, minimum sample, once-a-day snapshot, no individual answers. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seededRandom, drawSample, marginPoints, marginBand, tallyPoll, minimumPublishedSample, minimumNewAnswers, shareStep, maximumSample, pollingFlagOn, pollDay, pollSeed } from '../lib/polling-rules.ts';

test('rules: seeded sample, 95% margin ≈ 0.98/√n, minimum sample 10, shares in slate order', () => {
  assert.equal(seededRandom('s')(), seededRandom('s')()); assert.notEqual(seededRandom('s')(), seededRandom('t')());
  const items = Array.from({ length: 50 }, (_, i) => `x${i}`);
  assert.deepEqual(drawSample(items, 20, 'seed'), drawSample(items, 20, 'seed'), 'deterministic for a seed');
  assert.notDeepEqual(drawSample(items, 20, 'seed'), drawSample(items, 20, 'other'));
  const s = drawSample(items, 20, 'seed'); assert.equal(s.length, 20); assert.equal(new Set(s).size, 20, 'without replacement'); assert.ok(s.every(x => items.includes(x)));
  assert.equal(drawSample(items, 80, 'seed').length, 50); assert.deepEqual(drawSample(items, 0, 'seed'), []); assert.deepEqual(items.length, 50, 'input untouched');
  assert.notDeepEqual(drawSample(items, 50, 'seed'), items, 'shuffled, not the first n');
  assert.deepEqual([marginPoints(100), marginPoints(400), marginPoints(10), marginPoints(0)], [9.8, 4.9, 31, null]);
  assert.deepEqual([minimumPublishedSample, maximumSample], [10, 400]);
  const slate = ['a', 'b', 'c'];
  assert.equal(tallyPoll(Array(9).fill('a'), slate), null, '9 answers: not published');
  assert.deepEqual(tallyPoll([...Array(6).fill('a'), ...Array(4).fill('b')], slate), { n: 10, margin: 35, shares: [{ candidateId: 'a', share: 60 }, { candidateId: 'b', share: 40 }, { candidateId: 'c', share: 0 }] });
  assert.deepEqual(tallyPoll([...Array(1).fill('a'), ...Array(2).fill('b'), ...Array(8).fill('c')], slate).shares.map(x => x.share), [10, 20, 75], 'nearest 5% (ARC ruling a)');
  assert.deepEqual([shareStep, minimumNewAnswers], [5, 10]);
  assert.deepEqual([marginBand(10), marginBand(23), marginBand(24), marginBand(100), marginBand(400), marginBand(0)], [35, 35, 20, 10, 5, null], 'coarse band only [ASSUMPTION]');
  for (const e of [{}, { HARIMU_KINDLE_POLLING_ENABLED: 'TRUE' }, { HARIMU_KINDLE_POLLING_ENABLED: 'false' }, null]) assert.equal(pollingFlagOn(e), false); assert.equal(pollingFlagOn({ HARIMU_KINDLE_POLLING_ENABLED: 'true' }), true);
  assert.deepEqual([pollDay(86399), pollDay(86400)], [0, 1]);
  assert.equal(pollSeed('e', 3), 'e:3'); const many = Array.from({ length: 500 }, (_, i) => i % 3);
  assert.notDeepEqual(drawSample(many, 400, pollSeed('e', 3)), drawSample(many, 400, pollSeed('e', 4)), 'a new day draws a new sample');
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
const slate = [{ id: 'ines-varro', name: 'Ines Varro', platform: 'p' }, { id: 'tobin-achterberg', name: 'Tobin Achterberg', platform: 'p' }, { id: 'mara-quell', name: 'Mara Quell', platform: 'p' }];
async function setup(t, backend) {
  const { localRuntime } = await import('./helpers/local-runtime.mjs');
  const r = await localRuntime({ backend, accountElection: true }); t.after(() => r.close());
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  const day0 = (Math.floor(r.now / 86400000) + 1) * 86400; // start of tomorrow (seconds)
  r.setNow(day0 * 1000 + 3600 * 1000); // 01:00 on day0
  await r.db.prepare("INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at) VALUES ('kindle-presidential-poc-1','kindle',?,?,?)").bind(JSON.stringify(slate), day0, day0 + 259200).run();
  const at = new Date(r.now).toISOString();
  const citizen = (id, nation = 'kindle') => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
  const answer = (id, cand, when) => r.db.prepare('INSERT INTO kindle_poll_answers (election_id,clerk_user_id,candidate_id,answered_at,request_id) VALUES (?,?,?,?,?)').bind('kindle-presidential-poc-1', id, cand, when, `seed-${id}`).run();
  r.setFixtureEnv('HARIMU_KINDLE_POLLING_ENABLED', 'true');
  return { r, day0, citizen, answer };
}
const rows = async (r, t) => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n);

for (const backend of ['sqlite', 'postgres']) {
  test(`/api/polling (${backend}): flag off is 404 for GET and POST before auth, with zero DB statements, and writes nothing`, async t => {
    const { r } = await setup(t, backend);
    for (const flag of [undefined, 'false', 'TRUE']) {
      r.setFixtureEnv('HARIMU_KINDLE_POLLING_ENABLED', flag);
      const off = await spy(r, async () => [await r.call('polling', 'alice'), await r.call('polling', null), await r.call('polling', 'alice', { action: 'answer', candidateId: 'mara-quell', requestId: 'req-740-off1' }), await r.call('polling', null, { action: 'decline' }), await r.call('polling', 'alice', { action: 'decline' }, 'https://evil.invalid')]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404, 404, 404, 404], 'cross-origin too: the flag is checked first'); assert.deepEqual(off.sql, [], `flag ${flag}: no database access`);
    }
    assert.equal(await rows(r, 'kindle_poll_answers') + await rows(r, 'kindle_poll_snapshots'), 0);
    r.setFixtureEnv('HARIMU_KINDLE_POLLING_ENABLED', 'true');
    const on = await spy(r, () => r.call('polling', 'alice')); assert.equal(on.result.status, 200); assert.ok(on.sql.length > 0, 'baseline');
  });

  test(`/api/polling (${backend}): answer, change, replay, decline; one row per citizen; Kindle and eligibility gates; closed election`, async t => {
    const { r, citizen } = await setup(t, backend);
    const post = (u, body) => r.call('polling', u, body);
    assert.equal((await r.call('polling', null)).status, 401);
    assert.equal((await post('alice', { action: 'answer', candidateId: 'mara-quell', requestId: 'req-740-x1' }, )).status, 200);
    const first = await r.call('polling', 'alice');
    assert.deepEqual([first.data.polling.myAnswer, first.data.polling.open, first.data.eligible, first.data.polling.poll], ['mara-quell', true, true, null]);
    assert.equal((await post('alice', { action: 'answer', candidateId: 'ines-varro', requestId: 'req-740-x2' })).data.polling.myAnswer, 'ines-varro', 'change');
    assert.equal(await rows(r, 'kindle_poll_answers'), 1, 'one row per citizen per election');
    assert.equal((await post('alice', { action: 'answer', candidateId: 'ines-varro', requestId: 'req-740-x2' })).status, 200, 'replay');
    assert.equal((await post('bob', { action: 'answer', candidateId: 'ines-varro', requestId: 'req-740-x2' })).data.reason, 'request_conflict');
    assert.equal(await rows(r, 'kindle_poll_answers'), 1);
    for (const body of [{ action: 'answer', candidateId: 'nobody', requestId: 'req-740-x3' }, { action: 'answer', candidateId: 'mara-quell', requestId: 'short' }, { action: 'vote' }]) assert.equal((await post('alice', body)).status, 400, JSON.stringify(body));
    assert.equal((await r.call('polling', 'alice', { action: 'decline' }, 'https://evil.invalid')).status, 403, 'same origin');
    assert.equal((await post('bob', { action: 'answer', candidateId: 'mara-quell', requestId: 'req-740-b1' })).status, 200);
    assert.equal((await post('alice', { action: 'decline' })).data.polling.myAnswer, null); assert.equal(await rows(r, 'kindle_poll_answers'), 1, 'decline removes only my answer');
    assert.equal((await r.call('polling', 'bob')).data.polling.myAnswer, 'mara-quell');
    assert.equal((await post('bob', { action: 'decline' })).status, 200); assert.equal(await rows(r, 'kindle_poll_answers'), 0);
    await citizen('kim', 'korund');
    assert.equal((await r.call('polling', 'kim')).data.reason, 'not_kindle'); assert.equal((await post('kim', { action: 'decline' })).status, 403);
    r.setFixtureEnv('HARIMU_ACCOUNT_ELECTION_POC_ENABLED', 'false');
    assert.equal((await r.call('polling', 'bob')).data.eligible, false);
    assert.deepEqual([(await post('bob', { action: 'answer', candidateId: 'mara-quell', requestId: 'req-740-x4' })).data.reason, await rows(r, 'kindle_poll_answers')], ['not_eligible', 0]);
    r.setFixtureEnv('HARIMU_ACCOUNT_ELECTION_POC_ENABLED', 'true');
    r.setNow(r.now + 4 * 86400000);
    assert.equal((await post('bob', { action: 'answer', candidateId: 'mara-quell', requestId: 'req-740-x5' })).data.reason, 'closed', 'after the window (closed_at still NULL: the closes_at check alone)');
  });

  test(`/api/polling (${backend}): no poll under 10 answers; one seeded snapshot per day from answers before the day; nothing per-citizen or countable anywhere`, async t => {
    const { r, day0, citizen, answer } = await setup(t, backend);
    for (let i = 0; i < 12; i++) await citizen(`p${i}`);
    for (let i = 0; i < 9; i++) await answer(`p${i}`, i < 6 ? 'mara-quell' : 'tobin-achterberg', day0 + 60 + i);
    r.setNow((day0 + 86400 + 60) * 1000); // day 1
    assert.equal((await r.call('polling', 'alice')).data.polling.poll, null, '9 answers: nothing published'); assert.equal(await rows(r, 'kindle_poll_snapshots'), 0);
    await answer('p9', 'ines-varro', day0 + 100);
    await answer('p10', 'ines-varro', day0 + 86400 + 1); // given today: not in today's poll
    const pub = await r.call('polling', 'alice');
    assert.deepEqual([pub.data.polling.poll.marginBand, pub.data.polling.poll.day], [35, day0 / 86400 + 1]);
    assert.deepEqual(pub.data.polling.poll.shares.map(s => [s.candidateId, s.name, s.share]), [['ines-varro', 'Ines Varro', 10], ['tobin-achterberg', 'Tobin Achterberg', 30], ['mara-quell', 'Mara Quell', 60]]);
    assertPrivate(pub.data);
    await answer('p11', 'ines-varro', day0 + 200);
    assert.equal((await r.call('polling', 'bob')).data.polling.poll.shares[0].share, 10, 'once a day: the snapshot does not change later that day'); assert.equal(await rows(r, 'kindle_poll_snapshots'), 1);
  });

  test(`/api/polling (${backend}): an answer exactly at the day start is not in that day's poll but counts the next day; 9 new answers keep the old snapshot, 10 publish`, async t => {
    const { r, day0, citizen, answer } = await setup(t, backend);
    for (let i = 0; i < 30; i++) await citizen(`q${i}`);
    for (let i = 0; i < 10; i++) await answer(`q${i}`, 'mara-quell', day0 + 60 + i);
    const d1 = day0 + 86400; await answer('q10', 'ines-varro', d1); // exactly the day-1 start
    r.setNow((d1 + 60) * 1000);
    const one = (await r.call('polling', 'alice')).data.polling.poll;
    assert.deepEqual(one.shares.map(s => s.share), [0, 0, 100], 'answered_at == day start is excluded that day');
    for (let i = 11; i < 19; i++) await answer(`q${i}`, 'mara-quell', d1 + i); // 8 more: 9 new since the day-1 cut-off (q10 included)
    r.setNow((d1 + 86400 + 60) * 1000);
    const two = (await r.call('polling', 'alice')).data.polling.poll;
    assert.deepEqual([two.day, await rows(r, 'kindle_poll_snapshots')], [one.day, 1], '9 new answers: the previous snapshot is still served');
    await answer('q19', 'mara-quell', d1 + 86400 + 5); // given on day 2, counted for day 3
    r.setNow((d1 + 2 * 86400 + 60) * 1000);
    const three = (await r.call('polling', 'alice')).data.polling.poll;
    assert.deepEqual([three.day, await rows(r, 'kindle_poll_snapshots')], [d1 / 86400 + 2, 2], '10 new answers publish');
    assert.deepEqual(three.shares.map(s => s.share), [5, 0, 95], 'the day-start answer is in the next poll (1 of 20)');
    assertPrivate((await r.call('polling', 'alice')).data);
  });

  test(`/api/polling (${backend}): two first reads of a day racing keep exactly one snapshot`, async t => {
    const { r, day0, citizen, answer } = await setup(t, backend);
    for (let i = 0; i < 10; i++) { await citizen(`s${i}`); await answer(`s${i}`, 'mara-quell', day0 + i); }
    r.setNow((day0 + 86400 + 60) * 1000);
    const res = await Promise.all([r.call('polling', 'alice'), r.call('polling', 'bob'), r.call('polling', 'alice')]);
    assert.deepEqual(res.map(x => x.status), [200, 200, 200]); assert.equal(await rows(r, 'kindle_poll_snapshots'), 1);
    const { publishDailyPoll } = await r.importModule('lib/polling.ts');
    const election = { id: 'kindle-presidential-poc-1', slate: slate.map(c => c.id), names: {}, open: true };
    await r.db.prepare('DELETE FROM kindle_poll_snapshots').run();
    await Promise.all([publishDailyPoll(r.db, election, day0 + 86400 + 60), publishDailyPoll(r.db, election, day0 + 86400 + 60)]);
    assert.equal(await rows(r, 'kindle_poll_snapshots'), 1, 'concurrent publishes of one day: the second is a no-op, not an error');
  });

  test(`/api/polling (${backend}): replaying an older request id after a change returns the stored result and does not re-apply the old answer`, async t => {
    const { r } = await setup(t, backend);
    assert.equal((await r.call('polling', 'alice', { action: 'answer', candidateId: 'mara-quell', requestId: 'req-740-r1' })).status, 200);
    assert.equal((await r.call('polling', 'alice', { action: 'answer', candidateId: 'ines-varro', requestId: 'req-740-r2' })).status, 200);
    const replay = await r.call('polling', 'alice', { action: 'answer', candidateId: 'mara-quell', requestId: 'req-740-r1' });
    assert.equal(replay.status, 200); assert.equal(replay.data.polling.myAnswer, 'ines-varro');
    assert.equal((await r.call('polling', 'bob', { action: 'answer', candidateId: 'mara-quell', requestId: 'req-740-r1' })).data.reason, 'request_conflict');
  });
}

/** ARC ruling (c): walk the whole response; no per-citizen field and no raw count may appear at any depth. */
function assertPrivate(data) {
  const banned = /^(n|count|counts|votes|tally|answers|answerers|sample|sampleSize|clerk_user_id|userId|user_id|requestId|request_id|answered_at|answeredAt|margin|marginTenths)$/;
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!banned.test(k), `forbidden key ${path}.${k}`); walk(x, `${path}.${k}`); }
    if (typeof v === 'string') assert.ok(!/^(p|q|s)\d+$|seed-|req-/.test(v), `per-citizen value at ${path}`);
  };
  walk(data, '$');
  const poll = data.polling.poll;
  assert.deepEqual(Object.keys(data.polling).sort(), ['candidates', 'myAnswer', 'open', 'poll']);
  if (poll) {
    assert.deepEqual(Object.keys(poll).sort(), ['day', 'marginBand', 'publishedAt', 'shares']);
    for (const s of poll.shares) { assert.deepEqual(Object.keys(s).sort(), ['candidateId', 'name', 'share']); assert.equal(s.share % 5, 0, 'shares only in 5% steps'); }
  }
}

test('a draw from more than 400 answers is uniform: a biased index would over-pick the front of the pool', () => {
  const pool = [...Array(250).fill('a'), ...Array(250).fill('b')];
  for (const day of [1, 2, 3, 4, 5]) {
    const a = drawSample(pool, maximumSample, pollSeed('kindle-presidential-poc-1', day)).filter(x => x === 'a').length;
    assert.ok(a >= 180 && a <= 220, `day ${day}: ${a} of 400 from the first half (uniform ≈ 200)`);
  }
});
