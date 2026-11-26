/** #1505: an AI leader embargoes a nation that broke a treaty with it. No migration. HARIMU_AI_TREATY_EMBARGO_ENABLED is last at index 102, after treaty break (#1507, index 101). */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { aiEmbargoCandidates, aiEmbargoGrievanceWindowSeconds, aiEmbargoLifts, aiEmbargoRefusalCooldownSeconds, aiEmbargoRequestId, embargoRequestIdOk } from '../lib/embargo-rules.ts';
import { grievanceConfig } from '../lib/war-rules.ts';
import { treatyAiLeaders, treatySlot } from '../lib/diplomacy-rules.ts';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';

const FLAG = 'HARIMU_AI_TREATY_EMBARGO_ENABLED';
const WINDOW = aiEmbargoGrievanceWindowSeconds;
const brk = (over) => ({ kind: 'non-aggression', status: 'broken', proposer: 'kindle', other: 'aurelle', brokenBy: 'aurelle', endedAt: 100, ...over });
const live = (over) => ({ proposer: 'kindle', other: 'aurelle', kind: 'non-aggression', status: 'in_force', endsAt: 2_000_000, ...over });
const key = (row) => `${row.actor}>${row.target}@${row.endedAt}`;

describe('#1505', { concurrency: 1 }, () => {
  test('pure: trigger, window, self-break, live embargo, cooldown, treaty suppress, order, and lifts', () => {
    assert.equal(WINDOW, 30 * 86400);
    assert.equal(WINDOW, grievanceConfig.borderIncidentWindowSeconds);
    assert.equal(aiEmbargoRefusalCooldownSeconds, 3 * 86400);
    assert.equal(embargoRequestIdOk(aiEmbargoRequestId(3, 'kindle', 'aurelle')), true);
    const now = 1_000_000;
    const edge = now - WINDOW;
    const list = (breaks, embargoes = [], treaties = []) => aiEmbargoCandidates(now, breaks, embargoes, treaties);
    assert.deepEqual(list([brk({ endedAt: edge })]).map(key), ['kindle>aurelle@' + edge], 'break at the window edge counts');
    assert.deepEqual(list([brk({ endedAt: now })]).map(key), ['kindle>aurelle@' + now]);
    assert.deepEqual(list([brk({ kind: 'trade', endedAt: edge })]).map(key), ['kindle>aurelle@' + edge]);
    assert.deepEqual(list([brk({ endedAt: edge - 1 })]), [], 'a break older than the window yields none');
    assert.deepEqual(list([brk({ endedAt: now + 1 })]), []);
    assert.deepEqual(list([brk({ status: 'expired' })]), []);
    assert.deepEqual(list([brk({ brokenBy: 'kindle' })]).map(key), ['aurelle>kindle@100'], 'a break by the actor is not a candidate for that actor');
    assert.deepEqual(list([brk()], [{ actor: 'kindle', target: 'aurelle', status: 'proposed' }]), []);
    assert.deepEqual(list([brk()], [{ actor: 'kindle', target: 'aurelle', status: 'in_force' }]), []);
    assert.deepEqual(list([brk()], [{ actor: 'aurelle', target: 'kindle', status: 'in_force' }]).map(key), ['kindle>aurelle@100'], 'the other direction stays open');
    assert.deepEqual(list([brk()], [{ actor: 'kindle', target: 'aurelle', status: 'lifted' }]).map(key), ['kindle>aurelle@100']);
    const since = now - aiEmbargoRefusalCooldownSeconds;
    assert.deepEqual(list([brk()], [{ actor: 'kindle', target: 'aurelle', status: 'rejected', decidedAt: since + 1 }]), [], 'a refusal inside the cooldown yields none');
    assert.deepEqual(list([brk()], [{ actor: 'kindle', target: 'aurelle', status: 'rejected', decidedAt: since }]).map(key), ['kindle>aurelle@100'], 'refusal exactly at the cooldown edge does not block');
    assert.deepEqual(list([brk()], [{ actor: 'aurelle', target: 'kindle', status: 'rejected', decidedAt: since + 1 }]).map(key), ['kindle>aurelle@100']);
    assert.deepEqual(list([brk()], [], [live()]), [], 'an in-force treaty suppresses re-proposal');
    assert.deepEqual(list([brk()], [], [live({ proposer: 'aurelle', other: 'kindle', kind: 'trade' })]), []);
    assert.deepEqual(list([brk()], [], [live({ status: 'proposed' })]).map(key), ['kindle>aurelle@100']);
    assert.deepEqual(list([brk()], [], [live({ endsAt: now })]).map(key), ['kindle>aurelle@100'], 'a treaty whose term has ended does not suppress');
    const ordered = list([
      brk({ proposer: 'aurelle', other: 'korund', brokenBy: 'korund', endedAt: 10 }),
      brk({ proposer: 'aurelle', other: 'kindle', brokenBy: 'kindle', endedAt: 10 }),
      brk({ proposer: 'korund', other: 'kindle', brokenBy: 'kindle', endedAt: 5 }),
      brk({ proposer: 'korund', other: 'kindle', brokenBy: 'kindle', endedAt: 20 }),
    ]);
    assert.deepEqual(ordered.map(key), ['korund>kindle@5', 'aurelle>kindle@10', 'aurelle>korund@10'], 'oldest break is first');
    assert.deepEqual(list([brk()]).map(key), list([brk()]).map(key));
    const lifts = (embargoes, breaks, treaties = []) => aiEmbargoLifts(now, embargoes, breaks, treaties).map(row => row.id);
    const row = (id, actor, target) => ({ id, actor, target, status: 'in_force' });
    assert.deepEqual(lifts([row('e1', 'kindle', 'aurelle')], [brk({ endedAt: edge })]), [], 'a break at the window edge does not lift');
    assert.deepEqual(lifts([row('e1', 'kindle', 'aurelle')], [brk({ endedAt: now + 1 })]), [], 'a future break does not lift');
    assert.deepEqual(lifts([row('e1', 'kindle', 'aurelle')], [brk({ endedAt: edge - 1 })]), ['e1'], 'a break older than the window lifts');
    assert.deepEqual(lifts([row('e1', 'kindle', 'aurelle')], [brk({ endedAt: edge - 1 }), brk({ endedAt: now - 10 })]), [], 'one fresh break keeps the embargo');
    assert.deepEqual(lifts([row('e1', 'kindle', 'aurelle')], [brk()], [live()]), ['e1'], 'a new in-force treaty lifts');
    assert.deepEqual(lifts([row('e1', 'kindle', 'aurelle')], [brk()], [live({ status: 'proposed' })]), []);
    assert.deepEqual(lifts([row('e1', 'kindle', 'aurelle')], [brk({ brokenBy: 'kindle' })]), ['e1'], 'the imposer breaking it does not keep the embargo');
    assert.deepEqual(lifts([{ id: 'e2', actor: 'kindle', target: 'aurelle', status: 'proposed' }], []), []);
    assert.deepEqual(lifts([row('e-k', 'korund', 'aurelle'), row('e-a', 'aurelle', 'kindle')], []), ['e-a', 'e-k']);
  });

  test('the flag is preview true, production false, and last at index 102 after treaty break', () => {
    assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_TREATY_BREAK_ENABLED'), 101);
    assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 102);
    assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), FLAG_PACKS.HARIMU_GRAY_PACK.length - 1);
    const preview = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    const prod = JSON.parse(readFileSync('wrangler.prod.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
    assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
    assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 102);
    assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 102);
    assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG), Object.keys(preview.vars.HARIMU_GRAY_PACK).length - 1);
    const cron = readFileSync('lib/diplomacy.ts', 'utf8');
    const body = cron.slice(cron.indexOf('export async function runDiplomacyCron'));
    assert.ok(body.indexOf('breakDueNonAggressionPacts') >= 0 && body.indexOf('breakDueNonAggressionPacts') < body.indexOf('runAiTreatyEmbargo'), 'treaty break runs before the AI embargo in the same cron pass');
    assert.doesNotMatch(readFileSync('app/api/world/route.ts', 'utf8'), /runAiTreatyEmbargoes|aiEmbargoCandidates/);
    assert.doesNotMatch(readFileSync('app/api/citizen/route.ts', 'utf8'), /runAiTreatyEmbargoes/);
    assert.doesNotMatch(readFileSync('app/api/news/route.ts', 'utf8'), /runAiTreatyEmbargoes/);
    assert.match(readFileSync('lib/diplomacy.ts', 'utf8'), /bindAiTreatyEmbargoes/);
    assert.match(readFileSync('worker/entry.ts', 'utf8'), /runDiplomacyCron\(await getDatabase\(\)/);
    assert.match(readFileSync('worker/entry.ts', 'utf8'), /HARIMU_AI_TREATY_EMBARGO_ENABLED\?: string; HARIMU_GRAY_PACK\?: unknown/);
    assert.match(readFileSync('lib/embargo.ts', 'utf8'), /worldReputationBreaksSql/);
    assert.match(readFileSync('lib/embargo.ts', 'utf8'), /\[ASSUMPTION\] docs §8\.3/);
  });

  for (const backend of ['sqlite', 'postgres']) {
    test(`#1505 (${backend}): cron proposes one embargo, decides it, blocks trade, lifts, and a repeated slot writes nothing`, async t => {
      const r = await localRuntime({ backend }); t.after(() => r.close());
      const d = await r.importModule('lib/diplomacy.ts');
      const e = await r.importModule('lib/embargo.ts');
      const war = await r.importModule('lib/war.ts');
      const t0 = Math.floor(r.now / 1000);
      const rows = async () => (await r.db.prepare('SELECT * FROM embargoes ORDER BY proposed_at, id').all()).results;
      const breakNap = async (proposer, other, breaker, at) => {
        const res = await d.proposeTreaty(r.db, { proposer, other, kind: 'non-aggression', proposedBy: 'AI leader', requestId: randomUUID() }, at, { enabled: true });
        assert.equal(res.ok, true, JSON.stringify(res));
        await d.runDiplomacy(r.db, at);
        const broken = await d.breakTreaty(r.db, { treatyId: res.treaty.id, breaker }, at + 5, true);
        assert.equal(broken.ok, true, JSON.stringify(broken));
        return at + 5;
      };
      await breakNap('korund', 'aurelle', 'aurelle', t0);
      const newer = await breakNap('kindle', 'korund', 'korund', t0 + 100);
      const agedAt = newer - WINDOW - 1;
      await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES ('t-aged','req-aged-1505','aurelle:kindle','trade','kindle','aurelle','AI',1,'broken',1,1,?,?,'aurelle')").bind(agedAt + 100, agedAt).run();
      await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES ('t-ai-aged','req-ai-aged-1505','kindle:korund','non-aggression','korund','kindle','AI',1,'broken',1,1,?,?,'kindle')").bind(agedAt + 100, agedAt).run();
      await r.db.prepare("INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at) VALUES ('e-aged','req-embargo-aged','aurelle:kindle','kindle','aurelle',?,1,'in_force',1,1)").bind(treatyAiLeaders.kindle).run();
      await r.db.prepare("INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at) VALUES ('e-ai-aged','ai-embargo-aged','kindle:korund','korund','kindle',?,1,'in_force',1,1)").bind(treatyAiLeaders.korund).run();
      const packed = { HARIMU_DIPLOMACY_ENABLED: 'true', HARIMU_EMBARGO_ENABLED: 'true', HARIMU_GRAY_PACK: { [FLAG]: 'true' } };
      const off = [
        {},
        { HARIMU_DIPLOMACY_ENABLED: 'true', HARIMU_EMBARGO_ENABLED: 'true', [FLAG]: 'false' },
        { HARIMU_DIPLOMACY_ENABLED: 'false', HARIMU_EMBARGO_ENABLED: 'true', [FLAG]: 'true' },
        { HARIMU_DIPLOMACY_ENABLED: 'true', HARIMU_EMBARGO_ENABLED: 'false', [FLAG]: 'true' },
        { HARIMU_DIPLOMACY_ENABLED: 'true', HARIMU_EMBARGO_ENABLED: 'true', HARIMU_GRAY_PACK: { [FLAG]: 'false' } },
      ];
      for (const bindings of off) {
        assert.equal((await e.runAiTreatyEmbargoes(r.db, newer, { enabled: false })).status, 'disabled');
        await d.runDiplomacyCron(r.db, newer, bindings);
      }
      assert.equal((await rows()).length, 2);
      assert.ok((await rows()).every(row => row.status === 'in_force'), 'flag off writes no embargo');
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_EMBARGO_ENABLED', 'true');
      r.setFixtureEnv(FLAG, 'true');
      const prepare = r.db.prepare.bind(r.db), writes = [];
      r.db.prepare = sql => { if (/^\s*insert\s+into\s+embargoes\b/i.test(sql)) writes.push(sql); return prepare(sql); };
      try { await r.call('world', null); await r.call('citizen', 'alice'); await r.call('news', 'alice'); }
      finally { r.db.prepare = prepare; }
      assert.deepEqual(writes, [], 'no GET route writes an embargo');
      assert.ok((await rows()).every(row => row.status === 'in_force'));
      await d.runDiplomacyCron(r.db, newer, packed);
      const slot = treatySlot(newer);
      const proposed = (await rows()).find(row => row.request_id === aiEmbargoRequestId(slot, 'korund', 'aurelle'));
      assert.ok(proposed, 'only the oldest candidate is proposed');
      assert.equal(proposed.proposed_by, treatyAiLeaders.korund);
      assert.equal(proposed.status, 'proposed');
      assert.equal((await rows()).find(row => row.id === 'e-aged').status, 'in_force', 'a non-AI embargo stays in force');
      assert.equal((await rows()).find(row => row.id === 'e-ai-aged').status, 'lifted', 'an aged ai-embargo is lifted');
      await d.runDiplomacyCron(r.db, newer + 10, packed);
      assert.equal((await rows()).filter(row => String(row.request_id).startsWith(`ai-embargo-${slot}-`)).length, 1, 'only one embargo is proposed per slot');
      await e.runEmbargo(r.db, newer + 20);
      const imposed = (await rows()).find(row => row.id === proposed.id);
      assert.equal(imposed.status, 'in_force');
      assert.deepEqual(JSON.parse(imposed.ratification_json).map(item => [item.body, item.rule, item.passed]), [['Chairman', 'sole', true]]);
      const shown = (await e.readEmbargoes(r.db)).embargoes.find(row => row.id === proposed.id);
      assert.equal(shown.status, 'in-force');
      assert.equal((await war.readGrievanceInputs(r.db, 'aurelle', 'korund')).embargoAgainstUs, true);
      assert.equal((await war.readGrievanceInputs(r.db, 'korund', 'aurelle')).embargoAgainstUs, false);
      await r.db.prepare("DELETE FROM treaties WHERE kind='trade' AND status='proposed'").run();
      const blocked = await d.proposeTreaty(r.db, { proposer: 'korund', other: 'aurelle', kind: 'trade', proposedBy: 'AI leader', requestId: randomUUID() }, newer + 30, { enabled: true, embargo: true });
      assert.equal(blocked.reason, 'embargo');
      await r.db.prepare("DELETE FROM treaties WHERE status='proposed'").run();
      const nap = await d.proposeTreaty(r.db, { proposer: 'korund', other: 'aurelle', kind: 'non-aggression', proposedBy: 'AI leader', requestId: randomUUID() }, newer + 40, { enabled: true });
      assert.equal(nap.ok, true, JSON.stringify(nap));
      await d.runDiplomacy(r.db, newer + 40);
      await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES ('w-1505','war-req-1505-01','kindle:korund','kindle','korund','AI',?,?)").bind(newer, newer + 172800).run();
      const later = newer + 86400;
      await d.runDiplomacyCron(r.db, later, packed);
      assert.equal((await rows()).find(row => row.id === proposed.id).status, 'lifted', 'a new in-force treaty lifts');
      const second = (await rows()).find(row => row.request_id === aiEmbargoRequestId(treatySlot(later), 'kindle', 'korund'));
      assert.ok(second, 'an open war still gets an embargo');
      assert.equal((await rows()).some(row => row.request_id === aiEmbargoRequestId(treatySlot(later), 'korund', 'aurelle')), false, 'an in-force treaty suppresses re-proposal');
      await e.runEmbargo(r.db, later + 5);
      const refused = (await rows()).find(row => row.id === second.id);
      assert.equal(refused.status, 'rejected');
      assert.deepEqual(JSON.parse(refused.ratification_json)[0], { nation: 'kindle', body: 'Assembly', passed: false, rule: 'simple-majority', yes: 5, total: 18 });
      await r.db.prepare("DELETE FROM treaties WHERE kind='trade' AND status='proposed'").run();
      assert.equal((await d.proposeTreaty(r.db, { proposer: 'korund', other: 'aurelle', kind: 'trade', proposedBy: 'AI leader', requestId: randomUUID() }, later + 6, { enabled: true, embargo: true })).ok, true, 'trade opens again after the lift');
      assert.equal((await rows()).find(row => row.id === 'e-aged').status, 'in_force');
    });

    test(`#1505 (${backend}): more than 20 breaks still proposes the uncapped in-window break`, async t => {
      const r = await localRuntime({ backend }); t.after(() => r.close());
      const d = await r.importModule('lib/diplomacy.ts');
      const now = Math.floor(r.now / 1000);
      const insert = (id, ended, breaker, proposer, other) => r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES (?,?,?,'non-aggression',?,?,'AI',1,'broken',1,1,?,?,?)")
        .bind(id, `req-cap-${id}`, [proposer, other].sort().join(':'), proposer, other, ended + 10, ended, breaker).run();
      for (let i = 0; i < 21; i++) await insert(`f${i}`, now + 1000 + i, 'korund', 'kindle', 'korund');
      await insert('qual', now - 10, 'aurelle', 'kindle', 'aurelle');
      await d.runDiplomacyCron(r.db, now, { HARIMU_DIPLOMACY_ENABLED: 'true', HARIMU_EMBARGO_ENABLED: 'true', HARIMU_GRAY_PACK: { [FLAG]: 'true' } });
      const want = aiEmbargoRequestId(treatySlot(now), 'kindle', 'aurelle');
      const found = (await r.db.prepare('SELECT request_id FROM embargoes').all()).results.some(row => row.request_id === want);
      assert.equal(found, true, 'more than 20 breaks still proposes the uncapped in-window break');
    });

    test(`#1505 (${backend}): one cron pass breaks the NAP before the embargo decision, so the break keeps the AI embargo`, async t => {
      const r = await localRuntime({ backend }); t.after(() => r.close());
      const d = await r.importModule('lib/diplomacy.ts');
      await r.importModule('lib/embargo.ts');
      const now = Math.floor(r.now / 1000);
      const ends = now + 90 * 86400;
      await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES ('t-order','req-order-1505','aurelle:kindle','non-aggression','kindle','aurelle',?,?,'in_force',?,?,?,NULL,NULL)").bind(treatyAiLeaders.kindle, now - 10, now - 10, now - 10, ends).run();
      await r.db.prepare("INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at) VALUES ('e-order','ai-embargo-order','aurelle:kindle','kindle','aurelle',?,?,'in_force',?,?)").bind(treatyAiLeaders.kindle, now - 8, now - 8, now - 8).run();
      await d.runDiplomacyCron(r.db, now, { HARIMU_DIPLOMACY_ENABLED: 'true', HARIMU_EMBARGO_ENABLED: 'true', HARIMU_TREATY_BREAK_ENABLED: 'true', HARIMU_GRAY_PACK: { [FLAG]: 'true' } });
      const treaty = await r.db.prepare("SELECT status, broken_by, ended_at FROM treaties WHERE id='t-order'").first();
      const embargo = await r.db.prepare("SELECT status FROM embargoes WHERE id='e-order'").first();
      assert.equal(treaty.status, 'broken', 'the cron breaks the NAP');
      assert.equal(treaty.broken_by, 'aurelle');
      assert.equal(Number(treaty.ended_at), now);
      assert.equal(embargo.status, 'in_force', 'the break recorded this pass is visible, so the AI embargo stays');
    });
  }

  test('#1505 mutations: window, cooldown, suppress, lift, actor swap, flag guard and slot guard', () => {
    const pure = 'pure: trigger';
    const cron = 'cron proposes one embargo';
    const cases = [
      { file: 'lib/embargo-rules.ts', find: 'now - endedAt <= aiEmbargoGrievanceWindowSeconds', replace: 'now - endedAt < aiEmbargoGrievanceWindowSeconds', pattern: pure },
      { file: 'lib/embargo-rules.ts', find: 'row.decidedAt > now - aiEmbargoRefusalCooldownSeconds', replace: 'row.decidedAt >= now - aiEmbargoRefusalCooldownSeconds', pattern: pure },
      { file: 'lib/embargo-rules.ts', find: 'if (!sides || blocked(embargoes, sides.actor, sides.target, now) || settled(treaties, sides.actor, sides.target, now)) continue;', replace: 'if (!sides || blocked(embargoes, sides.actor, sides.target, now)) continue;', pattern: pure },
      { file: 'lib/embargo-rules.ts', find: 'if (!fresh || settled(treaties, row.actor, row.target, now))', replace: 'if (!fresh && settled(treaties, row.actor, row.target, now))', pattern: pure },
      { file: 'lib/embargo-rules.ts', find: 'return isTreatyNation(actor) && actor !== row.brokenBy ? { actor, target: row.brokenBy } : null;', replace: 'return isTreatyNation(actor) && actor !== row.brokenBy ? { actor: row.brokenBy, target: actor } : null;', pattern: pure },
      { file: 'lib/embargo-rules.ts', find: 'a.endedAt - b.endedAt', replace: 'b.endedAt - a.endedAt', pattern: pure },
      { file: 'lib/embargo.ts', find: 'if (!options.enabled) return { status: \'disabled\' as const, proposed: false, lifted: 0 };', replace: 'if (false) return { status: \'disabled\' as const, proposed: false, lifted: 0 };', pattern: cron },
      { file: 'lib/diplomacy.ts', find: 'flagOn(bindings, \'HARIMU_AI_TREATY_EMBARGO_ENABLED\')', replace: 'true', pattern: cron },
      { file: 'lib/embargo.ts', find: 'if (taken) return { status: \'ok\' as const, proposed: false, lifted: liftedIds.size };', replace: 'if (false) return { status: \'ok\' as const, proposed: false, lifted: liftedIds.size };', pattern: cron },
      { file: 'lib/embargo.ts', find: ".filter(row => row.requestId?.startsWith('ai-embargo-'))", replace: '.filter(() => true)', pattern: cron },
      { file: 'lib/embargo-rules.ts', find: 'endedAt > now || inWindow(now, endedAt)', replace: 'inWindow(now, endedAt)', pattern: pure },
      { file: 'lib/diplomacy-rules.ts', find: 'GROUP BY broken_by, kind, id, proposer_nation, other_nation, ended_at', replace: 'GROUP BY broken_by, kind, id, proposer_nation, other_nation, ended_at ORDER BY ended_at DESC LIMIT 20', pattern: 'more than 20 breaks' },
    ];
    const tree = mutantTree(); // #1508: mutants stay in a private copy so parallel shards do not compile them
    try {
      for (const c of cases) {
        const restore = tree.mutate(c.file, c.find, c.replace);
        try {
          const result = tree.run(['tests/ai-treaty-embargo-1505.test.mjs'], c.pattern);
          assert.notEqual(result.status, 0, `mutant survived (${c.pattern}):\n${result.stdout}\n${result.stderr}`);
        } finally { restore(); }
      }
    } finally { tree.close(); }
  });
});
