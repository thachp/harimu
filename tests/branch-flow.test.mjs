import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
test('CI runs on pushes to release and dev, with no pull request trigger and no deploy step (#127, #177, #1110)', async () => {
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /push:\s*\n\s*branches: \[release, dev\]/);
  assert.doesNotMatch(ci, /pull_request:/);
  assert.match(ci, /cancel-in-progress: false/);
  assert.doesNotMatch(ci, /npm run deploy|wrangler deploy/);
});
test('branch flow is documented and the deploy script names its source branch', async () => {
  const doc = await read('CONTRIBUTING.md');
  for (const s of ['→ **`dev`**', '**`dev` → `release`**', '**`release` → `main`**', 'Hotfix', 'merge `release` back into `dev`', '`dev` never deploys']) assert.ok(doc.includes(s), s);
  assert.match(await read('README.md'), /CONTRIBUTING\.md/);
  assert.match(await read('scripts/deploy-cloudflare.mjs'), /preview \(harimu-preview\) deploys from `release`; production deploys only from `main`/);
});
