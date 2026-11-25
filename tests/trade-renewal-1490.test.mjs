/** #1490: trade agreements that expire by term can be re-ratified for a fresh, gapless term. No migration. HARIMU_TRADE_RENEWAL_ENABLED is GRAY 97 (index 96). */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400;
const term = (d, compression = 12) => d.treatyTermSeconds('trade', compression);

async function setup(t, backend) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
  const d = await r.importModule('lib/diplomacy.ts');
  const propose = (over = {}, now = nowS()) => d.proposeTreaty(r.db, { proposer: 'kindle', other: 'korund', kind: 'trade', proposedBy: "Kindle's AI Cabinet", requestId: randomUUID(), ...over }, now, { enabled: true });
  const tick = (now, renewal = true, embargo = false) => d.runDiplomacy(r.db, now, { renewal, embargo });
  const rows = async () => (await r.db.prepare('SELECT * FROM treaties ORDER BY proposed_at,id').all()).results;
  return { r, d, nowS, propose, tick, rows };
}

async function expireTrade(ctx, over = {}) {
  const { propose, tick, nowS } = ctx;
  const proposed = await propose(over); assert.equal(proposed.ok, true, JSON.stringify(proposed));
  await tick(nowS(), false);
  const live = (await ctx.rows()).find(x => x.id === proposed.treaty.id);
  assert.equal(live.status, 'in_force', JSON.stringify(live));
  const ends = Number(live.ends_at);
  await tick(ends, false);
  const expired = (await ctx.rows()).find(x => x.id === live.id);
  assert.equal(expired.status, 'expired');
  assert.equal(Number(expired.ended_at), ends);
  return { live, ends };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`#1490 (${backend}): renews within the window into a gapless in_force row; a second tick does not write a second renewal; a NAP is never renewed; too old and is not renewed; flag off writes no renewal; open war is refused once; Renewed tag`, async t => {
    const ctx = await setup(t, backend);
    const { r, d, tick, rows } = ctx;

    assert.equal(d.renewalWindowSeconds, 86400);
    assert.equal(d.treatyRenewalRequestId('treaty-abc12'), 'renew-treaty-abc12');
    assert.equal(d.treatyRequestIdOk(d.treatyRenewalRequestId('x'.repeat(80))), true);
    const gap = d.renewedTerm(1000, 12);
    assert.equal(gap.ratifiedAt, 1000);
    assert.equal(gap.endsAt, 1000 + term(d));

    const { live, ends } = await expireTrade(ctx);
    await tick(ends + 60, true);
    const renewed = (await rows()).find(x => x.request_id === d.treatyRenewalRequestId(live.id));
    assert.ok(renewed, 'a renewal row was written');
    assert.equal(renewed.status, 'in_force');
    assert.equal(Number(renewed.ratified_at), ends);
    assert.equal(Number(renewed.ends_at), ends + term(d));
    assert.equal((await rows()).find(x => x.id === live.id).status, 'expired', 'the old row stays expired');
    const listed = (await d.readTreaties(r.db, ends + 60)).treaties;
    const publicNew = listed.find(x => x.id === renewed.id);
    const publicOld = listed.find(x => x.id === live.id);
    assert.equal(publicNew.renewal, true);
    assert.equal(publicOld.renewal, false);
    await tick(ends + 120, true);
    assert.equal((await rows()).filter(x => String(x.request_id).startsWith('renew-')).length, 1, 'a second tick does not write a second renewal');

    const { live: warLive, ends: warEnds } = await expireTrade(ctx, { proposer: 'korund', other: 'aurelle', requestId: randomUUID() });
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind('w-1490-1', 'war-req-1490-01', 'aurelle:korund', 'korund', 'aurelle', 'AI', warEnds, warEnds + 172800).run();
    await tick(warEnds + 10, true);
    const warReject = (await rows()).find(x => x.request_id === d.treatyRenewalRequestId(warLive.id));
    assert.equal(warReject.status, 'rejected', JSON.stringify(warReject));
    assert.equal((await d.readTreaties(r.db, warEnds + 10)).treaties.some(x => x.id === warReject.id), false, 'rejected renewals stay unpublished');
    await tick(warEnds + 20, true);
    assert.equal((await rows()).filter(x => x.request_id === d.treatyRenewalRequestId(warLive.id)).length, 1, 'open war is refused once');

    const { r: r2, d: d2, nowS: now2, propose: propose2, tick: tick2, rows: rows2 } = await setup(t, backend);
    const refused = await propose2({ other: 'aurelle' }); assert.equal(refused.ok, true);
    await tick2(now2(), false);
    const refusedLive = (await rows2()).find(x => x.id === refused.treaty.id);
    assert.equal(refusedLive.status, 'rejected', 'incumbent seats fail a Kindle–Aurelle trade (open-ledger only)');
    const passSeats = { 'steady-hand': 0, 'open-ledger': 18, 'dockside-builders': 0 };
    await r2.db.prepare("INSERT INTO assembly_elections (id,nation_id,policy,opens_at,closes_at,closed_at,result_json) VALUES ('el-1490-pass','kindle','preview-citizen-v1',?,?,?,?)")
      .bind(now2() - 4 * D, now2() - D, now2() - D, JSON.stringify({ totals: { after: passSeats } })).run();
    const okAurelle = await propose2({ other: 'aurelle', requestId: randomUUID() });
    await tick2(now2(), false);
    const okLive = (await rows2()).find(x => x.id === okAurelle.treaty.id);
    assert.equal(okLive.status, 'in_force');
    const okEnds = Number(okLive.ends_at);
    await tick2(okEnds, false);
    const failSeats = { 'steady-hand': 10, 'open-ledger': 0, 'dockside-builders': 8 };
    await r2.db.prepare("INSERT INTO assembly_elections (id,nation_id,policy,opens_at,closes_at,closed_at,result_json) VALUES ('el-1490-fail','kindle','preview-citizen-v1',?,?,?,?)")
      .bind(okEnds - 4 * D, okEnds - D, okEnds - D, JSON.stringify({ totals: { after: failSeats } })).run();
    await tick2(okEnds + 10, true);
    const assemblyReject = (await rows2()).find(x => x.request_id === d2.treatyRenewalRequestId(okLive.id));
    assert.equal(assemblyReject.status, 'rejected');
    const verdict = JSON.parse(assemblyReject.ratification_json);
    assert.equal(verdict[0].nation, 'kindle'); assert.equal(verdict[0].passed, false);
    await tick2(okEnds + 20, true);
    assert.equal((await rows2()).filter(x => x.request_id === d2.treatyRenewalRequestId(okLive.id)).length, 1, 'Assembly refusal is refused once');

    const { live: embargoLive, ends: embargoEnds } = await expireTrade({ propose: propose2, tick: tick2, rows: rows2, nowS: now2 }, { proposer: 'korund', other: 'aurelle', requestId: randomUUID() });
    await r2.db.prepare("INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at) VALUES ('e-1490','embargo-1490-01','aurelle:korund','korund','aurelle','AI',1,'in_force',1,1)").run();
    await tick2(embargoEnds + 10, true, true);
    const embargoReject = (await rows2()).find(x => x.request_id === d2.treatyRenewalRequestId(embargoLive.id));
    assert.equal(embargoReject.status, 'rejected', JSON.stringify(embargoReject));
    await tick2(embargoEnds + 20, true, true);
    assert.equal((await rows2()).filter(x => x.request_id === d2.treatyRenewalRequestId(embargoLive.id)).length, 1, 'embargo is refused once');

    const nap = await propose2({ kind: 'non-aggression', proposer: 'korund', other: 'aurelle', requestId: randomUUID() });
    await tick2(now2(), false);
    const napLive = (await rows2()).find(x => x.id === nap.treaty.id);
    assert.equal(napLive.status, 'in_force');
    const napEnds = Number(napLive.ends_at);
    await tick2(napEnds, false);
    const beforeNap = (await rows2()).length;
    await tick2(napEnds + 10, true);
    assert.equal((await rows2()).length, beforeNap, 'a NAP is never renewed');
    assert.equal((await rows2()).find(x => x.id === napLive.id).status, 'expired');

    const brokenProp = await propose2({ other: 'korund', requestId: randomUUID() });
    await tick2(now2(), false);
    const brokenLive = (await rows2()).find(x => x.id === brokenProp.treaty.id);
    const broke = await d2.breakTreaty(r2.db, { treatyId: brokenLive.id, breaker: 'kindle' }, now2() + 50, true);
    assert.equal(broke.ok, true);
    const beforeBroken = (await rows2()).length;
    await tick2(Number(brokenLive.ends_at) + 10, true);
    assert.equal((await rows2()).length, beforeBroken, 'a broken trade agreement is never renewed');

    const { r: r3, d: d3, propose: propose3, tick: tick3, rows: rows3 } = await setup(t, backend);
    const oldProp = await propose3(); await tick3(Math.floor(r3.now / 1000), false);
    const oldLive = (await rows3()).find(x => x.id === oldProp.treaty.id);
    const oldEnds = Number(oldLive.ends_at);
    await tick3(oldEnds, false);
    const beforeOld = (await rows3()).length;
    await tick3(oldEnds + d3.renewalWindowSeconds, true);
    assert.equal((await rows3()).length, beforeOld, 'ends_at == now - 86400 is too old and is not renewed');
    await tick3(oldEnds, false);
    const { live: flagLive, ends: flagEnds } = await expireTrade({ propose: propose3, tick: tick3, rows: rows3, nowS: () => Math.floor(r3.now / 1000) }, { requestId: randomUUID() });
    await tick3(flagEnds + 10, false);
    assert.equal((await rows3()).some(x => x.request_id === d3.treatyRenewalRequestId(flagLive.id)), false, 'flag off writes no renewal');
    const beforeOff = (await rows3()).length;
    assert.equal((await rows3()).find(x => x.id === flagLive.id).status, 'expired');

    r3.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'false');
    const world = await r3.call('world', null);
    assert.equal('treaties' in (world.data.simulation ?? {}), false);
    assert.equal((await rows3()).length, beforeOff, 'diplomacy off means no renewal');

    const copy = await r.importModule('lib/diplomacy-copy.ts');
    assert.equal(copy.treatyRenewalTag.text, 'Renewed');
    assert.equal(copy.treatyRenewalTag.proposal, true);
    const { renderToStaticMarkup } = await import('react-dom/server');
    const require = createRequire(import.meta.url);
    const load = async (file, stubs) => { const exports = {}; const src = await readFile(new URL(file, import.meta.url), 'utf8');
      new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports, name => name in stubs ? stubs[name] : require(name)); return exports; };
    const rules = await r.importModule('lib/diplomacy-rules.ts');
    const embargoCopy = await r.importModule('lib/embargo-copy.ts');
    const { ForeignAffairsPanel } = await load('../app/foreign-affairs-panel.tsx', { '@/lib/diplomacy-copy': copy, '@/lib/diplomacy-rules': rules, '@/lib/embargo-copy': embargoCopy, './display-preferences': { useDisplayTimestamp: () => value => `T${value}` } });
    const base = { id: 't1', kind: 'trade', proposer: 'kindle', other: 'korund', proposedBy: 'AI', proposedAt: 1, status: 'in-force', ratifiedAt: 2, endsAt: 5000, brokenAt: null, brokenBy: null, breakPenalty: null, ratifications: [], renewal: false };
    const withTag = renderToStaticMarkup(ForeignAffairsPanel({ treaties: [{ ...base, renewal: true }], nationId: 'kindle' }));
    const withoutTag = renderToStaticMarkup(ForeignAffairsPanel({ treaties: [base], nationId: 'kindle' }));
    assert.match(withTag, /Renewed/);
    assert.doesNotMatch(withoutTag, /Renewed/);
  });

  test(`#1490 (${backend}): world tick with diplomacy on and HARIMU_TRADE_RENEWAL_ENABLED off writes no renewal`, async t => {
    const ctx = await setup(t, backend);
    const { r, d, rows } = ctx;
    const { live, ends } = await expireTrade(ctx);
    r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
    r.setFixtureEnv('HARIMU_TRADE_RENEWAL_ENABLED', 'false');
    r.setNow((ends + 60) * 1000);
    const before = (await rows()).length;
    const world = await r.call('world', null);
    assert.equal(world.status, 200);
    assert.equal('treaties' in (world.data.simulation ?? {}), true, 'diplomacy stays on');
    assert.equal((await rows()).some(x => x.request_id === d.treatyRenewalRequestId(live.id)), false, 'world tick with HARIMU_TRADE_RENEWAL_ENABLED off writes no renewal');
    assert.equal((await rows()).length, before);
    assert.equal((await rows()).find(x => x.id === live.id).status, 'expired');
  });
}

const mutate = (file, find, replace) => {
  const original = readFileSync(file, 'utf8');
  const next = original.replace(find, replace);
  assert.notEqual(next, original, `mutant did not apply in ${file}: ${find}`);
  writeFileSync(file, next);
  return () => writeFileSync(file, original);
};
const run = (pattern) => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  return spawnSync('node', ['--experimental-strip-types', '--test', '--test-concurrency=1', '--test-name-pattern', pattern, 'tests/trade-renewal-1490.test.mjs'], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname, env });
};

test('#1490 mutations: renewing when the flag is off, renewing a too-old or NAP row, ignoring open war, and forcing the world-tick renewal path on all fail', () => {
  const cases = [
    { file: 'lib/diplomacy.ts', find: 'if (options.renewal === true) await renewDueTradeAgreements(db, now, { embargo: options.embargo });', replace: 'if (true) await renewDueTradeAgreements(db, now, { embargo: options.embargo });', pattern: 'flag off writes no renewal' },
    { file: 'lib/diplomacy.ts', find: "WHERE kind='trade' AND status='expired' AND ended_at=ends_at AND ends_at>?", replace: "WHERE kind='trade' AND status='expired' AND ended_at=ends_at AND ends_at>=?", pattern: 'too old and is not renewed' },
    { file: 'lib/diplomacy.ts', find: "WHERE kind='trade' AND status='expired' AND ended_at=ends_at AND ends_at>?", replace: "WHERE kind IN ('trade','non-aggression') AND status='expired' AND ended_at=ends_at AND ends_at>?", pattern: 'a NAP is never renewed' },
    { file: 'lib/diplomacy.ts', find: 'const blocked = (options.embargo === true && await embargoInForce(db, row.proposer_nation, row.other_nation)) || await openWarBetween(db, row.proposer_nation, row.other_nation);', replace: 'const blocked = false;', pattern: 'open war is refused once' },
    { file: 'lib/world-simulation.ts', find: "renewal: flagOn(options.atlasEnv, 'HARIMU_TRADE_RENEWAL_ENABLED')", replace: 'renewal: true', pattern: 'HARIMU_TRADE_RENEWAL_ENABLED off writes no renewal' },
  ];
  for (const c of cases) {
    const restore = mutate(c.file, c.find, c.replace);
    try {
      const result = run(c.pattern);
      assert.notEqual(result.status, 0, `mutant survived (${c.pattern}):\n${result.stdout}\n${result.stderr}`);
    } finally { restore(); }
  }
});
