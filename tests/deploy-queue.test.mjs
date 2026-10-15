import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { redactSecrets } from '../scripts/redact.mjs';

test('#163/#177 deploy-preview queues and only trusts this repo\'s release branch', async () => {
  const wf = await readFile('.github/workflows/deploy-preview.yml', 'utf8');
  assert.match(wf, /concurrency:\n  group: deploy-preview\n  cancel-in-progress: false/);
  assert.doesNotMatch(wf, /cancel-in-progress: true/);
  assert.match(wf, /github\.event\.repository\.full_name == github\.repository/);
  assert.match(wf, /github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'/);
  assert.match(wf, /github\.ref == 'refs\/heads\/release'/);
});
test('#163 D1 check failure prints wrangler output through redaction', async () => {
  const deploy = await readFile('scripts/deploy-cloudflare.mjs', 'utf8');
  assert.match(deploy, /console\.error\(redactSecrets\([\s\S]*schemaCheck\.stderr[\s\S]*schemaCheck\.stdout/);
  const env = { CLOUDFLARE_API_TOKEN: 'cf-tok-abc123XYZ', PREVIEW_DATABASE_ADMIN_URL: 'postgres://admin:pw@db.example/x' };
  const raw = 'Authentication error [code: 10000] token=cf-tok-abc123XYZ\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789ABCD url postgres://admin:pw@db.example/x';
  const out = redactSecrets(raw, env);
  for (const leak of ['cf-tok-abc123XYZ', 'abcdefghijklmnopqrstuvwxyz0123456789ABCD', 'admin:pw']) assert.ok(!out.includes(leak), leak);
  assert.match(out, /Authentication error \[code: 10000\]/, 'keeps the useful error');
});

test('#172 account and D1 ids stay visible; tokens are still redacted', () => {
  const account = '0123456789abcdef0123456789abcdef', d1 = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';
  const env = { CLOUDFLARE_API_TOKEN: 'cfTok_0123456789abcdefghijABCDEFGHIJ0123456789', CLOUDFLARE_ACCOUNT_ID: account };
  const out = redactSecrets(`account ${account} database ${d1} token ${env.CLOUDFLARE_API_TOKEN} other ${'Z'.repeat(45)}`, env);
  assert.ok(out.includes(account) && out.includes(d1));
  assert.ok(!out.includes(env.CLOUDFLARE_API_TOKEN) && !out.includes('Z'.repeat(45)));
});
test('#172 Postgres backend skips the D1 check with a warning; D1 backend still runs it', async () => {
  const deploy = await readFile('scripts/deploy-cloudflare.mjs', 'utf8');
  const skip = deploy.indexOf("if (storageBackend === 'postgres') {"), d1 = deploy.indexOf("'d1', 'execute'");
  assert.ok(skip > 0 && d1 > skip, 'D1 check sits in the non-Postgres branch');
  assert.match(deploy.slice(skip, d1), /console\.warn\([^)]*skipping the legacy preview D1 schema check[\s\S]*\} else \{/);
  assert.match(deploy, /assertPostgresMigrationsApplied\(db\)/);
});

test('#177 CLOUDFLARE_API_KEY values are redacted', () => {
  const env = { CLOUDFLARE_API_KEY: 'legacyGlobalKey12345' };
  const out = redactSecrets('X-Auth-Key: legacyGlobalKey12345 failed', env);
  assert.ok(!out.includes('legacyGlobalKey12345'));
  assert.match(out, /\[CLOUDFLARE_API_KEY\]/);
});
