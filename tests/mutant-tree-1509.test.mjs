/** #1509: mutantTree() fails loudly when node_modules cannot load. Before, a copy whose node_modules link was missing
 *  made every child run die on `import ts from 'typescript'`, exit non-zero, and so count every mutant as "caught". */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mutantTree } from './helpers/mutant-tree.mjs';

const probe = (body) => ["import assert from 'node:assert/strict';", "import { test } from 'node:test';", body].join('\n');

test('#1509 mutantTree refuses a repo with no node_modules instead of building a copy whose runs all fail', () => {
  const fake = mkdtempSync(join(tmpdir(), 'harimu-no-modules-'));
  try {
    mkdirSync(join(fake, 'lib'));
    writeFileSync(join(fake, 'lib', 'a.ts'), 'export const a = 1;\n');
    assert.throws(() => mutantTree({ repoRoot: fake }), /node_modules is missing or has no typescript/);
  } finally { rmSync(fake, { recursive: true, force: true }); }
});

test('#1509 a broken node_modules link or an unloadable module throws, so a mutant is never counted as caught by a load failure', () => {
  const tree = mutantTree();
  try {
    // A run that cannot import a package exits non-zero; before #1509 that read as "mutant caught". Now it throws.
    writeFileSync(join(tree.root, 'tests/mutant-missing-package.test.mjs'), probe("import 'harimu-no-such-package-1509';\ntest('missing package probe', () => { assert.ok(true); });"));
    assert.throws(() => tree.run(['tests/mutant-missing-package.test.mjs'], 'missing package probe'), /could not load a module, so it proves nothing about the mutant/);

    // A real module-level failure that is not a load failure still comes back as an ordinary failed run (status 1).
    writeFileSync(join(tree.root, 'tests/mutant-assert.test.mjs'), probe("import ts from 'typescript';\ntest('assert probe', () => { assert.equal(typeof ts.transpileModule, 'string'); });"));
    const failed = tree.run(['tests/mutant-assert.test.mjs'], 'assert probe');
    assert.equal(failed.status, 1, `${failed.stdout}\n${failed.stderr}`);

    // Remove the node_modules symlink in the copy (the shared node_modules is untouched): run() refuses before spawning.
    unlinkSync(join(tree.root, 'node_modules'));
    assert.ok(existsSync(new URL('../node_modules/typescript/package.json', import.meta.url)), 'the shared node_modules is untouched');
    assert.throws(() => tree.run(['tests/mutant-assert.test.mjs'], 'assert probe'), /node_modules link in .* is missing or broken/);
  } finally { tree.close(); }
});

test('#1509 restore fails if the shared file changed while its mutant lived in the copy', () => {
  // A throwaway "shared" repo in tmpdir (with a link to the real node_modules), so this test never writes the real tree.
  const fake = mkdtempSync(join(tmpdir(), 'harimu-shared-'));
  const tree = (() => {
    mkdirSync(join(fake, 'lib'));
    writeFileSync(join(fake, 'lib', 'a.ts'), 'export const a = 1;\n');
    symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(fake, 'node_modules'), 'dir');
    return mutantTree({ repoRoot: fake });
  })();
  try {
    const clean = tree.mutate('lib/a.ts', 'a = 1', 'a = 2');
    assert.equal(readFileSync(join(fake, 'lib', 'a.ts'), 'utf8'), 'export const a = 1;\n', 'the shared file is never written');
    clean();
    const restore = tree.mutate('lib/a.ts', 'a = 1', 'a = 2');
    writeFileSync(join(fake, 'lib', 'a.ts'), 'export const a = 3;\n'); // something else wrote the "shared" file mid-mutant
    assert.throws(restore, /the shared lib\/a.ts changed while its mutant lived in the copy/);
    assert.equal(readFileSync(join(tree.root, 'lib', 'a.ts'), 'utf8'), 'export const a = 1;\n', 'the copy is still restored');
  } finally { tree.close(); rmSync(fake, { recursive: true, force: true }); }
});
