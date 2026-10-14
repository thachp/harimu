/** #221: GET /api/election and GET /api/petitions perform no writes. Opening the preview election, closing and counting
 *  a due election, the verified-human visit and the AI Cabinet trigger happen on POSTs or the world tick; the GETs show
 *  the same values. HARIMU_TEST_STORAGE=postgres runs the same suite on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const writePattern = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
function recordWrites(r) {
  const writes = []; const prepare = r.db.prepare.bind(r.db); const batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (writePattern.test(sql)) writes.push(sql.replace(/\s+/g, ' ').slice(0, 90)); return prepare(sql); };
  r.db.batch = statements => { writes.push(`batch(${statements.length})`); return batch(statements); };
  return { writes, restore() { r.db.prepare = prepare; r.db.batch = batch; } };
}
async function readOnly(r, endpoint, user) {
  const probe = recordWrites(r);
  try { const res = await r.call(endpoint, user); assert.equal(res.status, 200, JSON.stringify(res.data)); assert.deepEqual(probe.writes, [], `GET /api/${endpoint} wrote ${JSON.stringify(probe.writes)}`); return res.data; }
  finally { probe.restore(); }
}
const eligible = (r, user) => r.setVerification(user, { userId: user, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
const count = async (r, table) => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);

for (const accountElection of [false, true]) test(`GET /api/election writes nothing: projected opening, then a due close and count (account election ${accountElection})`, async t => {
  const r = await localRuntime({ ballotPrivacyReady: !accountElection, accountElection }); t.after(() => r.close());
  eligible(r, 'alice'); const elections = accountElection ? 'poc_elections' : 'civic_elections';
  const before = await readOnly(r, 'election', 'alice');
  assert.equal(before.status, 'open'); assert.equal(before.closesAt - before.opensAt, 259200);
  assert.equal(await count(r, elections), 0, 'GET did not open the election');
  const { candidateIds } = await r.importModule('lib/elections.ts');
  const voted = await r.call('election', 'alice', { action: 'vote', electionId: before.id, requestId: randomUUID(), ranking: [...candidateIds] });
  assert.equal(voted.status, 200, JSON.stringify(voted.data)); assert.equal(await count(r, elections), 1, 'POST opens it');
  const open = await readOnly(r, 'election', 'alice');
  assert.equal(open.voted, true); assert.equal(open.closesAt, voted.data.closesAt);
  // Past the close: GET shows the closed result it used to write, without closing or counting.
  r.setNow(voted.data.closesAt * 1000 + 1000); eligible(r, 'alice');
  const closed = await readOnly(r, 'election', 'alice');
  assert.equal(closed.status, 'closed'); assert.equal(closed.result.humanBallots, 1);
  assert.equal(Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${elections} WHERE closed_at IS NOT NULL OR result_json IS NOT NULL`).first()).n), 0);
  // The world tick records the close and count; GET then shows the same result.
  await (await r.importModule('lib/world-simulation.ts')).advanceWorld(r.db, Math.floor(r.now / 1000));
  assert.equal(Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${elections} WHERE closed_at IS NOT NULL AND result_json IS NOT NULL`).first()).n), 1);
  assert.deepEqual((await readOnly(r, 'election', 'alice')).result, closed.result);
});

test('GET /api/petitions writes nothing, including a petition filed on a past day; POST records the visit', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  eligible(r, 'alice');
  // A census of 34 recent humans makes the threshold two, so one later signature does not close signing.
  const sec = Math.floor(r.now / 1000);
  for (let i = 0; i < 33; i++) { const user = `census-${i}`; await r.db.prepare("INSERT INTO citizens(clerk_user_id,nation_id,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',18,0,'Fixture',?,?)").bind(user, new Date(r.now).toISOString(), new Date(r.now).toISOString()).run(); await r.db.prepare("INSERT INTO civic_human_activity(clerk_user_id,last_seen,policy) VALUES (?,?,'tier1-human-v1')").bind(user, sec).run(); }
  const created = await r.call('petitions', 'alice', { action: 'create', requestId: randomUUID(), title: 'Repair the public waterworks', demand: 'Publish an audited plan to repair the district waterworks.' });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  // Days later, a different verified citizen who has never visited reads the list.
  r.setNow(r.now + 3 * 86400 * 1000); eligible(r, 'bob');
  const visitsBefore = await count(r, 'civic_human_activity');
  const read = await readOnly(r, 'petitions', 'bob');
  assert.equal(await count(r, 'civic_human_activity'), visitsBefore, 'GET did not record a visit');
  const pastDay = read.petitions.find(p => p.id === created.data.petitions[0].id);
  assert.ok(pastDay); assert.equal(pastDay.signatures, 1); assert.equal(pastDay.signed, false);
  // bob is counted as he will be once recorded; a POST records him and the number does not move.
  const sign = await r.call('petitions', 'bob', { action: 'sign', requestId: randomUUID(), petitionId: pastDay.id });
  assert.equal(sign.status, 200, JSON.stringify(sign.data)); assert.equal(await count(r, 'civic_human_activity'), visitsBefore + 1);
  const after = await readOnly(r, 'petitions', 'bob');
  assert.equal(after.weeklyHumans, read.weeklyHumans);
  assert.equal(sign.data.petitions.find(p => p.id === pastDay.id).status, 'awaiting-response', 'second signature reaches the threshold');
  // After its window ends the past petition reads the same way, still without writes.
  r.setNow(r.now + 8 * 86400 * 1000); eligible(r, 'bob');
  assert.equal((await readOnly(r, 'petitions', 'bob')).petitions.find(p => p.id === pastDay.id).status, 'awaiting-response');
});
