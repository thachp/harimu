/** #1339: with HARIMU_GRACE_ALL_POLITICAL_ACTIONS_ENABLED, the nation-change grace period ends on every docs §5.2 political action.
 *  Flag off: those five sources are not consulted. A missing optional table is no action. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { enrollmentChangeSqlFor, graceAllPoliticalActionsFlag, gracePoliticalActionTaken, gracePoliticalSources, politicalActionReadSql, runGraceEnrollmentChange } from '../lib/citizenship.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = graceAllPoliticalActionsFlag;
const EXTRA = ['assembly_voter_receipts', 'primary_voter_receipts', 'aurelle_pledges', 'party_members', 'congregation_officiants'];
const enroll = (nationId, expectedNationId = null) => ({ action: 'enroll', nationId, expectedNationId });
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));

function grayFlags(file) {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('"HARIMU_GRAY_PACK"');
  const slice = text.slice(start, text.indexOf('}', start) + 1);
  return [...slice.matchAll(/"(HARIMU_[A-Z0-9_]+)"\s*:/g)].slice(1).map(match => match[1]);
}

test('the flag is last in HARIMU_GRAY_PACK, preview true and production false, and a direct string wins', () => {
  assert.equal(FLAG, 'HARIMU_GRACE_ALL_POLITICAL_ACTIONS_ENABLED');
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined, 'not a top-level binding');
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, FLAG), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, FLAG), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false, 'a direct string wins');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_WORLD_ID_ENABLED'), 82);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 83);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), FLAG);
  for (const [file, value] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) {
    const flags = grayFlags(file);
    assert.equal(flags.indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81, file);
    assert.equal(flags.indexOf('HARIMU_WORLD_ID_ENABLED'), 82, file);
    assert.equal(flags.indexOf(FLAG), 83, file);
    assert.equal(flags.at(-1), FLAG, file);
    assert.equal(flags.includes('HARIMU_LAND_TILES_ENABLED'), false, file);
    assert.equal(strip(readFileSync(file, 'utf8')).vars.HARIMU_GRAY_PACK[FLAG], value);
  }
});

test('the read and the guarded write are built from one source list', () => {
  const off = gracePoliticalSources(false), on = gracePoliticalSources(true);
  assert.deepEqual(on.filter(source => source.table).map(source => source.table), EXTRA);
  assert.equal(off.some(source => source.table), false);
  for (const sources of [off, on]) {
    const read = politicalActionReadSql(sources), write = enrollmentChangeSqlFor(sources);
    for (const source of sources) {
      const table = source.table ?? /FROM (\w+)/.exec(source.sql)[1];
      assert.match(read, new RegExp(`FROM ${table}\\b`));
      assert.match(write, new RegExp(`NOT EXISTS\\(${source.sql.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
    }
  }
  for (const table of EXTRA) {
    assert.equal(politicalActionReadSql(off).includes(table), false);
    assert.equal(enrollmentChangeSqlFor(off).includes(table), false);
  }
});

test('a missing optional table is no action and any other error is rethrown', async () => {
  const seen = [];
  const db = {
    prepare(sql) {
      seen.push(sql);
      const missing = sql.includes('assembly_voter_receipts') ? new Error('no such table: assembly_voter_receipts')
        : sql.includes('congregation_officiants') ? new Error('PostgreSQL operation failed (42P01): relation "congregation_officiants" does not exist.') : null;
      return { bind() { return this; }, async first() { if (missing) throw missing; return { political_action_taken: 0 }; }, async run() { if (missing) throw missing; return { meta: { changes: 0 } }; } };
    },
  };
  assert.equal(await gracePoliticalActionTaken(db, 'ada', true), false);
  const reads = seen.filter(sql => sql.includes('political_action_taken'));
  assert.match(reads[0], /assembly_voter_receipts/);
  assert.doesNotMatch(reads.at(-1), /assembly_voter_receipts|congregation_officiants/);
  assert.match(reads.at(-1), /primary_voter_receipts/);
  assert.match(reads.at(-1), /party_members/);
  seen.length = 0;
  await runGraceEnrollmentChange(db, true, 'korund', '2026-01-15T12:00:00.000Z', 'ada', 'kindle');
  const writes = seen.filter(sql => sql.includes('nation_changes'));
  assert.doesNotMatch(writes.at(-1), /assembly_voter_receipts|congregation_officiants/);
  assert.match(writes.at(-1), /aurelle_pledges/);
  const boom = { prepare: () => ({ bind() { return this; }, async first() { throw new Error('database is locked'); } }) };
  await assert.rejects(() => gracePoliticalActionTaken(boom, 'ada', true), /locked/);
  const core = { prepare: () => ({ bind() { return this; }, async first() { throw new Error('no such table: citizen_decisions'); } }) };
  await assert.rejects(() => gracePoliticalActionTaken(core, 'ada', false), /citizen_decisions/);
  const off = [];
  await gracePoliticalActionTaken({ prepare(sql) { off.push(sql); return { bind() { return this; }, async first() { return { political_action_taken: 0 }; } }; } }, 'ada', false);
  assert.equal(off.length, 1, 'flag off is one read');
  for (const table of EXTRA) assert.equal(off[0].includes(table), false, table);
});

const nation = (r, user) => r.db.prepare('SELECT nation_id, nation_changes FROM citizens WHERE clerk_user_id=?').bind(user).first();
async function join(r, user) { assert.equal((await r.call('citizen', user, enroll('kindle'))).status, 200, user); }
async function election(r, kind, id) {
  const table = kind === 'assembly' ? 'assembly_elections' : 'primary_elections';
  await r.db.prepare(`INSERT OR IGNORE INTO ${table} (id,nation_id,policy,opens_at,closes_at) VALUES (?,'kindle','preview-citizen-v1',0,259200)`).bind(id).run();
}
const plant = {
  async assembly(r, user, written = 1) {
    await election(r, 'assembly', 'asm-1339');
    await r.db.prepare("INSERT INTO assembly_voter_receipts (election_id,clerk_user_id,district_id,request_id,checked_at,ballot_written,policy) VALUES ('asm-1339',?,'forgehaven',?,1,?,'preview-citizen-v1')").bind(user, `rq-asm-${user}`, written).run();
  },
  async primary(r, user, written = 1) {
    await election(r, 'primary', 'pri-1339');
    await r.db.prepare("INSERT INTO primary_voter_receipts (election_id,clerk_user_id,party_id,request_id,checked_at,ballot_written,policy) VALUES ('pri-1339',?,'steady-hand',?,1,?,'preview-citizen-v1')").bind(user, `rq-pri-${user}`, written).run();
  },
  async pledge(r, user) { await r.db.prepare("INSERT INTO aurelle_pledges (clerk_user_id,claimant_id,request_id,pledged_at,policy) VALUES (?,'vaelcourt',?,1,'tier1-human-v1')").bind(user, `rq-pledge-${user}`).run(); },
  async party(r, user) { await r.db.prepare("INSERT INTO party_members (clerk_user_id,party_id,joined_at) VALUES (?,'steady-hand',1)").bind(user).run(); },
  async office(r, user) { await r.db.prepare('INSERT INTO congregation_officiants (congregation_id,user_id,since_day,seated_at) VALUES (?,?,1,1)').bind(`office-${user}`, user).run(); },
};
async function locked(r, user) {
  const read = await r.call('citizen', user);
  assert.equal(read.status, 200);
  assert.equal(read.data.profile.citizenship.lockedReason, 'political-action');
  const write = await r.call('citizen', user, enroll('korund', 'kindle'));
  assert.equal(write.status, 409);
  assert.equal(write.data.citizenship.lockedReason, 'political-action');
  const row = await nation(r, user);
  assert.equal(row.nation_id, 'kindle');
  assert.equal(row.nation_changes, 0);
}
async function changed(r, user) {
  const before = await r.call('citizen', user);
  assert.equal(before.data.profile.citizenship.lockedReason, null);
  assert.equal(before.data.profile.citizenship.canChange, true);
  const write = await r.call('citizen', user, enroll('korund', 'kindle'));
  assert.equal(write.status, 200, write.data?.error ?? write.status);
  const row = await nation(r, user);
  assert.equal(row.nation_id, 'korund');
  assert.equal(row.nation_changes, 1);
}
async function drop(r, tables) {
  for (const table of tables) r.db.sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
  await r.db.prepare('SELECT 1 AS ready').first();
}

for (const backend of ['sqlite', 'postgres']) {
  test(`flag on: each docs §5.2 source locks the read and the write (${backend})`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setFixtureEnv(FLAG, 'true');
    for (const kind of ['assembly', 'primary', 'pledge', 'party', 'office']) {
      await join(r, kind); await plant[kind](r, kind); await locked(r, kind);
    }
  });

  test(`flag on: no action, an unwritten ballot, and a left party or office can still change (${backend})`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setFixtureEnv(FLAG, 'true');
    await join(r, 'none'); await changed(r, 'none');
    await join(r, 'unchecked'); await plant.assembly(r, 'unchecked', 0); await plant.primary(r, 'unchecked', 0); await changed(r, 'unchecked');
    await join(r, 'left-party'); await plant.party(r, 'left-party');
    await r.db.prepare('DELETE FROM party_members WHERE clerk_user_id=?').bind('left-party').run();
    await changed(r, 'left-party');
    await join(r, 'left-office'); await plant.office(r, 'left-office');
    await r.db.prepare('DELETE FROM congregation_officiants WHERE user_id=?').bind('left-office').run();
    await changed(r, 'left-office');
  });

  test(`flag off: a newer source does not lock, and those tables are not consulted (${backend})`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setFixtureEnv(FLAG, 'false');
    const seen = [];
    const prepare = r.db.prepare.bind(r.db);
    r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
    await join(r, 'off'); await plant.party(r, 'off');
    assert.equal((await r.call('citizen', 'off')).data.profile.citizenship.lockedReason, null);
    await changed(r, 'off');
    const grace = seen.filter(sql => /political_action_taken|nation_changes=nation_changes\+1/.test(sql));
    assert.ok(grace.length >= 2);
    for (const table of EXTRA) assert.equal(grace.some(sql => sql.includes(table)), false, table);
  });

  test(`flag on: a missing optional table is no action, and a present source still locks (${backend})`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await join(r, 'open'); await join(r, 'member'); await plant.party(r, 'member');
    await drop(r, EXTRA.filter(table => table !== 'party_members'));
    r.setFixtureEnv(FLAG, 'true');
    assert.equal((await r.call('citizen', 'open')).status, 200);
    assert.equal((await r.call('citizen', 'open')).data.profile.citizenship.lockedReason, null);
    await changed(r, 'open');
    await locked(r, 'member');
    await drop(r, ['party_members']);
    await join(r, 'later'); await changed(r, 'later');
  });

  test(`a direct string wins over the gray pack (${backend})`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await join(r, 'packed'); await plant.office(r, 'packed');
    r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ [FLAG]: 'true' }));
    r.setFixtureEnv(FLAG, undefined);
    await locked(r, 'packed');
    await join(r, 'direct'); await plant.office(r, 'direct');
    r.setFixtureEnv(FLAG, 'false');
    await changed(r, 'direct');
  });
}
