/** #867: Kindle rallies (docs §9.4). Flag-off 404 with no DB and no news clips, Tier-1 gate, Kindle-only, attend once (idempotent), weekly schedule reset,
 *  one AI-labeled news clip per rally, and the invariant that attendance adds no ballot or primary weight. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ralliesFlagOn, rallyStartsAt, rallyWeekOf, upcomingRallyWeek, lastRallyWeek, rallyIdFor, parseRallyId, rallyAiCrowd } from '../lib/rallies-rules.ts';

test('rules: flag is exactly "true"; one upcoming rally per candidate; the schedule rolls to next week once a rally starts', () => {
  for (const e of [{}, { HARIMU_KINDLE_RALLIES_ENABLED: 'TRUE' }, { HARIMU_KINDLE_RALLIES_ENABLED: 'false' }, null]) assert.equal(ralliesFlagOn(e), false);
  assert.equal(ralliesFlagOn({ HARIMU_KINDLE_RALLIES_ENABLED: 'true' }), true);
  const start = rallyStartsAt(100, 0);
  assert.deepEqual([upcomingRallyWeek(start - 1, 0), upcomingRallyWeek(start, 0), lastRallyWeek(start - 1, 0), lastRallyWeek(start, 0)], [100, 101, 99, 100]);
  assert.equal(rallyWeekOf(start), 100); assert.deepEqual(parseRallyId(rallyIdFor('mara-quell', 7)), { candidateId: 'mara-quell', week: 7 });
  for (const bad of ['rally-x', 'rally-mara-quell-', 7, null]) assert.equal(parseRallyId(bad), null);
});
test('invariant (static): no vote, ballot or primary code reads rallies', () => {
  for (const f of ['lib/elections.ts', 'lib/primaries.ts', 'lib/primaries-rules.ts', 'lib/instant-runoff.ts', 'lib/preview-election.ts', 'app/api/election/route.ts', 'app/api/primaries/route.ts'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /rally|rallies/i, f);
});
async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
async function setup(t, backend) {
  const { localRuntime } = await import('./helpers/local-runtime.mjs');
  const r = await localRuntime({ backend, accountElection: true }); t.after(() => r.close());
  const iso = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('cara','aurelle','Cara',18,0,'Good standing',?,?)").bind(iso, iso).run();
  r.setFixtureEnv('HARIMU_KINDLE_RALLIES_ENABLED', 'true');
  return r;
}
const rows = async (r, table = 'rally_attendance') => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
const attend = (r, u, rallyId, origin) => r.call('rallies', u, { rallyId }, origin);
const nowS = r => Math.floor(r.now / 1000);
const clipTitles = async (r, u = 'alice') => ((await r.call('news', u)).data.items ?? []).filter(i => i.id.startsWith('kindle:rally:'));

for (const backend of ['sqlite', 'postgres']) {
  test(`/api/rallies (${backend}): flag off is 404 before auth with zero DB statements; no news clip`, async t => {
    const r = await setup(t, backend);
    const { runRallyCron } = await r.importModule('lib/rallies.ts');
    await runRallyCron(r.db, nowS(r) + 30 * 86400);
    for (const flag of [undefined, 'false', 'TRUE']) {
      r.setFixtureEnv('HARIMU_KINDLE_RALLIES_ENABLED', flag);
      const off = await spy(r, async () => [await r.call('rallies', 'alice'), await r.call('rallies', null), await attend(r, 'alice', 'rally-mara-quell-1'), await attend(r, 'alice', 'x', 'https://evil.invalid')]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404, 404, 404]); assert.deepEqual(off.sql, [], `flag ${flag}: no database access`);
      assert.deepEqual(await clipTitles(r), [], 'no rally news with the flag off');
    }
    assert.equal(await rows(r), 0);
  });

  test(`/api/rallies (${backend}): Kindle only, Tier-1 only, attend once, crowd count`, async t => {
    const r = await setup(t, backend);
    assert.equal((await r.call('rallies', null)).status, 401);
    assert.equal((await r.call('rallies', 'cara')).data.reason, 'not_kindle'); assert.equal((await attend(r, 'cara', 'x')).status, 403);
    const list = (await r.call('rallies', 'alice')).data.rallies; assert.equal(list.length, 3);
    for (const x of list) { assert.equal(x.speech.ai, true); assert.ok(x.startsAt > nowS(r)); assert.equal(x.crowd, rallyAiCrowd); }
    const id = list[0].id;
    assert.equal((await attend(r, 'alice', id, 'https://evil.invalid')).status, 403, 'same origin');
    for (const bad of ['nope', 'rally-nobody-1', rallyIdFor(list[0].candidateId, parseRallyId(id).week + 1)]) assert.ok([400, 409].includes((await attend(r, 'alice', bad)).status), bad);
    assert.equal((await attend(r, 'alice', id)).status, 200);
    const again = await attend(r, 'alice', id); assert.equal(again.status, 200, 'repeat is 200'); assert.equal(await rows(r), 1, 'no new row');
    await attend(r, 'bob', id);
    const mine = again.data.rallies.find(x => x.id === id); assert.equal(mine.attending, true);
    const after = (await r.call('rallies', 'bob')).data.rallies.find(x => x.id === id); assert.deepEqual([after.humans, after.crowd], [2, 2 + rallyAiCrowd]);
    r.setFixtureEnv('HARIMU_ACCOUNT_ELECTION_POC_ENABLED', 'false');
    assert.equal((await r.call('rallies', 'alice')).data.eligible, false);
    const x = await attend(r, 'alice', list[1].id); assert.deepEqual([x.status, x.data.reason, await rows(r)], [403, 'not_eligible', 2], 'not Tier-1: no row');
  });

  test(`/api/rallies (${backend}): after the rally the schedule resets to next week and one AI-labeled clip is published`, async t => {
    const r = await setup(t, backend);
    const { runRallyCron } = await r.importModule('lib/rallies.ts');
    const first = (await r.call('rallies', 'alice')).data.rallies[0];
    await attend(r, 'alice', first.id); await attend(r, 'bob', first.id);
    assert.equal((await runRallyCron(r.db, first.startsAt - 1)).published > 0 && (await clipTitles(r)).some(c => c.id.endsWith(first.id)), false, 'nothing before the rally time');
    r.setNow((first.startsAt + 60) * 1000);
    assert.equal((await attend(r, 'alice', first.id)).data.reason, 'not_upcoming', 'a past rally takes no sign-ups');
    const next = (await r.call('rallies', 'alice')).data.rallies[0];
    assert.equal(parseRallyId(next.id).week, parseRallyId(first.id).week + 1); assert.deepEqual([next.humans, next.attending], [0, false], 'new rally starts empty');
    await runRallyCron(r.db, first.startsAt + 60); await runRallyCron(r.db, first.startsAt + 120);
    const clips = (await clipTitles(r)).filter(c => c.id === `kindle:rally:${first.id}`);
    assert.equal(clips.length, 1, 'published once');
    assert.match(clips[0].title, /^AI clip: /); assert.match(clips[0].text, /^AI-generated rally clip\. 2 citizens and 40 AI citizens attended\./);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM rally_clips WHERE rally_id=?').bind(first.id).first()).n), 1);
  });

  test(`/api/rallies (${backend}): attendance adds no votes, ballot weight or primary weight`, async t => {
    const r = await setup(t, backend);
    const { readPrimaries } = await r.importModule('lib/primaries.ts');
    const { runRallyCron } = await r.importModule('lib/rallies.ts');
    await r.db.prepare("INSERT INTO party_members (clerk_user_id,party_id,joined_at) VALUES ('bob','steady-hand',1)").run();
    const tally = async () => {
      const out = {};
      for (const table of ['party_members', 'primary_elections', 'primary_voter_receipts', 'primary_anonymous_ballots', 'civic_elections', 'civic_voter_receipts', 'civic_anonymous_ballots', 'party_plank_votes'])
        out[table] = Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
      out.primaries = (await readPrimaries(r.db, 'alice', 1, null, null)).parties.map(p => [p.id, p.members]);
      out.election = (await r.call('election', 'alice')).data;
      return out;
    };
    const baseline = await tally();
    for (const x of (await r.call('rallies', 'alice')).data.rallies) { await attend(r, 'alice', x.id); await attend(r, 'bob', x.id); }
    await runRallyCron(r.db, nowS(r) + 8 * 86400);
    assert.deepEqual(await tally(), baseline, 'ballot, primary and membership tallies are unchanged by rallies');
  });
  test(`/api/rallies (${backend}): a published clip appears only in the Kindle edition, never in Aurelle's or Korund's`, async t => {
    const r = await setup(t, backend);
    const { runRallyCron } = await r.importModule('lib/rallies.ts');
    const iso = new Date(r.now).toISOString();
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kim','korund','Kim',18,0,'Good standing',?,?)").bind(iso, iso).run();
    const first = (await r.call('rallies', 'alice')).data.rallies[0];
    r.setNow((first.startsAt + 60) * 1000); await runRallyCron(r.db, first.startsAt + 60);
    assert.ok((await clipTitles(r, 'alice')).length >= 1, 'Kindle edition has the clip');
    for (const u of ['cara', 'kim']) {
      const news = await r.call('news', u); assert.equal(news.status, 200, u);
      assert.deepEqual((news.data.items ?? []).filter(i => /rally/i.test(i.id) || /rall(y|ies)/i.test(i.title)), [], `${u}: no rally items`);
    }
  });

  test(`/api/rallies (${backend}): parallel attends write one row each; parallel publish writes one clip per rally`, async t => {
    const r = await setup(t, backend);
    const { runRallyCron } = await r.importModule('lib/rallies.ts');
    const first = (await r.call('rallies', 'alice')).data.rallies[0];
    const a = await Promise.all([...Array(8)].flatMap(() => [attend(r, 'alice', first.id), attend(r, 'bob', first.id)]));
    assert.ok(a.every(x => x.status === 200)); assert.equal(await rows(r), 2);
    const runs = await Promise.all([...Array(6)].map(() => runRallyCron(r.db, first.startsAt + 60)));
    assert.equal(runs.reduce((n, x) => n + x.published, 0), 3, 'one clip per candidate across all runs');
    assert.equal(await rows(r, 'rally_clips'), 3);
    assert.equal(Number((await r.db.prepare('SELECT humans FROM rally_clips WHERE rally_id=?').bind(first.id).first()).humans), 2);
  });
}
