/** #1531: report a citizen's display name on HARIMU_REPORTS_ENABLED. SQLite and HARIMU_TEST_STORAGE=postgres. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {mutantTree} from './helpers/mutant-tree.mjs';

const REPORTS = 'HARIMU_REPORTS_ENABLED';
const report = (r, user, body) => r.call('reports', user, {requestId: randomUUID(), ...body});
const nameReport = (r, user, targetId, reasonId = 'real-world-politics') => report(r, user, {targetKind: 'citizen-name', targetId, reasonId});
const stored = async db => (await db.prepare('SELECT reporter_id,target_kind,target_id,reason_id,note,target_snapshot FROM moderation_reports ORDER BY created_at,id').all()).results.map(row => ({...row}));
const setName = (r, user, name) => r.db.prepare('UPDATE citizens SET display_name=? WHERE clerk_user_id=?').bind(name, user).run();

test('migration 0138 keeps existing rows, widens target_kind and keys citizen-name uniqueness on the snapshot', async () => {
  const kept = "INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at,target_snapshot) VALUES ('row-1','req-1','alice','citizen-message','11111111-1111-4111-8111-111111111111','hate-harassment','kept',10,NULL)";
  const next = (id, request, kind, target, snapshot) => `INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at,target_snapshot) VALUES ('${id}','${request}','alice','${kind}','${target}','spam-other',NULL,11,${snapshot === null ? 'NULL' : `'${snapshot}'`})`;
  const {DatabaseSync} = await import('node:sqlite');
  const lite = new DatabaseSync(':memory:');
  for (const f of ['drizzle/0070_moderation_reports.sql', 'drizzle/0133_report_ai_targets.sql', 'drizzle/0135_report_square_poster.sql']) lite.exec(readFileSync(f, 'utf8'));
  lite.exec(kept);
  assert.throws(() => lite.exec(next('nope', 'req-x', 'citizen-name', 'bob', 'Ada Shore')));
  lite.exec(readFileSync('drizzle/0138_report_citizen_name.sql', 'utf8'));
  lite.exec(next('row-2', 'req-2', 'citizen-name', 'bob', 'Ada Shore'));
  lite.exec(next('row-3', 'req-3', 'citizen-name', 'bob', 'Bea Vale'));
  assert.throws(() => lite.exec(next('dup-name', 'req-4', 'citizen-name', 'bob', 'Ada Shore')));
  assert.throws(() => lite.exec(next('dup-msg', 'req-5', 'citizen-message', '11111111-1111-4111-8111-111111111111', 'ignored')));
  assert.throws(() => lite.exec(next('bad', 'req-6', 'name', 'bob', 'x')));
  assert.deepEqual(lite.prepare('SELECT id,target_kind,target_id,note,target_snapshot FROM moderation_reports ORDER BY id').all().map(row => ({...row})), [
    {id: 'row-1', target_kind: 'citizen-message', target_id: '11111111-1111-4111-8111-111111111111', note: 'kept', target_snapshot: null},
    {id: 'row-2', target_kind: 'citizen-name', target_id: 'bob', note: null, target_snapshot: 'Ada Shore'},
    {id: 'row-3', target_kind: 'citizen-name', target_id: 'bob', note: null, target_snapshot: 'Bea Vale'},
  ]);
  assert.ok(lite.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_moderation_reports_reporter'").get());
  assert.ok(lite.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_moderation_reports_target'").get());
  assert.ok(lite.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_moderation_reports_citizen_name'").get());
  const {PGlite} = await import('@electric-sql/pglite');
  const pg = new PGlite(); await pg.waitReady;
  for (const f of ['db/postgres/0070_moderation_reports.sql', 'db/postgres/0133_report_ai_targets.sql', 'db/postgres/0135_report_square_poster.sql']) await pg.exec(readFileSync(f, 'utf8'));
  await pg.exec(kept);
  await assert.rejects(pg.exec(next('nope', 'req-x', 'citizen-name', 'bob', 'Ada Shore')));
  await pg.exec(readFileSync('db/postgres/0138_report_citizen_name.sql', 'utf8'));
  await pg.exec(next('row-2', 'req-2', 'citizen-name', 'bob', 'Ada Shore'));
  await pg.exec(next('row-3', 'req-3', 'citizen-name', 'bob', 'Bea Vale'));
  await assert.rejects(pg.exec(next('dup-name', 'req-4', 'citizen-name', 'bob', 'Ada Shore')));
  await assert.rejects(pg.exec(next('dup-msg', 'req-5', 'citizen-message', '11111111-1111-4111-8111-111111111111', 'ignored')));
  await assert.rejects(pg.exec(next('bad', 'req-6', 'name', 'bob', 'x')));
  assert.deepEqual((await pg.query('SELECT id,target_kind,target_id,note,target_snapshot FROM moderation_reports ORDER BY id')).rows, [
    {id: 'row-1', target_kind: 'citizen-message', target_id: '11111111-1111-4111-8111-111111111111', note: 'kept', target_snapshot: null},
    {id: 'row-2', target_kind: 'citizen-name', target_id: 'bob', note: null, target_snapshot: 'Ada Shore'},
    {id: 'row-3', target_kind: 'citizen-name', target_id: 'bob', note: null, target_snapshot: 'Bea Vale'},
  ]);
  const idx = (await pg.query("SELECT indexname FROM pg_indexes WHERE tablename='moderation_reports'")).rows.map(r => r.indexname);
  for (const name of ['idx_moderation_reports_reporter', 'idx_moderation_reports_target', 'idx_moderation_reports_citizen_name']) assert.ok(idx.includes(name), name);
  await pg.close();
});

for (const backend of ['sqlite', 'postgres']) {
  test(`#1531 (${backend}): stores target id and snapshot, a rename can be reported again, self and unknown are 404, AI-only reason refused`, async t => {
    const r = await localRuntime({backend}); t.after(() => r.close());
    r.setFixtureEnv(REPORTS, 'true');
    await setName(r, 'bob', '  Ada Shore  ');
    await r.call('city', 'bob');
    const city = await r.call('city', 'alice');
    assert.equal(city.status, 200);
    assert.equal(city.data.reportsEnabled, true);
    const humans = city.data.coResidents.filter(x => x.kind === 'human');
    const self = humans.find(x => x.you), other = humans.find(x => !x.you);
    assert.equal('id' in self, false);
    assert.equal(other.id, 'bob');
    assert.equal(other.name, 'Ada Shore');
    assert.ok(city.data.coResidents.filter(x => x.kind === 'ai').every(x => !('id' in x)));
    const body = {requestId: randomUUID(), targetKind: 'citizen-name', targetId: 'bob', reasonId: 'real-world-politics', note: '  a real-world name  '};
    assert.equal((await r.call('reports', 'alice', body)).status, 201);
    assert.equal((await r.call('reports', 'alice', body)).status, 201, 'replay');
    const dup = await nameReport(r, 'alice', 'bob');
    assert.equal(dup.status, 409); assert.equal(dup.data.duplicate, true);
    await setName(r, 'bob', 'Bea Vale');
    const renamed = await nameReport(r, 'alice', 'bob', 'hate-harassment');
    assert.equal(renamed.status, 201, 'a different name can be reported again');
    assert.deepEqual((await stored(r.db)).sort((a, b) => a.target_snapshot.localeCompare(b.target_snapshot)), [
      {reporter_id: 'alice', target_kind: 'citizen-name', target_id: 'bob', reason_id: 'real-world-politics', note: 'a real-world name', target_snapshot: 'Ada Shore'},
      {reporter_id: 'alice', target_kind: 'citizen-name', target_id: 'bob', reason_id: 'hate-harassment', note: null, target_snapshot: 'Bea Vale'},
    ]);
    const listed = await (await r.importModule('lib/reports.ts')).listModerationReports(r.db);
    assert.deepEqual(new Set(listed.map(row => row.target_snapshot)), new Set(['Ada Shore', 'Bea Vale']));
    await setName(r, 'alice', 'Self Name');
    assert.equal((await nameReport(r, 'alice', 'alice')).status, 404);
    assert.equal((await nameReport(r, 'alice', 'nobody')).status, 404);
    assert.equal((await nameReport(r, 'alice', 'bob', 'ai-inappropriate')).status, 400);
    await r.db.prepare("UPDATE citizens SET display_name=NULL WHERE clerk_user_id='bob'").run();
    assert.equal((await nameReport(r, 'alice', 'bob')).status, 201);
    assert.ok((await stored(r.db)).some(row => row.target_id === 'bob' && row.target_snapshot === 'Citizen'));
  });

  test(`#1531 (${backend}): daily cap still applies across renames; flag off omits ids and 404s`, async t => {
    const r = await localRuntime({backend}); t.after(() => r.close());
    r.setFixtureEnv(REPORTS, 'true');
    for (let i = 1; i <= 10; i++) {
      await setName(r, 'bob', `Name ${i}`);
      assert.equal((await nameReport(r, 'alice', 'bob')).status, 201, `slot ${i}`);
    }
    await setName(r, 'bob', 'Name 11');
    assert.equal((await nameReport(r, 'alice', 'bob')).status, 429);
    r.setFixtureEnv(REPORTS, 'false');
    await r.call('city', 'bob');
    const city = await r.call('city', 'alice');
    assert.equal('reportsEnabled' in city.data, false);
    for (const row of city.data.coResidents) assert.equal('id' in row, false);
    assert.equal((await nameReport(r, 'alice', 'bob')).status, 404);
  });
}

test('#1531 copy, neighborhood wiring, and the button only on other humans with an id', async () => {
  const {reasonsFor, reportTargetFor} = await import('../lib/report-copy.ts');
  const target = reportTargetFor('citizen-name');
  assert.equal(target.entryLabel, 'Report this name');
  assert.equal(target.accessibleName, 'Report this citizen name to Harimu moderators');
  assert.equal(target.proposal, true);
  assert.equal(target.aiTarget, false);
  assert.equal(reasonsFor('citizen-name').length, 5);
  assert.equal(reasonsFor('citizen-name').some(r => r.id === 'ai-inappropriate'), false);
  const walk = readFileSync('app/neighborhood-walk.tsx', 'utf8');
  assert.match(walk, /kind="citizen-name"/);
  assert.match(walk, /resident\.kind==='human'&&!resident\.you&&resident\.id\?<ReportButton kind="citizen-name" targetId=\{resident\.id\}\/>/);
  assert.match(walk, /person\.kind==='human'&&!person\.you&&person\.id\?<ReportButton kind="citizen-name" targetId=\{person\.id\}\/>/);
});

test('#1531 mutations: same name still 409, a rename is 201, snapshot, self, unknown, cap, AI reason, and the button gate all fail', () => {
  const file = 'tests/reports-1531.test.mjs';
  const cases = [
    {
      file: 'lib/reports.ts',
      find: "const already=kind==='citizen-name'\n  ?await db.prepare('SELECT 1 AS ok FROM moderation_reports WHERE reporter_id=? AND target_kind=? AND target_id=? AND target_snapshot=?').bind(userId,kind,target,snapshot).first()\n  :await db.prepare('SELECT 1 AS ok FROM moderation_reports WHERE reporter_id=? AND target_kind=? AND target_id=?').bind(userId,kind,target).first();",
      replace: "const already=await db.prepare('SELECT 1 AS ok FROM moderation_reports WHERE reporter_id=? AND target_kind=? AND target_id=?').bind(userId,kind,target).first();",
      pattern: 'a rename can be reported again',
    },
    {
      file: 'lib/reports.ts',
      find: "kind==='citizen-name'?await citizenNameSnapshot(db,userId,target):null",
      replace: "kind==='citizen-name'?null:null",
      pattern: 'stores target id and snapshot',
    },
    {
      file: 'lib/reports.ts',
      find: 'if(targetId===userId.toLowerCase())return null;\n',
      replace: '',
      pattern: 'self and unknown are 404',
    },
    {
      file: 'lib/reports.ts',
      find: 'if(!row)return null;\n',
      replace: "if(!row)return 'Citizen';\n",
      pattern: 'self and unknown are 404',
    },
    {
      file: 'lib/reports.ts',
      find: '.bind(userId,day,reportDailyLimit)',
      replace: '.bind(userId,day,99)',
      pattern: 'daily cap still applies',
    },
    {
      file: 'lib/reports.ts',
      find: 'reasonsFor(kind).some(r=>r.id===reasonId)',
      replace: 'reportReasons.some(r=>r.id===reasonId)',
      pattern: 'AI-only reason refused',
    },
    {
      file: 'app/neighborhood-walk.tsx',
      find: "person.kind==='human'&&!person.you&&person.id?<ReportButton kind=\"citizen-name\" targetId={person.id}/>:null",
      replace: 'true?<ReportButton kind="citizen-name" targetId={person.id||"x"}/>:null',
      pattern: 'neighborhood wiring, and the button only on other humans',
    },
  ];
  const tree = mutantTree(); // #1480: never mutate the shared tree that parallel test files read
  try {
    for (const c of cases) {
      const steps = c.finds ?? [[c.find, c.replace]];
      const restores = [];
      try {
        for (const [find, replace] of steps) restores.push(tree.mutate(c.file, find, replace));
        const result = tree.run([file], c.pattern);
        assert.notEqual(result.status, 0, `mutant survived (${JSON.stringify(steps)}):\n${result.stdout}\n${result.stderr}`);
      } finally { while (restores.length) restores.pop()(); }
    }
  } finally { tree.close(); }
});
