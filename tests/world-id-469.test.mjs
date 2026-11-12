/** #469: inert World ID adapter. Flag off or secret missing: /api/world-id is 404 and fetch is not called. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { handleWorldIdRequest, isWorldIdPath, uniqueHumanGate, verifyWorldIdProof, WORLD_ID_VERIFY_ENDPOINT } from '../lib/world-id.ts';

const proof = { proof: 'proof-1', nullifierHash: 'null-1', signal: 'citizenship' };
const secret = 'verifier-secret';
const live = { HARIMU_WORLD_ID_ENABLED: 'true', HARIMU_WORLD_ID_VERIFIER_SECRET: secret };

function grayFlags(file) {
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('"HARIMU_GRAY_PACK"');
  const slice = text.slice(start, text.indexOf('}', start) + 1);
  return { slice, flags: [...slice.matchAll(/"(HARIMU_[A-Z0-9_]+)"\s*:/g)].slice(1).map(match => match[1]) };
}

test('flag off or secret missing is 404 and does not fetch', async () => {
  assert.equal(isWorldIdPath('/api/world'), false);
  assert.equal(isWorldIdPath('/api/world-identity'), false);
  assert.equal(isWorldIdPath('/api/world-id'), true);
  assert.equal(isWorldIdPath('/api/world-id/verify'), true);
  const off = { HARIMU_WORLD_ID_ENABLED: 'false', HARIMU_WORLD_ID_VERIFIER_SECRET: secret };
  const directOff = { HARIMU_GRAY_PACK: { HARIMU_WORLD_ID_ENABLED: 'true' }, HARIMU_WORLD_ID_ENABLED: 'false', HARIMU_WORLD_ID_VERIFIER_SECRET: secret };
  const noSecret = { HARIMU_WORLD_ID_ENABLED: 'true' };
  const emptySecret = { HARIMU_WORLD_ID_ENABLED: 'true', HARIMU_WORLD_ID_VERIFIER_SECRET: '' };
  let fetched = false;
  const miss = async () => { fetched = true; throw new Error('fetched'); };
  for (const env of [off, directOff, noSecret, emptySecret, {}]) {
    assert.equal((await verifyWorldIdProof(env, proof, miss)).reason, 'off');
    const response = await handleWorldIdRequest(new Request('https://harimu.example/api/world-id/verify', { method: 'POST', body: JSON.stringify(proof) }), env, miss);
    assert.equal(response.status, 404);
  }
  assert.equal(fetched, false);
  const source = readFileSync('lib/world-id.ts', 'utf8');
  assert.doesNotMatch(source, /getDatabase|from 'pg'|@clerk/);
  const entry = readFileSync('worker/entry.ts', 'utf8');
  assert.match(entry, /isWorldIdPath\(url\.pathname\)/);
  assert.match(entry, /handleWorldIdRequest\(request, env as unknown as WorldIdEnv\)/);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), 'HARIMU_WORLD_ID_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_WORLD_ID_ENABLED'), 82);
  for (const [file, value] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) {
    const gray = grayFlags(file);
    assert.equal(gray.flags.at(-1), 'HARIMU_WORLD_ID_ENABLED');
    assert.equal(gray.flags.indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81);
    assert.equal(gray.flags.indexOf('HARIMU_WORLD_ID_ENABLED'), 82);
    assert.match(gray.slice, new RegExp(`"HARIMU_WORLD_ID_ENABLED"\\s*:\\s*"${value}"`));
    assert.doesNotMatch(gray.slice, /HARIMU_WORLD_ID_VERIFIER_SECRET"\s*:/);
  }
});

test('flag on and secret present verifies with the injected fetch and no vendor host', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: String(init.body), authorization: init.headers.authorization }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
  const result = await verifyWorldIdProof(live, proof, fetchImpl);
  assert.equal(result.live, true);
  assert.equal(result.reason, 'verified');
  assert.equal(calls[0].url, WORLD_ID_VERIFY_ENDPOINT);
  assert.doesNotMatch(calls[0].url, /worldcoin|world\.org|toolsforhumanity/i);
  assert.equal(calls[0].authorization, `Bearer ${secret}`);
  assert.equal(JSON.parse(calls[0].body).nullifier_hash, 'null-1');
  assert.equal(calls[0].body.includes(secret), false);
  const directed = await verifyWorldIdProof({ ...live, WORLD_ID_VERIFY_URL: 'https://verifier.example/check' }, proof, fetchImpl);
  assert.equal(directed.ok, true);
  assert.equal(calls[1].url, 'https://verifier.example/check');
  const directOn = { HARIMU_GRAY_PACK: { HARIMU_WORLD_ID_ENABLED: 'false' }, HARIMU_WORLD_ID_ENABLED: 'true', HARIMU_WORLD_ID_VERIFIER_SECRET: secret };
  assert.equal((await verifyWorldIdProof(directOn, proof, fetchImpl)).ok, true);
  let providerFetched = false;
  const swapped = await verifyWorldIdProof(live, proof, async () => { providerFetched = true; throw new Error('fetched'); }, { async verify() { return { live: true, ok: true, reason: 'verified' }; } });
  assert.equal(swapped.reason, 'verified');
  assert.equal(providerFetched, false);
  assert.equal((await verifyWorldIdProof(live, proof, async () => new Response(JSON.stringify({ success: false }), { status: 200 }))).reason, 'rejected');
  assert.equal((await verifyWorldIdProof(live, proof, async () => new Response('no', { status: 403 }))).reason, 'rejected');
  assert.equal((await verifyWorldIdProof(live, { proof: '', nullifierHash: 'null-1' }, async () => { throw new Error('fetched'); })).reason, 'rejected');
  const response = await handleWorldIdRequest(new Request('https://harimu.example/api/world-id/verify', { method: 'POST', body: JSON.stringify(proof) }), live, fetchImpl);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text, '{"ok":true}');
  assert.equal(text.includes('null-1'), false);
  assert.equal(text.includes(secret), false);
  let extra = false;
  const boom = async () => { extra = true; throw new Error('fetched'); };
  assert.equal((await handleWorldIdRequest(new Request('https://harimu.example/api/world-id/verify'), live, boom)).status, 404);
  assert.equal((await handleWorldIdRequest(new Request('https://harimu.example/api/world-id/verify', { method: 'POST', body: '{' }), live, boom)).status, 400);
  assert.equal(extra, false);
});

test('unique-human gate grandfathers tier1 counted acts, requires World ID for new acts only when live, and leaves exploring open', () => {
  const enrolled = { alreadyEnrolledTier1CountedAct: true, worldIdVerified: false };
  const fresh = { alreadyEnrolledTier1CountedAct: false, worldIdVerified: false };
  const verified = { alreadyEnrolledTier1CountedAct: false, worldIdVerified: true };
  assert.deepEqual(uniqueHumanGate(live, { act: 'exploring', ...fresh }), { allowed: true, worldIdRequired: false, reason: 'exploring' });
  assert.deepEqual(uniqueHumanGate({ HARIMU_WORLD_ID_ENABLED: 'false' }, { act: 'exploring', ...fresh }), { allowed: true, worldIdRequired: false, reason: 'exploring' });
  for (const act of ['citizenship', 'election-vote', 'npc-claim']) {
    assert.equal(uniqueHumanGate(live, { act, ...enrolled }).reason, 'grandfathered-tier1-human-v1');
    assert.equal(uniqueHumanGate(live, { act, ...fresh }).reason, 'world-id-required');
    assert.equal(uniqueHumanGate(live, { act, ...fresh }).allowed, false);
    assert.equal(uniqueHumanGate(live, { act, ...verified }).reason, 'verified');
    assert.equal(uniqueHumanGate({ HARIMU_WORLD_ID_ENABLED: 'true' }, { act, ...fresh }).reason, 'world-id-off');
    assert.equal(uniqueHumanGate({ HARIMU_WORLD_ID_ENABLED: 'false', HARIMU_WORLD_ID_VERIFIER_SECRET: secret }, { act, ...fresh }).worldIdRequired, false);
  }
});
