/** #486 (ARC): the --rollback floor (target must contain #724's merge; never skipped) and the preview deploy's assertDatabaseNotAhead. Nothing here calls Cloudflare or a database. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { rollbackFloorCommit, rollbackFloorProblem, main as deployMain } from '../scripts/deploy-production.mjs';
import { readProductionConfigRaw } from '../scripts/production-config.mjs';

const version = '0123abcd-0123-4abc-8def-0123456789ab';
const fake = (tag, { view = 0, ancestor = 0, stdout } = {}) => { const calls = []; return { calls, spawn: (cmd, args) => { calls.push([cmd, ...args]);
  if (args[0] === 'versions') return { status: view, stdout: stdout ?? JSON.stringify({ annotations: tag === undefined ? {} : { 'workers/tag': tag } }) };
  if (cmd === 'git') return { status: ancestor }; return { status: 0 }; } }; };

test('floor commit is #724\'s merge, and a real git ancestry check passes for HEAD and fails for an older commit', () => {
  assert.equal(rollbackFloorCommit, '36fe66ed8682286c0178ea6b4ecf19a49877060c');
  const has = spawnSync('git', ['cat-file', '-e', rollbackFloorCommit]).status === 0;
  if (has) {
    assert.equal(spawnSync('git', ['merge-base', '--is-ancestor', rollbackFloorCommit, 'HEAD']).status, 0, 'this branch contains the floor');
    assert.notEqual(spawnSync('git', ['merge-base', '--is-ancestor', rollbackFloorCommit, `${rollbackFloorCommit}~1`]).status, 0, 'its parent does not');
  }
});

test('rollbackFloorProblem refuses every uncertain or older target and accepts a tagged descendant', () => {
  const sha = 'c'.repeat(40);
  assert.equal(rollbackFloorProblem(version, fake(sha).spawn), null);
  assert.match(rollbackFloorProblem(version, fake(sha, { ancestor: 1 }).spawn), /does not contain 36fe66ed/);
  assert.match(rollbackFloorProblem(version, fake(undefined).spawn), /no commit tag/);
  assert.match(rollbackFloorProblem(version, fake('main').spawn), /no commit tag/);
  assert.match(rollbackFloorProblem(version, fake(sha, { view: 1 }).spawn), /could not read/);
  assert.match(rollbackFloorProblem(version, fake(sha, { stdout: 'not json' }).spawn), /could not be parsed/);
  const f = fake(sha); rollbackFloorProblem(version, f.spawn); assert.deepEqual(f.calls[1], ['git', 'merge-base', '--is-ancestor', rollbackFloorCommit, sha]);
});

test('a real --rollback below the floor is refused before wrangler rollback runs', async () => {
  const run = { HARIMU_DEPLOY_ENVIRONMENT: 'production', GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: readProductionConfigRaw().account_id };
  const f = fake('d'.repeat(40), { ancestor: 1 });
  await assert.rejects(deployMain([`--rollback=${version}`], run, { spawn: f.spawn }), /rollback refused \(#486 floor\)/);
  assert.ok(!f.calls.some(c => c[1] === 'rollback'), 'wrangler rollback never ran');
  assert.match(readFileSync('.github/workflows/deploy-production.yml', 'utf8'), /fetch-depth: 0/, 'the workflow has the history the ancestry check needs');
});

test('the preview deploy also refuses code older than the shared database', () => {
  const src = readFileSync('scripts/deploy-cloudflare.mjs', 'utf8');
  assert.match(src, /import \{ assertDatabaseNotAhead, assertPostgresMigrationsApplied, connectPostgres \} from '\.\/postgres-migrations\.mjs';/);
  assert.match(src, /await assertPostgresMigrationsApplied\(db\); await assertDatabaseNotAhead\(db\);/);
  assert.ok(src.indexOf('assertDatabaseNotAhead(db)') < src.indexOf('deployArgs(false)'), 'checked before the deploy runs');
});
