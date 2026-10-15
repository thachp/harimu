/** #520: one shared Tier-1 / preview eligibility rule for the Assembly, primaries, town hall, canvassing and debate routes. A refactor: no behavior change.
 *  The route tests below were written against the five route-local copies and pass unchanged against the helper. HARIMU_TEST_STORAGE=postgres runs them on PGlite. */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const rt = await localRuntime(); after(() => rt.close());
const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const previewEnv = { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' };
const CITIZENS = 'Signed-in Kindle citizens may take part in this preview PoC.';
const unavailable = 'Phone verification is not available yet, so actions requiring verified human eligibility are unavailable. Work, trade, chat and private planning remain available.';
const eligibleReason = 'Your account is verified. Your civic actions can count.';
const tierOne = (r, user) => ({ userId: user, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
/** Each route: its own flag, the exact preview wording it has always used, and a write that needs eligibility. */
const routes = [
  { name: 'town-hall', flag: 'HARIMU_TOWN_HALLS_ENABLED', preview: CITIZENS, write: { action: 'ask', candidateId: 'ines-varro', text: 'What will you do about jobs and trade?' } },
  { name: 'canvassing', flag: 'HARIMU_CANVASSING_ENABLED', preview: CITIZENS, write: { action: 'start' } },
  { name: 'debate', flag: 'HARIMU_DEBATE_ENABLED', preview: CITIZENS, write: { action: 'ask', text: 'What will you do about jobs and trade?' } },
  { name: 'assembly', flag: 'HARIMU_KINDLE_ASSEMBLY_ENABLED', preview: 'Signed-in Kindle citizens may vote once in this preview PoC.', write: { action: 'vote', electionId: 'x', partyId: 'steady-hand' } },
  { name: 'primaries', flag: 'HARIMU_PRIMARIES_ENABLED', preview: 'Signed-in Kindle party members may vote once in this preview PoC.', write: { action: 'vote', electionId: 'x', ranking: [] } },
];
async function runtime(t, route, { env = null, privacy = true } = {}) {
  const r = await localRuntime({ ...(env ? { accountElectionBindings: env } : {}), ballotPrivacyReady: privacy }); t.after(() => r.close());
  r.setFixtureEnv(route.flag, 'true'); return r;
}
const get = async (r, route, user = 'alice') => { const res = await r.call(route.name, user); assert.equal(res.status, 200, `${route.name}: ${JSON.stringify(res.data)}`); return res.data.eligibility; };
const post = (r, route, user = 'alice') => r.call(route.name, user, { ...route.write, requestId: randomUUID() });

for (const route of routes) {
  test(`#520 ${backend} ${route.name}: the approved preview exception makes a Kindle citizen eligible with this route's own wording`, async t => {
    const r = await runtime(t, route, { env: previewEnv });
    assert.deepEqual(await get(r, route), { eligible: true, scope: 'preview-citizen', reason: route.preview, verification: { tier: 0, countedActionsEligible: false, status: 'unavailable', reason: unavailable } });
  });
  test(`#520 ${backend} ${route.name}: without the preview, Tier 1 decides: unverified, verified and revoked evidence`, async t => {
    const r = await runtime(t, route);
    assert.deepEqual(await get(r, route), { eligible: false, scope: 'tier1', reason: unavailable, verification: { tier: 0, countedActionsEligible: false, status: 'unavailable', reason: unavailable } });
    r.setVerification('alice', tierOne(r, 'alice'));
    assert.deepEqual(await get(r, route), { eligible: true, scope: 'tier1', reason: eligibleReason, verification: { tier: 1, countedActionsEligible: true, status: 'eligible', reason: eligibleReason } });
    r.setVerification('alice', { ...tierOne(r, 'alice'), revoked: true });
    const revoked = await get(r, route); assert.equal(revoked.eligible, false); assert.equal(revoked.scope, 'tier1'); assert.equal(revoked.reason, revoked.verification.reason); assert.equal(revoked.verification.countedActionsEligible, false);
    r.setVerification('bob', tierOne(r, 'bob')); assert.equal((await get(r, route, 'bob')).eligible, true, 'the evidence is per citizen'); assert.equal((await get(r, route, 'alice')).eligible, false);
  });
  for (const half of [{ NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true' }, { HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' }]) {
    test(`#520 ${backend} ${route.name}: only one of the two preview settings (${Object.keys(half)[0]}) is not the preview exception`, async t => {
      const r = await runtime(t, route, { env: half });
      const e = await get(r, route); assert.equal(e.scope, 'tier1'); assert.equal(e.eligible, false); assert.equal(e.reason, unavailable);
    });
  }
  test(`#520 ${backend} ${route.name}: an ineligible write is a 403 carrying the reason and the verification, before the body is used`, async t => {
    const r = await runtime(t, route);
    const res = await post(r, route); assert.equal(res.status, 403, JSON.stringify(res.data));
    assert.deepEqual(res.data, { error: unavailable, verification: { tier: 0, countedActionsEligible: false, status: 'unavailable', reason: unavailable } });
    r.setVerification('alice', { ...tierOne(r, 'alice'), revoked: true }); const revoked = await post(r, route); assert.equal(revoked.status, 403); assert.equal(revoked.data.error, revoked.data.verification.reason);
    r.setVerification('alice', tierOne(r, 'alice')); const through = await post(r, route); assert.notEqual(through.data.error, unavailable, 'eligible: the eligibility gate no longer answers'); assert.doesNotMatch(String(through.data.error ?? ''), /verif/i);
  });
}

test(`#520 ${backend}: the Assembly and primaries decide the preview by their own scope, so their privacy gate answers first when neither the preview nor privacy is on`, async t => {
  for (const route of routes.filter(x => ['assembly', 'primaries'].includes(x.name))) {
    const r = await runtime(t, route, { privacy: false });
    const res = await post(r, route); assert.equal(res.status, 403, route.name); assert.equal(res.data.privacyReady, false, 'the privacy gate, not the eligibility gate'); assert.equal(res.data.verification, undefined);
    const preview = await runtime(t, route, { env: previewEnv, privacy: false });
    assert.equal((await get(preview, route)).scope, 'preview-citizen', 'the preview needs no privacy review');
  }
});

test(`#520 ${backend}: the town hall, canvassing and debate decide the preview from the settings alone, whatever the privacy review says`, async t => {
  for (const route of routes.filter(x => !['assembly', 'primaries'].includes(x.name))) {
    const r = await runtime(t, route, { privacy: false });
    assert.deepEqual((await get(r, route)).scope, 'tier1', route.name);
    const preview = await runtime(t, route, { env: previewEnv, privacy: false }); assert.equal((await get(preview, route)).scope, 'preview-citizen', route.name);
  }
});

const helper = await rt.importModule('lib/kindle-eligibility.ts');
test('#520 helper: the preview exception wins with the caller\'s wording; otherwise Tier 1 decides with the verification\'s own reason; the verification is returned untouched', () => {
  const denied = { tier: 0, countedActionsEligible: false, status: 'required', reason: 'Verify first.' }, ok = { tier: 1, countedActionsEligible: true, status: 'eligible', reason: eligibleReason };
  assert.equal(helper.previewParticipationReason, CITIZENS);
  assert.deepEqual(helper.kindleEligibility(denied, { on: true, reason: 'Custom wording.' }), { eligible: true, scope: 'preview-citizen', reason: 'Custom wording.', verification: denied }, 'preview: eligible even without evidence');
  assert.deepEqual(helper.kindleEligibility(ok, { on: true, reason: 'Custom wording.' }), { eligible: true, scope: 'preview-citizen', reason: 'Custom wording.', verification: ok }, 'preview wins even for a verified citizen');
  assert.deepEqual(helper.kindleEligibility(denied, { on: false, reason: 'Custom wording.' }), { eligible: false, scope: 'tier1', reason: 'Verify first.', verification: denied });
  assert.deepEqual(helper.kindleEligibility(ok, { on: false, reason: 'Custom wording.' }), { eligible: true, scope: 'tier1', reason: eligibleReason, verification: ok });
  assert.equal(helper.kindleEligibility(denied, { on: false, reason: 'x' }).verification, denied, 'the same object, not a copy');
  assert.deepEqual(Object.keys(helper.kindleEligibility(ok, { on: false, reason: 'x' })), ['eligible', 'scope', 'reason', 'verification']);
});

test('#520 guard: no route declares the eligibility rule again; each of the five calls the helper', async () => {
  for (const route of routes) {
    const source = await readFile(new URL(`../app/api/${route.name}/route.ts`, import.meta.url), 'utf8');
    assert.match(source, /from '@\/lib\/kindle-eligibility'/, route.name); assert.match(source, /kindleEligibility\(/, route.name);
    assert.doesNotMatch(source, /countedActionsEligible|scope: 'tier1'|scope: 'preview-citizen'/, `${route.name} must not re-declare the rule`);
  }
  const helperSource = await readFile(new URL('../lib/kindle-eligibility.ts', import.meta.url), 'utf8');
  assert.deepEqual([...helperSource.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]), ['./verification'], 'the helper imports only the verification type');
  assert.doesNotMatch(helperSource, /readVerification|cloudflare|process\.env|Date\.now/, 'pure: no I/O, no clock, no settings');
});
