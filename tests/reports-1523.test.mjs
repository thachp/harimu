/** #1523: POST /api/reports accepts a live party or congregation message for a current member (not their own), behind the channel flags. Reuses citizen-message. No migration. SQLite and postgres. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';

const quiet = fn => async t => { t.mock.method(console, 'warn', () => {}); t.mock.method(console, 'info', () => {}); await fn(t); };
const rows = async db => (await db.prepare("SELECT reporter_id,target_kind,target_id,reason_id FROM moderation_reports ORDER BY created_at,id").all()).results.map(row => ({...row}));
const iso = r => new Date(r.now).toISOString();
const nowS = r => Math.floor(r.now / 1000);

async function setup(t, backend) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_PARTY_CHAT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_CONGREGATION_CHAT_ENABLED', 'true');
  const citizen = (user, nation = 'kindle') => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?) ON CONFLICT(clerk_user_id) DO NOTHING").bind(user, nation, `Private ${user}`, iso(r), iso(r)).run();
  const joinParty = (user, party) => r.db.prepare('INSERT INTO party_members (clerk_user_id,party_id,joined_at) VALUES (?,?,?) ON CONFLICT(clerk_user_id) DO UPDATE SET party_id=excluded.party_id').bind(user, party, nowS(r)).run();
  const joinCong = (user, congregationId, faithId = congregationId.split(':')[0], cityId = congregationId.split(':')[1]) =>
    r.db.prepare('INSERT INTO congregation_members (user_id,congregation_id,faith_id,city_id,officiant_opt_in,joined_at) VALUES (?,?,?,?,0,?) ON CONFLICT(user_id) DO UPDATE SET congregation_id=excluded.congregation_id,faith_id=excluded.faith_id,city_id=excluded.city_id').bind(user, congregationId, faithId, cityId, nowS(r)).run();
  const postParty = async (user, party, extra = {}) => {
    const id = randomUUID();
    await r.db.prepare('INSERT INTO party_messages (id,user_id,party_id,body,posted_at,deleted) VALUES (?,?,?,?,?,?)').bind(id, user, party, extra.body ?? 'hello party', nowS(r), extra.deleted ?? 0).run();
    return id;
  };
  const postCong = async (user, congregationId, extra = {}) => {
    const id = randomUUID();
    await r.db.prepare('INSERT INTO congregation_messages (id,user_id,congregation_id,body,posted_at,deleted) VALUES (?,?,?,?,?,?)').bind(id, user, congregationId, extra.body ?? 'hello hall', nowS(r), extra.deleted ?? 0).run();
    return id;
  };
  const report = (user, body) => r.call('reports', user, { requestId: randomUUID(), targetKind: 'citizen-message', reasonId: 'spam-other', ...body });
  return { r, citizen, joinParty, joinCong, postParty, postCong, report };
}

const backends = process.env.HARIMU_MUTANT_BACKENDS ? process.env.HARIMU_MUTANT_BACKENDS.split(',') : ['sqlite', 'postgres'];
for (const backend of backends) {
  test(`#1523 (${backend}): a current party member can report another member's live party message`, quiet(async t => {
    const { r, joinParty, postParty, report } = await setup(t, backend);
    await joinParty('alice', 'open-ledger'); await joinParty('bob', 'open-ledger');
    const id = await postParty('bob', 'open-ledger');
    const res = await report('alice', { targetId: id, reasonId: 'hate-harassment' });
    assert.equal(res.status, 201, 'a current party member can report another member\'s live party message');
    assert.deepEqual(res.data, { ok: true });
    assert.deepEqual(await rows(r.db), [{ reporter_id: 'alice', target_kind: 'citizen-message', target_id: id, reason_id: 'hate-harassment' }]);
  }));

  test(`#1523 (${backend}): a current congregation member can report another member's live congregation message`, quiet(async t => {
    const { r, joinCong, postCong, report } = await setup(t, backend);
    const hall = 'kinward-rite:forgehaven';
    await joinCong('alice', hall); await joinCong('bob', hall);
    const id = await postCong('bob', hall);
    const res = await report('alice', { targetId: id });
    assert.equal(res.status, 201, 'a current congregation member can report another member\'s live congregation message');
    assert.deepEqual(await rows(r.db), [{ reporter_id: 'alice', target_kind: 'citizen-message', target_id: id, reason_id: 'spam-other' }]);
  }));

  test(`#1523 (${backend}): own, deleted, a non-member, a former member, a different party, or the party flag off is 404`, quiet(async t => {
    const { r, citizen, joinParty, postParty, report } = await setup(t, backend);
    await joinParty('alice', 'open-ledger'); await joinParty('bob', 'open-ledger');
    const live = await postParty('bob', 'open-ledger');
    const own = await postParty('alice', 'open-ledger');
    const gone = await postParty('bob', 'open-ledger', { deleted: 1 });
    await citizen('carl'); await joinParty('carl', 'steady-hand');
    const other = await postParty('carl', 'steady-hand');
    await citizen('dana');
    assert.equal((await report('alice', { targetId: own })).status, 404, 'own party message is 404');
    assert.equal((await report('alice', { targetId: gone })).status, 404, 'deleted party message is 404');
    assert.equal((await report('dana', { targetId: live })).status, 404, 'a non-member is 404');
    assert.equal((await report('alice', { targetId: other })).status, 404, 'a different party is 404');
    await r.db.prepare("DELETE FROM party_members WHERE clerk_user_id='alice'").run();
    assert.equal((await report('alice', { targetId: live })).status, 404, 'a former member is 404');
    await joinParty('alice', 'open-ledger');
    r.setFixtureEnv('HARIMU_PARTY_CHAT_ENABLED', 'false');
    assert.equal((await report('alice', { targetId: live })).status, 404, 'the party flag off is 404');
    assert.deepEqual(await rows(r.db), []);
  }));

  test(`#1523 (${backend}): own, deleted, a non-member, a former member, a different congregation, or the congregation flag off is 404`, quiet(async t => {
    const { r, citizen, joinCong, postCong, report } = await setup(t, backend);
    const hall = 'kinward-rite:forgehaven', otherHall = 'open-hand:brasswell';
    await joinCong('alice', hall); await joinCong('bob', hall);
    const live = await postCong('bob', hall);
    const own = await postCong('alice', hall);
    const gone = await postCong('bob', hall, { deleted: 1 });
    await citizen('carl'); await joinCong('carl', otherHall);
    const other = await postCong('carl', otherHall);
    await citizen('dana');
    assert.equal((await report('alice', { targetId: own })).status, 404, 'own congregation message is 404');
    assert.equal((await report('alice', { targetId: gone })).status, 404, 'deleted congregation message is 404');
    assert.equal((await report('dana', { targetId: live })).status, 404, 'a non-member is 404');
    assert.equal((await report('alice', { targetId: other })).status, 404, 'a different congregation is 404');
    await r.db.prepare("DELETE FROM congregation_members WHERE user_id='alice'").run();
    assert.equal((await report('alice', { targetId: live })).status, 404, 'a former member is 404');
    await joinCong('alice', hall);
    r.setFixtureEnv('HARIMU_CONGREGATION_CHAT_ENABLED', 'false');
    assert.equal((await report('alice', { targetId: live })).status, 404, 'the congregation flag off is 404');
    assert.deepEqual(await rows(r.db), []);
  }));

  test(`#1523 (${backend}): a second report of the same party message is a duplicate; a replay of the same request id is a no-op; an eleventh report in the day is refused`, quiet(async t => {
    const { r, joinParty, postParty, report } = await setup(t, backend);
    await joinParty('alice', 'dockside-builders'); await joinParty('bob', 'dockside-builders');
    const firstId = await postParty('bob', 'dockside-builders', { body: 'one' });
    const body = { requestId: randomUUID(), targetKind: 'citizen-message', targetId: firstId, reasonId: 'spam-other' };
    assert.equal((await r.call('reports', 'alice', body)).status, 201);
    assert.equal((await r.call('reports', 'alice', body)).status, 201, 'a replay of the same request id is a no-op');
    const dup = await report('alice', { targetId: firstId, reasonId: 'hate-harassment' });
    assert.equal(dup.status, 409); assert.equal(dup.data.duplicate, true, 'a second report of the same party message is a duplicate');
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push(await postParty('bob', 'dockside-builders', { body: `m${i}` }));
    for (const id of ids.slice(0, 9)) assert.equal((await report('alice', { targetId: id })).status, 201);
    assert.equal((await report('alice', { targetId: ids[9] })).status, 429, 'an eleventh report in the day is refused');
    assert.equal((await rows(r.db)).length, 10);
  }));
}

test('#1523 mutations: dropping a membership, own-message, deleted, channel-flag, pair, duplicate or rate-cap filter is caught', () => {
  const partySql = "SELECT 1 AS ok FROM party_messages m JOIN party_members p ON p.clerk_user_id=? AND p.party_id=m.party_id WHERE m.id=? AND m.deleted=0 AND m.user_id<>?";
  const congSql = "SELECT 1 AS ok FROM congregation_messages m JOIN congregation_members c ON c.user_id=? AND c.congregation_id=m.congregation_id WHERE m.id=? AND m.deleted=0 AND m.user_id<>?";
  const cases = [
    { find: partySql, replace: "SELECT 1 AS ok FROM party_messages m WHERE m.id=? AND m.deleted=0 AND m.user_id<>? AND 1=0", pattern: "a current party member can report" },
    { find: "partyChatFlagOn(env)&&", replace: "true&&", pattern: "the party flag off is 404" },
    { find: partySql, replace: "SELECT 1 AS ok FROM party_messages m JOIN party_members p ON p.clerk_user_id=? AND p.party_id=m.party_id WHERE m.id=? AND m.deleted=0", pattern: "own, deleted, a non-member, a former member, a different party, or the party flag off is 404" },
    { find: "FROM party_messages m JOIN party_members p ON p.clerk_user_id=? AND p.party_id=m.party_id WHERE m.id=? AND m.deleted=0 AND m.user_id<>?", replace: "FROM party_messages m JOIN party_members p ON p.clerk_user_id=? AND p.party_id=m.party_id WHERE m.id=? AND m.user_id<>?", pattern: "own, deleted, a non-member, a former member, a different party, or the party flag off is 404" },
    { find: "JOIN party_members p ON p.clerk_user_id=? AND p.party_id=m.party_id", replace: "JOIN party_members p ON p.party_id=m.party_id", pattern: "a non-member, a former member" },
    { find: "JOIN party_members p ON p.clerk_user_id=? AND p.party_id=m.party_id", replace: "JOIN party_members p ON p.clerk_user_id=?", pattern: "a different party" },
    { find: congSql, replace: "SELECT 1 AS ok FROM congregation_messages m WHERE m.id=? AND m.deleted=0 AND m.user_id<>? AND 1=0", pattern: "a current congregation member can report" },
    { find: "congregationChatFlagOn(env)&&", replace: "true&&", pattern: "the congregation flag off is 404" },
    { find: congSql, replace: "SELECT 1 AS ok FROM congregation_messages m JOIN congregation_members c ON c.user_id=? AND c.congregation_id=m.congregation_id WHERE m.id=? AND m.deleted=0", pattern: "own, deleted, a non-member, a former member, a different congregation, or the congregation flag off is 404" },
    { find: "FROM congregation_messages m JOIN congregation_members c ON c.user_id=? AND c.congregation_id=m.congregation_id WHERE m.id=? AND m.deleted=0 AND m.user_id<>?", replace: "FROM congregation_messages m JOIN congregation_members c ON c.user_id=? AND c.congregation_id=m.congregation_id WHERE m.id=? AND m.user_id<>?", pattern: "own, deleted, a non-member, a former member, a different congregation, or the congregation flag off is 404" },
    { find: "JOIN congregation_members c ON c.user_id=? AND c.congregation_id=m.congregation_id", replace: "JOIN congregation_members c ON c.congregation_id=m.congregation_id", pattern: "a non-member, a former member" },
    { find: "JOIN congregation_members c ON c.user_id=? AND c.congregation_id=m.congregation_id", replace: "JOIN congregation_members c ON c.user_id=?", pattern: "a different congregation" },
    { edits: [
      { find: "if(await db.prepare('SELECT 1 AS ok FROM moderation_reports WHERE reporter_id=? AND target_kind=? AND target_id=?').bind(userId,kind,target).first())return err(409,'You already reported this.',{duplicate:true});", replace: "if(false)return err(409,'You already reported this.',{duplicate:true});" },
      { find: "if(replay)return same(replay)?{status:201,body:{ok:true}}:err(409,'Request already used.');\n return err(409,'You already reported this.',{duplicate:true});", replace: "if(replay)return same(replay)?{status:201,body:{ok:true}}:err(409,'Request already used.');\n return {status:201,body:{ok:true}};" },
    ], pattern: "a second report of the same party message is a duplicate" },
    { find: "if(!(await db.prepare(takeSlotSql).bind(userId,day,reportDailyLimit).run()).meta.changes)return err(429,`You can send up to ${reportDailyLimit} reports a day.`);", replace: "if(false)return err(429,`You can send up to ${reportDailyLimit} reports a day.`);", pattern: "an eleventh report in the day is refused" },
  ];
  // Patterns for membership-only mutants must appear in the 404 test names.
  process.env.HARIMU_MUTANT_BACKENDS = 'sqlite';
  const tree = mutantTree();
  try {
    for (const c of cases) {
      const edits = c.edits ?? [{ find: c.find, replace: c.replace }];
      const restores = edits.map(e => tree.mutate('lib/reports.ts', e.find, e.replace));
      try {
        const result = tree.run(['tests/reports-1523.test.mjs'], c.pattern);
        assert.notEqual(result.status, 0, `mutant survived (${c.pattern}):\n${result.stdout}\n${result.stderr}`);
      } finally { while (restores.length) restores.pop()(); }
    }
  } finally { tree.close(); }
});
