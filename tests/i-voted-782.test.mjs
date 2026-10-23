/** #782: Kindle cosmetic "I Voted" badge (docs §9.3), derived from voter receipts with ballot_written=1 (civic, PoC, primary). SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { iVotedFlagOn, iVotedSql, voteKindLabels } from '../lib/i-voted.ts';

test('rules: flag is exactly "true"; the SQL reads receipts only (never a ballot table) and no currency', () => {
  assert.equal(iVotedFlagOn({ HARIMU_I_VOTED_BADGE_ENABLED: 'true' }), true);
  for (const e of [{}, { HARIMU_I_VOTED_BADGE_ENABLED: 'false' }, { HARIMU_I_VOTED_BADGE_ENABLED: 'TRUE' }, null]) assert.equal(iVotedFlagOn(e), false);
  assert.equal(/ballots|ranking|party_id|candidate/i.test(iVotedSql), false, 'no ballot content is selected');
  assert.equal(iVotedSql.match(/ballot_written=1/g).length, 3); assert.equal(iVotedSql.match(/clerk_user_id=\?/g).length, 3);
  assert.deepEqual(Object.keys(voteKindLabels), ['civic', 'poc', 'primary']);
  assert.equal(/wallet|spk|currency_|INSERT|UPDATE/i.test(readFileSync('lib/i-voted.ts', 'utf8').replace(/never currency|No currency, no wallet/g, '')), false, 'read-only, no currency');
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
const three = JSON.stringify(['a', 'b', 'c']);
const elections = {
  civic: id => ["INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at) VALUES (?,'kindle',?,0,259200)", [id, three]],
  poc: id => ["INSERT INTO poc_elections (id,nation_id,candidates_json,opens_at,closes_at) VALUES (?,'kindle',?,0,259200)", [id, three]],
  primary: id => ["INSERT INTO primary_elections (id,nation_id,policy,opens_at,closes_at) VALUES (?,'kindle','preview-citizen-v1',0,259200)", [id]],
};
const receipts = {
  civic: "INSERT INTO civic_voter_receipts (election_id,clerk_user_id,request_id,checked_at,ballot_written,policy) VALUES (?,?,?,?,?,'tier1-human-v1')",
  poc: "INSERT INTO poc_voter_receipts (election_id,clerk_user_id,request_id,checked_at,ballot_written,policy) VALUES (?,?,?,?,?,'preview-citizen-v1')",
  primary: "INSERT INTO primary_voter_receipts (election_id,clerk_user_id,party_id,request_id,checked_at,ballot_written,policy) VALUES (?,?,'steady-hand',?,?,?,'preview-citizen-v1')",
};
async function vote(r, kind, id, user, at, written) {
  const [sql, binds] = elections[kind](id);
  await r.db.prepare(sql).bind(...binds).run().catch(() => {}); // the election may already exist
  await r.db.prepare(receipts[kind]).bind(id, user, `rq-${kind}-${id}-${user}`, at, written).run();
}

for (const backend of ['sqlite', 'postgres']) {
  test(`GET /api/citizen/i-voted (${backend}): flag off is 404 with zero DB statements (spy); on: 401 signed out, empty before voting`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice');
    for (const flag of [undefined, 'false', 'TRUE']) {
      r.setFixtureEnv('HARIMU_I_VOTED_BADGE_ENABLED', flag);
      const off = await spy(r, async () => [await r.call('citizen/i-voted', 'alice'), await r.call('citizen/i-voted', null)]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404]); assert.deepEqual(off.sql, [], `flag ${flag}: no database access`);
    }
    r.setFixtureEnv('HARIMU_I_VOTED_BADGE_ENABLED', 'true');
    assert.equal((await r.call('citizen/i-voted', null)).status, 401);
    const on = await spy(r, () => r.call('citizen/i-voted', 'alice'));
    assert.deepEqual([on.result.status, on.result.data.badges], [200, []]); assert.ok(on.sql.length > 0, 'baseline: the spy sees the read');
    assert.ok(on.sql.every(q => /^\s*SELECT/i.test(q)), 'read-only');
  });

  test(`I Voted (${backend}): only written ballots count, per kind, per citizen; one per election; newest first; no ballot content`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
    r.setFixtureEnv('HARIMU_I_VOTED_BADGE_ENABLED', 'true');
    const badges = async u => (await r.call('citizen/i-voted', u)).data.badges;
    // QA3 (#778 nit): a receipt with no written ballot gives no badge, in every receipt table.
    for (const kind of ['civic', 'poc', 'primary']) await vote(r, kind, `${kind}-nb`, 'alice', 100, 0);
    assert.deepEqual(await badges('alice'), [], 'ballot_written=0 gives no badge');
    // Each kind on its own, so dropping any one UNION branch or any one ballot_written filter fails.
    await vote(r, 'civic', 'civic-1', 'alice', 300, 1);
    assert.deepEqual(await badges('alice'), [{ kind: 'civic', electionId: 'civic-1', votedAt: 300 }]);
    await vote(r, 'poc', 'poc-1', 'alice', 200, 1);
    await vote(r, 'primary', 'primary-1', 'alice', 400, 1);
    assert.deepEqual((await badges('alice')).map(b => [b.kind, b.electionId, b.votedAt]), [['primary', 'primary-1', 400], ['civic', 'civic-1', 300], ['poc', 'poc-1', 200]], 'newest first');
    // Another citizen's ballots are never the caller's badge (each clerk_user_id filter).
    assert.deepEqual(await badges('bob'), []);
    for (const kind of ['civic', 'poc', 'primary']) await vote(r, kind, `${kind}-1`, 'bob', 500, 1);
    assert.equal((await badges('bob')).length, 3); assert.equal((await badges('alice')).length, 3);
    // One per citizen per election: a replayed/second receipt is refused by the receipt key, so the badge cannot duplicate.
    await assert.rejects(r.db.prepare(receipts.civic).bind('civic-1', 'alice', 'rq-replay', 600, 1).run());
    assert.equal((await badges('alice')).filter(b => b.electionId === 'civic-1').length, 1);
    const body = JSON.stringify(await r.call('citizen/i-voted', 'alice'));
    assert.equal(/steady-hand|ranking|candidate|"a"|request|rq-/.test(body), false, 'the badge holds no ballot content or request ids');
    assert.deepEqual(Object.keys((await badges('alice'))[0]).sort(), ['electionId', 'kind', 'votedAt']);
  });
}
