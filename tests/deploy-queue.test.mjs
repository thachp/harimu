import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { redactSecrets } from '../scripts/redact.mjs';

test('#163 deploy-preview queues and only trusts this repo\'s dev push CI', async () => {
  const wf = await readFile('.github/workflows/deploy-preview.yml', 'utf8');
  assert.match(wf, /concurrency:\n  group: deploy-preview\n  cancel-in-progress: false/);
  assert.doesNotMatch(wf, /cancel-in-progress: true/);
  assert.match(wf, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(wf, /workflow_run\.event == 'push'/);
  assert.match(wf, /workflow_run\.head_branch == 'dev'/);
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
