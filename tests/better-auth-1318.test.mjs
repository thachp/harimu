/** #1318: inert Better Auth. Flag off or no BETTER_AUTH_SECRET: /api/auth/* is 404 and no database client is constructed. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { checkVerification, startVerification } from '../lib/twilio-verify.ts';

const dir = mkdtempSync(join(tmpdir(), 'better-auth-1318-'));
const pgStub = join(dir, 'pg.mjs');
writeFileSync(pgStub, `globalThis.__harimuPg ??= [];
export class Client { constructor(config) { this.config = config; globalThis.__harimuPg.push(this); } async connect() { this.connected = true; } async end() { this.ended = true; } async query() { return { rows: [] }; } }
export const types = { getTypeParser() { return value => value; } };
`);
writeFileSync(join(dir, 'hooks.mjs'), `import { pathToFileURL } from 'node:url';
const stub = ${JSON.stringify(pathToFileURL(pgStub).href)};
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'pg') return { url: stub, shortCircuit: true };
  return nextResolve(specifier, context);
}
`);
register(pathToFileURL(join(dir, 'hooks.mjs')));
const clients = () => { globalThis.__harimuPg = []; return globalThis.__harimuPg; };
const request = path => new Request(`https://example.test${path}`);
const secret = 'not-a-real-better-auth-secret';
const hyperdrive = { HYPERDRIVE: { connectionString: 'postgres://127.0.0.1:1/closed' } };

async function workerFetch() {
  const presence = readFileSync('lib/city-presence.ts', 'utf8').match(/presenceSocketPath = '([^']+)'/)[1];
  const source = readFileSync('worker/entry.ts', 'utf8')
    .replace(/^import .*$/gm, line => line.includes('better-auth') ? `import { createAuth } from ${JSON.stringify(pathToFileURL(join(process.cwd(), 'lib/better-auth.ts')).href)};` : '')
    .replace(/^export \{ CityPresence \}.*$/m, '');
  const js = ts.transpileModule(`const vinext = { async fetch() { return new Response('vinext', { status: 200 }); } };
const env = {};
const authenticatedUserId = () => null, getDatabase = () => null, readCityLocation = () => null;
const presenceSocketPath = ${JSON.stringify(presence)};
const presenceUpgrade = () => new Response('presence', { status: 200 });
${source}`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = join(dir, 'worker.mjs');
  writeFileSync(file, js);
  return (await import(pathToFileURL(file).href)).default.fetch;
}
const twilio = { TWILIO_ACCOUNT_SID: 'AC', TWILIO_API_KEY_SID: 'SK', TWILIO_API_KEY_SECRET: 'secret', TWILIO_VERIFY_SERVICE_SID: 'VA' };
const callsOf = () => { const calls = []; const fetchImpl = async (url, init) => { calls.push({ url: String(url), body: String(init.body) }); return new Response(JSON.stringify({ status: 'approved' }), { status: 200 }); }; return { calls, fetchImpl }; };

test('flag off or missing BETTER_AUTH_SECRET: /api/auth/* is 404 and no database client is constructed', async () => {
  const fetch = await workerFetch();
  for (const [path, env] of [['/api/auth/ok', {}], ['/api/auth/session', { HARIMU_BETTER_AUTH_ENABLED: 'false', ...hyperdrive, BETTER_AUTH_SECRET: secret }], ['/api/auth', { HARIMU_GRAY_PACK: { HARIMU_BETTER_AUTH_ENABLED: 'false' }, ...hyperdrive, BETTER_AUTH_SECRET: secret }], ['/api/auth/phone-number/send-otp', { HARIMU_BETTER_AUTH_ENABLED: 'true', ...hyperdrive }], ['/api/auth/ok', { HARIMU_BETTER_AUTH_ENABLED: 'true', BETTER_AUTH_SECRET: '', ...hyperdrive }]]) {
    const opened = clients();
    const response = await fetch(request(path), env, {});
    assert.equal(response.status, 404, path);
    assert.equal(opened.length, 0, path);
  }
  const opened = clients();
  const app = await fetch(request('/api/citizen'), {}, {});
  assert.equal(app.status, 200); assert.equal(await app.text(), 'vinext'); assert.equal(opened.length, 0);
  const presenceClients = clients();
  const presence = await fetch(request('/api/presence/ws'), { HARIMU_BETTER_AUTH_ENABLED: 'true', BETTER_AUTH_SECRET: secret, ...hyperdrive }, {});
  assert.equal(await presence.text(), 'presence'); assert.equal(presenceClients.length, 0);
});

test('Twilio Verify start and check use the Verify URLs and form body; a missing secret does not fetch', async () => {
  const started = callsOf();
  const start = await startVerification(twilio, '+15551212', started.fetchImpl);
  assert.equal(start.ok, true);
  assert.equal(started.calls[0].url, 'https://verify.twilio.com/v2/Services/VA/Verifications');
  assert.equal(started.calls[0].body, 'To=%2B15551212&Channel=sms');
  const checked = callsOf();
  const check = await checkVerification(twilio, '+15551212', '123456', checked.fetchImpl);
  assert.deepEqual(check, { ok: true, approved: true });
  assert.equal(checked.calls[0].url, 'https://verify.twilio.com/v2/Services/VA/VerificationCheck');
  assert.equal(checked.calls[0].body, 'To=%2B15551212&Code=123456');
  const pending = callsOf();
  pending.fetchImpl = async (url, init) => { pending.calls.push({ url: String(url), body: String(init.body) }); return new Response(JSON.stringify({ status: 'pending' }), { status: 200 }); };
  assert.deepEqual(await checkVerification(twilio, '+15551212', '000000', pending.fetchImpl), { ok: true, approved: false });
  for (const name of ['TWILIO_ACCOUNT_SID', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_VERIFY_SERVICE_SID']) {
    const blocked = callsOf();
    const result = await startVerification({ ...twilio, [name]: '' }, '+15551212', blocked.fetchImpl);
    assert.deepEqual(result, { ok: false, error: 'missing_secret' });
    assert.equal(blocked.calls.length, 0, name);
    const checkedMissing = callsOf();
    assert.deepEqual(await checkVerification({ ...twilio, [name]: undefined }, '+15551212', '123456', checkedMissing.fetchImpl), { ok: false, error: 'missing_secret' });
    assert.equal(checkedMissing.calls.length, 0, name);
  }
});

test('auth_phone_registry refuses a second row for the same phone hmac or the same user', async () => {
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(readFileSync('db/postgres/0122_better_auth.sql', 'utf8'));
  await pg.exec(`INSERT INTO auth_phone_registry (phone_hmac, user_id, bound_at) VALUES ('hmac-a', 'user-a', 10)`);
  await assert.rejects(pg.exec(`INSERT INTO auth_phone_registry (phone_hmac, user_id, bound_at) VALUES ('hmac-a', 'user-b', 11)`));
  await assert.rejects(pg.exec(`INSERT INTO auth_phone_registry (phone_hmac, user_id, bound_at) VALUES ('hmac-b', 'user-a', 12)`));
  assert.equal((await pg.query(`SELECT revoked_at FROM auth_phone_registry WHERE phone_hmac = 'hmac-a'`)).rows[0].revoked_at, null);
  await pg.exec(`INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at, phone_number, phone_number_verified) VALUES ('u1', 'A', 'a@e.test', false, 1, 1, '+15551212', false)`);
  await assert.rejects(pg.exec(`INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at, phone_number, phone_number_verified) VALUES ('u2', 'B', 'b@e.test', false, 1, 1, '+15551212', true)`));
  await pg.close();
});
