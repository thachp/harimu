/** #1507: the diplomacy world tick can break an in-force NAP when the counterpart already has an in-force embargo against the breaker. No migration. HARIMU_TREATY_BREAK_ENABLED is GRAY 102 (index 98 on this base, after #1502; #1497 and GRAY 100/101 have not landed). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';
import { treatyBreakPenalty } from '../lib/diplomacy-rules.ts';

const D = 86400;
const FLAG = 'HARIMU_TREATY_BREAK_ENABLED';
const pair = (a, b) => [a, b].sort().join(':');

test('flag is preview true, production false, GRAY 102 at index 98, and listed in previewOnFlags', () => {
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_TRADE_RENEWAL_ENABLED'), 96);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 98); // GRAY 102 after the NAP reputation gate (index 97, GRAY 99). #1497 (GRAY 98) and GRAY 100/101 have not landed. indexOf only, no at(-1).
  const preview = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const prod = JSON.parse(readFileSync('wrangler.prod.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 98);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 98);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, FLAG), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, FLAG), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false, 'a direct string wins over the pack');
  assert.match(readFileSync('tests/wrangler-prod-501b.test.mjs', 'utf8'), /'HARIMU_TREATY_BREAK_ENABLED'/);
  assert.deepEqual(treatyBreakPenalty['non-aggression'], { legitimacy: -5, reputation: -10 });
});

async function insertTreaty(r, { id, kind = 'non-aggression', proposer, other, now, status = 'in_force', at = now - 10 }) {
  const ended = status === 'broken' || status === 'expired' ? at + 5 : null;
  await r.db.prepare('INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `r-${id}`, pair(proposer, other), kind, proposer, other, 'AI', at, status, at, at, at + 90 * D, ended, status === 'broken' ? proposer : null).run();
}
async function insertEmbargo(r, { id, actor, target, now, status = 'in_force', at = now - 8 }) {
  await r.db.prepare('INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at,lifted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, `r-${id}`, pair(actor, target), actor, target, 'AI', at, status, at, status === 'in_force' || status === 'lifted' ? at : null, status === 'lifted' ? at + 1 : null).run();
}
async function setup(t, backend) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
  const now = Math.floor(r.now / 1000);
  const d = await r.importModule('lib/diplomacy.ts');
  const war = await r.importModule('lib/war.ts');
  const row = id => r.db.prepare('SELECT * FROM treaties WHERE id=?').bind(id).first();
  return { r, d, war, now, row };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`#1507 (${backend}): flag on with the embargo trigger writes one broken NAP; broken_by is the breaking signatory; trade is not broken; a pact without the trigger stays in force; the injured nation's napBrokenByTarget is true; a second break is a no-op in the same slot; a GET / read path writes nothing`, async t => {
    const { r, d, war, now, row } = await setup(t, backend);

    // No trigger: a Kindle–Korund NAP and a third-party embargo stay in force.
    await insertTreaty(r, { id: 't-quiet', proposer: 'kindle', other: 'korund', now, at: now - 40 });
    await insertEmbargo(r, { id: 'e-third', actor: 'aurelle', target: 'kindle', now });
    await d.runDiplomacy(r.db, now, { treatyBreak: true });
    assert.equal((await row('t-quiet')).status, 'in_force', 'a pact without the trigger stays in force');
    assert.equal(await d.activeNonAggressionPact(r.db, 'kindle', 'korund', now), true);

    // A trade agreement with a matching embargo is not broken (e-third already points at this pair).
    await insertTreaty(r, { id: 't-trade', kind: 'trade', proposer: 'aurelle', other: 'kindle', now, at: now - 30 });
    await d.runDiplomacy(r.db, now, { treatyBreak: true });
    assert.equal((await row('t-trade')).status, 'in_force', 'trade is not broken');
    assert.equal((await row('t-quiet')).status, 'in_force');

    // Add the confirmed trigger: Korund embargoes Kindle (and Aurelle on a second NAP). t-quiet cannot share a live NAP slot with another Kindle–Korund pact.
    await insertTreaty(r, { id: 't-ak', proposer: 'aurelle', other: 'korund', now, at: now - 20 });
    await insertEmbargo(r, { id: 'e-kk', actor: 'korund', target: 'kindle', now });
    await insertEmbargo(r, { id: 'e-ak', actor: 'korund', target: 'aurelle', now });

    // A4 "a GET writes nothing" is for readTreaties / readWorldReputation only. GET /api/world is the production tick and can write when the flag is on, like expiry, renewal and proposals.
    const beforeReads = await Promise.all(['t-quiet', 't-ak', 't-trade'].map(id => row(id)));
    await d.readTreaties(r.db, now);
    await d.readWorldReputation(r.db, now);
    assert.deepEqual((await Promise.all(['t-quiet', 't-ak', 't-trade'].map(id => row(id)))).map(x => x.status), beforeReads.map(x => x.status), 'a GET / read path writes nothing');

    await d.runDiplomacy(r.db, now, { treatyBreak: true });
    const broke = await row('t-quiet');
    assert.equal(broke.status, 'broken', 'flag on with the confirmed trigger writes one broken NAP');
    assert.equal(broke.broken_by, 'kindle', 'broken_by is the breaking signatory (the embargo target)');
    assert.equal(Number(broke.ended_at), now);
    assert.equal((await row('t-ak')).status, 'in_force', 'at most one break per treaty slot');
    assert.equal((await row('t-trade')).status, 'in_force', 'trade is not broken');
    assert.equal(await d.activeNonAggressionPact(r.db, 'kindle', 'korund', now), false);
    assert.equal(await d.activeNonAggressionPact(r.db, 'aurelle', 'korund', now), true);

    const reputation = await d.readWorldReputation(r.db, now);
    assert.equal(reputation.kindle.score, -10);
    assert.equal(reputation.kindle.legitimacy, -5);
    assert.equal(reputation.kindle.brokenPacts, 1);
    assert.equal(reputation.korund.score, 0);
    assert.equal(reputation.korund.legitimacy, 0);
    assert.equal(reputation.aurelle.score, 0);

    const victim = await war.readGrievanceInputs(r.db, 'korund', 'kindle');
    const breaker = await war.readGrievanceInputs(r.db, 'kindle', 'korund');
    assert.equal(victim.napBrokenByTarget, true, "the injured nation's napBrokenByTarget is true");
    assert.equal(breaker.napBrokenByTarget, false, "the breaker's own break is not the victim's grievance");

    const copy = await r.importModule('lib/diplomacy-copy.ts');
    assert.equal(copy.brokenPactLine.proposal, true);
    const listed = (await d.readTreaties(r.db, now)).treaties.find(x => x.id === 't-quiet');
    const news = d.treatyNewsItems([listed], 'korund');
    const brokenLine = news.find(item => item.id === 'treaty:t-quiet:broken');
    assert.ok(brokenLine, 'existing brokenPactLine copy is reused on the news path');
    assert.match(brokenLine.text, /broken|broke/i);

    await d.runDiplomacy(r.db, now, { treatyBreak: true });
    assert.equal((await row('t-ak')).status, 'in_force', 'a second break is a no-op in the same slot');
    assert.equal((await row('t-quiet')).broken_by, 'kindle');

    // The next slot can break the remaining triggered NAP (Aurelle is the embargo target).
    const later = now + D;
    await d.runDiplomacy(r.db, later, { treatyBreak: true });
    const second = await row('t-ak');
    assert.equal(second.status, 'broken');
    assert.equal(second.broken_by, 'aurelle');
    assert.equal(Number(second.ended_at), later);
    assert.equal((await war.readGrievanceInputs(r.db, 'korund', 'aurelle')).napBrokenByTarget, true);
    assert.equal((await war.readGrievanceInputs(r.db, 'aurelle', 'korund')).napBrokenByTarget, false);
  });

  test(`#1507 (${backend}): world tick with diplomacy on and HARIMU_TREATY_BREAK_ENABLED off writes no break`, async t => {
    const { r, d, now, row } = await setup(t, backend);
    await insertTreaty(r, { id: 't-off', proposer: 'kindle', other: 'korund', now });
    await insertEmbargo(r, { id: 'e-off', actor: 'korund', target: 'kindle', now });
    r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
    r.setFixtureEnv(FLAG, 'false');
    r.setNow(now * 1000);
    const world = await r.call('world', null);
    assert.equal(world.status, 200);
    assert.equal('treaties' in (world.data.simulation ?? {}), true, 'diplomacy stays on');
    assert.equal((await row('t-off')).status, 'in_force', 'world tick with HARIMU_TREATY_BREAK_ENABLED off writes no break');
    assert.equal(await d.activeNonAggressionPact(r.db, 'kindle', 'korund', now), true, 'declaration behavior is unchanged: the pact stays in force');
    await d.runDiplomacy(r.db, now, { treatyBreak: false });
    assert.equal((await row('t-off')).status, 'in_force');
  });

  test(`#1507 (${backend}): world tick with diplomacy on and HARIMU_TREATY_BREAK_ENABLED on writes a break`, async t => {
    const { r, now, row } = await setup(t, backend);
    await insertTreaty(r, { id: 't-on', proposer: 'kindle', other: 'korund', now });
    await insertEmbargo(r, { id: 'e-on', actor: 'korund', target: 'kindle', now });
    r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
    r.setFixtureEnv(FLAG, 'true');
    r.setNow(now * 1000);
    const world = await r.call('world', null);
    assert.equal(world.status, 200);
    const broke = await row('t-on');
    assert.equal(broke.status, 'broken', 'world tick with HARIMU_TREATY_BREAK_ENABLED on writes a break');
    assert.equal(broke.broken_by, 'kindle', 'broken_by is the embargo target');
  });

  test(`#1507 (${backend}): a lifted or proposed embargo from the counterpart leaves the NAP in force`, async t => {
    const { r, d, now, row } = await setup(t, backend);
    await insertTreaty(r, { id: 't-lift', proposer: 'kindle', other: 'korund', now, at: now - 20 });
    await insertEmbargo(r, { id: 'e-lift', actor: 'korund', target: 'kindle', now, status: 'lifted' });
    await insertTreaty(r, { id: 't-prop', proposer: 'aurelle', other: 'korund', now, at: now - 10 });
    await insertEmbargo(r, { id: 'e-prop', actor: 'korund', target: 'aurelle', now, status: 'proposed' });
    await d.runDiplomacy(r.db, now, { treatyBreak: true });
    assert.equal((await row('t-lift')).status, 'in_force', 'a lifted embargo from the counterpart leaves the NAP in force');
    assert.equal((await row('t-prop')).status, 'in_force', 'a proposed embargo from the counterpart leaves the NAP in force');
    assert.equal(await d.activeNonAggressionPact(r.db, 'kindle', 'korund', now), true);
    assert.equal(await d.activeNonAggressionPact(r.db, 'aurelle', 'korund', now), true);
  });
}

test('#1507 mutations: breaking when the flag is off, forcing the world tick off or on, breaking with no trigger, a non-in-force embargo, or a trade, swapping broken_by, and ignoring the one-per-slot guard all fail', () => {
  const cases = [
    { file: 'lib/diplomacy.ts', find: 'if (options.treatyBreak === true) await breakDueNonAggressionPacts(db, now);', replace: 'if (true) await breakDueNonAggressionPacts(db, now);', pattern: 'HARIMU_TREATY_BREAK_ENABLED off writes no break' },
    { file: 'lib/world-simulation.ts', find: "treatyBreak: flagOn(options.atlasEnv, 'HARIMU_TREATY_BREAK_ENABLED')", replace: 'treatyBreak: true', pattern: 'HARIMU_TREATY_BREAK_ENABLED off writes no break' },
    { file: 'lib/world-simulation.ts', find: "treatyBreak: flagOn(options.atlasEnv, 'HARIMU_TREATY_BREAK_ENABLED')", replace: 'treatyBreak: false', pattern: 'HARIMU_TREATY_BREAK_ENABLED on writes a break' },
    { file: 'lib/diplomacy.ts', find: "WHERE t.kind='non-aggression' AND t.status='in_force' AND t.ends_at>?", replace: "WHERE t.kind IN ('non-aggression','trade') AND t.status='in_force' AND t.ends_at>?", pattern: 'trade is not broken' },
    { file: 'lib/diplomacy.ts', find: "JOIN embargoes e ON e.status='in_force' AND e.target_nation IN (t.proposer_nation, t.other_nation) AND e.actor_nation IN (t.proposer_nation, t.other_nation) AND e.actor_nation<>e.target_nation", replace: "JOIN embargoes e ON e.status='in_force'", pattern: 'a pact without the trigger stays in force' },
    { file: 'lib/diplomacy.ts', find: "JOIN embargoes e ON e.status='in_force' AND e.target_nation IN (t.proposer_nation, t.other_nation) AND e.actor_nation IN (t.proposer_nation, t.other_nation) AND e.actor_nation<>e.target_nation", replace: "JOIN embargoes e ON e.status<>'' AND e.target_nation IN (t.proposer_nation, t.other_nation) AND e.actor_nation IN (t.proposer_nation, t.other_nation) AND e.actor_nation<>e.target_nation", pattern: 'a lifted or proposed embargo from the counterpart leaves the NAP in force' },
    { file: 'lib/diplomacy.ts', find: 'e.target_nation AS breaker', replace: 'e.actor_nation AS breaker', pattern: "the injured nation's napBrokenByTarget is true" },
    { file: 'lib/diplomacy.ts', find: "SELECT 1 AS found FROM treaties WHERE status='broken' AND ended_at>=? AND ended_at<?", replace: "SELECT 1 AS found FROM treaties WHERE status='broken' AND ended_at>=? AND ended_at<? AND 1=0", pattern: 'a second break is a no-op in the same slot' },
  ];
  const tree = mutantTree(); // #1480: never mutate the shared tree that parallel test files read
  try {
    for (const c of cases) {
      const restore = tree.mutate(c.file, c.find, c.replace);
      try {
        const result = tree.run(['tests/treaty-breaks-1507.test.mjs'], c.pattern);
        assert.notEqual(result.status, 0, `mutant survived (${c.pattern}):\n${result.stdout}\n${result.stderr}`);
      } finally { restore(); }
    }
  } finally { tree.close(); }
});
