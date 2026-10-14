import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { postgresClientConfig, connectPostgres, connectTimeoutMs } from '../scripts/postgres-migrations.mjs';

test('sslrootcert=system is stripped and replaced by verified TLS (no file path lookup)', async () => {
  const config = postgresClientConfig('postgres://admin:pw@db.example.com:5432/harimu?sslmode=verify-full&sslrootcert=system&application_name=m');
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  assert.doesNotMatch(config.connectionString, /sslrootcert|sslmode/);
  assert.match(config.connectionString, /application_name=m/);
  assert.equal(config.connectionTimeoutMillis, 15000);
  assert.equal(connectTimeoutMs, 15000);
  // pg's own parser must accept the result without touching the filesystem.
  const { parse } = await import('pg-connection-string');
  assert.doesNotThrow(() => parse(config.connectionString));
  assert.throws(() => parse('postgres://a@h/d?sslrootcert=system'), /ENOENT|system/, 'the bug this works around');
  // Other URLs pass through untouched.
  assert.deepEqual(postgresClientConfig('postgres://a@h/d?sslmode=require'), { connectionString: 'postgres://a@h/d?sslmode=require', connectionTimeoutMillis: 15000 });
});
test('connect fails fast with a clear error when the server never answers', async t => {
  const sockets = [];
  const server = createServer(socket => sockets.push(socket)); // accept TCP, never speak Postgres
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { for (const s of sockets) s.destroy(); server.close(); });
  const started = Date.now();
  await assert.rejects(connectPostgres(`postgres://admin:secret@127.0.0.1:${server.address().port}/x`, { timeoutMs: 300 }),
    error => /timed out after 300 ms; nothing was migrated or deployed/.test(error.message) && !error.message.includes('secret'));
  assert.ok(Date.now() - started < 5000);
});
