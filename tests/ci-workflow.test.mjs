import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('required check rejects failed, cancelled, skipped and absent prerequisite results', () => {
  const gate = workflow.slice(workflow.indexOf('\n  check:\n'));
  assert.match(gate, /if: \$\{\{ always\(\) \}\}/);
  assert.match(gate, /needs: \[node-tests, validation\]/);
  assert.match(gate, /NODE_TEST_RESULT: \$\{\{ needs\.node-tests\.result \}\}/);
  assert.match(gate, /VALIDATION_RESULT: \$\{\{ needs\.validation\.result \}\}/);
  const command = gate.match(/        run: (.+)/)[1];
  for (const node of ['success', 'failure', 'cancelled', 'skipped', '']) {
    for (const validation of ['success', 'failure', 'cancelled', 'skipped', '']) {
      const result = spawnSync('bash', ['-e', '-c', command], {
        env: { ...process.env, NODE_TEST_RESULT: node, VALIDATION_RESULT: validation },
      });
      assert.equal(result.status === 0, node === 'success' && validation === 'success',
        `Node=${node}, validation=${validation}`);
    }
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
