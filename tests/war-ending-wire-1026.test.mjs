/** #1026: war-ending refusal copy is what proposeWarEnding returns, and the banner shows pending and result lines only when ending rows are passed. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';

const require = createRequire(import.meta.url);
const SECRET = 'a-very-long-server-only-secret';
const endingsSrc = readFileSync('lib/war-endings.ts', 'utf8');
const proposeSrc = endingsSrc.slice(endingsSrc.indexOf('export async function proposeWarEnding'), endingsSrc.indexOf('export async function decideWarEndings'));
const proposeCalls = [...proposeSrc.matchAll(/fail\(\s*(4\d\d),\s*'([a-z_]+)'/g)].map(m => [m[2], Number(m[1])]);
const proposeReasons = proposeCalls.map(c => c[0]).filter((r, i, a) => a.indexOf(r) === i);
const statusFor = Object.fromEntries(proposeCalls);

const mod = file => {
  const src = readFileSync(file, 'utf8').replace(/from (['"])(\.[^'"]+)\1/g, (_, q, spec) => `from ${JSON.stringify(pathToFileURL(resolve(file, '..', `${spec}.ts`)).href)}`);
  const out = join(mkdtempSync(join(tmpdir(), 'war-ending-wire-')), 'mod.mjs');
  writeFileSync(out, ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
  return import(pathToFileURL(out).href);
};
const [copy, rules, warCopy] = await Promise.all(['lib/war-ending-copy.ts', 'lib/war-rules.ts', 'lib/war-copy.ts'].map(mod));
const bannerSrc = readFileSync('app/war-banner.tsx', 'utf8');
const bannerExports = {};
new Function('exports', 'require', ts.transpileModule(bannerSrc, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(bannerExports, name => ({
  '@/lib/war-copy': warCopy, '@/lib/war-rules': rules, '@/lib/war-ending-copy': copy, '@/lib/war-weariness-copy': { wearinessBanners: {}, wearinessStrip: {} },
  './game-timer': { GameTimer: () => null }, './display-preferences': { useDisplayTimestamp: () => v => new Date(v).toISOString() }, '@/lib/war': {},
})[name] ?? require(name));
const { renderToStaticMarkup } = await import('react-dom/server');
const { WarBanner } = bannerExports;
const html = (nationId, wars, endings) => renderToStaticMarkup(WarBanner({ wars, nationId, ...(endings === undefined ? {} : { endings }) }));

const warOf = (id, attacker, defender, extra = {}) => ({ id, attacker, defender, casusBelli: 'Border incidents', declaredBy: 'AI', declaredAt: 1000, mobilizationEndsAt: 2000, status: 'active', endedAt: null, endKind: null, peaceLockEndsAt: null, ...extra });
const notice = (warId, kind, proposer, other, status, extra = {}) => ({ warId, kind, proposer, other, status, decidedAt: null, proposedAt: 1, ...extra });
const otherName = { kindle: 'Kindle', korund: 'Korund', aurelle: 'Aurelle' };

async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS() - 60 * 86400));
  const [endings, actions, sim] = await Promise.all(['lib/war-endings.ts', 'lib/war-actions.ts', 'lib/world-simulation.ts'].map(m => r.importModule(m)));
  const command = (body, endingsOn = true) => actions.handleWarCommand(r.db, { enabled: true, endings: endingsOn, secret: SECRET, authorization: `Bearer ${SECRET}`, body: { requestId: randomUUID(), ...body }, now: nowS() });
  const war = (await command({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' })).war;
  return { r, endings, sim, command, war, nowS };
}

test('flag off: snapshot JSON and the banner stay unchanged', async t => {
  const c = await setup(t);
  const denied = await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id }, false);
  assert.deepEqual({ ok: denied.ok, status: denied.status, reason: denied.reason, error: denied.error }, { ok: false, status: 400, reason: 'bad_request', error: 'Send action "declare", "propose-end", "accept-end" or "assault".' });
  assert.equal(denied.error.startsWith('Refused.'), false);
  const at = c.nowS();
  const off = await c.sim.readWorldSimulation(c.r.db, at, { war: true, warEndings: false });
  const on = await c.sim.readWorldSimulation(c.r.db, at, { war: true, warEndings: true });
  assert.equal('warEndings' in off, false);
  assert.deepEqual(off.wars, on.wars);
  assert.deepEqual(Object.keys(off.wars.wars[0]).sort(), ['attacker', 'casusBelli', 'declaredAt', 'declaredBy', 'defender', 'endKind', 'endedAt', 'id', 'mobilizationEndsAt', 'peaceLockEndsAt', 'status']);
  await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id });
  const offAfter = await c.sim.readWorldSimulation(c.r.db, at, { war: true, warEndings: false });
  const onAfter = await c.sim.readWorldSimulation(c.r.db, at, { war: true, warEndings: true });
  assert.equal('warEndings' in offAfter, false);
  assert.deepEqual(offAfter.wars, onAfter.wars, 'ending rows are not folded into the war JSON');
  assert.equal(onAfter.warEndings[0].status, 'proposed');
  assert.equal('line' in onAfter.warEndings[0] || 'error' in onAfter.warEndings[0], false);
  const open = [warOf('w1', 'kindle', 'korund')];
  const plain = html('kindle', open);
  assert.equal(html('kindle', open, undefined), plain);
  assert.equal(html('kindle', open, []), plain);
  assert.equal(html('kindle', open, null), plain);
  assert.match(plain, /war is active/i);
  assert.doesNotMatch(plain, /ratifies|Peace lock|Surrender enacted|Surrender rejected|Concession enacted/);
  assert.equal(html('aurelle', open, [notice('w1', 'surrender', 'kindle', 'korund', 'proposed')]), '', 'a nation that is not a party still sees nothing');
});

test('every proposeWarEnding reason returns its copy line; status codes stay the ones in the source', async t => {
  const c = await setup(t);
  const line = reason => copy.endingRefusalFor(reason).line.text;
  const seen = [];
  const check = (result, reason) => { seen.push(reason); assert.equal(result.reason, reason); assert.equal(result.status, statusFor[reason]); assert.equal(result.error, line(reason)); assert.match(result.error, /^Refused\. /); };
  check(await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id, requestId: '' }), 'bad_request');
  check(await c.endings.proposeWarEnding(c.r.db, { nation: 'korund', warId: c.war.id, kind: 'ceasefire', requestId: randomUUID() }, c.nowS()), 'bad_request');
  check(await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: 'missing-war' }), 'not_found');
  check(await c.command({ action: 'surrender', nation: 'aurelle', role: 'Monarch', warId: c.war.id }), 'not_a_party');
  check(await c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares: [] }), 'bad_squares');
  check(await c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares: [{ x: -1, y: -1 }] }), 'square_not_cedable');
  const rid = randomUUID();
  assert.equal((await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id, requestId: rid })).ok, true);
  check(await c.command({ action: 'surrender', nation: 'kindle', role: 'President', warId: c.war.id }), 'ending_pending');
  check(await c.command({ action: 'concede', nation: 'korund', role: 'Chairman', warId: c.war.id, squares: [{ x: 1, y: 1 }], requestId: rid }), 'request_reused');
  await c.r.db.prepare('UPDATE wars SET ended_at=?,end_kind=? WHERE id=?').bind(c.nowS(), 'other', c.war.id).run();
  check(await c.command({ action: 'surrender', nation: 'korund', role: 'Chairman', warId: c.war.id }), 'war_ended');
  assert.deepEqual(seen.filter((r, i, a) => a.indexOf(r) === i).sort(), [...proposeReasons].sort());
  assert.equal(copy.endingRefusalFor('not_ratified'), undefined);
  assert.equal(copy.endingRefusalFor('stale'), undefined);
});

test('banner pending and result lines for Kindle, Korund and Aurelle', () => {
  const rows = [
    ['kindle', 'korund', 'The Kindle Assembly ratifies a surrender by simple majority: more than half.', 'The Kindle Assembly ratifies a concession by at least two-thirds.'],
    ['korund', 'kindle', 'The Korund Chairman ratifies a surrender alone.', 'The Korund Chairman ratifies a concession alone.'],
    ['aurelle', 'kindle', 'The Aurelle Crown ratifies a surrender alone.', 'The Aurelle Crown ratifies a concession alone.'],
  ];
  for (const [nation, other, surrenderPending, concessionPending] of rows) {
    const open = [warOf('w1', nation, other)];
    const pendingSurrender = html(nation, open, [notice('w1', 'surrender', nation, other, 'proposed')]);
    assert.match(pendingSurrender, new RegExp(surrenderPending));
    assert.match(pendingSurrender, /war is active/i);
    assert.doesNotMatch(pendingSurrender, /Peace lock|Surrender enacted|Surrender rejected/);
    const pendingConcession = html(nation, open, [notice('w1', 'concession', nation, other, 'proposed')]);
    assert.match(pendingConcession, new RegExp(concessionPending));
    assert.match(pendingConcession, new RegExp(nation === 'kindle' ? 'The Korund Chairman ratifies a concession alone\\.' : 'The Kindle Assembly ratifies a concession by at least two-thirds\\.'));
    const rejected = html(nation, open, [notice('w1', 'surrender', nation, other, 'rejected', { decidedAt: 50 })]);
    assert.match(rejected, new RegExp(`Surrender rejected\\. The war with ${otherName[other]} goes on\\.`));
    assert.doesNotMatch(rejected, /Peace lock|awaits ratification|ratifies a surrender/);
    const decidedAt = 1_700_000_000;
    const readyAt = new Date((decidedAt + 10 * 86400) * 1000).toISOString();
    const ended = [warOf('w1', nation, other, { status: 'ended', endedAt: decidedAt, endKind: 'treaty', peaceLockEndsAt: decidedAt + 10 * 86400 })];
    const enacted = html(nation, ended, [notice('w1', 'surrender', nation, other, 'enacted', { decidedAt, proposedAt: 2 })]);
    assert.match(enacted, new RegExp(`Surrender enacted\\. The war with ${otherName[other]} is over\\.`));
    assert.match(enacted, new RegExp(`Peace lock after enactment: 10 real days, until ${readyAt.replace(/[.]/g, '\\.')}`));
    assert.doesNotMatch(enacted, /war is active|ratifies a surrender/);
    const conceded = html(nation, ended, [notice('w1', 'concession', nation, other, 'enacted', { decidedAt })]);
    assert.match(conceded, new RegExp(`Concession enacted\\. The war with ${otherName[other]} is over\\.`));
    assert.match(conceded, /Peace lock after enactment: 10 real days, until /);
    const otherView = html(other, open, [notice('w1', 'surrender', nation, other, 'proposed')]);
    assert.match(otherView, new RegExp(surrenderPending), 'the other party sees the body that ratifies');
  }
});
