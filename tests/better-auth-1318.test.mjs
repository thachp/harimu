/** #1318: inert Better Auth. Flag off (or secret missing): /api/auth is 404 and the database is not opened. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { createAuth, isBetterAuthPath } from '../lib/better-auth.ts';
import { checkVerification, startVerification } from '../lib/twilio-verify.ts';
import { isDestructive, postgresMigrations, transactionProblem } from '../scripts/postgres-migrations.mjs';

const sql = readFileSync('db/postgres/0122_better_auth.sql', 'utf8');
const opens = () => { throw new Error('database opened'); };

async function authResponse(env, path) {
  const request = new Request(`https://harimu.example${path}`);
  if (!isBetterAuthPath(new URL(request.url).pathname)) return null;
  const auth = createAuth(env, request, undefined, opens);
  if (!auth) return new Response('Not found', { status: 404 });
  try { return await auth.handler(request); } finally { await auth.close(); }
}

test('flag off or secret missing is 404 and does not open the database', async () => {
  assert.equal(isBetterAuthPath('/api/author'), false);
  assert.equal(isBetterAuthPath('/api/auth'), true);
  assert.equal(isBetterAuthPath('/api/auth/session'), true);
  const off = { HARIMU_BETTER_AUTH_ENABLED: 'false', BETTER_AUTH_SECRET: 'secret', HYPERDRIVE: { connectionString: 'postgres://closed' } };
  const packedOff = { HARIMU_GRAY_PACK: { HARIMU_BETTER_AUTH_ENABLED: 'true' }, HARIMU_BETTER_AUTH_ENABLED: 'false', BETTER_AUTH_SECRET: 'secret', HYPERDRIVE: { connectionString: 'postgres://closed' } };
  const noSecret = { HARIMU_BETTER_AUTH_ENABLED: 'true', HYPERDRIVE: { connectionString: 'postgres://closed' } };
  for (const env of [off, packedOff, noSecret, {}]) {
    const response = await authResponse(env, '/api/auth/session');
    assert.equal(response.status, 404);
  }
  assert.equal(await authResponse(off, '/api/author'), null);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_WORLD_ID_ENABLED'), 82);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_BETTER_AUTH_ENABLED'), 81);
  const entry = readFileSync('worker/entry.ts', 'utf8');
  assert.match(entry, /isBetterAuthPath\(url\.pathname\)/);
  assert.match(entry, /createAuth\(env as unknown as BetterAuthEnv, request, ctx\)/);
  assert.match(entry, /status: 404/);
});

test('Twilio Verify uses the Verify URLs and sends nothing when a secret is missing', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, body: String(init.body), authorization: init.headers.authorization }); return new Response(JSON.stringify({ status: 'approved' }), { status: 200 }); };
  const env = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_API_KEY_SID: 'SK1', TWILIO_API_KEY_SECRET: 'sekret', TWILIO_VERIFY_SERVICE_SID: 'VA1' };
  await startVerification(env, '+15551212', fetchImpl);
  assert.equal(calls[0].url, 'https://verify.twilio.com/v2/Services/VA1/Verifications');
  assert.match(calls[0].body, /(^|&)To=%2B15551212(&|$)/);
  assert.match(calls[0].body, /(^|&)Channel=sms(&|$)/);
  assert.equal(calls[0].authorization, `Basic ${Buffer.from('SK1:sekret').toString('base64')}`);
  assert.equal(await checkVerification(env, '+15551212', '123456', fetchImpl), true);
  assert.equal(calls[1].url, 'https://verify.twilio.com/v2/Services/VA1/VerificationCheck');
  assert.match(calls[1].body, /(^|&)Code=123456(&|$)/);
  assert.equal(await checkVerification(env, '+15551212', '000000', async () => new Response(JSON.stringify({ status: 'pending' }), { status: 200 })), false);
  let fetched = false;
  const miss = async () => { fetched = true; return new Response('{}', { status: 200 }); };
  for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_VERIFY_SERVICE_SID']) {
    assert.equal(startVerification({ ...env, [key]: '' }, '+15551212', miss), null);
    assert.equal(await checkVerification({ ...env, [key]: undefined }, '+15551212', '123456', miss), false);
  }
  assert.equal(fetched, false);
});

test('migration 0122 is additive and a registry conflict is refused', async () => {
  const last = postgresMigrations().find(m => m.file === '0122_better_auth.sql'); // #467: 0123 now follows; not pinned to the last file
  assert.equal(last.file, '0122_better_auth.sql');
  assert.equal(isDestructive(last.sql), false);
  assert.equal(transactionProblem(last.sql), null);
  assert.deepEqual(last.tables, ['auth_user', 'auth_session', 'auth_account', 'auth_verification', 'auth_phone_registry']);
  assert.match(readFileSync('db/postgres/schema.sql', 'utf8'), /CREATE TABLE auth_phone_registry\(phone_hmac TEXT COLLATE "C" PRIMARY KEY/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+auth_phone_registry/i);
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(sql);
  const hmac = 'ab'.repeat(32), other = 'cd'.repeat(32);
  await pg.exec(`INSERT INTO auth_phone_registry (phone_hmac, user_id, bound_at) VALUES ('${hmac}', 'user-1', 1)`);
  await assert.rejects(pg.exec(`INSERT INTO auth_phone_registry (phone_hmac, user_id, bound_at) VALUES ('${hmac}', 'user-2', 2)`));
  await assert.rejects(pg.exec(`INSERT INTO auth_phone_registry (phone_hmac, user_id, bound_at) VALUES ('${other}', 'user-1', 2)`));
  assert.equal((await pg.query('SELECT user_id FROM auth_phone_registry')).rows.length, 1);
  await pg.close();
});
