/** #1480 deploy fix: mutation tests mutate a private copy, so parallel test files never read a mutant from the shared tree. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { mutantTree } from './helpers/mutant-tree.mjs';

const repoRoot = new URL('..', import.meta.url).pathname;
const file = 'lib/diplomacy-rules.ts';
const find = 'export function withWorldReputationRecord(';
const replace = 'export function withWorldReputationRecordMutant(';

test('#1480 a mutant lives only in the private copy, the copy runs the tests, and close removes it', () => {
  const shared = readFileSync(join(repoRoot, file), 'utf8');
  const tree = mutantTree();
  try {
    assert.notEqual(tree.root, repoRoot);
    const restore = tree.mutate(file, find, replace);
    assert.equal(readFileSync(join(repoRoot, file), 'utf8'), shared, 'the shared working tree is never written');
    assert.ok(readFileSync(join(tree.root, file), 'utf8').includes(replace), 'the copy carries the mutant');
    writeFileSync(join(tree.root, 'tests/mutant-probe.test.mjs'), [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "import * as rules from '../lib/diplomacy-rules.ts';",
      "test('probe sees the mutant', () => { assert.equal(typeof rules.withWorldReputationRecordMutant, 'function'); });",
    ].join('\n'));
    const result = tree.run(['tests/mutant-probe.test.mjs'], 'probe');
    assert.equal(result.status, 0, `the run did not see the copy's mutant:\n${result.stdout}\n${result.stderr}`);
    restore();
    assert.equal(readFileSync(join(tree.root, file), 'utf8'), shared, 'restore puts the original back in the copy');
  } finally {
    tree.close();
  }
  assert.equal(existsSync(tree.root), false, 'close removes the copy');
  assert.equal(readFileSync(join(repoRoot, file), 'utf8'), shared);
});
