import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('required check rejects failed, cancelled, skipped and absent prerequisite results', () => {
  const gate = workflow.slice(workflow.indexOf('\n  check:\n'));
  assert.match(gate, /if: \$\{\{ always\(\) \}\}/);
  // #706: every test job, including all Postgres shards, gates the required check.
  assert.match(gate, /needs: \[node-tests, postgres-tests, validation, ai-evals\]/);
  assert.match(gate, /NEEDS_JSON: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(gate, /for job in node-tests postgres-tests validation ai-evals; do/);
  const command = gate.match(/        run: \|\n((?:          .*\n?)+)/)[1].replace(/^ {10}/gm, '');
  const results = ['success', 'failure', 'cancelled', 'skipped', undefined];
  for (const node of results) for (const postgres of results) for (const validation of results) for (const evals of results) {
    const needs = {};
    if (node) needs['node-tests'] = { result: node };
    if (postgres) needs['postgres-tests'] = { result: postgres };
    if (validation) needs.validation = { result: validation };
    if (evals) needs['ai-evals'] = { result: evals };
    const result = spawnSync('bash', ['-e', '-c', command], { env: { ...process.env, NEEDS_JSON: JSON.stringify(needs) } });
    assert.equal(result.status === 0, node === 'success' && postgres === 'success' && validation === 'success' && evals === 'success',
      `Node=${node}, postgres=${postgres}, validation=${validation}, ai-evals=${evals}`);
  }
});

test('CI retains all validations and uses both native Node shards without fail-fast', () => {
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /max-parallel: 2/);
  assert.match(workflow, /shard: \[1, 2\]/);
  assert.match(workflow, /node --experimental-strip-types --test --test-shard=\$\{\{ matrix\.shard \}\}\/2 tests\/\*\.test\.mjs/);
  for (const command of ['npm ci', 'npm run test:sql', 'npm run lint', 'npx tsc --noEmit',
    'npx playwright install --with-deps chromium', 'npm run test:layout']) {
    assert.ok(workflow.includes(`run: ${command}`), command);
  }
  assert.doesNotMatch(workflow, /continue-on-error:|--test-name-pattern|--test-skip-pattern/);
});
